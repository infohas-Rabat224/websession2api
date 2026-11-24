import { z } from 'zod';
import crypto from 'node:crypto';
import type {
  ModelInfo,
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  NormalizedResponse,
  NormalizedToolDefinition,
  ProviderError,
} from '../../shared-types/src/index';
import { createProviderError } from '../../provider-sdk/src/index';

const OpenAiContentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.union([z.string(), z.object({ url: z.string() })]),
  }),
]);

const OpenAiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const OpenAiMessageSchema = z.object({
  role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(OpenAiContentPartSchema), z.null()]).optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(OpenAiToolCallSchema).optional(),
});

const OpenAiToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const OpenAiChatCompletionRequestSchema = z
  .object({
    model: z.string().min(1, 'model is required'),
    messages: z.array(OpenAiMessageSchema).min(1, 'messages must contain at least one message'),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    tools: z.array(OpenAiToolSchema).optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) }),
      ])
      .optional(),
    response_format: z
      .object({
        type: z.enum(['text', 'json_object', 'json_schema']),
      })
      .optional(),
    n: z.number().int().optional(),
    logprobs: z.boolean().optional(),
    top_logprobs: z.number().int().optional(),
    audio: z.unknown().optional(),
    modalities: z.array(z.string()).optional(),
    user: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export type OpenAiChatCompletionRequest = z.infer<typeof OpenAiChatCompletionRequestSchema>;

const KNOWN_FIELDS = new Set([
  'model',
  'messages',
  'stream',
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
  'stop',
  'tools',
  'tool_choice',
  'response_format',
  'n',
  'logprobs',
  'top_logprobs',
  'audio',
  'modalities',
  'user',
  'metadata',
  'stream_options',
  'frequency_penalty',
  'presence_penalty',
]);

export function parseOpenAiChatRequest(
  rawBody: unknown,
  requestId: string
): { ok: true; request: NormalizedRequest } | { ok: false; error: ProviderError } {
  const parsed = OpenAiChatCompletionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      error: createProviderError(
        'INVALID_REQUEST',
        `Invalid OpenAI chat completion request: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ')}`,
        400
      ),
    };
  }

  const data = parsed.data;

  // Reject unsupported parameters explicitly instead of silently discarding them
  if (data.n !== undefined && data.n !== 1) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        `Parameter "n=${data.n}" is not supported; WebSession2API supports only n=1.`,
        400,
        { details: { unsupportedParameter: 'n' } }
      ),
    };
  }

  if (data.logprobs || data.top_logprobs !== undefined) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        'Parameters "logprobs" and "top_logprobs" are not supported by WebSession2API.',
        400,
        { details: { unsupportedParameter: 'logprobs' } }
      ),
    };
  }

  if (data.audio !== undefined) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        'Parameter "audio" is not supported by WebSession2API.',
        400,
        { details: { unsupportedParameter: 'audio' } }
      ),
    };
  }

  if (data.response_format?.type === 'json_schema') {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        'response_format.type="json_schema" is not supported across unified browser sessions.',
        422,
        { details: { unsupportedParameter: 'response_format' } }
      ),
    };
  }

  // Detect any unknown top-level parameters so we do not silently discard them
  const unknownKeys = Object.keys(data).filter((k) => !KNOWN_FIELDS.has(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        `Unsupported OpenAI request parameter(s): ${unknownKeys.join(', ')}. WebSession2API refuses to silently ignore unknown parameters.`,
        400,
        { details: { unsupportedParameters: unknownKeys } }
      ),
    };
  }

  const systemParts: string[] = [];
  const normalizedMessages: NormalizedMessage[] = [];

  for (const msg of data.messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n')
            : '';
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === 'tool') {
      const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      normalizedMessages.push({
        role: 'tool',
        toolCallId: msg.tool_call_id,
        content: [
          {
            type: 'tool_result',
            toolUseId: msg.tool_call_id || 'unknown',
            content: contentStr,
          },
        ],
      });
      continue;
    }

    const parts: NormalizedContentPart[] = [];
    if (typeof msg.content === 'string') {
      parts.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          parts.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url') {
          const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
          parts.push({ type: 'image_url', imageUrl: url });
        }
      }
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          parsedArgs = { raw: tc.function.arguments };
        }
        parts.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: parsedArgs,
        });
      }
    }

    normalizedMessages.push({
      role: msg.role,
      name: msg.name,
      content:
        parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts,
    });
  }

  const tools: NormalizedToolDefinition[] | undefined = data.tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters ?? { type: 'object', properties: {} },
  }));

  const stopSequences =
    typeof data.stop === 'string' ? [data.stop] : Array.isArray(data.stop) ? data.stop : undefined;

  const toolChoice =
    typeof data.tool_choice === 'string'
      ? data.tool_choice
      : data.tool_choice
        ? { type: 'tool' as const, name: data.tool_choice.function.name }
        : undefined;

  return {
    ok: true,
    request: {
      requestId,
      protocol: 'openai',
      requestedModel: data.model,
      conversationId: data.metadata?.conversation_id || data.user,
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: normalizedMessages,
      stream: Boolean(data.stream),
      maxTokens: data.max_completion_tokens ?? data.max_tokens,
      temperature: data.temperature,
      topP: data.top_p,
      stopSequences,
      tools,
      toolChoice,
      responseFormat: data.response_format?.type === 'json_object' ? 'json_object' : 'text',
      metadata: data.metadata,
    },
  };
}

