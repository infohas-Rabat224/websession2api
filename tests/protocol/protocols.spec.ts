import { describe, it, expect } from 'vitest';
import {
  parseOpenAiChatRequest,
  formatOpenAiCompletion,
  formatOpenAiStreamChunk,
} from '../../packages/openai-compat/src/index';
import {
  parseAnthropicMessagesRequest,
  countAnthropicTokens,
  formatAnthropicMessage,
  formatAnthropicSseEvent,
} from '../../packages/anthropic-compat/src/index';
import { validateRequestAgainstCapabilities } from '../../packages/provider-sdk/src/index';
import { DeepSeekProviderAdapter } from '../../providers/deepseek/src/index';

describe('OpenAI & Anthropic Protocol Compatibility', () => {
  it('parses valid OpenAI chat requests and rejects unsupported parameters explicitly', () => {
    const ok = parseOpenAiChatRequest(
      {
        model: 'deepseek-web',
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hello' },
        ],
        stream: true,
      },
      'req_1'
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.request.systemPrompt).toBe('Be brief.');
      expect(ok.request.messages).toHaveLength(1);
    }

    const badN = parseOpenAiChatRequest(
      { model: 'deepseek-web', messages: [{ role: 'user', content: 'Hi' }], n: 3 },
      'req_2'
    );
    expect(badN.ok).toBe(false);
    if (!badN.ok) {
      expect(badN.error.code).toBe('UNSUPPORTED_PARAMETER');
    }

    const unknownField = parseOpenAiChatRequest(
      { model: 'deepseek-web', messages: [{ role: 'user', content: 'Hi' }], undocumented_flag: true },
      'req_3'
    );
    expect(unknownField.ok).toBe(false);
  });

  it('rejects native tool definitions on text-only browser sessions instead of pretending', () => {
    const deepseek = new DeepSeekProviderAdapter();
    const parsed = parseOpenAiChatRequest(
      {
        model: 'deepseek-web',
        messages: [{ role: 'user', content: 'Run tool' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              parameters: { type: 'object', properties: { path: { type: 'string' } } },
            },
          },
        ],
      },
      'req_tools'
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const capErr = validateRequestAgainstCapabilities(
        parsed.request,
        deepseek.getCapabilities(),
        'deepseek'
      );
      expect(capErr).not.toBeNull();
      expect(capErr?.code).toBe('UNSUPPORTED_CAPABILITY');
      expect(capErr?.httpStatus).toBe(422);
    }
  });

  it('parses Anthropic messages, counts tokens, and formats SSE frames', () => {
    const parsed = parseAnthropicMessagesRequest(
      {
        model: 'glm-web',
        max_tokens: 512,
        system: 'System rule',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Explain GLM' }] }],
      },
      'req_ant_1'
    );
    expect(parsed.ok).toBe(true);

    const counted = countAnthropicTokens({
      model: 'glm-web',
      messages: [{ role: 'user', content: 'Count these tokens accurately.' }],
    });
    expect(counted.ok).toBe(true);
    if (counted.ok) {
      expect(counted.input_tokens).toBeGreaterThan(0);
    }

    const msg = formatAnthropicMessage({
      requestId: 'req_ant_1',
      providerId: 'zai',
      modelAlias: 'glm-web',
      visibleModelName: 'GLM-4.5',
      content: 'Hello from GLM',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, estimated: true },
      latencyMs: 120,
      mode: 'browser_session',
      isSimulated: false,
    });
    expect(msg.type).toBe('message');
    expect(msg.stop_reason).toBe('end_turn');

    const sse = formatAnthropicSseEvent('message_stop', { type: 'message_stop' });
    expect(sse).toContain('event: message_stop');

    const oaChunk = formatOpenAiStreamChunk({
      completionId: 'chatcmpl-1',
      model: 'deepseek-web',
      deltaContent: 'Hi',
    });
    expect(oaChunk).toContain('data: ');

    const oaResp = formatOpenAiCompletion({
      requestId: 'req_1',
      providerId: 'deepseek',
      modelAlias: 'deepseek-web',
      visibleModelName: 'DeepSeek-V3',
      content: 'Done',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, estimated: true },
      latencyMs: 50,
      mode: 'browser_session',
      isSimulated: false,
    });
    expect(oaResp.object).toBe('chat.completion');
  });
});
