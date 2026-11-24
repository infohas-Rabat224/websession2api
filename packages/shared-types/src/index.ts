export type ProviderId =
  | 'deepseek'
  | 'zai'
  | 'kimi'
  | 'qwen'
  | 'claude'
  | 'chatgpt'
  | 'gemini';

export type IntegrationMode = 'browser_session' | 'official_api';

export type DashboardRuntimeMode = 'production' | 'development_simulation';

export type ApiProtocol = 'openai' | 'anthropic';

export type VerificationStatus =
  | 'IMPLEMENTED'
  | 'UNIT_TESTED'
  | 'UI_TESTED'
  | 'LIVE_VERIFIED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNAVAILABLE';

export type ProviderOperationalStatus =
  | 'NOT INSTALLED'
  | 'SESSION REQUIRED'
  | 'SESSION EXPIRED'
  | 'CONNECTED'
  | 'TESTING'
  | 'VERIFIED WORKING'
  | 'PARTIALLY SUPPORTED'
  | 'TEMPORARILY UNAVAILABLE'
  | 'INTERFACE CHANGED'
  | 'FAILED';

export type CapabilityVerificationState =
  | 'verified'
  | 'supported_untested'
  | 'unsupported'
  | 'failed';

export type VerificationStepId =
  | 'session_detection'
  | 'model_discovery'
  | 'test_prompt'
  | 'response_extraction'
  | 'consecutive_context'
  | 'timeout_error_recovery'
  | 'streaming'
  | 'attachments'
  | 'images'
  | 'tool_calling';

export interface VerificationStepResult {
  id: VerificationStepId;
  label: string;
  category: 'core' | 'capability';
  status: 'passed' | 'failed' | 'unsupported' | 'skipped';
  durationMs: number;
  detail: string;
  failureReason?: string;
}

export interface ProviderCapabilityVerificationMatrix {
  streaming: CapabilityVerificationState;
  attachments: CapabilityVerificationState;
  images: CapabilityVerificationState;
  toolCalling: CapabilityVerificationState;
  consecutiveContext: CapabilityVerificationState;
  timeoutRecovery: CapabilityVerificationState;
}

export interface ProviderVerificationReport {
  id: string;
  providerId: ProviderId;
  providerName: string;
  driverVersion: string;
  mode: IntegrationMode;
  operationalStatus: ProviderOperationalStatus;
  passedCoreChecks: number;
  totalCoreChecks: number;
  steps: VerificationStepResult[];
  capabilityResults: ProviderCapabilityVerificationMatrix;
  modelsDiscovered: string[];
  lastSuccessfulTestAt: string | null;
  checkedAt: string;
  failureReasons: string[];
  summary: string;
  isSimulated: boolean;
}

export interface ProviderCompatibilityMatrixRow {
  providerId: ProviderId;
  providerName: string;
  shortName: string;
  domain: string;
  driverVersion: string;
  mode: IntegrationMode;
  enabled: boolean;
  operationalStatus: ProviderOperationalStatus;
  sessionStatus: SessionStatus;
  authStatus: AuthenticationStatus;
  modelAvailable: boolean;
  discoveredModels: string[];
  capabilityResults: ProviderCapabilityVerificationMatrix;
  lastSuccessfulTestAt: string | null;
  lastCheckedAt: string | null;
  failureReasons: string[];
  lastError: ProviderError | null;
  lastReport: ProviderVerificationReport | null;
  isSimulated: boolean;
}

export type SessionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'degraded'
  | 'captcha_required'
  | 'rate_limited'
  | 'unverified';

export type AuthenticationStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'expired'
  | 'api_key_configured'
  | 'unknown';

export type ToolCallingMode =
  | 'native_provider'
  | 'agent_side_only'
  | 'text_only';

export type TaskCategory = 'coding' | 'long-context' | 'general';

export type AgentId =
  | 'claude-code'
  | 'hermes'
  | 'opencode'
  | 'cline'
  | 'roo-code';

