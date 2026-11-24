import type {
  AgentId,
  AgentProfile,
  GatewaySettings,
  ProviderId,
  RoutingConfig,
  RoutingRule,
} from '../../shared-types/src/index';

export const DEFAULT_GATEWAY_HOST = '127.0.0.1';
export const DEFAULT_GATEWAY_PORT = 8787;
export const NATIVE_HOST_NAME = 'com.websession2api.host';

export const PROVIDER_MODEL_ALIASES: Record<
  ProviderId,
  { alias: string; prefixedAlias: string; defaultOfficialBaseUrl: string; defaultOfficialModel: string }
> = {
  deepseek: {
    alias: 'deepseek-web',
    prefixedAlias: 'websession/deepseek',
    defaultOfficialBaseUrl: 'https://api.deepseek.com/v1',
    defaultOfficialModel: 'deepseek-chat',
  },
  zai: {
    alias: 'glm-web',
    prefixedAlias: 'websession/glm',
    defaultOfficialBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultOfficialModel: 'glm-4.5',
  },
  kimi: {
    alias: 'kimi-web',
    prefixedAlias: 'websession/kimi',
    defaultOfficialBaseUrl: 'https://api.moonshot.ai/v1',
    defaultOfficialModel: 'moonshot-v1-8k',
  },
  qwen: {
    alias: 'qwen-web',
    prefixedAlias: 'websession/qwen',
    defaultOfficialBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultOfficialModel: 'qwen-plus',
  },
  claude: {
    alias: 'claude-web',
    prefixedAlias: 'websession/claude',
    defaultOfficialBaseUrl: 'https://api.anthropic.com',
    defaultOfficialModel: 'claude-sonnet-4-20250514',
  },
  chatgpt: {
    alias: 'chatgpt-web',
    prefixedAlias: 'websession/chatgpt',
    defaultOfficialBaseUrl: 'https://api.openai.com/v1',
    defaultOfficialModel: 'gpt-4o-mini',
  },
  gemini: {
    alias: 'gemini-web',
    prefixedAlias: 'websession/gemini',
    defaultOfficialBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultOfficialModel: 'gemini-2.5-flash',
  },
};

export function createDefaultSettings(apiKeyPrefix: string): GatewaySettings {
  return {
    host: process.env.WEBSESSION2API_HOST || DEFAULT_GATEWAY_HOST,
    port: Number(process.env.WEBSESSION2API_PORT || DEFAULT_GATEWAY_PORT),
    apiAuthEnabled: true,
    apiKeyPrefix,
    apiKeyLastRotatedAt: new Date().toISOString(),
    loopbackOnly: true,
    dnsRebindingProtection: true,
    originValidationEnabled: true,
    csrfProtectionEnabled: true,
    maxRequestBodyBytes: 2 * 1024 * 1024, // 2 MiB
    rateLimitPerMinute: 60,
    maxConcurrency: 4,
    defaultTimeoutMs: 90_000,
    logPromptsAndResponses: false,
    retentionDays: 14,
    nativeHostId: NATIVE_HOST_NAME,
    allowedExtensionIds: (process.env.WEBSESSION2API_ALLOWED_EXTENSION_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    runtimeMode: 'production',
  };
}

export function createDefaultRoutingConfig(): RoutingConfig {
  return {
    defaultProviderId: 'deepseek',
    defaultModelAlias: 'deepseek-web',
    fallbackEnabled: true,
    providerPriority: ['deepseek', 'zai', 'claude', 'chatgpt', 'kimi', 'qwen', 'gemini'],
    taskPreferences: {
      coding: ['deepseek-web', 'glm-web', 'claude-web'],
      'long-context': ['kimi-web', 'gemini-web'],
      general: ['chatgpt-web', 'glm-web'],
    },
    maxConcurrencyPerProvider: 2,
    maxQueueDepth: 32,
    requestTimeoutMs: 90_000,
    strictConversationPinning: true,
  };
}

export function createDefaultRoutingRules(): RoutingRule[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'rule_coding',
      name: 'Coding Preference',
      taskCategory: 'coding',
      preferredAliases: ['deepseek-web', 'glm-web', 'claude-web'],
      fallbackEnabled: true,
      priorityOrder: ['deepseek', 'zai', 'claude'],
      allowSilentMidConversationSwitch: false,
      enabled: true,
      updatedAt: now,
    },
    {
      id: 'rule_long_context',
      name: 'Long-Context Preference',
      taskCategory: 'long-context',
      preferredAliases: ['kimi-web', 'gemini-web'],
      fallbackEnabled: true,
      priorityOrder: ['kimi', 'gemini'],
      allowSilentMidConversationSwitch: false,
      enabled: true,
      updatedAt: now,
    },
    {
      id: 'rule_general',
      name: 'General Preference',
      taskCategory: 'general',
      preferredAliases: ['chatgpt-web', 'glm-web'],
      fallbackEnabled: true,
      priorityOrder: ['chatgpt', 'zai'],
      allowSilentMidConversationSwitch: false,
      enabled: true,
      updatedAt: now,
    },
  ];
}

