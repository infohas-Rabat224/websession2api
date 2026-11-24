import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import type {
  ProviderId,
  ProviderStatus,
  SelectorHealthReport,
} from '../../packages/shared-types/src/index';
import { gatewayApi } from '../lib/api';

interface DiagnosticsViewProps {
  providers: ProviderStatus[];
  onRefresh: () => Promise<void>;
}

export function DiagnosticsView({ providers, onRefresh }: DiagnosticsViewProps) {
  const [selectedId, setSelectedId] = useState<ProviderId>('deepseek');
  const [running, setRunning] = useState(false);
  const [latestReport, setLatestReport] = useState<SelectorHealthReport | null>(null);

  const selectedProvider = providers.find((p) => p.id === selectedId) || providers[0];
  const report = latestReport || selectedProvider?.selectorHealth || null;

  const handleRunDiagnostics = async () => {
    setRunning(true);
    try {
      const res = await gatewayApi.runDiagnostics(selectedId);
      setLatestReport(res.report);
      await onRefresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Selector Diagnostics & Local Install
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Inspect DOM selector health, detect provider UI drift, and follow workstation setup steps for the local Chrome MV3 extension and Native Messaging host.
          </p>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={() => void handleRunDiagnostics()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Stethoscope className="h-3.5 w-3.5" />
          <span>{running ? 'Checking...' : 'Run Selector Check'}</span>
        </button>
      </div>

      {/* Provider selector strip */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[#111723] border border-slate-800/90 w-fit">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedId(p.id);
              setLatestReport(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              selectedId === p.id
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {p.shortName}
          </button>
        ))}
      </div>

      {report && selectedProvider && (
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/70">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {selectedProvider.name} — {report.driverVersion}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{report.summary}</p>
            </div>
            <div className="text-xs font-mono">
              <span
                className={
                  report.uiDriftDetected
                    ? 'text-rose-400'
                    : report.healthy
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                }
              >
                {report.uiDriftDetected
                  ? 'UI Drift Detected'
                  : report.healthy
                    ? 'Live Tab Verified'
                    : 'Static Schema Ready'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">Selector Key</th>
                  <th className="pb-2.5 font-medium">CSS / Accessible Selector</th>
                  <th className="pb-2.5 font-medium text-right">Matches</th>
                  <th className="pb-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.results.map((r) => (
                  <tr key={r.selectorKey}>
                    <td className="py-2.5 font-mono text-slate-200 whitespace-nowrap">{r.selectorKey}</td>
                    <td className="py-2.5 font-mono text-slate-400 max-w-md truncate" title={r.cssSelector}>
                      {r.cssSelector}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {r.elementCount}
                    </td>
                    <td className="py-2.5">
                      <span className={r.matched ? 'text-emerald-400' : 'text-slate-400'}>
                        {r.matched ? (r.visible ? 'Matched · Visible' : 'Matched · Hidden') : 'Unchecked / 0'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Local Installation Quick Reference */}
      <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-100">Workstation Installation & Export Workflow</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Google AI Studio runs in a hosted cloud sandbox and cannot access Chrome tabs or Windows/macOS/Linux Native Messaging registries on your machine. Export this repository and run the included scripts locally:
        </p>
        <pre className="p-4 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# 1. Install dependencies & build dashboard, MV3 extension, and Native Messaging host
npm install
npm run build:all

# 2. Load apps/extension/dist in Chrome -> chrome://extensions (Developer Mode -> Load unpacked)
#    Copy the generated Chrome Extension ID

# 3. Register the Native Messaging host (Windows PowerShell / macOS / Linux)
#    Windows: .\\scripts\\windows\\install.ps1 -ExtensionId <YOUR_EXTENSION_ID>
#    macOS/Linux: ./scripts/unix/install.sh <YOUR_EXTENSION_ID>

# 4. Start the local loopback API gateway (127.0.0.1:8787)
npm run gateway`}
        </pre>
      </section>
    </div>
  );
}