export function formatOpenAiCompletion(response: NormalizedResponse) {
  const created = Math.floor(Date.now() / 1000);
  const completionId = `chatcmpl-${response.requestId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || crypto.randomBytes(8).toString('hex')}`;

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: response.content || (response.toolCalls?.length ? null : ''),
  };

  if (response.toolCalls && response.toolCalls.length > 0) {
    message.tool_calls = response.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.input),
      },
    }));
  }

  return {
    id: completionId,
    object: 'chat.completion',
    created,
    model: response.modelAlias,
    choices: [
      {
        index: 0,
        message,
        logprobs: null,
        finish_reason: response.finishReason === 'tool_calls' ? 'tool_calls' : response.finishReason === 'length' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.totalTokens,
    },
    system_fingerprint: `ws2a_${response.providerId}_${response.mode}`,
  };
}

export function formatOpenAiStreamChunk(params: {
  completionId: string;
  model: string;
  deltaContent?: string;
  role?: 'assistant';
  finishReason?: 'stop' | 'length' | 'tool_calls' | null;
}): string {
  const payload = {
    id: params.completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        delta: {
          ...(params.role ? { role: params.role } : {}),
          ...(params.deltaContent !== undefined ? { content: params.deltaContent } : {}),
        },
        logprobs: null,
        finish_reason: params.finishReason ?? null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function formatOpenAiStreamDone(): string {
  return 'data: [DONE]\n\n';
}

export function formatOpenAiModelsList(models: ModelInfo[]) {
  const now = Math.floor(Date.now() / 1000);
  const items: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const m of models) {
    for (const id of [m.alias, m.prefixedAlias]) {
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        object: 'model',
        created: now,
        owned_by: `websession2api:${m.providerId}`,
        websession2api: {
          provider: m.providerId,
          visible_model_name: m.visibleModelName,
          available: m.available,
          authentication_state: m.authenticationState,
          mode: m.mode,
          capabilities: m.capabilities,
          is_simulated: m.isSimulated,
        },
      });
    }
  }

  return {
    object: 'list',
    data: items,
  };
}

export function formatOpenAiError(error: ProviderError) {
  const type =
    error.httpStatus === 401
      ? 'authentication_error'
      : error.httpStatus === 429
        ? 'rate_limit_error'
        : error.httpStatus >= 500
          ? 'server_error'
          : 'invalid_request_error';

  return {
    error: {
      message: error.message,
      type,
      code: error.code,
      param:
        typeof error.details?.unsupportedParameter === 'string'
          ? error.details.unsupportedParameter
          : null,
    },
  };
}
