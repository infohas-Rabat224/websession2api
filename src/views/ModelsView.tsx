import { useState } from 'react';
import { Search } from 'lucide-react';
import type { ModelInfo } from '../../packages/shared-types/src/index';
import { ProviderLogo } from '../components/ProviderLogo';

interface ModelsViewProps {
  models: ModelInfo[];
}

export function ModelsView({ models }: ModelsViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');

  const filtered = models.filter((m) => {
    if (filter === 'available' && !m.available) return false;
    if (filter === 'unavailable' && m.available) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.alias.toLowerCase().includes(q) ||
      m.prefixedAlias.toLowerCase().includes(q) ||
      m.providerName.toLowerCase().includes(q) ||
      (m.visibleModelName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Model Registry</h1>
        <p className="mt-1 text-sm text-slate-400">
          Dynamic model aliases exposed via <code className="text-slate-200">GET /v1/models</code>. Visible model names are reported only when observed from a connected tab or configured official API—never fabricated.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter aliases or providers..."
            aria-label="Filter models"
            className="w-full rounded-lg bg-[#111723] border border-slate-800 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="inline-flex rounded-lg bg-[#111723] border border-slate-800 p-1 self-start">
          {(['all', 'available', 'unavailable'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                filter === tab ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#111723] border border-slate-800/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-[#0D121C]">
                <th className="py-3 px-4 font-medium">Primary Alias</th>
                <th className="py-3 px-4 font-medium">Prefixed Alias</th>
                <th className="py-3 px-4 font-medium">Provider</th>
                <th className="py-3 px-4 font-medium">Observed Model</th>
                <th className="py-3 px-4 font-medium">Capabilities</th>
                <th className="py-3 px-4 font-medium">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/30">
                  <td className="py-3.5 px-4 font-mono font-medium text-sky-300 whitespace-nowrap">
                    {m.alias}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                    {m.prefixedAlias}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <ProviderLogo providerId={m.providerId} size={24} />
                      <div>
                        <div className="text-slate-200 font-medium">{m.providerName}</div>
                        <div className="text-slate-500">
                          {m.mode === 'official_api' ? 'Official API' : 'Browser Session'} · {m.verificationStatus}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    {m.visibleModelName || <span className="text-slate-500">Unobserved</span>}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    <div>
                      {m.capabilities.nativeToolCalling ? 'Native tools' : 'Text-only chat'} ·{' '}
                      {m.capabilities.streaming ? 'Stream' : 'Batch'} ·{' '}
                      {m.capabilities.cancellation ? 'Cancel' : 'No cancel'}
                    </div>
                    {m.errorStatus && (
                      <div className="mt-0.5 text-rose-400 truncate max-w-xs">{m.errorStatus}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className={`font-medium ${m.available ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {m.available ? 'Available' : 'Unavailable'}
                    </div>
                    <div className="text-slate-500 capitalize">
                      {m.authenticationState.replace(/_/g, ' ')}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No models match the current search or availability filter.
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
