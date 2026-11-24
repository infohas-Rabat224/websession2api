import { useState } from 'react';
import { RefreshCw, KeyRound, Play, Plug, Power, ShieldCheck, Unplug } from 'lucide-react';
import type {
  DashboardRuntimeMode,
  IntegrationMode,
  ProviderId,
  ProviderStatus,
} from '../../packages/shared-types/src/index';
import { ProviderLogo } from '../components/ProviderLogo';
import { gatewayApi } from '../lib/api';
import { operationalStatusColor } from './CompatibilityMatrixView';

interface ProvidersViewProps {
  providers: ProviderStatus[];
  runtimeMode: DashboardRuntimeMode;
  onRefresh: () => Promise<void>;
}

export function ProvidersView({ providers, runtimeMode, onRefresh }: ProvidersViewProps) {
  const [busyId, setBusyId] = useState<ProviderId | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [configModalProvider, setConfigModalProvider] = useState<ProviderStatus | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiModelName, setApiModelName] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const runAction = async (
    providerId: ProviderId,
    action: () => Promise<unknown>,
    okMsg: string
  ) => {
    setBusyId(providerId);
    setFeedback((prev) => ({ ...prev, [providerId]: { ok: true, message: 'Working...' } }));
    try {
      const result = await action();
      await onRefresh();
      const customFeedback =
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        'message' in result &&
        typeof (result as { ok: unknown }).ok === 'boolean' &&
        typeof (result as { message: unknown }).message === 'string'
          ? (result as { ok: boolean; message: string })
          : { ok: true, message: okMsg };
      setFeedback((prev) => ({ ...prev, [providerId]: customFeedback }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Action failed',
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  const openOfficialConfig = (p: ProviderStatus) => {
    setConfigModalProvider(p);
    setApiBaseUrl(p.officialApiBaseUrl || '');
    setApiKey('');
    setApiModelName(p.visibleModelName || '');
    setModalError(null);
  };

  const handleSaveOfficialApi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configModalProvider) return;
    setModalError(null);
    try {
      await gatewayApi.saveOfficialApi(configModalProvider.id, {
        baseUrl: apiBaseUrl.trim(),
        apiKey: apiKey.trim(),
        modelName: apiModelName.trim() || configModalProvider.shortName.toLowerCase(),
      });
      await onRefresh();
      setFeedback((prev) => ({
        ...prev,
        [configModalProvider.id]: {
          ok: true,
          message: 'Official API credentials encrypted and saved server-side.',
        },
      }));
      setConfigModalProvider(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  const statusTextColor = (status: ProviderStatus['sessionStatus']) => {
    if (status === 'connected') return 'text-emerald-400';
    if (status === 'expired' || status === 'captcha_required' || status === 'rate_limited') {
      return 'text-rose-400';
    }
    if (status === 'degraded') return 'text-amber-400';
    return 'text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            AI Providers
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Seven independent provider adapters supporting authorized Browser Session Mode and encrypted Official API Mode. Priority adapters: DeepSeek Web and Z.ai / GLM.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh All</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {providers.map((p) => {
          const isBusy = busyId === p.id;
          const fb = feedback[p.id];
          const isConnected = p.sessionStatus === 'connected';
          return (
            <article
              key={p.id}
              data-testid={`provider-card-${p.id}`}
              className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProviderLogo providerId={p.id} size={38} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold text-slate-100">{p.name}</h2>
                        {(p.id === 'deepseek' || p.id === 'zai') && (
                          <span className="text-xs font-medium text-sky-400 whitespace-nowrap">
                            · Priority
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {p.domain} · {p.driverVersion}
                      </div>
                      <div className={`mt-0.5 text-[11px] font-mono font-semibold ${operationalStatusColor(p.operationalStatus)}`}>
                        {p.operationalStatus}
                      </div>
                    </div>
                  </div>

                  {/* Mode Switcher */}
                  <div className="inline-flex rounded-lg bg-[#0B0F17] p-0.5 border border-slate-800 shrink-0">
                    {(['browser_session', 'official_api'] as IntegrationMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(
                            p.id,
                            () => gatewayApi.setProviderMode(p.id, mode),
                            `Switched to ${mode === 'official_api' ? 'Official API' : 'Browser Session'} mode.`
                          )
                        }
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          p.mode === mode
                            ? 'bg-slate-800 text-slate-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode === 'browser_session' ? 'Browser' : 'Official API'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Key-Value Status Grid — Clean Unboxed Metadata */}
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 pt-3 border-t border-slate-800/70 text-xs">
                  <div>
                    <dt className="text-slate-500">Session Status</dt>
                    <dd className={`mt-0.5 font-medium capitalize ${statusTextColor(p.sessionStatus)}`}>
                      {p.sessionStatus.replace(/_/g, ' ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Authentication</dt>
                    <dd className="mt-0.5 text-slate-200 capitalize">
                      {p.authStatus.replace(/_/g, ' ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Adapter State</dt>
                    <dd className={`mt-0.5 font-medium ${p.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Active Tab</dt>
                    <dd className="mt-0.5 text-slate-300 truncate font-mono">
                      {p.activeTabId ? `#${p.activeTabId} ${p.activeTabTitle || ''}` : 'None attached'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Visible Model</dt>
                    <dd className="mt-0.5 text-slate-200 truncate font-mono">
                      {p.visibleModelName || 'Not detected'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tool Calling</dt>
                    <dd className="mt-0.5 text-slate-300">
                      {p.capabilities.nativeToolCalling ? 'Native Provider' : 'Text-Only Chat'}
                    </dd>
                  </div>
                </dl>

                <div className="text-xs text-slate-400 leading-relaxed">
                  Capabilities: {p.capabilities.streaming ? 'Streaming' : 'Non-streaming'} ·{' '}
                  {p.capabilities.cancellation ? 'Cancellable' : 'No cancel'} ·{' '}
                  {p.capabilities.multimodalImages ? 'Images' : 'Text input'} ·{' '}
                  {p.lastSuccessfulRequestAt
                    ? `Last success ${new Date(p.lastSuccessfulRequestAt).toLocaleTimeString()}`
                    : 'No successful request yet'}
                </div>

                {p.lastError && (
                  <div className="rounded-lg bg-rose-950/30 border border-rose-900/60 px-3 py-2 text-xs text-rose-300">
                    <span className="font-mono font-semibold">{p.lastError.code}:</span>{' '}
                    {p.lastError.message}
                  </div>
                )}

                {fb && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs border ${
                      fb.ok
                        ? 'bg-slate-900 border-slate-700 text-slate-200'
                        : 'bg-rose-950/30 border-rose-900/60 text-rose-300'
                    }`}
                  >
                    {fb.message}
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/70">
                {isConnected ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(
                        p.id,
                        () => gatewayApi.disconnectProvider(p.id),
                        `Disconnected ${p.name}.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(
                        p.id,
                        () => gatewayApi.connectProvider(p.id),
                        runtimeMode === 'development_simulation'
                          ? `Simulated tab connected for ${p.name}.`
                          : `Connected ${p.name}.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
                  >
                    <Plug className="h-3.5 w-3.5" />
                    <span>Connect</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      p.id,
                      () => (p.enabled ? gatewayApi.disableProvider(p.id) : gatewayApi.enableProvider(p.id)),
                      p.enabled ? `Disabled ${p.name}.` : `Enabled ${p.name}.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{p.enabled ? 'Disable' : 'Enable'}</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      p.id,
                      async () => {
                        const res = await gatewayApi.testProvider(p.id);
                        if (!res.ok) throw new Error(res.error?.message || 'Test failed');
                      },
                      `Connectivity test passed for ${p.name}.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Test</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      p.id,
                      () => gatewayApi.runDiagnostics(p.id),
                      `Refreshed session & selector state for ${p.name}.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      p.id,
                      async () => {
                        const res = await gatewayApi.verifyProvider(p.id);
                        return {
                          ok:
                            res.report.operationalStatus === 'VERIFIED WORKING' ||
                            res.report.operationalStatus === 'PARTIALLY SUPPORTED',
                          message: `${res.report.operationalStatus} (${res.report.passedCoreChecks}/${res.report.totalCoreChecks} core) — ${res.report.summary}`,
                        };
                      },
                      `Verification finished for ${p.name}.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verify E2E</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => openOfficialConfig(p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Official API</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Official API Configuration Modal */}
      {configModalProvider && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="official-api-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-[#111723] border border-slate-700 p-6 space-y-4">
            <div>
              <h2 id="official-api-modal-title" className="text-lg font-semibold text-slate-100">
                Configure Official API — {configModalProvider.name}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Credentials are encrypted at rest with AES-256-GCM on the gateway server and never returned to browser JavaScript.
              </p>
            </div>

            <form onSubmit={handleSaveOfficialApi} className="space-y-3.5">
              <div>
                <label htmlFor="official-base-url" className="block text-xs font-medium text-slate-300 mb-1">
                  Allowlisted HTTPS Base URL
                </label>
                <input
                  id="official-base-url"
                  type="url"
                  required
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label htmlFor="official-model-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Official Model ID
                </label>
                <input
                  id="official-model-name"
                  type="text"
                  required
                  placeholder="e.g. deepseek-chat, glm-4.5, claude-sonnet-4-20250514"
                  value={apiModelName}
                  onChange={(e) => setApiModelName(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label htmlFor="official-api-key" className="block text-xs font-medium text-slate-300 mb-1">
                  Provider API Key
                </label>
                <input
                  id="official-api-key"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="Enter official provider API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              {modalError && (
                <div className="rounded-lg bg-rose-950/40 border border-rose-900 px-3 py-2 text-xs text-rose-300">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigModalProvider(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
                >
                  Encrypt & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
