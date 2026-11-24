import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { RequestLogEntry } from '../../packages/shared-types/src/index';

interface RequestLogsViewProps {
  requests: RequestLogEntry[];
  onRefresh: () => Promise<void>;
}

export function RequestLogsView({ requests, onRefresh }: RequestLogsViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');

  const filtered = requests.filter((r) => {
    if (statusFilter === 'success') return r.status === 'success';
    if (statusFilter === 'error') return r.status !== 'success';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Request Logs</h1>
          <p className="mt-1 text-sm text-slate-400">
            SQLite-persisted request metadata. Prompt and response bodies are excluded from storage by default for privacy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#111723] border border-slate-800 p-1">
            {(['all', 'success', 'error'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  statusFilter === f ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#111723] border border-slate-800/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-[#0D121C]">
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Request ID</th>
                <th className="py-3 px-4 font-medium">Provider</th>
                <th className="py-3 px-4 font-medium">Model</th>
                <th className="py-3 px-4 font-medium">Protocol</th>
                <th className="py-3 px-4 font-medium text-right">Duration</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Error Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">{log.requestId}</td>
                  <td className="py-3 px-4 font-mono text-slate-200 whitespace-nowrap">
                    {log.providerId || '—'}
                  </td>
                  <td className="py-3 px-4 font-mono text-sky-300 whitespace-nowrap">{log.model}</td>
                  <td className="py-3 px-4 text-slate-400 uppercase whitespace-nowrap">
                    {log.protocol} {log.streaming ? '· SSE' : ''}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                    {log.durationMs}ms
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {log.httpStatus} · {log.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={log.errorMessage || ''}>
                    {log.errorCode ? `${log.errorCode}: ${log.errorMessage}` : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No request logs match the selected filter in this runtime mode.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