export interface ProviderCapabilities {
  streaming: boolean;
  systemInstructions: boolean;
  multiTurnHistory: boolean;
  toolCallingMode: ToolCallingMode;
  nativeToolCalling: boolean;
  toolResults: boolean;
  fileAttachments: boolean;
  multimodalImages: boolean;
  cancellation: boolean;
  tokenCounting: boolean;
  jsonMode: boolean;
  notes: string;
}

export interface SelectorDiagnosticResult {
  selectorKey: string;
  cssSelector: string;
  matched: boolean;
  elementCount: number;
  visible: boolean;
  warning?: string;
}

export interface SelectorHealthReport {
  checkedAt: string;
  driverVersion: string;
  healthy: boolean;
  uiDriftDetected: boolean;
  results: SelectorDiagnosticResult[];
  summary: string;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  shortName: string;
  domain: string;
  url: string;
  driverVersion: string;
  enabled: boolean;
  mode: IntegrationMode;
  sessionStatus: SessionStatus;
  authStatus: AuthenticationStatus;
  verificationStatus: VerificationStatus;
  operationalStatus: ProviderOperationalStatus;
  activeTabId: number | null;
  activeTabTitle: string | null;
  activeTabUrl: string | null;
  visibleModelName: string | null;
  capabilities: ProviderCapabilities;
  lastConnectedAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastError: ProviderError | null;
  officialApiConfigured: boolean;
  officialApiBaseUrl: string | null;
  selectorHealth: SelectorHealthReport | null;
  lastVerificationReport: ProviderVerificationReport | null;
  isSimulated: boolean;
}

export interface ModelInfo {
  id: string;
  alias: string;
  prefixedAlias: string;
  providerId: ProviderId;
  providerName: string;
  visibleModelName: string | null;
  authenticationState: AuthenticationStatus;
  available: boolean;
  mode: IntegrationMode;
  capabilities: ProviderCapabilities;
  verificationStatus: VerificationStatus;
  lastSuccessfulRequestAt: string | null;
  errorStatus: string | null;
  isSimulated: boolean;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  imageUrl: string;
  mediaType?: string;
}

