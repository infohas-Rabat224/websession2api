import crypto from 'node:crypto';
import type {
  AgentId,
  AgentProfile,
  DashboardRuntimeMode,
  GatewayHealthSummary,
  GatewaySettings,
  IntegrationMode,
  ModelInfo,
  NormalizedRequest,
  NormalizedResponse,
  ProviderCapabilities,
  ProviderCompatibilityMatrixRow,
  ProviderError,
  ProviderEvent,
  ProviderId,
  ProviderStatus,
  ProviderVerificationReport,
  RequestLogEntry,
  RoutingConfig,
  RoutingHistoryEntry,
  RoutingRule,
  SelectorHealthReport,
  SessionStatus,
  AuthenticationStatus,
} from '../../../packages/shared-types/src/index';
import {
  createDefaultRoutingConfig,
  createDefaultRoutingRules,
  createDefaultSettings,
  generateAgentConfigSnippet,
  getAgentProfiles,
  PROVIDER_MODEL_ALIASES,
} from '../../../packages/configuration/src/index';
import {
  initDatabase,
  WebSessionRepository,
  type DatabaseContext,
} from '../../../packages/database/src/index';
import {
  generateLocalApiKey,
  getApiKeyPrefix,
  hashApiKey,
  redactSensitiveText,
  SecretVault,
  SlidingWindowRateLimiter,
  validateOfficialApiBaseUrl,
  verifyApiKey,
} from '../../../packages/security/src/index';
import {
  buildDefaultCapabilityMatrix,
  buildStaticSelectorDiagnostics,
  createProviderError,
  deriveOperationalStatus,
  estimateTokenCount,
  flattenMessagesToText,
  ProviderAdapterError,
  ProviderRegistry,
  runAdapterVerificationSuite,
  validateRequestAgainstCapabilities,
  type BrowserBridgeDispatch,
} from '../../../packages/provider-sdk/src/index';
import { BaseProviderAdapter } from '../../../providers/base/src/index';
import { DeepSeekProviderAdapter } from '../../../providers/deepseek/src/index';
import { ZaiProviderAdapter } from '../../../providers/zai/src/index';
import { KimiProviderAdapter } from '../../../providers/kimi/src/index';
import { QwenProviderAdapter } from '../../../providers/qwen/src/index';
import { ClaudeProviderAdapter } from '../../../providers/claude/src/index';
import { ChatGptProviderAdapter } from '../../../providers/chatgpt/src/index';
import { GeminiProviderAdapter } from '../../../providers/gemini/src/index';
import { ModelRouter, resolveAliasToProviderId } from './router';

export interface EngineOptions {
  dbPath?: string;
  apiKey?: string;
  environment?: 'hosted_preview' | 'local_gateway';
}

interface PendingBridgeRequest {
  providerId: ProviderId;
  resolve: (res: NormalizedResponse) => void;
  reject: (err: ProviderAdapterError) => void;
  onEvent?: (ev: ProviderEvent) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  accumulatedText: string;
}

interface SimulatedProviderRuntime {
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
}

export interface BridgeOutboundCommand {
  type: 'SUBMIT_REQUEST' | 'CANCEL_REQUEST' | 'RUN_DIAGNOSTICS';
  providerId: ProviderId;
  requestId: string;
  payload: Record<string, unknown>;
}

export class GatewayEngine {
  public readonly dbCtx: DatabaseContext;
  public readonly repo: WebSessionRepository;
  public readonly router: ModelRouter;
  public readonly rateLimiter: SlidingWindowRateLimiter;
  public readonly registry: ProviderRegistry<BaseProviderAdapter>;
  private readonly vault: SecretVault;
  private readonly adapters: Map<ProviderId, BaseProviderAdapter>;
  private readonly simulatedState = new Map<ProviderId, SimulatedProviderRuntime>();
  private readonly simulatedVerificationReports = new Map<ProviderId, ProviderVerificationReport>();
  private readonly activeSimCancels = new Map<string, () => void>();
  private readonly pendingBridgeRequests = new Map<string, PendingBridgeRequest>();
  private readonly bridgeOutboundQueue: BridgeOutboundCommand[] = [];

  private settings: GatewaySettings;
  private apiKeyHash: string;
  private currentPlaintextKeyInMemory: string;
  private readonly startedAtMs = Date.now();
  private readonly environment: 'hosted_preview' | 'local_gateway';
  private nativeBridgeLastHeartbeatMs = 0;

