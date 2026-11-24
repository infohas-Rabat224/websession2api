import { z } from 'zod';
import crypto from 'node:crypto';
import type {
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  NormalizedResponse,
  NormalizedToolDefinition,
  ProviderError,
} from '../../shared-types/src/index';
import { createProviderError, estimateTokenCount, flattenMessagesToText } from '../../provider-sdk/src/index';

const AnthropicContentBlockSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.enum(['base64', 'url']),
      media_type: z.string().optional(),
      data: z.string().optional(),
      url: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.union([
      z.string(),
      z.array(z.object({ type: z.literal('text'), text: z.string() })),
    ]),
    is_error: z.boolean().optional(),
  }),
]);

const AnthropicMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(AnthropicContentBlockSchema)]),
});

const AnthropicToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  input_schema: z.record(z.string(), z.unknown()),
});

export const AnthropicMessagesRequestSchema = z
  .object({
    model: z.string().min(1, 'model is required'),
    max_tokens: z.number().int().positive('max_tokens must be a positive integer'),
    messages: z.array(AnthropicMessageSchema).min(1, 'messages must not be empty'),
    system: z
      .union([
        z.string(),
        z.array(z.object({ type: z.literal('text'), text: z.string() }).passthrough()),
      ])
      .optional(),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    stop_sequences: z.array(z.string()).optional(),
    tools: z.array(AnthropicToolSchema).optional(),
    tool_choice: z
      .union([
        z.object({ type: z.literal('auto') }),
        z.object({ type: z.literal('any') }),
        z.object({ type: z.literal('none') }),
        z.object({ type: z.literal('tool'), name: z.string() }),
      ])
      .optional(),
    metadata: z.object({ user_id: z.string().optional() }).passthrough().optional(),
    thinking: z.unknown().optional(),
  })
  .passthrough();

export const AnthropicCountTokensRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(AnthropicMessageSchema).min(1),
  system: z
    .union([
      z.string(),
      z.array(z.object({ type: z.literal('text'), text: z.string() }).passthrough()),
    ])
    .optional(),
  tools: z.array(AnthropicToolSchema).optional(),
});

const KNOWN_ANTHROPIC_FIELDS = new Set([
  'model',
  'max_tokens',
  'messages',
  'system',
  'stream',
  'temperature',
  'top_p',
  'top_k',
  'stop_sequences',
  'tools',
  'tool_choice',
  'metadata',
  'thinking',
]);

export function parseAnthropicMessagesRequest(
  rawBody: unknown,
  requestId: string
): { ok: true; request: NormalizedRequest } | { ok: false; error: ProviderError } {
  const parsed = AnthropicMessagesRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      error: createProviderError(
        'INVALID_REQUEST',
        `Invalid Anthropic messages request: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ')}`,
        400
      ),
    };
  }

  const data = parsed.data;

  if (data.thinking !== undefined) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        'Parameter "thinking" (extended thinking) is not uniformly supported by WebSession2API browser adapters.',
        422,
        { details: { unsupportedParameter: 'thinking' } }
      ),
    };
  }

  const unknownKeys = Object.keys(data).filter((k) => !KNOWN_ANTHROPIC_FIELDS.has(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: createProviderError(
        'UNSUPPORTED_PARAMETER',
        `Unsupported Anthropic request parameter(s): ${unknownKeys.join(', ')}.`,
        400,
        { details: { unsupportedParameters: unknownKeys } }
      ),
    };
  }

  const systemPrompt =
    typeof data.system === 'string'
      ? data.system
      : Array.isArray(data.system)
        ? data.system.map((b) => b.text).join('\n\n')
        : undefined;

  const normalizedMessages: NormalizedMessage[] = data.messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    const parts: NormalizedContentPart[] = msg.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'image') {
        const url =
          block.source.type === 'url'
            ? block.source.url || ''
            : `data:${block.source.media_type || 'image/png'};base64,${block.source.data || ''}`;
        return { type: 'image_url', imageUrl: url, mediaType: block.source.media_type };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      const resultText =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((c) => c.text).join('\n');
      return {
        type: 'tool_result',
        toolUseId: block.tool_use_id,
        content: resultText,
        isError: block.is_error,
      };
    });
    return { role: msg.role, content: parts };
  });

  const tools: NormalizedToolDefinition[] | undefined = data.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));

  const toolChoice =
    data.tool_choice?.type === 'auto'
      ? 'auto'
      : data.tool_choice?.type === 'none'
        ? 'none'
        : data.tool_choice?.type === 'any'
          ? 'required'
          : data.tool_choice?.type === 'tool'
            ? { type: 'tool' as const, name: data.tool_choice.name }
            : undefined;

  return {
    ok: true,
    request: {
      requestId,
      protocol: 'anthropic',
      requestedModel: data.model,
      conversationId: data.metadata?.user_id,
      systemPrompt,
      messages: normalizedMessages,
      stream: Boolean(data.stream),
      maxTokens: data.max_tokens,
      temperature: data.temperature,
      topP: data.top_p,
      stopSequences: data.stop_sequences,
      tools,
      toolChoice,
      responseFormat: 'text',
    },
  };
}

export function countAnthropicTokens(
  rawBody: unknown
): { ok: true; input_tokens: number } | { ok: false; error: ProviderError } {
  const parsed = AnthropicCountTokensRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      error: createProviderError(
        'INVALID_REQUEST',
        `Invalid count_tokens request: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        400
      ),
    };
  }

  const normalized = parseAnthropicMessagesRequest(
    { ...parsed.data, max_tokens: 1 },
    'count_tokens'
  );
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  let text = flattenMessagesToText(normalized.request);
  if (parsed.data.tools && parsed.data.tools.length > 0) {
    text += '\n' + JSON.stringify(parsed.data.tools);
  }
  return { ok: true, input_tokens: estimateTokenCount(text) };
}

export function formatAnthropicMessage(response: NormalizedResponse) {
  const messageId = `msg_${response.requestId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || crypto.randomBytes(8).toString('hex')}`;
  const contentBlocks: Array<Record<string, unknown>> = [];

  if (response.content) {
    contentBlocks.push({ type: 'text', text: response.content });
  }
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const tc of response.toolCalls) {
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
  }
  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: 'text', text: '' });
  }

  const stopReason =
    response.finishReason === 'tool_calls'
      ? 'tool_use'
      : response.finishReason === 'length'
        ? 'max_tokens'
        : 'end_turn';

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    model: response.modelAlias,
    content: contentBlocks,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
    },
  };
}

export function formatAnthropicSseEvent(eventName: string, payload: Record<string, unknown>): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function formatAnthropicError(error: ProviderError) {
  const type =
    error.httpStatus === 401
      ? 'authentication_error'
      : error.httpStatus === 429
        ? 'rate_limit_error'
        : error.httpStatus >= 500
          ? 'api_error'
          : 'invalid_request_error';

  return {
    type: 'error',
    error: {
      type,
      message: error.message,
      code: error.code,
    },
  };
}