export function getAgentProfiles(host = DEFAULT_GATEWAY_HOST, port = DEFAULT_GATEWAY_PORT): AgentProfile[] {
  const baseUrl = `http://${host}:${port}`;
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      protocol: 'anthropic',
      endpointUrl: baseUrl,
      compatibilityStatus: 'requires_native_tools',
      versionNotes:
        'Claude Code (>=1.0.x) calls POST /v1/messages and POST /v1/messages/count_tokens with native tool_use schemas. Full agentic workflows require Official API Mode or a provider supporting native tool calls; browser text-only sessions return an explicit UNSUPPORTED_CAPABILITY error when tools[] are requested.',
      toolExecutionWarning:
        'Browser Session Mode providers are text-only and will reject structured tool_use requests rather than faking tool calls. Use Official API Mode (e.g. Claude or DeepSeek API) for full Claude Code tool loops.',
      configFilename: 'claude-code.env',
      configFormat: 'env',
    },
    {
      id: 'hermes',
      name: 'Hermes Agent',
      protocol: 'openai',
      endpointUrl: `${baseUrl}/v1`,
      compatibilityStatus: 'verified_contract',
      versionNotes:
        'Hermes Agent connects via OpenAI Chat Completions (/v1/chat/completions) and /v1/models. Text chat & streaming work with browser sessions; function calling requires Official API Mode.',
      toolExecutionWarning:
        'When Hermes sends OpenAI tools[], browser-session providers explicitly return 422 UNSUPPORTED_CAPABILITY instead of silently dropping tool definitions.',
      configFilename: 'hermes-config.yaml',
      configFormat: 'yaml',
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      protocol: 'openai',
      endpointUrl: `${baseUrl}/v1`,
      compatibilityStatus: 'verified_contract',
      versionNotes:
        'OpenCode custom OpenAI-compatible provider configuration targets /v1/chat/completions with SSE streaming. Compatible with model aliases such as deepseek-web and glm-web.',
      toolExecutionWarning:
        'OpenCode agentic tool execution requires native provider tool calling (Official API Mode). Browser sessions support chat and code generation without automated tool execution.',
      configFilename: 'opencode.json',
      configFormat: 'json',
    },
    {
      id: 'cline',
      name: 'Cline',
      protocol: 'openai',
      endpointUrl: `${baseUrl}/v1`,
      compatibilityStatus: 'partial_text_only',
      versionNotes:
        'Cline (VS Code extension) supports OpenAI Compatible custom base URLs and can execute XML-prompted agent-side tools over plain chat text when configured for non-native tool calling, or native tools in Official API Mode.',
      toolExecutionWarning:
        'WebSession2API never executes arbitrary coding-agent commands inside the Chrome extension. All workspace file/command execution stays strictly inside Cline.',
      configFilename: 'cline-provider.json',
      configFormat: 'json',
    },
    {
      id: 'roo-code',
      name: 'Roo Code',
      protocol: 'openai',
      endpointUrl: `${baseUrl}/v1`,
      compatibilityStatus: 'partial_text_only',
      versionNotes:
        'Roo Code supports OpenAI Compatible endpoints at http://127.0.0.1:8787/v1 with custom model IDs (deepseek-web, glm-web, websession/deepseek).',
      toolExecutionWarning:
        'Structured OpenAI tools[] requests are rejected on text-only browser sessions. Configure Roo Code prompt-based tool mode or switch the provider to Official API Mode.',
      configFilename: 'roo-code-provider.json',
      configFormat: 'json',
    },
  ];
}