  constructor(options: EngineOptions = {}) {
    this.environment =
      options.environment ??
      (process.env.APP_URL ? 'hosted_preview' : 'local_gateway');
    this.dbCtx = initDatabase(options.dbPath);
    this.repo = new WebSessionRepository(this.dbCtx);
    this.vault = new SecretVault(process.env.WEBSESSION2API_MASTER_KEY);

    // Initialize secure local API key (never hardcoded)
    const envApiKey = options.apiKey || process.env.WEBSESSION2API_API_KEY || '';
    const storedHash = this.repo.getSetting<string>('api_key_hash');
    const storedPrefix = this.repo.getSetting<string>('api_key_prefix');

    if (envApiKey) {
      this.currentPlaintextKeyInMemory = envApiKey;
      this.apiKeyHash = hashApiKey(envApiKey);
      this.repo.setSetting('api_key_hash', this.apiKeyHash);
      this.repo.setSetting('api_key_prefix', getApiKeyPrefix(envApiKey));
    } else if (storedHash && storedPrefix) {
      this.apiKeyHash = storedHash;
      // Keep ephemeral session token for preview playground calls while preserving hash
      const generated = generateLocalApiKey();
      this.currentPlaintextKeyInMemory = generated;
      this.apiKeyHash = hashApiKey(generated);
      this.repo.setSetting('api_key_hash', this.apiKeyHash);
      this.repo.setSetting('api_key_prefix', getApiKeyPrefix(generated));
    } else {
      const generated = generateLocalApiKey();
      this.currentPlaintextKeyInMemory = generated;
      this.apiKeyHash = hashApiKey(generated);
      this.repo.setSetting('api_key_hash', this.apiKeyHash);
      this.repo.setSetting('api_key_prefix', getApiKeyPrefix(generated));
    }

    const savedSettings = this.repo.getGatewaySettings();
    const defaultSettings = createDefaultSettings(getApiKeyPrefix(this.currentPlaintextKeyInMemory));
    this.settings = savedSettings
      ? {
          ...defaultSettings,
          ...savedSettings,
          apiKeyPrefix: getApiKeyPrefix(this.currentPlaintextKeyInMemory),
        }
      : defaultSettings;
    this.repo.saveGatewaySettings(this.settings);

    const savedRouting = this.repo.getRoutingConfig();
    this.router = new ModelRouter(savedRouting ?? createDefaultRoutingConfig());
    if (!savedRouting) {
      this.repo.saveRoutingConfig(this.router.getConfig());
    }

    if (this.repo.listRoutingRules().length === 0) {
      for (const rule of createDefaultRoutingRules()) {
        this.repo.upsertRoutingRule(rule);
      }
    }

    // Seed agent profiles
    for (const profile of getAgentProfiles(this.settings.host, this.settings.port)) {
      this.repo.upsertAgentProfile(profile);
    }

    this.rateLimiter = new SlidingWindowRateLimiter(this.settings.rateLimitPerMinute, 60_000);

    // Instantiate and register all 7 independent provider adapters in ProviderRegistry
    const list: BaseProviderAdapter[] = [
      new DeepSeekProviderAdapter(),
      new ZaiProviderAdapter(),
      new KimiProviderAdapter(),
      new QwenProviderAdapter(),
      new ClaudeProviderAdapter(),
      new ChatGptProviderAdapter(),
      new GeminiProviderAdapter(),
    ];
    this.registry = new ProviderRegistry<BaseProviderAdapter>();
    for (const adapter of list) {
      this.registry.register(adapter);
    }
    this.adapters = new Map(list.map((a) => [a.id, a]));

    const bridgeDispatch: BrowserBridgeDispatch = {
      isConnected: () => this.isNativeBridgeConnected(),
      sendRequest: (providerId, request, onEvent) =>
        this.dispatchViaNativeBridge(providerId, request, onEvent),
      cancelRequest: async (providerId, requestId) => {
        const pending = this.pendingBridgeRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingBridgeRequests.delete(requestId);
          pending.reject(
            new ProviderAdapterError(
              createProviderError('CANCELLED', 'Request cancelled by client.', 499, { providerId })
            )
          );
        }
        this.bridgeOutboundQueue.push({
          type: 'CANCEL_REQUEST',
          providerId,
          requestId,
          payload: { requestId },
        });
        return true;
      },
      runSelectorDiagnostics: async (providerId, selectors) => {
        if (!this.isNativeBridgeConnected()) return null;
        this.bridgeOutboundQueue.push({
          type: 'RUN_DIAGNOSTICS',
          providerId,
          requestId: `diag_${crypto.randomBytes(6).toString('hex')}`,
          payload: { selectors },
        });
        return null;
      },
    };

    // Hydrate persisted provider settings, encrypted official API keys, and non-simulated verification reports
    const savedProviders = new Map(this.repo.getProviderRecords().map((r) => [r.id, r]));
    const savedSessions = new Map(this.repo.getProviderSessions().map((s) => [s.providerId, s]));
    const savedVerifications = this.repo.getLatestVerificationReports(false);

    for (const adapter of this.adapters.values()) {
      adapter.attachBridge(bridgeDispatch);
      const saved = savedProviders.get(adapter.id);
      if (saved) {
        adapter.setEnabled(saved.enabled);
        adapter.setMode(saved.mode as IntegrationMode);
        if (saved.officialApiKeyEncrypted && saved.officialApiBaseUrl) {
          const decrypted = this.vault.decrypt(saved.officialApiKeyEncrypted);
          if (decrypted) {
            adapter.configureOfficialApi({
              baseUrl: saved.officialApiBaseUrl,
              apiKey: decrypted,
              modelName: PROVIDER_MODEL_ALIASES[adapter.id].defaultOfficialModel,
              wireFormat: adapter.id === 'claude' ? 'anthropic' : 'openai',
            });
          }
        }
      }

      const savedReport = savedVerifications[adapter.id];
      if (savedReport && !savedReport.isSimulated) {
        adapter.setVerificationReport(savedReport);
      }

      // Restore last known timestamps (never claim live connected browser tab on fresh boot)
      const prevSession = savedSessions.get(adapter.id);
      if (prevSession && adapter.getProviderStatus().mode === 'browser_session') {
        adapter.applySessionUpdate({
          sessionStatus: 'disconnected',
          authStatus: 'unknown',
          activeTabId: null,
          activeTabTitle: null,
          activeTabUrl: null,
          visibleModelName: prevSession.visibleModelName,
          error: null,
        });
      }

      this.persistProvider(adapter);
    }