export interface ToolUseContentPart {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentPart {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface FileAttachmentContentPart {
  type: 'file_attachment';
  filename: string;
  mimeType: string;
  sizeBytes?: number;
}

export type NormalizedContentPart =
  | TextContentPart
  | ImageContentPart
  | FileAttachmentContentPart
  | ToolUseContentPart
  | ToolResultContentPart;

export interface NormalizedMessage {
  role: MessageRole;
  content: string | NormalizedContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface NormalizedToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface NormalizedRequest {
  requestId: string;
  protocol: ApiProtocol;
  requestedModel: string;
  resolvedProviderId?: ProviderId;
  conversationId?: string;
  systemPrompt?: string;
  messages: NormalizedMessage[];
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: NormalizedToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; name: string };
  responseFormat?: 'text' | 'json_object';
  timeoutMs?: number;
  metadata?: Record<string, string>;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
}

export interface NormalizedResponse {
  requestId: string;
  providerId: ProviderId;
  modelAlias: string;
  visibleModelName: string;
  content: string;
  toolCalls?: ToolUseContentPart[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'cancelled' | 'error';
  usage: NormalizedUsage;
  latencyMs: number;
  mode: IntegrationMode;
  isSimulated: boolean;
}

export type ProviderEventType =
  | 'started'
  | 'delta'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface ProviderEvent {
  requestId: string;
  providerId: ProviderId;
  type: ProviderEventType;
  deltaText?: string;
  response?: NormalizedResponse;
  error?: ProviderError;
  timestamp: string;
}

export type ProviderErrorCode =
  | 'PROVIDER_DISCONNECTED'
  | 'SESSION_EXPIRED'
  | 'AUTH_REQUIRED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNSUPPORTED_PARAMETER'
  | 'RATE_LIMITED'
  | 'CAPTCHA_REQUIRED'
  | 'UI_SELECTOR_CHANGED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'QUEUE_FULL'
  | 'UPSTREAM_ERROR'
  | 'INVALID_REQUEST'
  | 'PROVIDER_DISABLED'
  | 'BRIDGE_UNAVAILABLE';

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  providerId?: ProviderId;
  retryable: boolean;
  httpStatus: number;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ProviderRequestHandle {
  requestId: string;
  providerId: ProviderId;
  startedAt: string;
  cancel: () => Promise<boolean>;
}

export interface RoutingRule {
  id: string;
  name: string;
  taskCategory: TaskCategory;
  preferredAliases: string[];
  fallbackEnabled: boolean;
  priorityOrder: ProviderId[];
  allowSilentMidConversationSwitch: false;
  enabled: boolean;
  updatedAt: string;
}

export interface RoutingConfig {
  defaultProviderId: ProviderId;
  defaultModelAlias: string;
  fallbackEnabled: boolean;
  providerPriority: ProviderId[];
  taskPreferences: Record<TaskCategory, string[]>;
  maxConcurrencyPerProvider: number;
  maxQueueDepth: number;
  requestTimeoutMs: number;
  strictConversationPinning: true;
}

export interface RoutingHistoryEntry {
  id: string;
  requestId: string;
  requestedModel: string;
  taskCategory: TaskCategory | null;
  selectedProviderId: ProviderId;
  fallbackFromProviderId: ProviderId | null;
  reason: string;
  status: 'routed' | 'fallback_routed' | 'rejected';
  timestamp: string;
}

export interface RequestLogEntry {
  id: string;
  requestId: string;
  timestamp: string;
  providerId: ProviderId | null;
  model: string;
  protocol: ApiProtocol;
  mode: IntegrationMode | 'simulation';
  durationMs: number;
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string | null;
  streaming: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  isSimulated: boolean;
}

export interface GatewaySettings {
  host: string;
  port: number;
  apiAuthEnabled: boolean;
  apiKeyPrefix: string;
  apiKeyLastRotatedAt: string;
  loopbackOnly: boolean;
  dnsRebindingProtection: boolean;
  originValidationEnabled: boolean;
  csrfProtectionEnabled: boolean;
  maxRequestBodyBytes: number;
  rateLimitPerMinute: number;
  maxConcurrency: number;
  defaultTimeoutMs: number;
  logPromptsAndResponses: boolean;
  retentionDays: number;
  nativeHostId: string;
  allowedExtensionIds: string[];
  runtimeMode: DashboardRuntimeMode;
}

export interface AgentProfile {
  id: AgentId;
  name: string;
  protocol: ApiProtocol;
  endpointUrl: string;
  compatibilityStatus: 'verified_contract' | 'partial_text_only' | 'requires_native_tools';
  versionNotes: string;
  toolExecutionWarning: string;
  configFilename: string;
  configFormat: 'env' | 'json' | 'yaml';
}

export interface GatewayHealthSummary {
  status: 'healthy' | 'degraded' | 'offline';
  runtimeMode: DashboardRuntimeMode;
  environment: 'hosted_preview' | 'local_gateway';
  uptimeSeconds: number;
  host: string;
  port: number;
  databaseConnected: boolean;
  nativeBridgeConnected: boolean;
  connectedProvidersCount: number;
  availableModelsCount: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  activeRequests: number;
  queuedRequests: number;
  version: string;
  timestamp: string;
}

export type NativeMessageType =
  | 'HELLO'
  | 'HEARTBEAT'
  | 'SESSION_UPDATE'
  | 'SUBMIT_REQUEST'
  | 'STREAM_DELTA'
  | 'REQUEST_COMPLETE'
  | 'REQUEST_ERROR'
  | 'CANCEL_REQUEST'
  | 'RUN_DIAGNOSTICS'
  | 'DIAGNOSTICS_RESULT';

export interface NativeMessagingEnvelope<T = Record<string, unknown>> {
  id: string;
  type: NativeMessageType;
  protocolVersion: '1.0';
  extensionId?: string;
  providerId?: ProviderId;
  timestamp: string;
  payload: T;
}
