import { useEffect, useState } from 'react';
import { Check, Copy, Download, Play } from 'lucide-react';
import type { AgentId, AgentProfile, ModelInfo } from '../../packages/shared-types/src/index';
import { gatewayApi } from '../lib/api';

interface AgentsViewProps {
  agents: AgentProfile[];
  models: ModelInfo[];
}

export function AgentsView({ agents, models }: AgentsViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('claude-code');
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-web');
  const [snippet, setSnippet] = useState<{ filename: string; format: string; content: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; note: string; protocolEndpoint: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  useEffect(() => {
    let active = true;
    gatewayApi
      .getAgentConfig(selectedAgentId, selectedModel)
      .then((res) => {
        if (active) setSnippet(res);
      })
      .catch(() => {});
    setTestResult(null);
    return () => {
      active = false;
    };
  }, [selectedAgentId, selectedModel]);

  const handleCopy = () => {
    if (!snippet) return;
    void navigator.clipboard?.writeText(snippet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    if (!snippet) return;
    const blob = new Blob([snippet.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = snippet.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await gatewayApi.testAgent(selectedAgentId);
      setTestResult({
        ok: res.ok,
        note: res.note,
        protocolEndpoint: res.protocolEndpoint,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        note: err instanceof Error ? err.message : 'Connection test failed',
        protocolEndpoint: activeAgent?.endpointUrl || '',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Coding Agents</h1>
        <p className="mt-1 text-sm text-slate-400">
          Verified protocol configuration generators for local coding agents. Compatibility notes accurately distinguish native tool calling from text-only browser sessions.
        </p>
      </div>

      {/* Agent Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[#111723] border border-slate-800/90 w-fit">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setSelectedAgentId(agent.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              selectedAgentId === agent.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            {agent.name}
          </button>
        ))}
      </div>

      {activeAgent && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <section className="xl:col-span-5 rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">{activeAgent.name}</h2>
              <div className="mt-1 text-xs font-mono text-slate-400">
                Protocol: {activeAgent.protocol.toUpperCase()} · {activeAgent.endpointUrl}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/70 space-y-3 text-xs">
              <div>
                <div className="text-slate-400 font-medium mb-1">Version & Protocol Compatibility</div>
                <p className="text-slate-300 leading-relaxed">{activeAgent.versionNotes}</p>
              </div>

              <div className="rounded-lg bg-amber-950/25 border border-amber-900/50 p-3 text-amber-200/90 leading-relaxed">
                <div className="font-semibold text-amber-300 mb-1">Tool Execution Boundary</div>
                {activeAgent.toolExecutionWarning}
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <div>
                <label htmlFor="agent-model-select" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Default Model Alias in Config
                </label>
                <select
                  id="agent-model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {models.map((m) => (
                    <option key={m.alias} value={m.alias}>
                      {m.alias} ({m.providerName})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={testing}
                onClick={() => void handleTestConnection()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{testing ? 'Testing...' : 'Test Gateway Contract'}</span>
              </button>

              {testResult && (
                <div
                  className={`rounded-lg p-3 text-xs border ${
                    testResult.ok
                      ? 'bg-emerald-950/25 border-emerald-900/60 text-emerald-200'
                      : 'bg-rose-950/30 border-rose-900/60 text-rose-200'
                  }`}
                >
                  <div className="font-mono text-[11px] opacity-80">{testResult.protocolEndpoint}</div>
                  <div className="mt-1">{testResult.note}</div>
                </div>
              )}
            </div>
          </section>

          <section className="xl:col-span-7 rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Generated Configuration</h3>
                <div className="text-xs font-mono text-slate-400">
                  {snippet?.filename || activeAgent.configFilename}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Config'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <pre className="p-4 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs font-mono text-sky-200/95 overflow-x-auto leading-relaxed">
              {snippet?.content || 'Loading configuration template...'}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}
