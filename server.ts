import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { GatewayEngine } from './apps/gateway/src/engine';
import {
  extractBearerOrApiKey,
  isAllowedOrigin,
  validateCsrfHeader,
} from './packages/security/src/index';
import {
  formatOpenAiCompletion,
  formatOpenAiError,
  formatOpenAiModelsList,
  formatOpenAiStreamChunk,
  formatOpenAiStreamDone,
  parseOpenAiChatRequest,
} from './packages/openai-compat/src/index';
import {
  countAnthropicTokens,
  formatAnthropicError,
  formatAnthropicMessage,
  formatAnthropicSseEvent,
  parseAnthropicMessagesRequest,
} from './packages/anthropic-compat/src/index';
import { createProviderError, ProviderAdapterError } from './packages/provider-sdk/src/index';
import type {
  AgentId,
  DashboardRuntimeMode,
  IntegrationMode,
  ProviderId,
} from './packages/shared-types/src/index';

const PORT = 3000;
const app = express();
const engine = new GatewayEngine({
  environment: process.env.WEBSESSION2API_LOCAL === '1' ? 'local_gateway' : 'hosted_preview',
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

function buildConfiguredHostedOrigins(): string[] {
  const origins = new Set<string>();
  const rawUrls = [process.env.APP_URL, process.env.SHARED_APP_URL].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  for (const raw of rawUrls) {
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        origins.add(parsed.origin);
        // Include sibling preview/shared Cloud Run origin when hosted in AI Studio
        if (parsed.hostname.startsWith('ais-dev-') && parsed.hostname.endsWith('.run.app')) {
          origins.add(`${parsed.protocol}//${parsed.hostname.replace(/^ais-dev-/, 'ais-pre-')}`);
        } else if (parsed.hostname.startsWith('ais-pre-') && parsed.hostname.endsWith('.run.app')) {
          origins.add(`${parsed.protocol}//${parsed.hostname.replace(/^ais-pre-/, 'ais-dev-')}`);
        }
      }
    } catch {
      // Ignore malformed env URL
    }
  }
  return Array.from(origins);
}

const CONFIGURED_HOSTED_ORIGINS = buildConfiguredHostedOrigins();

function getRequestAllowedOrigins(req: Request): string[] {
  const origins = new Set<string>(CONFIGURED_HOSTED_ORIGINS);

  const addHostHeader = (rawHost: string | string[] | undefined) => {
    if (!rawHost) return;
    const first = (Array.isArray(rawHost) ? rawHost[0] : rawHost).split(',')[0]?.trim();
    if (!first) return;
    origins.add(`https://${first}`);
    origins.add(`http://${first}`);
  };

  addHostHeader(req.headers.host);
  addHostHeader(req.headers['x-forwarded-host']);

  // Behind a reverse proxy that rewrites Host without X-Forwarded-Host, browsers still assert
  // same-origin requests via the non-spoofable Fetch Metadata header Sec-Fetch-Site: same-origin.
  const secFetchSite =
    typeof req.headers['sec-fetch-site'] === 'string'
      ? req.headers['sec-fetch-site'].toLowerCase()
      : '';
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (
    engine.getHealthSummary().environment === 'hosted_preview' &&
    secFetchSite === 'same-origin' &&
    originHeader
  ) {
    try {
      const parsed = new URL(originHeader);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore invalid origin
    }
  }

  return Array.from(origins);
}

// Dashboard preview API guard: validates CSRF & same-origin / bearer auth while allowing hosted dashboard
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.path.startsWith('/v1/') || req.path.startsWith('/admin/') || req.path.startsWith('/api/')) {
    const settings = engine.getSettings();
    const isInferenceRoute = req.path.startsWith('/v1/') || req.path.startsWith('/api/v1/');
    if (isInferenceRoute) {
      const rl = engine.rateLimiter.check(req.ip || 'preview');
      if (!rl.allowed) {
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Gateway rate limit exceeded.' },
        });
        return;
      }
    }

    const allowedOrigins = getRequestAllowedOrigins(req);
    if (settings.originValidationEnabled && req.headers.origin) {
      if (!isAllowedOrigin(req.headers.origin, allowedOrigins)) {
        res.status(403).json({
          error: { code: 'ORIGIN_BLOCKED', message: 'Origin rejected by gateway security policy.' },
        });
        return;
      }
    }
    if (settings.csrfProtectionEnabled) {
      const csrf = validateCsrfHeader(req.method, req.headers, allowedOrigins);
      if (!csrf.ok) {
        res.status(403).json({
          error: { code: 'CSRF_BLOCKED', message: csrf.reason || 'CSRF validation failed.' },
        });
        return;
      }
    }
  }
  next();
});