export function generateAgentConfigSnippet(
  agentId: AgentId,
  options: {
    host?: string;
    port?: number;
    apiKeyPlaceholder?: string;
    modelAlias?: string;
  } = {}
): { filename: string; format: 'env' | 'json' | 'yaml'; content: string } {
  const host = options.host || DEFAULT_GATEWAY_HOST;
  const port = options.port || DEFAULT_GATEWAY_PORT;
  const apiKey = options.apiKeyPlaceholder || '<YOUR_LOCAL_WEBSESSION2API_KEY>';
  const model = options.modelAlias || 'deepseek-web';
  const baseUrl = `http://${host}:${port}`;

  switch (agentId) {
    case 'claude-code':
      return {
        filename: 'claude-code.env',
        format: 'env',
        content: [
          '# Claude Code -> WebSession2API Anthropic-Compatible Gateway',
          `ANTHROPIC_BASE_URL=${baseUrl}`,
          `ANTHROPIC_AUTH_TOKEN=${apiKey}`,
          `ANTHROPIC_MODEL=${model}`,
          '# Note: Native tool_use requires a provider configured in Official API Mode.',
        ].join('\n'),
      };
    case 'hermes':
      return {
        filename: 'hermes-config.yaml',
        format: 'yaml',
        content: [
          '# Hermes Agent -> WebSession2API OpenAI-Compatible Gateway',
          'provider:',
          '  type: openai_compatible',
          `  base_url: "${baseUrl}/v1"`,
          `  api_key: "${apiKey}"`,
          `  model: "${model}"`,
          '  stream: true',
          '  native_tools: false # Set true only when provider runs in Official API Mode',
        ].join('\n'),
      };
    case 'opencode':
      return {
        filename: 'opencode.json',
        format: 'json',
        content: JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            provider: {
              websession2api: {
                npm: '@ai-sdk/openai-compatible',
                name: 'WebSession2API Local Gateway',
                options: {
                  baseURL: `${baseUrl}/v1`,
                  apiKey,
                },
                models: {
                  [model]: { name: model },
                  'glm-web': { name: 'glm-web' },
                  'websession/deepseek': { name: 'websession/deepseek' },
                  'websession/glm': { name: 'websession/glm' },
                },
              },
            },
            model: `websession2api/${model}`,
          },
          null,
          2
        ),
      };
    case 'cline':
      return {
        filename: 'cline-provider.json',
        format: 'json',
        content: JSON.stringify(
          {
            apiProvider: 'openai',
            openAiBaseUrl: `${baseUrl}/v1`,
            openAiApiKey: apiKey,
            openAiModelId: model,
            openAiModelInfo: {
              supportsImages: false,
              supportsPromptCache: false,
            },
          },
          null,
          2
        ),
      };
    case 'roo-code':
      return {
        filename: 'roo-code-provider.json',
        format: 'json',
        content: JSON.stringify(
          {
            apiProvider: 'openai',
            openAiBaseUrl: `${baseUrl}/v1`,
            openAiApiKey: apiKey,
            openAiModelId: model,
            openAiCustomModelInfo: {
              supportsImages: false,
              supportsPromptCache: false,
              supportsComputerUse: false,
            },
          },
          null,
          2
        ),
      };
  }
}
