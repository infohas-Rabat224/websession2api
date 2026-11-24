import {
  Activity,
  Cpu,
  GitBranch,
  Layers,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  Terminal,
  X,
} from 'lucide-react';
import type { DashboardRuntimeMode } from '../../packages/shared-types/src/index';

export type NavSectionId =
  | 'overview'
  | 'providers'
  | 'matrix'
  | 'models'
  | 'playground'
  | 'agents'
  | 'routing'
  | 'logs'
  | 'diagnostics'
  | 'settings';

export const NAV_ITEMS: Array<{ id: NavSectionId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', icon: Layers },
  { id: 'matrix', label: 'Compatibility', icon: ShieldCheck },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'playground', label: 'API Playground', icon: Terminal },
  { id: 'agents', label: 'Agents', icon: Activity },
  { id: 'routing', label: 'Routing', icon: GitBranch },
  { id: 'logs', label: 'Request Logs', icon: ScrollText },
  { id: 'diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeSection: NavSectionId;
  onSelect: (id: NavSectionId) => void;
  runtimeMode: DashboardRuntimeMode;
  connectedProvidersCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelect,
  runtimeMode,
  connectedProvidersCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-[#0D121C] border-r border-slate-800/80">
      <div className="flex items-center justify-between px-5 h-14 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <span className="font-mono text-xs font-semibold text-sky-400">W2A</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-100 whitespace-nowrap truncate">
            WebSession2API
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Main Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-sky-500/12 text-sky-300'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3.5 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Active Sessions</span>
          <span className="font-mono tabular-nums text-slate-200">{connectedProvidersCount} / 7</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Runtime Mode</span>
          <span
            className={`font-medium ${
              runtimeMode === 'development_simulation' ? 'text-amber-400' : 'text-slate-200'
            }`}
          >
            {runtimeMode === 'development_simulation' ? 'Dev Simulation' : 'Production'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-60 shrink-0 h-screen sticky top-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
