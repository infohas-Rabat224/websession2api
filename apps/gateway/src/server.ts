import crypto from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { z } from 'zod';
import { GatewayEngine, type EngineOptions } from './engine';
import {
  extractBearerOrApiKey,
  isAllowedLoopbackHost,
  isAllowedOrigin,
  isLoopbackAddress,
  validateCsrfHeader,
} from '../../../packages/security/src/index';
import {
  formatOpenAiCompletion,
  formatOpenAiError,
  formatOpenAiModelsList,
  formatOpenAiStreamChunk,
  formatOpenAiStreamDone,
  parseOpenAiChatRequest,
} from '../../../packages/openai-compat/src/index';
import {
  countAnthropicTokens,
  formatAnthropicError,
  formatAnthropicMessage,
  formatAnthropicSseEvent,
  parseAnthropicMessagesRequest,
} from '../../../packages/anthropic-compat/src/index';
import { createProviderError, ProviderAdapterError } from '../../../packages/provider-sdk/src/index';
import type { AgentId, DashboardRuntimeMode, IntegrationMode, ProviderId } from '../../../packages/shared-types/src/index';

export interface CreateGatewayServerOptions extends EngineOptions {
  enforceLoopbackHost?: boolean;
  logger?: boolean;
}

const OfficialApiBodySchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(6),
  modelName: z.string().min(1),
});