// External /v1/* callers must provide Bearer / x-api-key; same-origin dashboard Playground uses X-WebSession2API-Dashboard: 1
function authorizeApiCall(req: Request, res: Response, protocol: 'openai' | 'anthropic'): boolean {
  const provided = extractBearerOrApiKey(req.headers);
  const allowedOrigins = getRequestAllowedOrigins(req);
  const isSameOriginDashboard =
    req.headers['x-websession2api-dashboard'] === '1' &&
    (!req.headers.origin || isAllowedOrigin(req.headers.origin, allowedOrigins));

  if (isSameOriginDashboard) return true;

  if (!engine.verifyGatewayApiKey(provided)) {
    const err = createProviderError(
      'AUTH_REQUIRED',
      'Missing or invalid gateway API key. Supply Authorization: Bearer <key> or x-api-key.',
      401
    );
    if (protocol === 'anthropic') {
      res.status(401).json(formatAnthropicError(err));
    } else {
      res.status(401).json(formatOpenAiError(err));
    }
    return false;
  }
  return true;
}

const v1Router = express.Router();
const adminRouter = express.Router();

// =========================================================
// OpenAI-Compatible Endpoints
// =========================================================

v1Router.get('/models', async (req, res) => {
  if (!authorizeApiCall(req, res, 'openai')) return;
  const models = await engine.getModels();
  res.json(formatOpenAiModelsList(models));
});

v1Router.post('/chat/completions', async (req, res) => {
  if (!authorizeApiCall(req, res, 'openai')) return;
  const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
  const parsed = parseOpenAiChatRequest(req.body, requestId);
  if (!parsed.ok) {
    res.status(parsed.error.httpStatus).json(formatOpenAiError(parsed.error));
    return;
  }

  const normalizedReq = parsed.request;
  if (!normalizedReq.stream) {
    try {
      const response = await engine.executeUnifiedRequest(normalizedReq);
      res.status(200).json(formatOpenAiCompletion(response));
    } catch (err) {
      const pe =
        err instanceof ProviderAdapterError
          ? err.providerError
          : createProviderError('UPSTREAM_ERROR', 'Unexpected gateway error', 500);
      res.status(pe.httpStatus).json(formatOpenAiError(pe));
    }
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const completionId = `chatcmpl-${requestId.slice(4)}`;
  let roleSent = false;

  req.on('close', () => {
    void engine.cancelActiveRequest(requestId);
  });

  try {
    const response = await engine.executeUnifiedRequest(normalizedReq, {
      onEvent: (event) => {
        if (event.type === 'delta' && event.deltaText) {
          if (!roleSent) {
            res.write(
              formatOpenAiStreamChunk({
                completionId,
                model: normalizedReq.requestedModel,
                role: 'assistant',
                deltaContent: '',
              })
            );
            roleSent = true;
          }
          res.write(
            formatOpenAiStreamChunk({
              completionId,
              model: normalizedReq.requestedModel,
              deltaContent: event.deltaText,
            })
          );
        }
      },
    });
    res.write(
      formatOpenAiStreamChunk({
        completionId,
        model: response.modelAlias,
        finishReason: 'stop',
      })
    );
    res.write(formatOpenAiStreamDone());
    res.end();
  } catch (err) {
    const pe =
      err instanceof ProviderAdapterError
        ? err.providerError
        : createProviderError('UPSTREAM_ERROR', 'Streaming failed', 500);
    res.write(`data: ${JSON.stringify(formatOpenAiError(pe))}\n\n`);
    res.write(formatOpenAiStreamDone());
    res.end();
  }
});

// =========================================================
// Anthropic-Compatible Endpoints
// =========================================================

v1Router.post('/messages/count_tokens', (req, res) => {
  if (!authorizeApiCall(req, res, 'anthropic')) return;
  const counted = countAnthropicTokens(req.body);
  if (!counted.ok) {
    res.status(counted.error.httpStatus).json(formatAnthropicError(counted.error));
    return;
  }
  res.json({ input_tokens: counted.input_tokens });
});

v1Router.post('/messages', async (req, res) => {
  if (!authorizeApiCall(req, res, 'anthropic')) return;
  const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
  const parsed = parseAnthropicMessagesRequest(req.body, requestId);
  if (!parsed.ok) {
    res.status(parsed.error.httpStatus).json(formatAnthropicError(parsed.error));
    return;
  }

  const normalizedReq = parsed.request;
  if (!normalizedReq.stream) {
    try {
      const response = await engine.executeUnifiedRequest(normalizedReq);
      res.status(200).json(formatAnthropicMessage(response));
    } catch (err) {
      const pe =
        err instanceof ProviderAdapterError
          ? err.providerError
          : createProviderError('UPSTREAM_ERROR', 'Unexpected gateway error', 500);
      res.status(pe.httpStatus).json(formatAnthropicError(pe));
    }
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const messageId = `msg_${requestId.slice(4)}`;
  let started = false;

  req.on('close', () => {
    void engine.cancelActiveRequest(requestId);
  });

  try {
    const response = await engine.executeUnifiedRequest(normalizedReq, {
      onEvent: (event) => {
        if (event.type === 'delta' && event.deltaText) {
          if (!started) {
            started = true;
            res.write(
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
            res.write(
              formatAnthropicSseEvent('content_block_start', {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              })
            );
          }
          res.write(
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
      res.write(
        formatAnthropicSseEvent('message_start', {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            model: response.modelAlias,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: response.usage.inputTokens, output_tokens: 0 },
          },
        })
      );
      res.write(
        formatAnthropicSseEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        })
      );
    }

    res.write(formatAnthropicSseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }));
    res.write(
      formatAnthropicSseEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: response.usage.outputTokens },
      })
    );
    res.write(formatAnthropicSseEvent('message_stop', { type: 'message_stop' }));
    res.end();
  } catch (err) {
    const pe =
      err instanceof ProviderAdapterError
        ? err.providerError
        : createProviderError('UPSTREAM_ERROR', 'Streaming failed', 500);
    res.write(formatAnthropicSseEvent('error', formatAnthropicError(pe)));
    res.end();
  }
});

