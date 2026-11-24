import { useCallback, useEffect, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import type {
  AgentProfile,
  DashboardRuntimeMode,
  GatewayHealthSummary,
  GatewaySettings,
  ModelInfo,
  ProviderCompatibilityMatrixRow,
  ProviderStatus,
  RequestLogEntry,
  RoutingConfig,
  RoutingHistoryEntry,
} from '../packages/shared-types/src/index';
import { gatewayApi } from './lib/api';
import { NAV_ITEMS, Sidebar, type NavSectionId } from './components/Sidebar';
import { OverviewView } from './views/OverviewView';
import { ProvidersView } from './views/ProvidersView';
import { CompatibilityMatrixView } from './views/CompatibilityMatrixView';
import { ModelsView } from './views/ModelsView';
import { PlaygroundView } from './views/PlaygroundView';
import { AgentsView } from './views/AgentsView';
import { RoutingView } from './views/RoutingView';
import { RequestLogsView } from './views/RequestLogsView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [health, setHealth] = useState<GatewayHealthSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [matrix, setMatrix] = useState<ProviderCompatibilityMatrixRow[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [requests, setRequests] = useState<RequestLogEntry[]>([]);
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig | null>(null);
  const [routingHistory, setRoutingHistory] = useState<RoutingHistoryEntry[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [settings, setSettings] = useState<GatewaySettings | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<DashboardRuntimeMode>('production');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      setLoadError(null);
      const [h, p, mx, m, r, rt, ag, st] = await Promise.all([
        gatewayApi.getHealth(),
        gatewayApi.getProviders(),
        gatewayApi.getCompatibilityMatrix(),
        gatewayApi.getModels(),
        gatewayApi.getRequests(),
        gatewayApi.getRouting(),
        gatewayApi.getAgents(),
        gatewayApi.getSettings(),
      ]);
      setHealth(h);
      setProviders(p.providers);
      setMatrix(mx.matrix);
      setModels(m.models);
      setRequests(r.requests);
      setRoutingConfig(rt.config);
      setRoutingHistory(rt.history);
      setAgents(ag.agents);
      setSettings(st.settings);
      setRuntimeMode(h.runtimeMode);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to connect to gateway backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleToggleRuntimeMode = async (mode: DashboardRuntimeMode) => {
    if (mode === runtimeMode) return;
    try {
      setLoadError(null);
      await gatewayApi.setRuntimeMode(mode);
      await refreshAll();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to switch runtime mode.');
    }
  };

  const activeNavLabel = NAV_ITEMS.find((i) => i.id === activeSection)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        runtimeMode={runtimeMode}
        connectedProvidersCount={health?.connectedProvidersCount ?? 0}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar — Clean Breadcrumb + Primary Action */}
        <header className="sticky top-0 z-30 h-14 bg-[#0B0F17]/95 backdrop-blur-xs border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 truncate">
              <span className="text-slate-500 hidden sm:inline">WebSession2API</span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="font-medium text-slate-100 truncate">{activeNavLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/70 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1360px] w-full mx-auto space-y-6">
          {/* Runtime Mode Isolation Toolbar (strictly separated Production vs Development Simulation) */}
          <div className="rounded-xl bg-[#111723] border border-slate-800/90 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs leading-relaxed">
              {runtimeMode === 'development_simulation' ? (
                <span className="text-amber-300">
                  <strong className="font-semibold">Development Simulation Mode Active:</strong> Displaying isolated simulated browser tabs so you can test OpenAI/Anthropic protocol routing, SSE streaming, and capability checks inside AI Studio. Simulated state is never mixed with Production Mode.
                </span>
              ) : (
                <span className="text-slate-300">
                  <strong className="font-semibold text-slate-100">Production Mode Active:</strong> Reporting live backend & SQLite state only.{' '}
                  {health?.environment === 'hosted_preview' && !health.nativeBridgeConnected
                    ? 'This hosted preview cannot access local Chrome tabs on your computer — configure Official API Mode, export and run locally, or switch to Development Simulation to inspect protocol flows.'
                    : 'Local Native Messaging bridge status is live.'}
                </span>
              )}
            </div>

            <div
              role="group"
              aria-label="Runtime mode selector"
              className="inline-flex rounded-lg bg-[#0B0F17] p-1 border border-slate-800 shrink-0 self-start md:self-auto"
            >
              <button
                type="button"
                onClick={() => void handleToggleRuntimeMode('production')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  runtimeMode === 'production'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Production Mode
              </button>
              <button
                type="button"
                onClick={() => void handleToggleRuntimeMode('development_simulation')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  runtimeMode === 'development_simulation'
                    ? 'bg-amber-600/25 text-amber-200 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dev Simulation
              </button>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="rounded-xl bg-rose-950/35 border border-rose-900/70 px-4 py-3 text-xs text-rose-200"
            >
              Backend connection error: {loadError}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 rounded-xl bg-[#111723] border border-slate-800/80 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <OverviewView
                  health={health}
                  providers={providers}
                  requests={requests}
                  agents={agents}
                  onNavigate={setActiveSection}
                />
              )}
              {activeSection === 'providers' && (
                <ProvidersView
                  providers={providers}
                  runtimeMode={runtimeMode}
                  onRefresh={refreshAll}
                />
              )}
              {activeSection === 'matrix' && (
                <CompatibilityMatrixView
                  matrix={matrix}
                  runtimeMode={runtimeMode}
                  onRefresh={refreshAll}
                />
              )}
              {activeSection === 'models' && <ModelsView models={models} />}
              {activeSection === 'playground' && (
                <PlaygroundView
                  providers={providers}
                  models={models}
                  runtimeMode={runtimeMode}
                  gatewayHost={settings?.host || '127.0.0.1'}
                  gatewayPort={settings?.port || 8787}
                  onRequestFinished={refreshAll}
                />
              )}
              {activeSection === 'agents' && <AgentsView agents={agents} models={models} />}
              {activeSection === 'routing' && (
                <RoutingView
                  config={routingConfig}
                  history={routingHistory}
                  onRefresh={refreshAll}
                />
              )}
              {activeSection === 'logs' && (
                <RequestLogsView requests={requests} onRefresh={refreshAll} />
              )}
              {activeSection === 'diagnostics' && (
                <DiagnosticsView providers={providers} onRefresh={refreshAll} />
              )}
              {activeSection === 'settings' && (
                <SettingsView settings={settings} onRefresh={refreshAll} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
