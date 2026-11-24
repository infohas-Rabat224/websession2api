import type {
  AuthenticationStatus,
  IntegrationMode,
  ModelInfo,
  NormalizedRequest,
  NormalizedResponse,
  ProviderCapabilities,
  ProviderError,
  ProviderErrorCode,
  ProviderEvent,
  ProviderId,
  ProviderOperationalStatus,
  ProviderRequestHandle,
  ProviderStatus,
  ProviderVerificationReport,
  SelectorDiagnosticResult,
  SelectorHealthReport,
  SessionStatus,
  VerificationStatus,
} from '../../shared-types/src/index';

export * from './verification';

export interface ProviderSelectorConfig {
  authIndicator: string;
  loginPromptIndicator: string;
  composerInput: string;
  submitButton: string;
  responseContainer: string;
  streamingIndicator: string;
  stopButton: string;
  modelBadge: string;
  errorBanner: string;
  captchaIndicator: string;
}

export interface BrowserBridgeDispatch {
  isConnected: () => boolean;
  sendRequest: (
    providerId: ProviderId,
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ) => Promise<NormalizedResponse>;
  cancelRequest: (providerId: ProviderId, requestId: string) => Promise<boolean>;
  runSelectorDiagnostics: (
    providerId: ProviderId,
    selectors: ProviderSelectorConfig
  ) => Promise<SelectorHealthReport | null>;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  readonly shortName: string;
  readonly domain: string;
  readonly url: string;
  readonly driverVersion: string;
  readonly verificationStatus: VerificationStatus;
  readonly selectors: ProviderSelectorConfig;

  detectSession(): Promise<{
    sessionStatus: SessionStatus;
    activeTabId: number | null;
    activeTabTitle: string | null;
    activeTabUrl: string | null;
    visibleModelName: string | null;
  }>;

  getAuthenticationStatus(): Promise<AuthenticationStatus>;

  getAvailableModels(): Promise<ModelInfo[]>;

  getCapabilities(): ProviderCapabilities;

  submitMessage(
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<{ handle: ProviderRequestHandle; completion: Promise<NormalizedResponse> }>;

  collectResponse(handle: ProviderRequestHandle): Promise<NormalizedResponse>;

  cancelRequest(requestId: string): Promise<boolean>;

  getProviderStatus(): ProviderStatus;

  runDiagnostics(): Promise<SelectorHealthReport>;

  disconnect(): Promise<void>;
}

export function createProviderError(
  code: ProviderErrorCode,
  message: string,
  httpStatus: number,
  options: {
    providerId?: ProviderId;
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {}
): ProviderError {
  return {
    code,
    message,
    providerId: options.providerId,
    retryable: options.retryable ?? false,
    httpStatus,
    details: options.details,
    timestamp: new Date().toISOString(),
  };
}

export class ProviderAdapterError extends Error {
  public readonly providerError: ProviderError;

  constructor(error: ProviderError) {
    super(error.message);
    this.name = 'ProviderAdapterError';
    this.providerError = error;
  }
}

export function validateRequestAgainstCapabilities(
  request: NormalizedRequest,
  capabilities: ProviderCapabilities,
  providerId: ProviderId
): ProviderError | null {
  if (request.tools && request.tools.length > 0 && !capabilities.nativeToolCalling) {
    return createProviderError(
      'UNSUPPORTED_CAPABILITY',
      `Provider "${providerId}" in current mode (${capabilities.toolCallingMode}) does not support native structured tool calling (tools[]). WebSession2API will not pretend ordinary chat text is a structured tool call. Switch this provider to Official API Mode or disable native tool schemas.`,
      422,
      {
        providerId,
        retryable: false,
        details: {
          unsupportedParameter: 'tools',
          toolCallingMode: capabilities.toolCallingMode,
          nativeToolCalling: capabilities.nativeToolCalling,
        },
      }
    );
  }

  const hasToolResult = request.messages.some((m) => {
    if (m.role === 'tool') return true;
    if (Array.isArray(m.content)) {
      return m.content.some((part) => part.type === 'tool_result' || part.type === 'tool_use');
    }
    return false;
  });

  if (hasToolResult && !capabilities.toolResults) {
    return createProviderError(
      'UNSUPPORTED_CAPABILITY',
      `Provider "${providerId}" does not support structured tool_use/tool_result blocks in ${capabilities.toolCallingMode} mode.`,
      422,
      {
        providerId,
        retryable: false,
        details: { unsupportedParameter: 'tool_result' },
      }
    );
  }

  const hasImage = request.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'image_url')
  );

