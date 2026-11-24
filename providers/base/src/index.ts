import type {
  AuthenticationStatus,
  IntegrationMode,
  ModelInfo,
  NormalizedRequest,
  NormalizedResponse,
  ProviderCapabilities,
  ProviderError,
  ProviderEvent,
  ProviderId,
  ProviderRequestHandle,
  ProviderStatus,
  ProviderVerificationReport,
  SelectorHealthReport,
  SessionStatus,
  VerificationStatus,
} from '../../../packages/shared-types/src/index';
import {
  buildStaticSelectorDiagnostics,
  createProviderError,
  deriveOperationalStatus,
  estimateTokenCount,
  flattenMessagesToText,
  ProviderAdapterBase,
  ProviderAdapterError,
  validateRequestAgainstCapabilities,
  type BrowserBridgeDispatch,
  type OfficialApiConfig,
  type ProviderRuntimeState,
  type ProviderSelectorConfig,
} from '../../../packages/provider-sdk/src/index';
import { PROVIDER_MODEL_ALIASES } from '../../../packages/configuration/src/index';
import { validateOfficialApiBaseUrl } from '../../../packages/security/src/index';

export interface BaseProviderDefinition {
  id: ProviderId;
  name: string;
  shortName: string;
  domain: string;
  url: string;
  driverVersion: string;
  verificationStatus: VerificationStatus;
  selectors: ProviderSelectorConfig;
  browserCapabilities: ProviderCapabilities;
  officialApiCapabilities: ProviderCapabilities;
  officialWireFormat: 'openai' | 'anthropic';
}

export abstract class BaseProviderAdapter extends ProviderAdapterBase {
  readonly id: ProviderId;
  readonly name: string;
  readonly shortName: string;
  readonly domain: string;
  readonly url: string;
  readonly driverVersion: string;
  readonly verificationStatus: VerificationStatus;
  readonly selectors: ProviderSelectorConfig;

  protected readonly browserCapabilities: ProviderCapabilities;
  protected readonly officialApiCapabilities: ProviderCapabilities;
  protected readonly officialWireFormat: 'openai' | 'anthropic';

  protected state: ProviderRuntimeState;
  protected bridge: BrowserBridgeDispatch | null = null;
  protected hasLiveSelectorHealth = false;
  protected readonly activeAbortControllers = new Map<string, AbortController>();
  protected readonly activeCompletions = new Map<string, Promise<NormalizedResponse>>();

  constructor(def: BaseProviderDefinition) {
    super();
    this.id = def.id;
    this.name = def.name;
    this.shortName = def.shortName;
    this.domain = def.domain;
    this.url = def.url;
    this.driverVersion = def.driverVersion;
    this.verificationStatus = def.verificationStatus;
    this.selectors = def.selectors;
    this.browserCapabilities = def.browserCapabilities;
    this.officialApiCapabilities = def.officialApiCapabilities;
    this.officialWireFormat = def.officialWireFormat;

    this.state = {
      enabled: true,
      mode: 'browser_session',
      sessionStatus: 'disconnected',
      authStatus: 'unknown',
      activeTabId: null,
      activeTabTitle: null,
      activeTabUrl: null,
      visibleModelName: null,
      lastConnectedAt: null,
      lastSuccessfulRequestAt: null,
      lastError: null,
      selectorHealth: buildStaticSelectorDiagnostics(this.driverVersion, this.selectors, false),
      officialApiConfig: null,
      testing: false,
      lastVerificationReport: null,
    };
  }

  attachBridge(bridge: BrowserBridgeDispatch | null): void {
    this.bridge = bridge;
  }

  setTesting(testing: boolean): void {
    this.state.testing = testing;
  }

