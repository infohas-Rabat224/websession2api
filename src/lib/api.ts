import type {
  AgentId,
  AgentProfile,
  DashboardRuntimeMode,
  GatewayHealthSummary,
  GatewaySettings,
  IntegrationMode,
  ModelInfo,
  ProviderCompatibilityMatrixRow,
  ProviderId,
  ProviderStatus,
  ProviderVerificationReport,
  RequestLogEntry,
  RoutingConfig,
  RoutingHistoryEntry,
  RoutingRule,
  SelectorHealthReport,
} from '../../packages/shared-types/src/index';

const DASHBOARD_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  'X-WebSession2API-Dashboard': '1',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...DASHBOARD_HEADERS,
      ...(init?.headers || {}),
    },
  });
  const rawText = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const errField = data.error as string | { message?: string } | undefined;
    const message =
      errField && typeof errField === 'object'
        ? errField.message || `Request failed with HTTP ${res.status}`
        : typeof errField === 'string'
          ? errField
          : `Request failed with HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const gatewayApi = {
  getHealth: () => fetchJson<GatewayHealthSummary>('/api/admin/health'),
  getProviders: () =>
    fetchJson<{ providers: ProviderStatus[]; runtimeMode: DashboardRuntimeMode }>('/api/admin/providers'),
  enableProvider: (id: ProviderId) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/enable`, { method: 'POST', body: '{}' }),
  disableProvider: (id: ProviderId) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/disable`, { method: 'POST', body: '{}' }),
  connectProvider: (id: ProviderId) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/connect`, { method: 'POST', body: '{}' }),
  disconnectProvider: (id: ProviderId) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/disconnect`, { method: 'POST', body: '{}' }),
  setProviderMode: (id: ProviderId, mode: IntegrationMode) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  saveOfficialApi: (id: ProviderId, payload: { baseUrl: string; apiKey: string; modelName: string }) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/official-api`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  clearOfficialApi: (id: ProviderId) =>
    fetchJson<{ provider: ProviderStatus }>(`/api/admin/providers/${id}/official-api`, { method: 'DELETE' }),
  testProvider: (id: ProviderId) =>
    fetchJson<{ ok: boolean; latencyMs?: number; error?: { code: string; message: string } }>(
      `/api/admin/providers/${id}/test`,
      { method: 'POST', body: '{}' }
    ),
  runDiagnostics: (id: ProviderId) =>
    fetchJson<{ report: SelectorHealthReport }>(`/api/admin/providers/${id}/diagnostics`, {
      method: 'POST',
      body: '{}',
    }),
  getCompatibilityMatrix: () =>
    fetchJson<{ matrix: ProviderCompatibilityMatrixRow[]; runtimeMode: DashboardRuntimeMode }>(
      '/api/admin/compatibility-matrix'
    ),
  verifyProvider: (id: ProviderId) =>
    fetchJson<{ report: ProviderVerificationReport; row: ProviderCompatibilityMatrixRow }>(
      `/api/admin/providers/${id}/verify`,
      { method: 'POST', body: '{}' }
    ),
  verifyAllProviders: () =>
    fetchJson<{
      reports: ProviderVerificationReport[];
      matrix: ProviderCompatibilityMatrixRow[];
      runtimeMode: DashboardRuntimeMode;
    }>('/api/admin/verify-all', { method: 'POST', body: '{}' }),
  getModels: () =>
    fetchJson<{ models: ModelInfo[]; runtimeMode: DashboardRuntimeMode }>('/api/admin/models'),
  getRequests: () =>
    fetchJson<{ requests: RequestLogEntry[]; runtimeMode: DashboardRuntimeMode }>('/api/admin/requests'),
  getRouting: () =>
    fetchJson<{ config: RoutingConfig; rules: RoutingRule[]; history: RoutingHistoryEntry[] }>(
      '/api/admin/routing'
    ),
  updateRouting: (config: Partial<RoutingConfig>) =>
    fetchJson<{ config: RoutingConfig }>('/api/admin/routing', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getAgents: () => fetchJson<{ agents: AgentProfile[] }>('/api/admin/agents'),
  getAgentConfig: (id: AgentId, model?: string) =>
    fetchJson<{ filename: string; format: string; content: string }>(
      `/api/admin/agents/${id}/config${model ? `?model=${encodeURIComponent(model)}` : ''}`
    ),
  testAgent: (id: AgentId) =>
    fetchJson<{
      ok: boolean;
      agentId: string;
      gatewayReachable: boolean;
      availableModelsCount: number;
      protocolEndpoint: string;
      note: string;
    }>(`/api/admin/agents/${id}/test`, { method: 'POST', body: '{}' }),
  getSettings: () => fetchJson<{ settings: GatewaySettings }>('/api/admin/settings'),
  updateSettings: (settings: Partial<GatewaySettings>) =>
    fetchJson<{ settings: GatewaySettings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  rotateApiKey: () =>
    fetchJson<{ newApiKey: string; prefix: string; rotatedAt: string }>('/api/admin/settings/rotate-key', {
      method: 'POST',
      body: '{}',
    }),
  setRuntimeMode: (mode: DashboardRuntimeMode) =>
    fetchJson<{ runtimeMode: DashboardRuntimeMode }>('/api/admin/runtime-mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
};