  if (hasImage && !capabilities.multimodalImages) {
    return createProviderError(
      'UNSUPPORTED_CAPABILITY',
      `Provider "${providerId}" does not support multimodal image inputs in its current mode.`,
      422,
      {
        providerId,
        retryable: false,
        details: { unsupportedParameter: 'image_url' },
      }
    );
  }

  const hasAttachment = request.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'file_attachment')
  );

  if (hasAttachment && !capabilities.fileAttachments) {
    return createProviderError(
      'UNSUPPORTED_CAPABILITY',
      `Provider "${providerId}" does not support file attachments in its current mode.`,
      422,
      {
        providerId,
        retryable: false,
        details: { unsupportedParameter: 'file_attachment' },
      }
    );
  }

  if (request.responseFormat === 'json_object' && !capabilities.jsonMode) {
    return createProviderError(
      'UNSUPPORTED_PARAMETER',
      `Provider "${providerId}" does not guarantee response_format=json_object in browser session mode.`,
      422,
      {
        providerId,
        retryable: false,
        details: { unsupportedParameter: 'response_format' },
      }
    );
  }

  return null;
}

export function buildStaticSelectorDiagnostics(
  driverVersion: string,
  selectors: ProviderSelectorConfig,
  bridgeConnected: boolean,
  matchedMap?: Partial<Record<keyof ProviderSelectorConfig, { count: number; visible: boolean }>>
): SelectorHealthReport {
  const keys = Object.keys(selectors) as (keyof ProviderSelectorConfig)[];
  const results: SelectorDiagnosticResult[] = keys.map((key) => {
    const observed = matchedMap?.[key];
    const matched = observed ? observed.count > 0 : false;
    const visible = observed ? observed.visible : false;
    let warning: string | undefined;
    if (!bridgeConnected && !observed) {
      warning = 'Chrome extension bridge not connected; selector not yet verified against a live tab.';
    } else if (observed && observed.count === 0 && (key === 'composerInput' || key === 'submitButton' || key === 'responseContainer')) {
      warning = 'Critical UI selector missing — provider website DOM may have changed.';
    }
    return {
      selectorKey: key,
      cssSelector: selectors[key],
      matched,
      elementCount: observed?.count ?? 0,
      visible,
      warning,
    };
  });

  const criticalKeys: (keyof ProviderSelectorConfig)[] = [
    'composerInput',
    'submitButton',
    'responseContainer',
  ];
  const criticalMissing = matchedMap
    ? criticalKeys.some((k) => (matchedMap[k]?.count ?? 0) === 0)
    : false;

  const healthy = bridgeConnected && !!matchedMap && !criticalMissing;
  const summary = !bridgeConnected && !matchedMap
    ? 'Awaiting local Chrome extension tab inspection. Static selector schema is valid.'
    : criticalMissing
      ? 'UI drift detected: one or more critical DOM selectors did not match the active tab.'
      : 'All critical interactive selectors verified on active provider tab.';

  return {
    checkedAt: new Date().toISOString(),
    driverVersion,
    healthy,
    uiDriftDetected: criticalMissing,
    results,
    summary,
  };
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function flattenMessagesToText(request: NormalizedRequest): string {
  const parts: string[] = [];
  if (request.systemPrompt) {
    parts.push(`[System Instructions]\n${request.systemPrompt}`);
  }
  for (const msg of request.messages) {
    const contentText =
      typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .map((part) => {
              if (part.type === 'text') return part.text;
              if (part.type === 'image_url') return `[Image: ${part.imageUrl}]`;
              if (part.type === 'file_attachment') return `[Attachment: ${part.filename} (${part.mimeType})]`;
              if (part.type === 'tool_use') return `[ToolUse ${part.name}: ${JSON.stringify(part.input)}]`;
              return `[ToolResult ${part.toolUseId}: ${part.content}]`;
            })
            .join('\n');
    parts.push(`${msg.role.toUpperCase()}: ${contentText}`);
  }
  return parts.join('\n\n');
}

export interface OfficialApiConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  wireFormat: 'openai' | 'anthropic';
}

export interface ProviderRuntimeState {
  enabled: boolean;
  mode: IntegrationMode;
  sessionStatus: SessionStatus;
  authStatus: AuthenticationStatus;
  activeTabId: number | null;
  activeTabTitle: string | null;
  activeTabUrl: string | null;
  visibleModelName: string | null;
  lastConnectedAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastError: ProviderError | null;
  selectorHealth: SelectorHealthReport | null;
  officialApiConfig: OfficialApiConfig | null;
  testing: boolean;
  lastVerificationReport: ProviderVerificationReport | null;
}