  setVerificationReport(report: ProviderVerificationReport | null): void {
    this.state.lastVerificationReport = report;
  }

  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
  }

  setMode(mode: IntegrationMode): void {
    this.state.mode = mode;
    if (mode === 'official_api' && this.state.officialApiConfig) {
      this.state.authStatus = 'api_key_configured';
      this.state.sessionStatus = 'connected';
    } else if (mode === 'browser_session' && !this.state.activeTabId) {
      this.state.sessionStatus = 'disconnected';
      this.state.authStatus = 'unknown';
    }
  }

  configureOfficialApi(config: OfficialApiConfig | null): void {
    this.state.officialApiConfig = config;
    if (config && this.state.mode === 'official_api') {
      this.state.authStatus = 'api_key_configured';
      this.state.sessionStatus = 'connected';
      this.state.visibleModelName = config.modelName;
      this.state.lastConnectedAt = new Date().toISOString();
      this.state.lastError = null;
    } else if (!config && this.state.mode === 'official_api') {
      this.state.authStatus = 'unauthenticated';
      this.state.sessionStatus = 'disconnected';
    }
  }

  applySessionUpdate(update: {
    sessionStatus: SessionStatus;
    authStatus: AuthenticationStatus;
    activeTabId: number | null;
    activeTabTitle: string | null;
    activeTabUrl: string | null;
    visibleModelName: string | null;
    selectorHealth?: SelectorHealthReport | null;
    error?: ProviderError | null;
  }): void {
    this.state.sessionStatus = update.sessionStatus;
    this.state.authStatus = update.authStatus;
    this.state.activeTabId = update.activeTabId;
    this.state.activeTabTitle = update.activeTabTitle;
    this.state.activeTabUrl = update.activeTabUrl;
    if (update.visibleModelName !== undefined) {
      this.state.visibleModelName = update.visibleModelName;
    }
    if (update.sessionStatus === 'connected') {
      this.state.lastConnectedAt = new Date().toISOString();
    }
    if (update.selectorHealth) {
      this.state.selectorHealth = update.selectorHealth;
      this.hasLiveSelectorHealth = true;
    }
    if (update.error !== undefined) {
      this.state.lastError = update.error;
    }
  }

  recordSuccess(visibleModelName?: string): void {
    this.state.lastSuccessfulRequestAt = new Date().toISOString();
    if (visibleModelName) {
      this.state.visibleModelName = visibleModelName;
    }
    this.state.lastError = null;
  }

  recordError(error: ProviderError): void {
    this.state.lastError = error;
    if (error.code === 'SESSION_EXPIRED') {
      this.state.sessionStatus = 'expired';
      this.state.authStatus = 'expired';
    } else if (error.code === 'CAPTCHA_REQUIRED') {
      this.state.sessionStatus = 'captcha_required';
    } else if (error.code === 'RATE_LIMITED') {
      this.state.sessionStatus = 'rate_limited';
    } else if (error.code === 'UI_SELECTOR_CHANGED') {
      this.state.sessionStatus = 'degraded';
    }
  }

  async detectSession() {
    return {
      sessionStatus: this.state.sessionStatus,
      activeTabId: this.state.activeTabId,
      activeTabTitle: this.state.activeTabTitle,
      activeTabUrl: this.state.activeTabUrl,
      visibleModelName: this.state.visibleModelName,
    };
  }

  async getAuthenticationStatus(): Promise<AuthenticationStatus> {
    if (this.state.mode === 'official_api') {
      return this.state.officialApiConfig ? 'api_key_configured' : 'unauthenticated';
    }
    return this.state.authStatus;
  }

  getCapabilities(): ProviderCapabilities {
    return this.state.mode === 'official_api'
      ? { ...this.officialApiCapabilities }
      : { ...this.browserCapabilities };
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const aliasInfo = PROVIDER_MODEL_ALIASES[this.id];
    const capabilities = this.getCapabilities();
    const isAvailable =
      this.state.enabled &&
      (this.state.mode === 'official_api'
        ? Boolean(this.state.officialApiConfig)
        : this.state.sessionStatus === 'connected' && this.state.authStatus === 'authenticated');

    return [
      {
        id: `${this.id}:${aliasInfo.alias}`,
        alias: aliasInfo.alias,
        prefixedAlias: aliasInfo.prefixedAlias,
        providerId: this.id,
        providerName: this.name,
        visibleModelName:
          this.state.mode === 'official_api'
            ? this.state.officialApiConfig?.modelName ?? null
            : this.state.visibleModelName,
        authenticationState: await this.getAuthenticationStatus(),
        available: isAvailable,
        mode: this.state.mode,
        capabilities,
        verificationStatus: this.verificationStatus,
        lastSuccessfulRequestAt: this.state.lastSuccessfulRequestAt,
        errorStatus: this.state.lastError ? `${this.state.lastError.code}: ${this.state.lastError.message}` : null,
        isSimulated: false,
      },
    ];
  }

  async submitMessage(
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<{ handle: ProviderRequestHandle; completion: Promise<NormalizedResponse> }> {
    if (!this.state.enabled) {
      const err = createProviderError(
        'PROVIDER_DISABLED',
        `Provider "${this.name}" is currently disabled in WebSession2API.`,
        503,
        { providerId: this.id }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }

    const capabilities = this.getCapabilities();
    const capError = validateRequestAgainstCapabilities(request, capabilities, this.id);
    if (capError) {
      throw new ProviderAdapterError(capError);
    }

    const handle: ProviderRequestHandle = {
      requestId: request.requestId,
      providerId: this.id,
      startedAt: new Date().toISOString(),
      cancel: () => this.cancelRequest(request.requestId),
    };

    const completion =
      this.state.mode === 'official_api'
        ? this.executeOfficialApiRequest(request, onEvent)
        : this.executeBrowserSessionRequest(request, onEvent);

    this.activeCompletions.set(request.requestId, completion);
    completion.finally(() => {
      this.activeCompletions.delete(request.requestId);
      this.activeAbortControllers.delete(request.requestId);
    });

    return { handle, completion };
  }

  async collectResponse(handle: ProviderRequestHandle): Promise<NormalizedResponse> {
    const promise = this.activeCompletions.get(handle.requestId);
    if (!promise) {
      throw new ProviderAdapterError(
        createProviderError('INVALID_REQUEST', `No active request found for ${handle.requestId}`, 404, {
          providerId: this.id,
        })
      );
    }
    return promise;
  }

  async cancelRequest(requestId: string): Promise<boolean> {
    const controller = this.activeAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(requestId);
      return true;
    }
    if (this.state.mode === 'browser_session' && this.bridge?.isConnected()) {
      return this.bridge.cancelRequest(this.id, requestId);
    }
    return false;
  }

  async runDiagnostics(): Promise<SelectorHealthReport> {
    if (this.state.mode === 'browser_session' && this.bridge?.isConnected()) {
      const liveReport = await this.bridge.runSelectorDiagnostics(this.id, this.selectors);
      if (liveReport) {
        this.state.selectorHealth = liveReport;
        this.hasLiveSelectorHealth = true;
        return liveReport;
      }
      if (this.hasLiveSelectorHealth && this.state.selectorHealth) {
        return this.state.selectorHealth;
      }
    }
    if (this.hasLiveSelectorHealth && this.state.selectorHealth?.uiDriftDetected) {
      return this.state.selectorHealth;
    }
    const staticReport = buildStaticSelectorDiagnostics(
      this.driverVersion,
      this.selectors,
      Boolean(this.bridge?.isConnected())
    );
    this.state.selectorHealth = staticReport;
    return staticReport;
  }

  async disconnect(): Promise<void> {
    this.state.sessionStatus = 'disconnected';
    this.hasLiveSelectorHealth = false;
    if (this.state.mode === 'browser_session') {
      this.state.authStatus = 'unknown';
      this.state.activeTabId = null;
      this.state.activeTabTitle = null;
      this.state.activeTabUrl = null;
    }
  }

  getProviderStatus(): ProviderStatus {
    const operationalStatus = deriveOperationalStatus({
      enabled: this.state.enabled,
      mode: this.state.mode,
      bridgeConnected: Boolean(this.bridge?.isConnected()),
      officialApiConfigured: Boolean(this.state.officialApiConfig),
      sessionStatus: this.state.sessionStatus,
      authStatus: this.state.authStatus,
      testing: this.state.testing,
      lastError: this.state.lastError,
      selectorHealth: this.state.selectorHealth,
      lastVerificationReport: this.state.lastVerificationReport,
      isSimulated: false,
    });

    return {
      id: this.id,
      name: this.name,
      shortName: this.shortName,
      domain: this.domain,
      url: this.url,
      driverVersion: this.driverVersion,
      enabled: this.state.enabled,
      mode: this.state.mode,
      sessionStatus: this.state.sessionStatus,
      authStatus: this.state.authStatus,
      verificationStatus: this.verificationStatus,
      operationalStatus,
      activeTabId: this.state.activeTabId,
      activeTabTitle: this.state.activeTabTitle,
      activeTabUrl: this.state.activeTabUrl,
      visibleModelName:
        this.state.mode === 'official_api'
          ? this.state.officialApiConfig?.modelName ?? null
          : this.state.visibleModelName,
      capabilities: this.getCapabilities(),
      lastConnectedAt: this.state.lastConnectedAt,
      lastSuccessfulRequestAt: this.state.lastSuccessfulRequestAt,
      lastError: this.state.lastError,
      officialApiConfigured: Boolean(this.state.officialApiConfig),
      officialApiBaseUrl:
        this.state.officialApiConfig?.baseUrl ||
        PROVIDER_MODEL_ALIASES[this.id].defaultOfficialBaseUrl,
      selectorHealth: this.state.selectorHealth,
      lastVerificationReport: this.state.lastVerificationReport,
      isSimulated: false,
    };
  }

  protected async executeBrowserSessionRequest(
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<NormalizedResponse> {
    if (!this.bridge || !this.bridge.isConnected()) {
      const err = createProviderError(
        'BRIDGE_UNAVAILABLE',
        `No local Chrome Extension / Native Messaging bridge is connected for ${this.name} (${this.domain}). Install the local gateway and Chrome extension on your workstation, or configure Official API Mode.`,
        503,
        { providerId: this.id, retryable: false }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }

    if (this.state.sessionStatus !== 'connected' || this.state.authStatus !== 'authenticated') {
      const err = createProviderError(
        this.state.sessionStatus === 'expired' ? 'SESSION_EXPIRED' : 'PROVIDER_DISCONNECTED',
        `Provider "${this.name}" does not have an authenticated browser tab on ${this.domain} (status: ${this.state.sessionStatus}).`,
        503,
        { providerId: this.id, retryable: false }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }

    try {
      const response = await this.bridge.sendRequest(this.id, request, onEvent);
      this.recordSuccess(response.visibleModelName);
      return response;
    } catch (error) {
      if (error instanceof ProviderAdapterError) {
        this.recordError(error.providerError);
        throw error;
      }
      const err = createProviderError(
        'UPSTREAM_ERROR',
        error instanceof Error ? error.message : 'Browser session execution failed.',
        502,
        { providerId: this.id, retryable: true }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }
  }

  protected async executeOfficialApiRequest(
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<NormalizedResponse> {
    const cfg = this.state.officialApiConfig;
    if (!cfg || !cfg.apiKey) {
      const err = createProviderError(
        'AUTH_REQUIRED',
        `Official API Mode is selected for ${this.name}, but no official API key has been configured.`,
        401,
        { providerId: this.id }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }

    const urlValidation = validateOfficialApiBaseUrl(cfg.baseUrl);
    if (!urlValidation.valid) {
      const err = createProviderError(
        'INVALID_REQUEST',
        `Blocked official API endpoint for ${this.name}: ${urlValidation.reason}`,
        400,
        { providerId: this.id }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    }

    const controller = new AbortController();
    this.activeAbortControllers.set(request.requestId, controller);
    const timeoutMs = request.timeoutMs ?? 90_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    onEvent?.({
      requestId: request.requestId,
      providerId: this.id,
      type: 'started',
      timestamp: new Date().toISOString(),
    });

    try {
      const isAnthropicWire = cfg.wireFormat === 'anthropic';
      const endpoint = isAnthropicWire
        ? `${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`
        : `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: Record<string, unknown>;

      if (isAnthropicWire) {
        headers['x-api-key'] = cfg.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: cfg.modelName,
          max_tokens: request.maxTokens ?? 1024,
          ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
          messages: request.messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content:
              typeof m.content === 'string'
                ? m.content
                : m.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'text', text: JSON.stringify(p) })),
          })),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.tools
            ? {
                tools: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.inputSchema,
                })),
              }
            : {}),
        };
      } else {
        headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        const openaiMsgs: Array<Record<string, unknown>> = [];
        if (request.systemPrompt) {
          openaiMsgs.push({ role: 'system', content: request.systemPrompt });
        }
        for (const m of request.messages) {
          openaiMsgs.push({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : flattenMessagesToText({ ...request, systemPrompt: undefined, messages: [m] }),
          });
        }
        body = {
          model: cfg.modelName,
          messages: openaiMsgs,
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.tools
            ? {
                tools: request.tools.map((t) => ({
                  type: 'function',
                  function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema,
                  },
                })),
              }
            : {}),
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = createProviderError(
          res.status === 429 ? 'RATE_LIMITED' : res.status === 401 ? 'AUTH_REQUIRED' : 'UPSTREAM_ERROR',
          `Official ${this.name} API returned HTTP ${res.status}: ${text.slice(0, 300)}`,
          res.status >= 400 && res.status < 600 ? res.status : 502,
          { providerId: this.id, retryable: res.status === 429 || res.status >= 500 }
        );
        this.recordError(err);
        throw new ProviderAdapterError(err);
      }

      const json = (await res.json()) as Record<string, unknown>;
      let textOutput = '';
      let inputTokens = estimateTokenCount(flattenMessagesToText(request));
      let outputTokens = 0;

      if (isAnthropicWire) {
        const content = Array.isArray(json.content) ? json.content : [];
        textOutput = content
          .filter((b): b is { type: string; text: string } => typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
          .map((b) => b.text)
          .join('');
        const usage = json.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        inputTokens = usage?.input_tokens ?? inputTokens;
        outputTokens = usage?.output_tokens ?? estimateTokenCount(textOutput);
      } else {
        const choices = Array.isArray(json.choices) ? json.choices : [];
        const first = choices[0] as { message?: { content?: string } } | undefined;
        textOutput = first?.message?.content ?? '';
        const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        inputTokens = usage?.prompt_tokens ?? inputTokens;
        outputTokens = usage?.completion_tokens ?? estimateTokenCount(textOutput);
      }

      if (request.stream && textOutput) {
        onEvent?.({
          requestId: request.requestId,
          providerId: this.id,
          type: 'delta',
          deltaText: textOutput,
          timestamp: new Date().toISOString(),
        });
      }

      const normalizedResponse: NormalizedResponse = {
        requestId: request.requestId,
        providerId: this.id,
        modelAlias: PROVIDER_MODEL_ALIASES[this.id].alias,
        visibleModelName: cfg.modelName,
        content: textOutput,
        finishReason: 'stop',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimated: false,
        },
        latencyMs: Date.now() - started,
        mode: 'official_api',
        isSimulated: false,
      };

      this.recordSuccess(cfg.modelName);
      onEvent?.({
        requestId: request.requestId,
        providerId: this.id,
        type: 'completed',
        response: normalizedResponse,
        timestamp: new Date().toISOString(),
      });
      return normalizedResponse;
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const err = createProviderError(
        isAbort ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        isAbort
          ? `Request to ${this.name} official API was aborted or timed out after ${timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : 'Official API request failed.',
        isAbort ? 504 : 502,
        { providerId: this.id, retryable: true }
      );
      this.recordError(err);
      throw new ProviderAdapterError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}