export function createFastifyGateway(options: CreateGatewayServerOptions = {}): {
  app: FastifyInstance;
  engine: GatewayEngine;
} {
  const engine = new GatewayEngine({
    ...options,
    environment: options.environment ?? 'local_gateway',
  });

  const enforceLoopback = options.enforceLoopbackHost ?? true;

  const app = Fastify({
    bodyLimit: engine.getSettings().maxRequestBodyBytes,
    logger:
      options.logger === false
        ? false
        : {
            level: process.env.WEBSESSION2API_LOG_LEVEL || 'info',
            redact: {
              paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
              censor: '[REDACTED]',
            },
          },
  });

  // Security middleware: DNS rebinding, loopback enforcement, Origin, CSRF, rate limiting
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const settings = engine.getSettings();

    if (enforceLoopback && settings.loopbackOnly && req.ip && !isLoopbackAddress(req.ip)) {
      reply.code(403).send({
        error: {
          code: 'LOOPBACK_ONLY',
          message: 'WebSession2API local gateway accepts loopback connections only.',
        },
      });
      return reply;
    }

    if (enforceLoopback && settings.dnsRebindingProtection) {
      const host = req.headers.host;
      if (host && !isAllowedLoopbackHost(host)) {
        reply.code(403).send({
          error: {
            code: 'DNS_REBINDING_BLOCKED',
            message: `Disallowed Host header "${host}". Gateway allows localhost/127.0.0.1 only.`,
          },
        });
        return reply;
      }
    }

    if (settings.originValidationEnabled) {
      const origin = req.headers.origin;
      if (origin && !isAllowedOrigin(origin)) {
        reply.code(403).send({
          error: {
            code: 'ORIGIN_BLOCKED',
            message: 'Origin not permitted by local gateway CORS/Origin policy.',
          },
        });
        return reply;
      }
    }

    if (settings.csrfProtectionEnabled) {
      const csrf = validateCsrfHeader(req.method, req.headers);
      if (!csrf.ok) {
        reply.code(403).send({
          error: {
            code: 'CSRF_BLOCKED',
            message: csrf.reason || 'Request blocked by CSRF policy.',
          },
        });
        return reply;
      }
    }

    // Rate limiting applies to /v1/* inference endpoints so dashboard admin polling never trips 429
    if (req.url.startsWith('/v1/')) {
      const rl = engine.rateLimiter.check(req.ip || 'loopback');
      if (!rl.allowed) {
        reply
          .code(429)
          .header('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
          .send({
            error: {
              code: 'RATE_LIMITED',
              message: 'Gateway rate limit exceeded.',
            },
          });
        return reply;
      }
    }
  });

  // Auth verifier helper
  const requireAuth = (req: FastifyRequest, reply: FastifyReply, protocol: 'openai' | 'anthropic' | 'admin'): boolean => {
    const provided = extractBearerOrApiKey(req.headers);
    if (!engine.verifyGatewayApiKey(provided)) {
      const err = createProviderError(
        'AUTH_REQUIRED',
        'Invalid or missing local gateway API key. Provide Authorization: Bearer <key> or x-api-key header.',
        401
      );
      if (protocol === 'anthropic') {
        reply.code(401).send(formatAnthropicError(err));
      } else {
        reply.code(401).send(formatOpenAiError(err));
      }
      return false;
    }
    return true;
  };

  // =========================================================
  // OpenAI-Compatible Endpoints
  // =========================================================

  app.get('/v1/models', async (req, reply) => {
    if (!requireAuth(req, reply, 'openai')) return;
    const models = await engine.getModels();
    return reply.send(formatOpenAiModelsList(models));
  });

  app.post('/v1/chat/completions', async (req, reply) => {
    if (!requireAuth(req, reply, 'openai')) return;
    const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
    const parsed = parseOpenAiChatRequest(req.body, requestId);
    if (!parsed.ok) {
      return reply.code(parsed.error.httpStatus).send(formatOpenAiError(parsed.error));
    }

    const normalizedReq = parsed.request;

    if (!normalizedReq.stream) {
      try {
        const res = await engine.executeUnifiedRequest(normalizedReq);
        return reply.code(200).send(formatOpenAiCompletion(res));
      } catch (err) {
        const pe =
          err instanceof ProviderAdapterError
            ? err.providerError
            : createProviderError('UPSTREAM_ERROR', 'Unexpected gateway error', 500);
        return reply.code(pe.httpStatus).send(formatOpenAiError(pe));
      }
    }

    // Streaming SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const completionId = `chatcmpl-${requestId.slice(4)}`;
    let roleSent = false;

    req.raw.on('close', () => {
      void engine.cancelActiveRequest(requestId);
    });

    try {
      const res = await engine.executeUnifiedRequest(normalizedReq, {
        onEvent: (event) => {
          if (event.type === 'delta' && event.deltaText) {
            if (!roleSent) {
              reply.raw.write(
                formatOpenAiStreamChunk({
                  completionId,
                  model: normalizedReq.requestedModel,
                  role: 'assistant',
                  deltaContent: '',
                })
              );
              roleSent = true;
            }
            reply.raw.write(
              formatOpenAiStreamChunk({
                completionId,
                model: normalizedReq.requestedModel,
                deltaContent: event.deltaText,
              })
            );
          }
        },
      });

      reply.raw.write(
        formatOpenAiStreamChunk({
          completionId,
          model: res.modelAlias,
          finishReason: 'stop',
        })
      );
      reply.raw.write(formatOpenAiStreamDone());
      reply.raw.end();
    } catch (err) {
      const pe =
        err instanceof ProviderAdapterError
          ? err.providerError
          : createProviderError('UPSTREAM_ERROR', 'Streaming error', 500);
      reply.raw.write(`data: ${JSON.stringify(formatOpenAiError(pe))}\n\n`);
      reply.raw.write(formatOpenAiStreamDone());
      reply.raw.end();
    }
    return reply;
  });

  // =========================================================
  // Anthropic-Compatible Endpoints
  // =========================================================

  app.post('/v1/messages/count_tokens', async (req, reply) => {
    if (!requireAuth(req, reply, 'anthropic')) return;
    const counted = countAnthropicTokens(req.body);
    if (!counted.ok) {
      return reply.code(counted.error.httpStatus).send(formatAnthropicError(counted.error));
    }
    return reply.code(200).send({ input_tokens: counted.input_tokens });
  });

  app.post('/v1/messages', async (req, reply) => {
    if (!requireAuth(req, reply, 'anthropic')) return;
    const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
    const parsed = parseAnthropicMessagesRequest(req.body, requestId);
    if (!parsed.ok) {
      return reply.code(parsed.error.httpStatus).send(formatAnthropicError(parsed.error));
    }

    const normalizedReq = parsed.request;

    if (!normalizedReq.stream) {
      try {
        const res = await engine.executeUnifiedRequest(normalizedReq);
        return reply.code(200).send(formatAnthropicMessage(res));
      } catch (err) {
        const pe =
          err instanceof ProviderAdapterError
            ? err.providerError
            : createProviderError('UPSTREAM_ERROR', 'Unexpected gateway error', 500);
        return reply.code(pe.httpStatus).send(formatAnthropicError(pe));
      }
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const messageId = `msg_${requestId.slice(4)}`;
    let started = false;

    req.raw.on('close', () => {
      void engine.cancelActiveRequest(requestId);
    });

    try {
      const res = await engine.executeUnifiedRequest(normalizedReq, {
        onEvent: (event) => {
          if (event.type === 'delta' && event.deltaText) {
            if (!started) {
              started = true;
              reply.raw.write(
                formatAnthropicSseEvent('message_start', {
                  type: 'message_start',
                  message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    model: normalizedReq.requestedModel,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  },
                })
              );
              reply.raw.write(
                formatAnthropicSseEvent('content_block_start', {
                  type: 'content_block_start',
                  index: 0,
                  content_block: { type: 'text', text: '' },
                })
              );
            }
            reply.raw.write(
              formatAnthropicSseEvent('content_block_delta', {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: event.deltaText },
              })
            );
          }
        },
      });

      if (!started) {
        reply.raw.write(
          formatAnthropicSseEvent('message_start', {
            type: 'message_start',
            message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              model: res.modelAlias,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: res.usage.inputTokens, output_tokens: 0 },
            },
          })
        );
        reply.raw.write(
          formatAnthropicSseEvent('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          })
        );
      }

      reply.raw.write(
        formatAnthropicSseEvent('content_block_stop', { type: 'content_block_stop', index: 0 })
      );
      reply.raw.write(
        formatAnthropicSseEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: res.usage.outputTokens },
        })
      );
      reply.raw.write(formatAnthropicSseEvent('message_stop', { type: 'message_stop' }));
      reply.raw.end();
    } catch (err) {
      const pe =
        err instanceof ProviderAdapterError
          ? err.providerError
          : createProviderError('UPSTREAM_ERROR', 'Streaming error', 500);
      reply.raw.write(formatAnthropicSseEvent('error', formatAnthropicError(pe)));
      reply.raw.end();
    }
    return reply;
  });

  // =========================================================
  // Administration Endpoints (protected by API key)
  // =========================================================

  app.get('/admin/health', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send(engine.getHealthSummary());
  });

  app.get('/admin/providers', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ providers: engine.getProviders(), runtimeMode: engine.getRuntimeMode() });
  });

  app.post('/admin/providers/:id/enable', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    return reply.send({ provider: engine.setProviderEnabled(id, true) });
  });

  app.post('/admin/providers/:id/disable', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    return reply.send({ provider: engine.setProviderEnabled(id, false) });
  });

  app.post('/admin/providers/:id/disconnect', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    return reply.send({ provider: await engine.disconnectProvider(id) });
  });

  app.post('/admin/providers/:id/mode', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    const { mode } = req.body as { mode: IntegrationMode };
    return reply.send({ provider: engine.setProviderMode(id, mode) });
  });

  app.post('/admin/providers/:id/official-api', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    const parsed = OfficialApiBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    try {
      return reply.send({ provider: engine.configureOfficialApi(id, parsed.data) });
    } catch (err) {
      const pe = err instanceof ProviderAdapterError ? err.providerError : createProviderError('INVALID_REQUEST', 'Failed to save config', 400);
      return reply.code(pe.httpStatus).send(formatOpenAiError(pe));
    }
  });

  app.post('/admin/providers/:id/diagnostics', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    const report = await engine.runProviderDiagnostics(id);
    return reply.send({ report });
  });

  app.get('/admin/compatibility-matrix', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({
      matrix: engine.getCompatibilityMatrix(),
      runtimeMode: engine.getRuntimeMode(),
    });
  });

  app.post('/admin/providers/:id/verify', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: ProviderId };
    try {
      const result = await engine.runProviderVerification(id);
      return reply.send(result);
    } catch (err) {
      const pe =
        err instanceof ProviderAdapterError
          ? err.providerError
          : createProviderError('UPSTREAM_ERROR', 'Provider verification failed', 500);
      return reply.code(pe.httpStatus).send(formatOpenAiError(pe));
    }
  });

  app.post('/admin/verify-all', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const result = await engine.runAllProvidersVerification();
    return reply.send(result);
  });

  app.get('/admin/models', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ models: await engine.getModels(), runtimeMode: engine.getRuntimeMode() });
  });

  app.get('/admin/capabilities', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ capabilities: engine.getCapabilitiesMatrix() });
  });

  app.get('/admin/requests', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ requests: engine.listRequests(100), runtimeMode: engine.getRuntimeMode() });
  });

  app.get('/admin/routing', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send(engine.getRoutingState());
  });

  app.put('/admin/routing', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const updated = engine.updateRoutingConfig(req.body as Record<string, unknown>);
    return reply.send({ config: updated });
  });

  app.get('/admin/agents', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ agents: engine.getAgents() });
  });

  app.get('/admin/agents/:id/config', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { id } = req.params as { id: AgentId };
    const query = req.query as { model?: string };
    return reply.send(engine.getAgentConfig(id, query.model));
  });

  app.get('/admin/settings', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ settings: engine.getSettings() });
  });

  app.put('/admin/settings', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send({ settings: engine.updateSettings(req.body as Record<string, unknown>) });
  });

  app.post('/admin/settings/rotate-key', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    return reply.send(engine.rotateApiKey());
  });

  app.post('/admin/runtime-mode', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const { mode } = req.body as { mode: DashboardRuntimeMode };
    return reply.send({ runtimeMode: engine.setRuntimeMode(mode) });
  });

  // Loopback Native Messaging Host IPC bridge endpoint
  app.post('/internal/bridge/event', async (req, reply) => {
    if (!requireAuth(req, reply, 'admin')) return;
    const result = engine.ingestBridgeEvent(req.body as Parameters<typeof engine.ingestBridgeEvent>[0]);
    return reply.send(result);
  });

  app.addHook('onClose', async () => {
    engine.close();
  });

  return { app, engine };
}