/**
 * Standardized abstract base class in packages/provider-sdk for all provider implementations.
 * Guarantees consistent session detection, authentication status, model discovery, and diagnostics.
 */
export abstract class ProviderAdapterBase implements ProviderAdapter {
  abstract readonly id: ProviderId;
  abstract readonly name: string;
  abstract readonly shortName: string;
  abstract readonly domain: string;
  abstract readonly url: string;
  abstract readonly driverVersion: string;
  abstract readonly verificationStatus: VerificationStatus;
  abstract readonly selectors: ProviderSelectorConfig;

  abstract detectSession(): Promise<{
    sessionStatus: SessionStatus;
    activeTabId: number | null;
    activeTabTitle: string | null;
    activeTabUrl: string | null;
    visibleModelName: string | null;
  }>;

  abstract getAuthenticationStatus(): Promise<AuthenticationStatus>;
  abstract getAvailableModels(): Promise<ModelInfo[]>;
  abstract getCapabilities(): ProviderCapabilities;
  abstract submitMessage(
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<{ handle: ProviderRequestHandle; completion: Promise<NormalizedResponse> }>;
  abstract collectResponse(handle: ProviderRequestHandle): Promise<NormalizedResponse>;
  abstract cancelRequest(requestId: string): Promise<boolean>;
  abstract getProviderStatus(): ProviderStatus;
  abstract runDiagnostics(): Promise<SelectorHealthReport>;
  abstract disconnect(): Promise<void>;

  getOperationalStatus(): ProviderOperationalStatus {
    return this.getProviderStatus().operationalStatus;
  }
}

/**
 * Independent fault-isolated registry managing all registered provider adapters.
 * One provider's failure during session detection, model discovery, or status lookup
 * is isolated and never prevents other providers from functioning.
 */
export class ProviderRegistry<T extends ProviderAdapter = ProviderAdapter> {
  private readonly adapters = new Map<ProviderId, T>();

  register(adapter: T): void {
    this.adapters.set(adapter.id, adapter);
  }

  unregister(providerId: ProviderId): boolean {
    return this.adapters.delete(providerId);
  }

  has(providerId: ProviderId): boolean {
    return this.adapters.has(providerId);
  }

  get(providerId: ProviderId): T | undefined {
    return this.adapters.get(providerId);
  }

  getOrThrow(providerId: ProviderId): T {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new ProviderAdapterError(
        createProviderError('INVALID_REQUEST', `Unknown provider adapter: ${providerId}`, 404, {
          providerId,
        })
      );
    }
    return adapter;
  }

  ids(): ProviderId[] {
    return Array.from(this.adapters.keys());
  }

  list(): T[] {
    return Array.from(this.adapters.values());
  }

  async discoverAllModels(): Promise<{
    models: ModelInfo[];
    errors: Array<{ providerId: ProviderId; error: string }>;
  }> {
    const models: ModelInfo[] = [];
    const errors: Array<{ providerId: ProviderId; error: string }> = [];
    const entries = this.list();
    const settled = await Promise.allSettled(entries.map((a) => a.getAvailableModels()));
    settled.forEach((result, idx) => {
      const providerId = entries[idx].id;
      if (result.status === 'fulfilled') {
        models.push(...result.value);
      } else {
        errors.push({
          providerId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    return { models, errors };
  }

  async detectAllSessions(): Promise<
    Record<
      string,
      {
        ok: boolean;
        sessionStatus: SessionStatus;
        authStatus: AuthenticationStatus;
        visibleModelName: string | null;
        error?: string;
      }
    >
  > {
    const output: Record<
      string,
      {
        ok: boolean;
        sessionStatus: SessionStatus;
        authStatus: AuthenticationStatus;
        visibleModelName: string | null;
        error?: string;
      }
    > = {};
    const entries = this.list();
    await Promise.allSettled(
      entries.map(async (adapter) => {
        try {
          const [session, auth] = await Promise.all([
            adapter.detectSession(),
            adapter.getAuthenticationStatus(),
          ]);
          output[adapter.id] = {
            ok: true,
            sessionStatus: session.sessionStatus,
            authStatus: auth,
            visibleModelName: session.visibleModelName,
          };
        } catch (err) {
          output[adapter.id] = {
            ok: false,
            sessionStatus: 'degraded',
            authStatus: 'unknown',
            visibleModelName: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );
    return output;
  }
}
