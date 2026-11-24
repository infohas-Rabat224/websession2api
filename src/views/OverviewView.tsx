import { useState } from 'react';
import { Check, Copy, ArrowRight } from 'lucide-react';
import type {
  AgentProfile,
  GatewayHealthSummary,
  ProviderStatus,
  RequestLogEntry,
} from '../../packages/shared-types/src/index';
import type { NavSectionId } from '../components/Sidebar';

interface OverviewViewProps {
  health: GatewayHealthSummary | null;
  providers: ProviderStatus[];
  requests: RequestLogEntry[];
  agents: AgentProfile[];
  onNavigate: (section: NavSectionId) => void;
}

export function OverviewView({
  health,
  providers,
  requests,
  agents,
  onNavigate,
}: OverviewViewProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyText = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 1800);
  };

  const openaiBase = `http://${health?.host || '127.0.0.1'}:${health?.port || 8787}/v1`;
  const anthropicBase = `http://${health?.host || '127.0.0.1'}:${health?.port || 8787}`;
  const recentLogs = requests.slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Gateway Overview
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Unified OpenAI and Anthropic compatible API gateway exposing authenticated browser sessions and official provider APIs with explicit capability reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('playground')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <span>Open API Playground</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Primary KPI Strip — Single Elevation */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Gateway Health</div>
          <div className="mt-2 text-lg font-semibold text-emerald-400 capitalize">
            {health?.status || 'Loading'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {health ? `Up ${health.uptimeSeconds}s` : '—'}
          </div>
        </div>

        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Connected Providers</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {health?.connectedProvidersCount ?? 0}
            <span className="text-sm font-normal text-slate-500"> / {providers.length || 7}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {health?.runtimeMode === 'development_simulation' ? 'Simulated tabs' : 'Verified live'}
          </div>
        </div>

        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Available Models</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {health?.availableModelsCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Aliases registered</div>
        </div>

        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Total Requests</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {health?.totalRequests ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">SQLite persisted</div>
        </div>

        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Successful</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
            {health?.successfulRequests ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">HTTP 200 OK</div>
        </div>

        <div className="rounded-xl bg-[#111723] border border-slate-800/90 p-4">
          <div className="text-xs text-slate-400">Failed / Rejected</div>
          <div className="mt-2 text-2xl font-semibold text-rose-400 font-mono tabular-nums">
            {health?.failedRequests ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Explicit errors</div>
        </div>
      </div>

      {/* Local API Endpoints + 5-Layer Bridge Architecture Status */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">Local API Endpoints</h2>
            <span className="text-xs text-slate-400">Loopback only · Authenticated</span>
          </div>

          <div className="space-y-3 divide-y divide-slate-800/70">
            <div className="pt-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-400">OpenAI-Compatible Base URL</div>
                <code className="block mt-1 text-sm text-sky-300 truncate">{openaiBase}</code>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  GET /v1/models · POST /v1/chat/completions
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(openaiBase)}
                aria-label="Copy OpenAI base URL"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedUrl === openaiBase ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedUrl === openaiBase ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="pt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-400">Anthropic-Compatible Base URL</div>
                <code className="block mt-1 text-sm text-sky-300 truncate">{anthropicBase}</code>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  POST /v1/messages · POST /v1/messages/count_tokens
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(anthropicBase)}
                aria-label="Copy Anthropic base URL"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedUrl === anthropicBase ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedUrl === anthropicBase ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">Five-Layer Bridge Status</h2>
            <span className="text-xs text-slate-400">
              {health?.environment === 'hosted_preview' ? 'Hosted Preview Container' : 'Local Workstation'}
            </span>
          </div>

          <div className="space-y-2.5 text-sm">
            {[
              {
                step: '01',
                name: 'AI Provider Websites',
                detail: 'DeepSeek · Z.ai GLM · Kimi · Qwen · Claude · ChatGPT · Gemini',
                status: `${health?.connectedProvidersCount ?? 0} active`,
                ok: (health?.connectedProvidersCount ?? 0) > 0,
              },
              {
                step: '02',
                name: 'Chrome MV3 Extension',
                detail: 'Scoped host_permissions · Zero cookie export · 7 DOM drivers',
                status: health?.nativeBridgeConnected ? 'Connected' : 'Local install required',
                ok: Boolean(health?.nativeBridgeConnected),
              },
              {
                step: '03',
                name: 'Native Messaging Host',
                detail: 'com.websession2api.host · 32-bit LE stdio framing',
                status: health?.nativeBridgeConnected ? 'Active IPC' : 'Awaiting local host',
                ok: Boolean(health?.nativeBridgeConnected),
              },
              {
                step: '04',
                name: 'Local API Gateway & SQLite',
                detail: 'Fastify + Drizzle ORM · Loopback auth · Model router',
                status: health?.databaseConnected ? 'Operational' : 'Offline',
                ok: Boolean(health?.databaseConnected),
              },
              {
                step: '05',
                name: 'Coding Agents',
                detail: `${agents.length} configuration generators ready`,
                status: 'Contracts ready',
                ok: true,
              },
            ].map((layer) => (
              <div
                key={layer.step}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{layer.step}</span>
                    <span className="font-medium text-slate-200">{layer.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 truncate pl-6">{layer.detail}</div>
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                    layer.ok ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {layer.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent Activity & Agent Integration Status */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 rounded-xl bg-[#111723] border border-slate-800/90 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-100">Recent Gateway Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('logs')}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              View all logs
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm text-slate-300">No requests recorded in this runtime mode yet.</p>
              <p className="text-xs text-slate-500">
                Send a request from the API Playground or connect a local coding agent to inspect live traffic metadata.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2.5 font-medium">Request ID</th>
                    <th className="pb-2.5 font-medium">Model</th>
                    <th className="pb-2.5 font-medium">Protocol</th>
                    <th className="pb-2.5 font-medium text-right">Latency</th>
                    <th className="pb-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-slate-300">{log.requestId}</td>
                      <td className="py-2.5 font-mono text-slate-200">{log.model}</td>
                      <td className="py-2.5 text-slate-400 uppercase">{log.protocol}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                        {log.durationMs}ms
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`font-medium ${
                            log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {log.status === 'success' ? `200 OK` : `${log.httpStatus} ${log.errorCode || log.status}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-100">Coding Agents</h2>
            <button
              type="button"
              onClick={() => onNavigate('agents')}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              Configure
            </button>
          </div>

          <div className="divide-y divide-slate-800/60">
            {agents.map((agent) => (
              <div key={agent.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-200">{agent.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {agent.protocol.toUpperCase()} · {agent.configFilename}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    agent.compatibilityStatus === 'verified_contract'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {agent.compatibilityStatus === 'verified_contract'
                    ? 'Contract Ready'
                    : agent.compatibilityStatus === 'partial_text_only'
                      ? 'Text / XML Mode'
                      : 'Needs Native Tools'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
