import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Save } from 'lucide-react';
import type {
  ProviderId,
  RoutingConfig,
  RoutingHistoryEntry,
  TaskCategory,
} from '../../packages/shared-types/src/index';
import { gatewayApi } from '../lib/api';

interface RoutingViewProps {
  config: RoutingConfig | null;
  history: RoutingHistoryEntry[];
  onRefresh: () => Promise<void>;
}

const ALL_ALIASES = [
  'deepseek-web',
  'glm-web',
  'kimi-web',
  'qwen-web',
  'claude-web',
  'chatgpt-web',
  'gemini-web',
];

export function RoutingView({ config, history, onRefresh }: RoutingViewProps) {
  const [draft, setDraft] = useState<RoutingConfig | null>(config);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (!draft) {
    return <div className="text-sm text-slate-400">Loading routing configuration...</div>;
  }

  const movePriority = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.providerPriority.length) return;
    const next = [...draft.providerPriority];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, providerPriority: next });
  };

  const toggleTaskAlias = (category: TaskCategory, alias: string) => {
    const current = draft.taskPreferences[category] || [];
    const nextList = current.includes(alias)
      ? current.filter((a) => a !== alias)
      : [...current, alias];
    setDraft({
      ...draft,
      taskPreferences: {
        ...draft.taskPreferences,
        [category]: nextList,
      },
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await gatewayApi.updateRouting(draft);
      await onRefresh();
      setNotice('Routing configuration persisted to SQLite.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save routing configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Routing Engine</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure user-defined task preferences, fallback ordering, and concurrency queues. Active conversations stay pinned and never silently switch providers mid-thread.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving...' : 'Save Routing Rules'}</span>
        </button>
      </div>

      {notice && (
        <div className="rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-xs text-slate-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Default Provider & Priority Order */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-5">
          <h2 className="text-base font-semibold text-slate-100">Default Provider & Fallback Priority</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="routing-default-provider" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Provider
              </label>
              <select
                id="routing-default-provider"
                value={draft.defaultProviderId}
                onChange={(e) =>
                  setDraft({ ...draft, defaultProviderId: e.target.value as ProviderId })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {draft.providerPriority.map((pid) => (
                  <option key={pid} value={pid}>
                    {pid}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="routing-timeout" className="block text-xs font-medium text-slate-300 mb-1.5">
                Request Timeout (ms)
              </label>
              <input
                id="routing-timeout"
                type="number"
                min={5000}
                max={300000}
                step={5000}
                value={draft.requestTimeoutMs}
                onChange={(e) =>
                  setDraft({ ...draft, requestTimeoutMs: Number(e.target.value) || 90000 })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.fallbackEnabled}
                onChange={(e) => setDraft({ ...draft, fallbackEnabled: e.target.checked })}
                className="rounded border-slate-600 bg-[#0B0F17] text-sky-500"
              />
              <span>Enable automatic fallback to next authenticated provider for new conversations</span>
            </label>
            <div className="text-slate-500">
              Strict Conversation Pinning: Active (locked on — never silently changes provider mid-conversation).
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">Provider Priority Order</div>
            <div className="divide-y divide-slate-800/70 rounded-lg border border-slate-800 bg-[#0B0F17]">
              {draft.providerPriority.map((pid, idx) => (
                <div key={pid} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-slate-500 w-4">{idx + 1}.</span>
                    <span className="font-mono text-slate-200">{pid}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePriority(idx, -1)}
                      aria-label={`Move ${pid} up`}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.providerPriority.length - 1}
                      onClick={() => movePriority(idx, 1)}
                      aria-label={`Move ${pid} down`}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* User Task Preferences */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Task Preferences</h2>
            <p className="mt-1 text-xs text-slate-400">
              User-configurable alias preferences for <code className="text-slate-300">auto:coding</code>,{' '}
              <code className="text-slate-300">auto:long-context</code>, and{' '}
              <code className="text-slate-300">auto:general</code>. These reflect your routing preferences, not objective model rankings.
            </p>
          </div>

          {(['coding', 'long-context', 'general'] as TaskCategory[]).map((cat) => (
            <div key={cat} className="space-y-2 pt-3 first:pt-0 border-t first:border-t-0 border-slate-800/70">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 capitalize">
                  {cat.replace('-', ' ')} ({`auto:${cat}`})
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {draft.taskPreferences[cat]?.join(' -> ') || 'None selected'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ALIASES.map((alias) => {
                  const selected = draft.taskPreferences[cat]?.includes(alias);
                  return (
                    <button
                      key={alias}
                      type="button"
                      onClick={() => toggleTaskAlias(cat, alias)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                        selected
                          ? 'bg-sky-600/25 border border-sky-500/60 text-sky-200'
                          : 'bg-[#0B0F17] border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {alias}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Routing History */}
      <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5">
        <h2 className="text-base font-semibold text-slate-100 mb-4">Routing Decision History</h2>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No routing decisions recorded in this session yet. Send a request in the API Playground to observe routing resolution.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 font-medium">Timestamp</th>
                  <th className="pb-2.5 font-medium">Requested Model</th>
                  <th className="pb-2.5 font-medium">Selected Provider</th>
                  <th className="pb-2.5 font-medium">Outcome</th>
                  <th className="pb-2.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {new Date(h.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 font-mono text-slate-200">{h.requestedModel}</td>
                    <td className="py-2.5 font-mono text-sky-300">{h.selectedProviderId}</td>
                    <td className="py-2.5">
                      <span
                        className={
                          h.status === 'rejected'
                            ? 'text-rose-400'
                            : h.status === 'fallback_routed'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }
                      >
                        {h.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{h.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