// =========================================================
// Admin API Routes
// =========================================================

const OfficialApiSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(6),
  modelName: z.string().min(1),
});

adminRouter.get('/health', (_req, res) => {
  res.json(engine.getHealthSummary());
});

adminRouter.get('/providers', (_req, res) => {
  res.json({ providers: engine.getProviders(), runtimeMode: engine.getRuntimeMode() });
});

adminRouter.post('/providers/:id/enable', (req, res) => {
  try {
    res.json({ provider: engine.setProviderEnabled(req.params.id as ProviderId, true) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.post('/providers/:id/disable', (req, res) => {
  try {
    res.json({ provider: engine.setProviderEnabled(req.params.id as ProviderId, false) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.post('/providers/:id/connect', (req, res) => {
  const providerId = req.params.id as ProviderId;
  if (engine.getRuntimeMode() === 'development_simulation') {
    res.json({ provider: engine.connectSimulatedProvider(providerId) });
    return;
  }
  res.status(503).json({
    error: {
      code: 'BRIDGE_UNAVAILABLE',
      message:
        'Cannot open or attach to local Chrome tabs from the hosted preview. Run the local WebSession2API gateway and MV3 Chrome extension on your computer, or configure Official API Mode.',
    },
  });
});

adminRouter.post('/providers/:id/disconnect', async (req, res) => {
  try {
    res.json({ provider: await engine.disconnectProvider(req.params.id as ProviderId) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.post('/providers/:id/mode', (req, res) => {
  try {
    const mode = (req.body as { mode: IntegrationMode }).mode;
    if (mode !== 'browser_session' && mode !== 'official_api') {
      res.status(400).json({ error: 'Invalid mode' });
      return;
    }
    res.json({ provider: engine.setProviderMode(req.params.id as ProviderId, mode) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.post('/providers/:id/official-api', (req, res) => {
  const parsed = OfficialApiSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }
  try {
    res.json({ provider: engine.configureOfficialApi(req.params.id as ProviderId, parsed.data) });
  } catch (err) {
    const pe =
      err instanceof ProviderAdapterError
        ? err.providerError
        : createProviderError('INVALID_REQUEST', 'Failed to configure Official API', 400);
    res.status(pe.httpStatus).json({ error: pe.message, code: pe.code });
  }
});

adminRouter.delete('/providers/:id/official-api', (req, res) => {
  try {
    res.json({ provider: engine.clearOfficialApi(req.params.id as ProviderId) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.post('/providers/:id/test', async (req, res) => {
  const providerId = req.params.id as ProviderId;
  const requestId = `test_${crypto.randomBytes(6).toString('hex')}`;
  try {
    const response = await engine.executeUnifiedRequest({
      requestId,
      protocol: 'openai',
      requestedModel: providerId,
      messages: [{ role: 'user', content: 'Respond with OK to confirm connectivity.' }],
      stream: false,
      maxTokens: 32,
    });
    res.json({ ok: true, latencyMs: response.latencyMs, response });
  } catch (err) {
    const pe =
      err instanceof ProviderAdapterError
        ? err.providerError
        : createProviderError('UPSTREAM_ERROR', 'Provider test failed', 503);
    res.status(pe.httpStatus).json({ ok: false, error: pe });
  }
});

adminRouter.post('/providers/:id/diagnostics', async (req, res) => {
  try {
    const report = await engine.runProviderDiagnostics(req.params.id as ProviderId);
    res.json({ report });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

adminRouter.get('/compatibility-matrix', (_req, res) => {
  res.json({
    matrix: engine.getCompatibilityMatrix(),
    runtimeMode: engine.getRuntimeMode(),
  });
});

adminRouter.post('/providers/:id/verify', async (req, res) => {
  try {
    const result = await engine.runProviderVerification(req.params.id as ProviderId);
    res.json(result);
  } catch (err) {
    const pe =
      err instanceof ProviderAdapterError
        ? err.providerError
        : createProviderError('UPSTREAM_ERROR', 'Provider verification failed', 500);
    res.status(pe.httpStatus).json({ error: pe.message, code: pe.code });
  }
});

adminRouter.post('/verify-all', async (_req, res) => {
  const result = await engine.runAllProvidersVerification();
  res.json(result);
});

adminRouter.get('/models', async (_req, res) => {
  res.json({ models: await engine.getModels(), runtimeMode: engine.getRuntimeMode() });
});

adminRouter.get('/capabilities', (_req, res) => {
  res.json({ capabilities: engine.getCapabilitiesMatrix() });
});

adminRouter.get('/requests', (_req, res) => {
  res.json({ requests: engine.listRequests(100), runtimeMode: engine.getRuntimeMode() });
});

adminRouter.get('/routing', (_req, res) => {
  res.json(engine.getRoutingState());
});

adminRouter.put('/routing', (req, res) => {
  res.json({ config: engine.updateRoutingConfig(req.body as Record<string, unknown>) });
});

adminRouter.get('/agents', (_req, res) => {
  res.json({ agents: engine.getAgents() });
});

adminRouter.get('/agents/:id/config', (req, res) => {
  const model = typeof req.query.model === 'string' ? req.query.model : undefined;
  res.json(engine.getAgentConfig(req.params.id as AgentId, model));
});

adminRouter.post('/agents/:id/test', async (req, res) => {
  const agentId = req.params.id as AgentId;
  const models = await engine.getModels();
  const availableCount = models.filter((m) => m.available).length;
  const health = engine.getHealthSummary();
  res.json({
    ok: true,
    agentId,
    gatewayReachable: true,
    runtimeMode: health.runtimeMode,
    availableModelsCount: availableCount,
    protocolEndpoint:
      agentId === 'claude-code'
        ? `http://${health.host}:${health.port}/v1/messages`
        : `http://${health.host}:${health.port}/v1/chat/completions`,
    note:
      availableCount === 0
        ? 'Gateway API endpoint is reachable and healthy, but 0 providers are currently connected in Production Mode.'
        : `Gateway API endpoint is reachable with ${availableCount} available model(s).`,
  });
});

adminRouter.get('/settings', (_req, res) => {
  res.json({ settings: engine.getSettings() });
});

adminRouter.put('/settings', (req, res) => {
  res.json({ settings: engine.updateSettings(req.body as Record<string, unknown>) });
});

adminRouter.post('/settings/rotate-key', (_req, res) => {
  res.json(engine.rotateApiKey());
});

adminRouter.post('/runtime-mode', (req, res) => {
  const mode = (req.body as { mode: DashboardRuntimeMode }).mode;
  if (mode !== 'production' && mode !== 'development_simulation') {
    res.status(400).json({ error: 'Invalid runtime mode' });
    return;
  }
  res.json({ runtimeMode: engine.setRuntimeMode(mode) });
});

app.use('/v1', v1Router);
app.use('/api/v1', v1Router);
app.use('/admin', adminRouter);
app.use('/api/admin', adminRouter);

app.post('/internal/bridge/event', (req, res) => {
  const provided = extractBearerOrApiKey(req.headers);
  if (!engine.verifyGatewayApiKey(provided)) {
    res.status(401).json({ error: 'Unauthorized bridge event' });
    return;
  }
  res.json(engine.ingestBridgeEvent(req.body));
});

// Mount Vite middleware in development or static dist/ in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WebSession2API] Control Plane & Gateway listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[WebSession2API] Failed to start server:', err);
  process.exit(1);
});