    this.initIsolatedSimulationState();
  }

  private initIsolatedSimulationState(): void {
    const now = new Date().toISOString();
    const simSeeds: Record<ProviderId, SimulatedProviderRuntime> = {
      deepseek: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'connected',
        authStatus: 'authenticated',
        activeTabId: 401,
        activeTabTitle: 'DeepSeek - Into the Unknown [SIMULATED]',
        activeTabUrl: 'https://chat.deepseek.com/a/chat/s/demo-session',
        visibleModelName: 'DeepSeek-V3 (Simulated Tab)',
        lastConnectedAt: now,
        lastSuccessfulRequestAt: now,
        lastError: null,
      },
      zai: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'connected',
        authStatus: 'authenticated',
        activeTabId: 402,
        activeTabTitle: 'Z.ai GLM Chat [SIMULATED]',
        activeTabUrl: 'https://chat.z.ai/c/demo-glm',
        visibleModelName: 'GLM-4.5 (Simulated Tab)',
        lastConnectedAt: now,
        lastSuccessfulRequestAt: now,
        lastError: null,
      },
      kimi: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'connected',
        authStatus: 'authenticated',
        activeTabId: 403,
        activeTabTitle: 'Kimi.ai [SIMULATED]',
        activeTabUrl: 'https://kimi.moonshot.cn/chat/demo',
        visibleModelName: 'Kimi k1.5 (Simulated Tab)',
        lastConnectedAt: now,
        lastSuccessfulRequestAt: null,
        lastError: null,
      },
      qwen: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'disconnected',
        authStatus: 'unauthenticated',
        activeTabId: null,
        activeTabTitle: null,
        activeTabUrl: null,
        visibleModelName: null,
        lastConnectedAt: null,
        lastSuccessfulRequestAt: null,
        lastError: null,
      },
      claude: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'connected',
        authStatus: 'authenticated',
        activeTabId: 405,
        activeTabTitle: 'Claude [SIMULATED]',
        activeTabUrl: 'https://claude.ai/chat/demo',
        visibleModelName: 'Claude Sonnet (Simulated Tab)',
        lastConnectedAt: now,
        lastSuccessfulRequestAt: null,
        lastError: null,
      },
      chatgpt: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'expired',
        authStatus: 'expired',
        activeTabId: 406,
        activeTabTitle: 'ChatGPT — Sign in required [SIMULATED]',
        activeTabUrl: 'https://chatgpt.com/',
        visibleModelName: null,
        lastConnectedAt: now,
        lastSuccessfulRequestAt: null,
        lastError: createProviderError(
          'SESSION_EXPIRED',
          'Simulated expired session: user needs to re-authenticate in Chrome tab.',
          401,
          { providerId: 'chatgpt' }
        ),
      },
      gemini: {
        enabled: true,
        mode: 'browser_session',
        sessionStatus: 'connected',
        authStatus: 'authenticated',
        activeTabId: 407,
        activeTabTitle: 'Google Gemini [SIMULATED]',
        activeTabUrl: 'https://gemini.google.com/app',
        visibleModelName: 'Gemini 2.5 Flash (Simulated Tab)',
        lastConnectedAt: now,
        lastSuccessfulRequestAt: null,
        lastError: null,
      },
    };

    for (const [id, state] of Object.entries(simSeeds) as [ProviderId, SimulatedProviderRuntime][]) {
      this.simulatedState.set(id, state);
    }
  }

  private persistProvider(adapter: BaseProviderAdapter, encryptedKey?: string | null): void {
    const status = adapter.getProviderStatus();
    const aliasMeta = PROVIDER_MODEL_ALIASES[adapter.id];
    this.repo.upsertProviderRecord({
      id: adapter.id,
      name: adapter.name,
      shortName: adapter.shortName,
      domain: adapter.domain,
      url: adapter.url,
      driverVersion: adapter.driverVersion,
      enabled: status.enabled,
      mode: status.mode,
      verificationStatus: status.verificationStatus,
      officialApiBaseUrl: status.officialApiBaseUrl,
      ...(encryptedKey !== undefined ? { officialApiKeyEncrypted: encryptedKey } : {}),
      capabilitiesJson: JSON.stringify(status.capabilities),
    });

    this.repo.upsertProviderSession({
      providerId: adapter.id,
      sessionStatus: status.sessionStatus,
      authStatus: status.authStatus,
      activeTabId: status.activeTabId,
      activeTabTitle: status.activeTabTitle,
      activeTabUrl: status.activeTabUrl,
      visibleModelName: status.visibleModelName,
      lastConnectedAt: status.lastConnectedAt,
      lastSuccessfulRequestAt: status.lastSuccessfulRequestAt,
      lastErrorJson: status.lastError ? JSON.stringify(status.lastError) : null,
    });

    this.repo.upsertModel({
      id: `${adapter.id}:${aliasMeta.alias}`,
      providerId: adapter.id,
      visibleModelName: status.visibleModelName,
      available:
        status.enabled &&
        (status.mode === 'official_api'
          ? status.officialApiConfigured
          : status.sessionStatus === 'connected' && status.authStatus === 'authenticated'),
      capabilitiesJson: JSON.stringify(status.capabilities),
    });

    this.repo.upsertModelAlias({
      alias: aliasMeta.alias,
      prefixedAlias: aliasMeta.prefixedAlias,
      providerId: adapter.id,
      modelId: `${adapter.id}:${aliasMeta.alias}`,
      enabled: status.enabled,
    });
  }

  isNativeBridgeConnected(): boolean {
    return Date.now() - this.nativeBridgeLastHeartbeatMs < 30_000;
  }

  verifyGatewayApiKey(provided: string | null | undefined): boolean {
    if (!this.settings.apiAuthEnabled) return true;
    return verifyApiKey(provided, this.apiKeyHash);
  }

  getRuntimeApiKeyForLocalDisplay(): { prefix: string; rotatedAt: string } {
    return {
      prefix: this.settings.apiKeyPrefix,
      rotatedAt: this.settings.apiKeyLastRotatedAt,
    };
  }

  rotateApiKey(): { newApiKey: string; prefix: string; rotatedAt: string } {
    const newApiKey = generateLocalApiKey();
    const rotatedAt = new Date().toISOString();
    this.currentPlaintextKeyInMemory = newApiKey;
    this.apiKeyHash = hashApiKey(newApiKey);
    this.repo.setSetting('api_key_hash', this.apiKeyHash);
    this.repo.setSetting('api_key_prefix', getApiKeyPrefix(newApiKey));
    this.settings = {
      ...this.settings,
      apiKeyPrefix: getApiKeyPrefix(newApiKey),
      apiKeyLastRotatedAt: rotatedAt,
    };
    this.repo.saveGatewaySettings(this.settings);
    return { newApiKey, prefix: this.settings.apiKeyPrefix, rotatedAt };
  }

  getSettings(): GatewaySettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<GatewaySettings>): GatewaySettings {
    const next: GatewaySettings = {
      ...this.settings,
      ...partial,
      // Protect read-only metadata
      apiKeyPrefix: this.settings.apiKeyPrefix,
      apiKeyLastRotatedAt: this.settings.apiKeyLastRotatedAt,
    };
    this.settings = next;
    this.rateLimiter.setLimit(next.rateLimitPerMinute);
    this.router.updateConfig({
      maxConcurrencyPerProvider: next.maxConcurrency,
      requestTimeoutMs: next.defaultTimeoutMs,
    });
    this.repo.saveGatewaySettings(next);
    this.repo.saveRoutingConfig(this.router.getConfig());
    return this.getSettings();
  }

  getRuntimeMode(): DashboardRuntimeMode {
    return this.settings.runtimeMode;
  }

  setRuntimeMode(mode: DashboardRuntimeMode): DashboardRuntimeMode {
    this.settings = { ...this.settings, runtimeMode: mode };
    this.repo.saveGatewaySettings(this.settings);
    return mode;
  }

  getProviders(modeOverride?: DashboardRuntimeMode): ProviderStatus[] {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    if (runtimeMode === 'development_simulation') {
      return Array.from(this.adapters.values()).map((adapter) => {
        const base = adapter.getProviderStatus();
        const sim = this.simulatedState.get(adapter.id)!;
        const simReport = this.simulatedVerificationReports.get(adapter.id) ?? null;
        const selectorHealth = buildStaticSelectorDiagnostics(
          adapter.driverVersion,
          adapter.selectors,
          sim.sessionStatus === 'connected',
          sim.sessionStatus === 'connected'
            ? {
                authIndicator: { count: 1, visible: true },
                composerInput: { count: 1, visible: true },
                submitButton: { count: 1, visible: true },
                responseContainer: { count: 2, visible: true },
                modelBadge: { count: 1, visible: true },
              }
            : undefined
        );
        const operationalStatus = deriveOperationalStatus({
          enabled: sim.enabled,
          mode: sim.mode,
          bridgeConnected: true,
          officialApiConfigured: base.officialApiConfigured,
          sessionStatus: sim.sessionStatus,
          authStatus: sim.authStatus,
          lastError: sim.lastError,
          selectorHealth,
          lastVerificationReport: simReport,
          isSimulated: true,
        });
        return {
          ...base,
          enabled: sim.enabled,
          mode: sim.mode,
          sessionStatus: sim.sessionStatus,
          authStatus: sim.authStatus,
          operationalStatus,
          activeTabId: sim.activeTabId,
          activeTabTitle: sim.activeTabTitle,
          activeTabUrl: sim.activeTabUrl,
          visibleModelName: sim.visibleModelName,
          lastConnectedAt: sim.lastConnectedAt,
          lastSuccessfulRequestAt: sim.lastSuccessfulRequestAt,
          lastError: sim.lastError,
          selectorHealth,
          lastVerificationReport: simReport,
          isSimulated: true,
        };
      });
    }
    return Array.from(this.adapters.values()).map((a) => a.getProviderStatus());
  }

  async getModels(modeOverride?: DashboardRuntimeMode): Promise<ModelInfo[]> {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const providers = this.getProviders(runtimeMode);
    return providers.map((p) => {
      const aliasInfo = PROVIDER_MODEL_ALIASES[p.id];
      const available =
        p.enabled &&
        (p.mode === 'official_api'
          ? p.officialApiConfigured
          : p.sessionStatus === 'connected' && p.authStatus === 'authenticated');
      return {
        id: `${p.id}:${aliasInfo.alias}`,
        alias: aliasInfo.alias,
        prefixedAlias: aliasInfo.prefixedAlias,
        providerId: p.id,
        providerName: p.name,
        visibleModelName: p.visibleModelName,
        authenticationState: p.authStatus,
        available,
        mode: p.mode,
        capabilities: p.capabilities,
        verificationStatus: p.verificationStatus,
        lastSuccessfulRequestAt: p.lastSuccessfulRequestAt,
        errorStatus: p.lastError ? `${p.lastError.code}: ${p.lastError.message}` : null,
        isSimulated: p.isSimulated,
      };
    });
  }

  getCapabilitiesMatrix(modeOverride?: DashboardRuntimeMode) {
    return this.getProviders(modeOverride).map((p) => ({
      providerId: p.id,
      providerName: p.name,
      mode: p.mode,
      verificationStatus: p.verificationStatus,
      capabilities: p.capabilities,
      isSimulated: p.isSimulated,
    }));
  }

  getHealthSummary(modeOverride?: DashboardRuntimeMode): GatewayHealthSummary {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const isSimulated = runtimeMode === 'development_simulation';
    const providers = this.getProviders(runtimeMode);
    const connectedProvidersCount = providers.filter(
      (p) =>
        p.enabled &&
        (p.mode === 'official_api'
          ? p.officialApiConfigured
          : p.sessionStatus === 'connected' && p.authStatus === 'authenticated')
    ).length;

    const logs = this.repo.listRequests(500, isSimulated);
    const successfulRequests = logs.filter((l) => l.status === 'success').length;
    const failedRequests = logs.filter((l) => l.status !== 'success').length;
    const queue = this.router.getQueueMetrics();

    return {
      status: 'healthy',
      runtimeMode,
      environment: this.environment,
      uptimeSeconds: Math.floor((Date.now() - this.startedAtMs) / 1000),
      host: this.settings.host,
      port: this.settings.port,
      databaseConnected: true,
      nativeBridgeConnected: isSimulated ? true : this.isNativeBridgeConnected(),
      connectedProvidersCount,
      availableModelsCount: connectedProvidersCount,
      totalRequests: logs.length,
      successfulRequests,
      failedRequests,
      activeRequests: queue.activeRequests,
      queuedRequests: queue.queuedRequests,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  setProviderEnabled(providerId: ProviderId, enabled: boolean, modeOverride?: DashboardRuntimeMode): ProviderStatus {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    if (runtimeMode === 'development_simulation') {
      const sim = this.simulatedState.get(providerId);
      if (!sim) throw new Error(`Unknown provider: ${providerId}`);
      sim.enabled = enabled;
      return this.getProviders('development_simulation').find((p) => p.id === providerId)!;
    }
    const adapter = this.getAdapterOrThrow(providerId);
    adapter.setEnabled(enabled);
    this.persistProvider(adapter);
    return adapter.getProviderStatus();
  }

  setProviderMode(providerId: ProviderId, mode: IntegrationMode, modeOverride?: DashboardRuntimeMode): ProviderStatus {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    if (runtimeMode === 'development_simulation') {
      const sim = this.simulatedState.get(providerId);
      if (!sim) throw new Error(`Unknown provider: ${providerId}`);
      sim.mode = mode;
      return this.getProviders('development_simulation').find((p) => p.id === providerId)!;
    }
    const adapter = this.getAdapterOrThrow(providerId);
    adapter.setMode(mode);
    this.persistProvider(adapter);
    return adapter.getProviderStatus();
  }

  async disconnectProvider(providerId: ProviderId, modeOverride?: DashboardRuntimeMode): Promise<ProviderStatus> {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    if (runtimeMode === 'development_simulation') {
      const sim = this.simulatedState.get(providerId);
      if (!sim) throw new Error(`Unknown provider: ${providerId}`);
      sim.sessionStatus = 'disconnected';
      sim.authStatus = 'unauthenticated';
      sim.activeTabId = null;
      sim.activeTabTitle = null;
      return this.getProviders('development_simulation').find((p) => p.id === providerId)!;
    }
    const adapter = this.getAdapterOrThrow(providerId);
    await adapter.disconnect();
    this.persistProvider(adapter);
    return adapter.getProviderStatus();
  }

  connectSimulatedProvider(providerId: ProviderId): ProviderStatus {
    const sim = this.simulatedState.get(providerId);
    if (!sim) throw new Error(`Unknown provider: ${providerId}`);
    const adapter = this.getAdapterOrThrow(providerId);
    sim.sessionStatus = 'connected';
    sim.authStatus = 'authenticated';
    sim.activeTabId = 410 + Math.floor(Math.random() * 80);
    sim.activeTabTitle = `${adapter.name} [SIMULATED]`;
    sim.activeTabUrl = adapter.url;
    sim.visibleModelName = `${adapter.shortName} Web (Simulated Tab)`;
    sim.lastConnectedAt = new Date().toISOString();
    sim.lastError = null;
    return this.getProviders('development_simulation').find((p) => p.id === providerId)!;
  }

  configureOfficialApi(
    providerId: ProviderId,
    input: { baseUrl: string; apiKey: string; modelName: string }
  ): ProviderStatus {
    const adapter = this.getAdapterOrThrow(providerId);
    const validation = validateOfficialApiBaseUrl(input.baseUrl);
    if (!validation.valid) {
      throw new ProviderAdapterError(
        createProviderError('INVALID_REQUEST', validation.reason || 'Invalid Official API URL', 400, {
          providerId,
        })
      );
    }
    if (!input.apiKey || input.apiKey.trim().length < 6) {
      throw new ProviderAdapterError(
        createProviderError('INVALID_REQUEST', 'Official API key must be at least 6 characters.', 400, {
          providerId,
        })
      );
    }
    const encrypted = this.vault.encrypt(input.apiKey.trim());
    adapter.setMode('official_api');
    adapter.configureOfficialApi({
      baseUrl: input.baseUrl.trim(),
      apiKey: input.apiKey.trim(),
      modelName: input.modelName.trim() || PROVIDER_MODEL_ALIASES[providerId].defaultOfficialModel,
      wireFormat: providerId === 'claude' ? 'anthropic' : 'openai',
    });
    this.persistProvider(adapter, encrypted);
    return adapter.getProviderStatus();
  }

  clearOfficialApi(providerId: ProviderId): ProviderStatus {
    const adapter = this.getAdapterOrThrow(providerId);
    adapter.configureOfficialApi(null);
    adapter.setMode('browser_session');
    this.persistProvider(adapter, null);
    return adapter.getProviderStatus();
  }

  async runProviderDiagnostics(
    providerId: ProviderId,
    modeOverride?: DashboardRuntimeMode
  ): Promise<SelectorHealthReport> {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const adapter = this.getAdapterOrThrow(providerId);
    if (runtimeMode === 'development_simulation') {
      const sim = this.simulatedState.get(providerId)!;
      const report = buildStaticSelectorDiagnostics(
        adapter.driverVersion,
        adapter.selectors,
        sim.sessionStatus === 'connected',
        sim.sessionStatus === 'connected'
          ? {
              authIndicator: { count: 1, visible: true },
              loginPromptIndicator: { count: 0, visible: false },
              composerInput: { count: 1, visible: true },
              submitButton: { count: 1, visible: true },
              responseContainer: { count: 3, visible: true },
              streamingIndicator: { count: 0, visible: false },
              stopButton: { count: 0, visible: false },
              modelBadge: { count: 1, visible: true },
              errorBanner: { count: 0, visible: false },
              captchaIndicator: { count: 0, visible: false },
            }
          : undefined
      );
      return report;
    }

    const report = await adapter.runDiagnostics();
    this.repo.saveDiagnostic(providerId, report);
    return report;
  }

  // Called by Native Messaging host over authenticated loopback IPC
  ingestBridgeEvent(event: {
    type: 'HEARTBEAT' | 'SESSION_UPDATE' | 'STREAM_DELTA' | 'REQUEST_COMPLETE' | 'REQUEST_ERROR' | 'DIAGNOSTICS_RESULT';
    providerId?: ProviderId;
    payload: Record<string, unknown>;
  }): { outbound: BridgeOutboundCommand[] } {
    this.nativeBridgeLastHeartbeatMs = Date.now();

    if (event.type === 'SESSION_UPDATE' && event.providerId && this.adapters.has(event.providerId)) {
      const adapter = this.adapters.get(event.providerId)!;
      adapter.applySessionUpdate({
        sessionStatus: (event.payload.sessionStatus as SessionStatus) || 'disconnected',
        authStatus: (event.payload.authStatus as AuthenticationStatus) || 'unknown',
        activeTabId: typeof event.payload.activeTabId === 'number' ? event.payload.activeTabId : null,
        activeTabTitle: typeof event.payload.activeTabTitle === 'string' ? event.payload.activeTabTitle : null,
        activeTabUrl: typeof event.payload.activeTabUrl === 'string' ? event.payload.activeTabUrl : null,
        visibleModelName: typeof event.payload.visibleModelName === 'string' ? event.payload.visibleModelName : null,
      });
      this.persistProvider(adapter);
    } else if (event.type === 'STREAM_DELTA') {
      const requestId = String(event.payload.requestId || '');
      const delta = String(event.payload.deltaText || '');
      const pending = this.pendingBridgeRequests.get(requestId);
      if (pending) {
        pending.accumulatedText += delta;
        pending.onEvent?.({
          requestId,
          providerId: pending.providerId,
          type: 'delta',
          deltaText: delta,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'REQUEST_COMPLETE') {
      const requestId = String(event.payload.requestId || '');
      const pending = this.pendingBridgeRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingBridgeRequests.delete(requestId);
        const content = String(event.payload.content ?? pending.accumulatedText);
        const visibleModelName = String(
          event.payload.visibleModelName || PROVIDER_MODEL_ALIASES[pending.providerId].alias
        );
        const outputTokens = estimateTokenCount(content);
        const inputTokens = Number(event.payload.inputTokens || 16);
        const response: NormalizedResponse = {
          requestId,
          providerId: pending.providerId,
          modelAlias: PROVIDER_MODEL_ALIASES[pending.providerId].alias,
          visibleModelName,
          content,
          finishReason: 'stop',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimated: true,
          },
          latencyMs: Date.now() - pending.startedAt,
          mode: 'browser_session',
          isSimulated: false,
        };
        pending.onEvent?.({
          requestId,
          providerId: pending.providerId,
          type: 'completed',
          response,
          timestamp: new Date().toISOString(),
        });
        pending.resolve(response);
      }
    } else if (event.type === 'REQUEST_ERROR') {
      const requestId = String(event.payload.requestId || '');
      const pending = this.pendingBridgeRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingBridgeRequests.delete(requestId);
        const err = createProviderError(
          (event.payload.code as ProviderError['code']) || 'UPSTREAM_ERROR',
          String(event.payload.message || 'Browser extension reported an error.'),
          Number(event.payload.httpStatus || 502),
          { providerId: pending.providerId }
        );
        pending.reject(new ProviderAdapterError(err));
      }
    } else if (event.type === 'DIAGNOSTICS_RESULT' && event.providerId && this.adapters.has(event.providerId)) {
      const report = event.payload.report as SelectorHealthReport | undefined;
      if (report) {
        const adapter = this.adapters.get(event.providerId)!;
        adapter.applySessionUpdate({
          sessionStatus: adapter.getProviderStatus().sessionStatus,
          authStatus: adapter.getProviderStatus().authStatus,
          activeTabId: adapter.getProviderStatus().activeTabId,
          activeTabTitle: adapter.getProviderStatus().activeTabTitle,
          activeTabUrl: adapter.getProviderStatus().activeTabUrl,
          visibleModelName: adapter.getProviderStatus().visibleModelName,
          selectorHealth: report,
        });
        this.repo.saveDiagnostic(event.providerId, report);
      }
    }

    const outbound = this.bridgeOutboundQueue.splice(0, this.bridgeOutboundQueue.length);
    return { outbound };
  }

  private dispatchViaNativeBridge(
    providerId: ProviderId,
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<NormalizedResponse> {
    const timeoutMs = request.timeoutMs ?? this.settings.defaultTimeoutMs;
    return new Promise<NormalizedResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBridgeRequests.delete(request.requestId);
        reject(
          new ProviderAdapterError(
            createProviderError(
              'TIMEOUT',
              `Timed out after ${timeoutMs}ms waiting for Chrome extension response from ${providerId}.`,
              504,
              { providerId, retryable: true }
            )
          )
        );
      }, timeoutMs);

      this.pendingBridgeRequests.set(request.requestId, {
        providerId,
        resolve,
        reject,
        onEvent,
        timer,
        startedAt: Date.now(),
        accumulatedText: '',
      });

      this.bridgeOutboundQueue.push({
        type: 'SUBMIT_REQUEST',
        providerId,
        requestId: request.requestId,
        payload: {
          requestId: request.requestId,
          promptText: flattenMessagesToText(request),
          stream: request.stream,
          timeoutMs,
        },
      });
    });
  }

  async executeUnifiedRequest(
    request: NormalizedRequest,
    options: {
      onEvent?: (event: ProviderEvent) => void;
      modeOverride?: DashboardRuntimeMode;
    } = {}
  ): Promise<NormalizedResponse> {
    const startedAt = Date.now();
    const runtimeMode = options.modeOverride ?? this.settings.runtimeMode;
    const isSimulated = runtimeMode === 'development_simulation';

    const providerStatuses = this.getProviders(runtimeMode);
    const candidates = providerStatuses.map((p) => ({
      providerId: p.id,
      enabled: p.enabled,
      available:
        p.enabled &&
        (p.mode === 'official_api'
          ? p.officialApiConfigured
          : p.sessionStatus === 'connected' && p.authStatus === 'authenticated'),
    }));

    const route = this.router.resolveRoute({
      requestId: request.requestId,
      requestedModel: request.requestedModel,
      conversationId: request.conversationId,
      candidates,
    });

    if (!route.ok) {
      this.logRequestMetadata({
        requestId: request.requestId,
        providerId: route.error.providerId ?? resolveAliasToProviderId(request.requestedModel),
        model: request.requestedModel,
        protocol: request.protocol,
        mode: isSimulated ? 'simulation' : 'browser_session',
        durationMs: Date.now() - startedAt,
        status: 'error',
        httpStatus: route.error.httpStatus,
        errorCode: route.error.code,
        errorMessage: redactSensitiveText(route.error.message),
        streaming: request.stream,
        inputTokens: null,
        outputTokens: null,
        isSimulated,
      });
      throw new ProviderAdapterError(route.error);
    }

    const release = await this.router.acquireSlot(route.providerId);
    try {
      const response = isSimulated
        ? await this.executeSimulatedRequest(route.providerId, request, options.onEvent)
        : await this.executeRealAdapterRequest(route.providerId, request, options.onEvent);

      this.logRequestMetadata({
        requestId: request.requestId,
        providerId: route.providerId,
        model: request.requestedModel,
        protocol: request.protocol,
        mode: isSimulated ? 'simulation' : response.mode,
        durationMs: Date.now() - startedAt,
        status: 'success',
        httpStatus: 200,
        errorCode: null,
        errorMessage: null,
        streaming: request.stream,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        isSimulated,
      });

      return response;
    } catch (error) {
      const providerError =
        error instanceof ProviderAdapterError
          ? error.providerError
          : createProviderError(
              'UPSTREAM_ERROR',
              error instanceof Error ? error.message : 'Request execution failed',
              502,
              { providerId: route.providerId }
            );

      this.logRequestMetadata({
        requestId: request.requestId,
        providerId: route.providerId,
        model: request.requestedModel,
        protocol: request.protocol,
        mode: isSimulated ? 'simulation' : 'browser_session',
        durationMs: Date.now() - startedAt,
        status:
          providerError.code === 'CANCELLED'
            ? 'cancelled'
            : providerError.code === 'TIMEOUT'
              ? 'timeout'
              : 'error',
        httpStatus: providerError.httpStatus,
        errorCode: providerError.code,
        errorMessage: redactSensitiveText(providerError.message),
        streaming: request.stream,
        inputTokens: null,
        outputTokens: null,
        isSimulated,
      });

      throw new ProviderAdapterError(providerError);
    } finally {
      release();
    }
  }

  private async executeRealAdapterRequest(
    providerId: ProviderId,
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<NormalizedResponse> {
    const adapter = this.getAdapterOrThrow(providerId);
    const { completion } = await adapter.submitMessage(
      { ...request, resolvedProviderId: providerId, timeoutMs: request.timeoutMs ?? this.settings.defaultTimeoutMs },
      onEvent
    );
    const result = await completion;
    this.persistProvider(adapter);
    return result;
  }

  private async executeSimulatedRequest(
    providerId: ProviderId,
    request: NormalizedRequest,
    onEvent?: (event: ProviderEvent) => void
  ): Promise<NormalizedResponse> {
    const adapter = this.getAdapterOrThrow(providerId);
    const sim = this.simulatedState.get(providerId)!;
    const capabilities: ProviderCapabilities = adapter.getCapabilities();

    // Enforce the EXACT same capability contract even in Development Simulation Mode
    const capError = validateRequestAgainstCapabilities(request, capabilities, providerId);
    if (capError) {
      throw new ProviderAdapterError(capError);
    }

    const startedAt = Date.now();
    const promptFlat = flattenMessagesToText(request);
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user');
    const userPreview =
      typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content.trim().slice(0, 140)
        : 'structured prompt';

    const chunks = [
      `[Development Simulation — ${adapter.name} (${sim.visibleModelName || adapter.shortName})]\n\n`,
      `Received ${request.protocol.toUpperCase()} request (${request.requestId}) routed to alias \`${PROVIDER_MODEL_ALIASES[providerId].alias}\`.\n`,
      `Prompt summary: "${userPreview}"\n\n`,
      `This response was generated by the isolated Development Simulation Mode adapter to verify protocol framing, streaming SSE deltas, request logging, and cancellation without claiming live access to your local Chrome tabs.\n`,
      `Switch to Production Mode and run the local gateway + Chrome MV3 extension on your workstation to execute real browser sessions or configure Official API Mode.`,
    ];

    onEvent?.({
      requestId: request.requestId,
      providerId,
      type: 'started',
      timestamp: new Date().toISOString(),
    });

    let cancelled = false;
    this.activeSimCancels.set(request.requestId, () => {
      cancelled = true;
    });

    try {
      let fullText = '';
      for (const chunk of chunks) {
        if (cancelled) {
          throw new ProviderAdapterError(
            createProviderError('CANCELLED', 'Simulated request cancelled by client.', 499, { providerId })
          );
        }
        await new Promise((r) => setTimeout(r, request.stream ? 45 : 15));
        fullText += chunk;
        if (request.stream) {
          onEvent?.({
            requestId: request.requestId,
            providerId,
            type: 'delta',
            deltaText: chunk,
            timestamp: new Date().toISOString(),
          });
        }
      }

      const inputTokens = estimateTokenCount(promptFlat);
      const outputTokens = estimateTokenCount(fullText);
      const response: NormalizedResponse = {
        requestId: request.requestId,
        providerId,
        modelAlias: PROVIDER_MODEL_ALIASES[providerId].alias,
        visibleModelName: sim.visibleModelName || `${adapter.shortName} (Simulated)`,
        content: fullText,
        finishReason: 'stop',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimated: true,
        },
        latencyMs: Date.now() - startedAt,
        mode: 'browser_session',
        isSimulated: true,
      };

      sim.lastSuccessfulRequestAt = new Date().toISOString();
      onEvent?.({
        requestId: request.requestId,
        providerId,
        type: 'completed',
        response,
        timestamp: new Date().toISOString(),
      });
      return response;
    } finally {
      this.activeSimCancels.delete(request.requestId);
    }
  }

  async cancelActiveRequest(requestId: string): Promise<boolean> {
    const simCancel = this.activeSimCancels.get(requestId);
    if (simCancel) {
      simCancel();
      return true;
    }
    for (const adapter of this.adapters.values()) {
      const ok = await adapter.cancelRequest(requestId);
      if (ok) return true;
    }
    return false;
  }

  listRequests(limit = 100, modeOverride?: DashboardRuntimeMode): RequestLogEntry[] {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    return this.repo.listRequests(limit, runtimeMode === 'development_simulation');
  }

  getRoutingState(): {
    config: RoutingConfig;
    rules: RoutingRule[];
    history: RoutingHistoryEntry[];
  } {
    return {
      config: this.router.getConfig(),
      rules: this.repo.listRoutingRules(),
      history: this.router.getHistory(50),
    };
  }

  updateRoutingConfig(partial: Partial<RoutingConfig>): RoutingConfig {
    const updated = this.router.updateConfig(partial);
    this.repo.saveRoutingConfig(updated);
    return updated;
  }

  getAgents(): AgentProfile[] {
    return getAgentProfiles(this.settings.host, this.settings.port);
  }

  getAgentConfig(agentId: AgentId, modelAlias?: string) {
    return generateAgentConfigSnippet(agentId, {
      host: this.settings.host,
      port: this.settings.port,
      apiKeyPlaceholder: `${this.settings.apiKeyPrefix} (set WEBSESSION2API_API_KEY)`,
      modelAlias,
    });
  }

  getCompatibilityMatrix(modeOverride?: DashboardRuntimeMode): ProviderCompatibilityMatrixRow[] {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const providers = this.getProviders(runtimeMode);
    return providers.map((p) => {
      const aliasInfo = PROVIDER_MODEL_ALIASES[p.id];
      const report = p.lastVerificationReport;
      const modelAvailable =
        p.enabled &&
        (p.mode === 'official_api'
          ? p.officialApiConfigured
          : p.sessionStatus === 'connected' && p.authStatus === 'authenticated');

      const discoveredModels =
        report && report.modelsDiscovered.length > 0
          ? report.modelsDiscovered
          : [p.visibleModelName ? `${aliasInfo.alias} (${p.visibleModelName})` : aliasInfo.alias];

      const failureReasons =
        report && report.failureReasons.length > 0
          ? report.failureReasons
          : p.lastError
            ? [`${p.lastError.code}: ${p.lastError.message}`]
            : p.operationalStatus === 'NOT INSTALLED'
              ? [`Local Chrome extension / Native Messaging bridge is not connected for ${p.domain}.`]
              : p.operationalStatus === 'SESSION REQUIRED'
                ? [`Authenticated session or Official API key required for ${p.name}.`]
                : [];

      return {
        providerId: p.id,
        providerName: p.name,
        shortName: p.shortName,
        domain: p.domain,
        driverVersion: p.driverVersion,
        mode: p.mode,
        enabled: p.enabled,
        operationalStatus: p.operationalStatus,
        sessionStatus: p.sessionStatus,
        authStatus: p.authStatus,
        modelAvailable,
        discoveredModels,
        capabilityResults: report
          ? report.capabilityResults
          : buildDefaultCapabilityMatrix(p.capabilities),
        lastSuccessfulTestAt: report?.lastSuccessfulTestAt ?? p.lastSuccessfulRequestAt,
        lastCheckedAt: report?.checkedAt ?? p.selectorHealth?.checkedAt ?? null,
        failureReasons,
        lastError: p.lastError,
        lastReport: report,
        isSimulated: p.isSimulated,
      };
    });
  }

  /**
   * Executes the full 10-check functional verification suite for a single provider in isolation.
   * Never fabricates or mocks successful responses in Production Mode.
   */
  async runProviderVerification(
    providerId: ProviderId,
    modeOverride?: DashboardRuntimeMode
  ): Promise<{ report: ProviderVerificationReport; row: ProviderCompatibilityMatrixRow }> {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const isSimulated = runtimeMode === 'development_simulation';
    const adapter = this.getAdapterOrThrow(providerId);

    if (!isSimulated) {
      adapter.setTesting(true);
    }

    try {
      const currentStatus = this.getProviders(runtimeMode).find((p) => p.id === providerId)!;
      const previousSuccess = currentStatus.lastVerificationReport?.lastSuccessfulTestAt ?? currentStatus.lastSuccessfulRequestAt;

      const report = await runAdapterVerificationSuite({
        adapter,
        mode: currentStatus.mode,
        bridgeConnected: isSimulated ? true : this.isNativeBridgeConnected(),
        officialApiConfigured: currentStatus.officialApiConfigured,
        isSimulated,
        sessionOverride: isSimulated
          ? {
              sessionStatus: currentStatus.sessionStatus,
              authStatus: currentStatus.authStatus,
              visibleModelName: currentStatus.visibleModelName,
              lastError: currentStatus.lastError,
            }
          : undefined,
        previousLastSuccessAt: previousSuccess,
        executePrompt: (req, onEvent) =>
          isSimulated
            ? this.executeSimulatedRequest(providerId, req, onEvent)
            : this.executeRealAdapterRequest(providerId, req, onEvent),
      });

      if (isSimulated) {
        this.simulatedVerificationReports.set(providerId, report);
      } else {
        adapter.setVerificationReport(report);
        this.repo.saveVerificationReport(report);
        this.persistProvider(adapter);
      }

      const row = this.getCompatibilityMatrix(runtimeMode).find((r) => r.providerId === providerId)!;
      return { report, row };
    } finally {
      if (!isSimulated) {
        adapter.setTesting(false);
      }
    }
  }

  /**
   * Verifies all 7 providers independently using Promise.allSettled so that one provider's
   * failure or timeout can never prevent other providers from being verified.
   */
  async runAllProvidersVerification(modeOverride?: DashboardRuntimeMode): Promise<{
    reports: ProviderVerificationReport[];
    matrix: ProviderCompatibilityMatrixRow[];
    runtimeMode: DashboardRuntimeMode;
  }> {
    const runtimeMode = modeOverride ?? this.settings.runtimeMode;
    const ids = this.registry.ids();
    const settled = await Promise.allSettled(
      ids.map((id) => this.runProviderVerification(id, runtimeMode))
    );
    const reports: ProviderVerificationReport[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        reports.push(result.value.report);
      }
    }
    return {
      reports,
      matrix: this.getCompatibilityMatrix(runtimeMode),
      runtimeMode,
    };
  }

  private logRequestMetadata(entry: Omit<RequestLogEntry, 'id' | 'timestamp'>): void {
    this.repo.logRequest({
      id: `log_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  getAdapterOrThrow(providerId: ProviderId): BaseProviderAdapter {
    return this.registry.getOrThrow(providerId);
  }

  close(): void {
    for (const pending of this.pendingBridgeRequests.values()) {
      clearTimeout(pending.timer);
    }
    this.dbCtx.close();
  }
}
