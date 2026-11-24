import { useState } from 'react';
import { CheckCircle2, Play, ShieldCheck, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import type {
  CapabilityVerificationState,
  DashboardRuntimeMode,
  ProviderCompatibilityMatrixRow,
  ProviderId,
  ProviderOperationalStatus,
  ProviderVerificationReport,
} from '../../packages/shared-types/src/index';
import { ProviderLogo } from '../components/ProviderLogo';
import { gatewayApi } from '../lib/api';

interface CompatibilityMatrixViewProps {
  matrix: ProviderCompatibilityMatrixRow[];
  runtimeMode: DashboardRuntimeMode;
  onRefresh: () => Promise<void>;
}

export function operationalStatusColor(status: ProviderOperationalStatus): string {
  switch (status) {
    case 'VERIFIED WORKING':
      return 'text-emerald-400';
    case 'PARTIALLY SUPPORTED':
      return 'text-sky-400';
    case 'CONNECTED':
      return 'text-teal-300';
    case 'TESTING':
      return 'text-amber-300';
    case 'SESSION REQUIRED':
    case 'NOT INSTALLED':
      return 'text-slate-400';
    case 'TEMPORARILY UNAVAILABLE':
    case 'SESSION EXPIRED':
      return 'text-amber-400';
    case 'INTERFACE CHANGED':
    case 'FAILED':
      return 'text-rose-400';
  }
}

function capabilityLabel(state: CapabilityVerificationState): { text: string; color: string } {
  switch (state) {
    case 'verified':
      return { text: 'Verified', color: 'text-emerald-400' };
    case 'supported_untested':
      return { text: 'Untested', color: 'text-slate-400' };
    case 'unsupported':
      return { text: 'Unsupported', color: 'text-slate-500' };
    case 'failed':
      return { text: 'Failed', color: 'text-rose-400' };
  }
}

export function CompatibilityMatrixView({
  matrix,
  runtimeMode,
  onRefresh,
}: CompatibilityMatrixViewProps) {
  const [selectedId, setSelectedId] = useState<ProviderId>('deepseek');
  const [busyProvider, setBusyProvider] = useState<ProviderId | 'all' | null>(null);
  const [activeReport, setActiveReport] = useState<ProviderVerificationReport | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selectedRow = matrix.find((r) => r.providerId === selectedId) || matrix[0] || null;
  const inspectedReport =
    activeReport && activeReport.providerId === selectedId
      ? activeReport
      : selectedRow?.lastReport || null;

  const handleVerifyOne = async (providerId: ProviderId) => {
    setBusyProvider(providerId);
    setSelectedId(providerId);
    setRunError(null);
    try {
      const res = await gatewayApi.verifyProvider(providerId);
      setActiveReport(res.report);
      await onRefresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleVerifyAll = async () => {
    setBusyProvider('all');
    setRunError(null);
    try {
      const res = await gatewayApi.verifyAllProviders();
      const matched = res.reports.find((r) => r.providerId === selectedId) || res.reports[0] || null;
      if (matched) setActiveReport(matched);
      await onRefresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Batch verification failed.');
    } finally {
      setBusyProvider(null);
    }
  };

  const verifiedCount = matrix.filter((r) => r.operationalStatus === 'VERIFIED WORKING').length;
  const partialCount = matrix.filter((r) => r.operationalStatus === 'PARTIALLY SUPPORTED').length;
  const waitingCount = matrix.filter(
    (r) =>
      r.operationalStatus === 'NOT INSTALLED' ||
      r.operationalStatus === 'SESSION REQUIRED' ||
      r.operationalStatus === 'CONNECTED'
  ).length;
  const faultCount = matrix.filter(
    (r) =>
      r.operationalStatus === 'FAILED' ||
      r.operationalStatus === 'INTERFACE CHANGED' ||
      r.operationalStatus === 'SESSION EXPIRED' ||
      r.operationalStatus === 'TEMPORARILY UNAVAILABLE'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Provider Compatibility Matrix
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Independent 10-step functional verification for DeepSeek, Z.ai / GLM, Kimi, Qwen, Claude, ChatGPT, and Gemini. A provider only receives <span className="font-mono text-slate-200">VERIFIED WORKING</span> after passing an actual end-to-end test.
          </p>
        </div>

        <button
          type="button"
          disabled={busyProvider !== null}
          onClick={() => void handleVerifyAll()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{busyProvider === 'all' ? 'Verifying All 7...' : 'Verify All 7 Providers'}</span>
        </button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Verified Working</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-400">
            {verifiedCount} / {matrix.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Full E2E + capabilities passed</div>
        </div>
        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Partially Supported</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-sky-400">
            {partialCount} / {matrix.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Core chat passed; limited features</div>
        </div>
        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Install / Session Needed</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-200">
            {waitingCount} / {matrix.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {runtimeMode === 'development_simulation' ? 'Simulated runtime' : 'Awaiting local extension or API key'}
          </div>
        </div>
        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Errors / Drift / Expired</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-rose-400">
            {faultCount} / {matrix.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Isolated per provider adapter</div>
        </div>
      </div>

      {runError && (
        <div
          role="alert"
          className="rounded-xl bg-rose-950/35 border border-rose-900/70 px-4 py-3 text-xs text-rose-200"
        >
          {runError}
        </div>
      )}

      {/* Compatibility Matrix Table */}
      <section className="rounded-xl bg-[#111723] border border-slate-800/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-[#0D121C]">
                <th className="py-3 px-3 font-medium">Provider</th>
                <th className="py-3 px-2.5 font-medium">Status</th>
                <th className="py-3 px-2.5 font-medium">Models</th>
                <th className="py-3 px-2 font-medium">Streaming</th>
                <th className="py-3 px-2 font-medium">Attachments</th>
                <th className="py-3 px-2 font-medium">Images</th>
                <th className="py-3 px-2 font-medium">Tools</th>
                <th className="py-3 px-2 font-medium">Last Pass</th>
                <th className="py-3 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {matrix.map((row) => {
                const isSelected = row.providerId === selectedId;
                const isTesting = busyProvider === row.providerId || busyProvider === 'all';
                const displayStatus: ProviderOperationalStatus = isTesting ? 'TESTING' : row.operationalStatus;
                const streamCap = capabilityLabel(row.capabilityResults.streaming);
                const attCap = capabilityLabel(row.capabilityResults.attachments);
                const imgCap = capabilityLabel(row.capabilityResults.images);
                const toolCap = capabilityLabel(row.capabilityResults.toolCalling);

                return (
                  <tr
                    key={row.providerId}
                    data-testid={`matrix-row-${row.providerId}`}
                    className={isSelected ? 'bg-slate-800/35' : 'hover:bg-slate-800/20'}
                  >
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <ProviderLogo providerId={row.providerId} size={26} />
                        <div>
                          <div className="font-medium text-slate-100">{row.providerName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {row.driverVersion} · {row.mode === 'official_api' ? 'Official API' : 'Browser'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <div className={`font-mono font-semibold text-[11px] ${operationalStatusColor(displayStatus)}`}>
                        {displayStatus}
                        {row.isSimulated ? ' (SIM)' : ''}
                      </div>
                      {row.failureReasons[0] && (
                        <div
                          className="text-[11px] text-slate-500 max-w-[140px] truncate mt-0.5"
                          title={row.failureReasons[0]}
                        >
                          {row.failureReasons[0]}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <div className={row.modelAvailable ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
                        {row.modelAvailable ? 'Available' : 'Unavailable'}
                      </div>
                      <div
                        className="text-[11px] font-mono text-slate-500 max-w-[115px] truncate"
                        title={row.discoveredModels.join(', ')}
                      >
                        {row.discoveredModels[0] || '—'}
                      </div>
                    </td>
                    <td className={`py-3 px-2 font-mono text-[11px] whitespace-nowrap ${streamCap.color}`}>
                      {streamCap.text}
                    </td>
                    <td className={`py-3 px-2 font-mono text-[11px] whitespace-nowrap ${attCap.color}`}>
                      {attCap.text}
                    </td>
                    <td className={`py-3 px-2 font-mono text-[11px] whitespace-nowrap ${imgCap.color}`}>
                      {imgCap.text}
                    </td>
                    <td className={`py-3 px-2 font-mono text-[11px] whitespace-nowrap ${toolCap.color}`}>
                      {toolCap.text}
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] tabular-nums text-slate-400 whitespace-nowrap">
                      {row.lastSuccessfulTestAt
                        ? new Date(row.lastSuccessfulTestAt).toLocaleTimeString()
                        : 'Never'}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyProvider !== null}
                          onClick={() => void handleVerifyOne(row.providerId)}
                          aria-label={`Verify ${row.providerName}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-[11px] font-medium text-slate-200 transition-colors"
                        >
                          <Play className="h-3 w-3" />
                          <span>Verify</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(row.providerId);
                            setActiveReport(row.lastReport);
                          }}
                          aria-label={`Inspect ${row.providerName} diagnostic report`}
                          className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                            isSelected
                              ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                              : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`}
                        >
                          Report
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Diagnostic Report Panel */}
      {selectedRow && (
        <section
          data-testid="verification-diagnostic-panel"
          className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-800/70">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Diagnostic Verification Report — {selectedRow.providerName}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {inspectedReport
                  ? inspectedReport.summary
                  : `No verification run recorded yet for ${selectedRow.providerName} in ${runtimeMode === 'development_simulation' ? 'Dev Simulation' : 'Production'} mode.`}
              </p>
            </div>
            <div className="text-right text-xs font-mono">
              <div className={`font-semibold ${operationalStatusColor(selectedRow.operationalStatus)}`}>
                {selectedRow.operationalStatus}
              </div>
              {inspectedReport && (
                <div className="text-slate-500 mt-0.5 tabular-nums">
                  Core checks: {inspectedReport.passedCoreChecks}/{inspectedReport.totalCoreChecks} ·{' '}
                  {new Date(inspectedReport.checkedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {selectedRow.failureReasons.length > 0 && (
            <div className="rounded-lg bg-rose-950/25 border border-rose-900/60 p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-rose-300">Exact Failure / Blocking Reasons</div>
              <ul className="space-y-1 text-xs text-rose-200/90 list-disc pl-4">
                {selectedRow.failureReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {inspectedReport ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2.5 font-medium">Verification Step</th>
                    <th className="pb-2.5 font-medium">Outcome</th>
                    <th className="pb-2.5 font-medium text-right">Duration</th>
                    <th className="pb-2.5 font-medium pl-4">Diagnostic Detail & Failure Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {inspectedReport.steps.map((step) => (
                    <tr key={step.id}>
                      <td className="py-2.5 font-medium text-slate-200 whitespace-nowrap pr-3">
                        {step.label}
                      </td>
                      <td className="py-2.5 whitespace-nowrap pr-3">
                        {step.status === 'passed' && (
                          <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Passed</span>
                          </span>
                        )}
                        {step.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 font-mono text-rose-400">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                        {step.status === 'unsupported' && (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-400">
                            <MinusCircle className="h-3.5 w-3.5" />
                            <span>Unsupported</span>
                          </span>
                        )}
                        {step.status === 'skipped' && (
                          <span className="inline-flex items-center gap-1 font-mono text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Skipped</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {step.durationMs}ms
                      </td>
                      <td className="py-2.5 pl-4 text-slate-300">
                        <div>{step.detail}</div>
                        {step.failureReason && (
                          <div className="mt-0.5 text-rose-300 font-mono text-[11px]">
                            Reason: {step.failureReason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                Run the 10-step functional verification suite to test session detection, model discovery, real prompt execution, context, recovery, streaming, attachments, images, and tool calling separately.
              </span>
              <button
                type="button"
                disabled={busyProvider !== null}
                onClick={() => void handleVerifyOne(selectedRow.providerId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Run Verification Now</span>
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
