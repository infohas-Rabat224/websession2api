import { useRef, useState } from 'react';
import { Check, Copy, Play, Square } from 'lucide-react';
import type {
  ApiProtocol,
  DashboardRuntimeMode,
  ModelInfo,
  ProviderStatus,
} from '../../packages/shared-types/src/index';

interface PlaygroundViewProps {
  providers: ProviderStatus[];
  models: ModelInfo[];
  runtimeMode: DashboardRuntimeMode;
  gatewayHost: string;
  gatewayPort: number;
  onRequestFinished: () => Promise<void>;
}

export function PlaygroundView({
  providers,
  models,
  runtimeMode,
  gatewayHost,
  gatewayPort,
  onRequestFinished,
}: PlaygroundViewProps) {
  const [protocol, setProtocol] = useState<ApiProtocol>('openai');
  const [selectedModel, setSelectedModel] = useState<string>(models[0]?.alias || 'deepseek-web');
  const [systemPrompt, setSystemPrompt] = useState('You are a concise software engineering assistant.');
  const [prompt, setPrompt] = useState('Explain how Chrome Native Messaging frames stdin/stdout JSON payloads.');
  const [streaming, setStreaming] = useState(true);
  const [includeSampleTool, setIncludeSampleTool] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ status: number; code: string; message: string } | null>(null);
  const [meta, setMeta] = useState<{ status: number; latencyMs: number; endpoint: string } | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const selectedModelInfo = models.find(
    (m) => m.alias === selectedModel || m.prefixedAlias === selectedModel
  );
  const selectedProvider = providers.find((p) => p.id === selectedModelInfo?.providerId);

  const buildPayload = () => {
    if (protocol === 'openai') {
      const payload: Record<string, unknown> = {
        model: selectedModel,
        stream: streaming,
        messages: [
          ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
          { role: 'user', content: prompt.trim() },
        ],
      };
      if (includeSampleTool) {
        payload.tools = [
          {
            type: 'function',
            function: {
              name: 'read_workspace_file',
              description: 'Read a file from the local repository',
              parameters: {
                type: 'object',
                properties: { path: { type: 'string' } },
                required: ['path'],
              },
            },
          },
        ];
      }
      return payload;
    }

    const payload: Record<string, unknown> = {
      model: selectedModel,
      max_tokens: 1024,
      stream: streaming,
      ...(systemPrompt.trim() ? { system: systemPrompt.trim() } : {}),
      messages: [{ role: 'user', content: prompt.trim() }],
    };
    if (includeSampleTool) {
      payload.tools = [
        {
          name: 'read_workspace_file',
          description: 'Read a file from the local repository',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ];
    }
    return payload;
  };

  const buildCurlCommand = () => {
    const endpoint =
      protocol === 'openai'
        ? `http://${gatewayHost}:${gatewayPort}/v1/chat/completions`
        : `http://${gatewayHost}:${gatewayPort}/v1/messages`;
    const authHeader =
      protocol === 'openai'
        ? `-H "Authorization: Bearer $WEBSESSION2API_API_KEY"`
        : `-H "x-api-key: $WEBSESSION2API_API_KEY" -H "anthropic-version: 2023-06-01"`;
    const body = JSON.stringify(buildPayload(), null, 2).replace(/'/g, "'\\''");
    return `curl -X POST "${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  ${authHeader} \\\n  -d '${body}'`;
  };

  const handleCopyCurl = () => {
    void navigator.clipboard?.writeText(buildCurlCommand());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1800);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorInfo({ status: 400, code: 'INVALID_REQUEST', message: 'Prompt cannot be empty.' });
      return;
    }

    const endpoint = protocol === 'openai' ? '/api/v1/chat/completions' : '/api/v1/messages';
    const displayEndpoint = protocol === 'openai' ? '/v1/chat/completions' : '/v1/messages';
    const payload = buildPayload();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setResponseText('');
    setRawJson(null);
    setErrorInfo(null);
    setMeta(null);

    const startedAt = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-WebSession2API-Dashboard': '1',
          ...(protocol === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errObj = (errBody as { error?: { code?: string; message?: string; type?: string } }).error;
        setErrorInfo({
          status: res.status,
          code: errObj?.code || errObj?.type || `HTTP_${res.status}`,
          message: errObj?.message || `Gateway returned HTTP ${res.status}`,
        });
        setRawJson(JSON.stringify(errBody, null, 2));
        setMeta({ status: res.status, latencyMs: Math.round(performance.now() - startedAt), endpoint: displayEndpoint });
        return;
      }

      if (streaming && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        const rawEvents: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            rawEvents.push(dataStr);
            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>;
              if (parsed.error && typeof parsed.error === 'object') {
                const pe = parsed.error as { code?: string; message?: string };
                setErrorInfo({
                  status: 503,
                  code: pe.code || 'STREAM_ERROR',
                  message: pe.message || 'Stream error',
                });
              } else if (protocol === 'openai') {
                const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
                const delta = choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  setResponseText(accumulated);
                }
              } else {
                const delta = parsed.delta as { type?: string; text?: string } | undefined;
                if (delta?.type === 'text_delta' && delta.text) {
                  accumulated += delta.text;
                  setResponseText(accumulated);
                }
              }
            } catch {
              // Ignore partial non-JSON lines
            }
          }
        }

        setRawJson(rawEvents.slice(-5).join('\n'));
        setMeta({ status: res.status, latencyMs: Math.round(performance.now() - startedAt), endpoint: displayEndpoint });
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        setRawJson(JSON.stringify(json, null, 2));
        if (protocol === 'openai') {
          const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
          setResponseText(choices?.[0]?.message?.content || '');
        } else {
          const blocks = json.content as Array<{ type?: string; text?: string }> | undefined;
          setResponseText(
            (blocks || [])
              .filter((b) => b.type === 'text')
              .map((b) => b.text || '')
              .join('')
          );
        }
        setMeta({ status: res.status, latencyMs: Math.round(performance.now() - startedAt), endpoint: displayEndpoint });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setErrorInfo({
          status: 499,
          code: 'CANCELLED',
          message: 'Request aborted by user.',
        });
      } else {
        setErrorInfo({
          status: 500,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Request failed',
        });
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      await onRequestFinished();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">API Playground</h1>
          <p className="mt-1 text-sm text-slate-400">
            Calls the live backend <code className="text-slate-200">/v1/chat/completions</code> and{' '}
            <code className="text-slate-200">/v1/messages</code> endpoints directly. Never substitutes sample output when a real request fails.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopyCurl}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          {copiedCurl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copiedCurl ? 'cURL Copied' : 'Copy as cURL'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Request Composer */}
        <form
          onSubmit={handleSend}
          className="xl:col-span-5 rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4"
        >
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Protocol</span>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
              {(['openai', 'anthropic'] as ApiProtocol[]).map((proto) => (
                <button
                  key={proto}
                  type="button"
                  onClick={() => setProtocol(proto)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    protocol === proto ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {proto === 'openai' ? 'OpenAI /v1/chat' : 'Anthropic /v1/messages'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="playground-model" className="block text-xs font-medium text-slate-300 mb-1.5">
              Model Alias / Route
            </label>
            <select
              id="playground-model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <optgroup label="Registered Provider Aliases">
                {models.map((m) => (
                  <option key={m.alias} value={m.alias}>
                    {m.alias} ({m.providerName} — {m.available ? 'Available' : 'Disconnected'})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Prefixed Aliases">
                {models.map((m) => (
                  <option key={m.prefixedAlias} value={m.prefixedAlias}>
                    {m.prefixedAlias}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Task Preferences">
                <option value="auto:coding">auto:coding</option>
                <option value="auto:long-context">auto:long-context</option>
                <option value="auto:general">auto:general</option>
              </optgroup>
            </select>
            {selectedProvider && (
              <div className="mt-1.5 text-xs text-slate-400">
                Target: {selectedProvider.name} ·{' '}
                {selectedProvider.mode === 'official_api' ? 'Official API' : 'Browser Session'} ·{' '}
                <span className={selectedModelInfo?.available ? 'text-emerald-400' : 'text-amber-400'}>
                  {selectedModelInfo?.available ? 'Ready' : 'Not connected'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="playground-system" className="block text-xs font-medium text-slate-300 mb-1.5">
              System Instructions
            </label>
            <input
              id="playground-system"
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label htmlFor="playground-prompt" className="block text-xs font-medium text-slate-300 mb-1.5">
              User Prompt
            </label>
            <textarea
              id="playground-prompt"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2.5 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex flex-col gap-2.5 pt-1 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={streaming}
                onChange={(e) => setStreaming(e.target.checked)}
                className="rounded border-slate-600 bg-[#0B0F17] text-sky-500"
              />
              <span>Enable Server-Sent Events (SSE) streaming</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSampleTool}
                onChange={(e) => setIncludeSampleTool(e.target.checked)}
                className="rounded border-slate-600 bg-[#0B0F17] text-sky-500"
              />
              <span>Attach sample tool schema (verifies explicit capability rejection on text-only sessions)</span>
            </label>
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{isRunning ? 'Sending...' : 'Send Request'}</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-800 bg-rose-950/40 hover:bg-rose-900/40 text-xs font-medium text-rose-200 transition-colors whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5" />
                <span>Stop</span>
              </button>
            )}
          </div>
        </form>

        {/* Response & Error Inspector */}
        <div className="xl:col-span-7 space-y-5">
          <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/70">
              <h2 className="text-sm font-semibold text-slate-100">Response Output</h2>
              <div className="text-xs font-mono tabular-nums text-slate-400">
                {meta ? (
                  <>
                    <span className={meta.status >= 200 && meta.status < 300 ? 'text-emerald-400' : 'text-rose-400'}>
                      HTTP {meta.status}
                    </span>{' '}
                    · {meta.latencyMs}ms · {meta.endpoint}
                  </>
                ) : (
                  <span>Mode: {runtimeMode === 'development_simulation' ? 'Dev Simulation' : 'Production'}</span>
                )}
              </div>
            </div>

            {errorInfo && (
              <div
                role="alert"
                className="rounded-lg bg-rose-950/35 border border-rose-900/70 p-4 space-y-1.5 text-xs"
              >
                <div className="font-mono font-semibold text-rose-300">
                  Error {errorInfo.status} · {errorInfo.code}
                </div>
                <p className="text-rose-200/90 leading-relaxed">{errorInfo.message}</p>
              </div>
            )}

            {responseText ? (
              <pre className="whitespace-pre-wrap text-sm text-slate-100 leading-relaxed font-sans bg-[#0B0F17] border border-slate-800/80 rounded-lg p-4 max-h-96 overflow-y-auto">
                {responseText}
              </pre>
            ) : !errorInfo ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Submit a request to inspect real gateway output, SSE deltas, or explicit protocol errors.
              </div>
            ) : null}

            {rawJson && (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-medium">
                  Inspect raw wire payload
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-300 font-mono overflow-x-auto max-h-56">
                  {rawJson}
                </pre>
              </details>
            )}
          </section>

          <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-300">Equivalent cURL Command</h3>
            <pre className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
              {buildCurlCommand()}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
