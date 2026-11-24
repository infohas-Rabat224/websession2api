import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Save } from 'lucide-react';
import type { GatewaySettings } from '../../packages/shared-types/src/index';
import { gatewayApi } from '../lib/api';

interface SettingsViewProps {
  settings: GatewaySettings | null;
  onRefresh: () => Promise<void>;
}

export function SettingsView({ settings, onRefresh }: SettingsViewProps) {
  const [draft, setDraft] = useState<GatewaySettings | null>(settings);
  const [extensionIdsText, setExtensionIdsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (settings) {
      setDraft(settings);
      setExtensionIdsText(settings.allowedExtensionIds.join(', '));
    }
  }, [settings]);

  if (!draft) {
    return <div className="text-sm text-slate-400">Loading gateway settings...</div>;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const allowedExtensionIds = extensionIdsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await gatewayApi.updateSettings({ ...draft, allowedExtensionIds });
      await onRefresh();
      setNotice('Gateway settings persisted to SQLite.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRotateKey = async () => {
    const res = await gatewayApi.rotateApiKey();
    setRotatedKey(res.newApiKey);
    await onRefresh();
  };

  const copyNewKey = () => {
    if (!rotatedKey) return;
    void navigator.clipboard?.writeText(rotatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1800);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure local gateway networking, API authentication, security protections, Native Messaging allowlists, privacy logging, and execution limits.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {notice && (
        <div className="rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-xs text-slate-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Network & Authentication */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Gateway & Authentication</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-host" className="block text-xs font-medium text-slate-300 mb-1">
                Bind Host (Loopback)
              </label>
              <input
                id="settings-host"
                type="text"
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="settings-port" className="block text-xs font-medium text-slate-300 mb-1">
                Gateway Port
              </label>
              <input
                id="settings-port"
                type="number"
                min={1024}
                max={65535}
                value={draft.port}
                onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 8787 })}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/70 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-200">Local API Key</div>
                <div className="text-xs font-mono text-slate-400">
                  Active key: {draft.apiKeyPrefix} · Rotated{' '}
                  {new Date(draft.apiKeyLastRotatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleRotateKey()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Rotate Key</span>
              </button>
            </div>

            {rotatedKey && (
              <div className="rounded-lg bg-emerald-950/30 border border-emerald-900/60 p-3 space-y-2">
                <div className="text-xs text-emerald-300 font-medium">
                  New Local API Key (shown once — save to your local .env or coding agent config):
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-emerald-100 break-all">{rotatedKey}</code>
                  <button
                    type="button"
                    onClick={copyNewKey}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-800 text-xs text-emerald-200 shrink-0"
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Security & Hardening */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-3.5">
          <h2 className="text-base font-semibold text-slate-100">Security Controls</h2>

          {[
            { key: 'apiAuthEnabled', label: 'Require Bearer / x-api-key authentication on all /v1 and /admin routes' },
            { key: 'loopbackOnly', label: 'Enforce loopback-only binding (127.0.0.1 / ::1)' },
            { key: 'dnsRebindingProtection', label: 'DNS rebinding protection (strict Host header validation)' },
            { key: 'originValidationEnabled', label: 'Origin header validation (block unauthorized web origins)' },
            { key: 'csrfProtectionEnabled', label: 'CSRF validation on state-changing routes' },
          ].map((item) => (
            <label key={item.key} className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(draft[item.key as keyof GatewaySettings])}
                onChange={(e) => setDraft({ ...draft, [item.key]: e.target.checked })}
                className="mt-0.5 rounded border-slate-600 bg-[#0B0F17] text-sky-500"
              />
              <span>{item.label}</span>
            </label>
          ))}

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label htmlFor="settings-rate-limit" className="block text-xs font-medium text-slate-300 mb-1">
                Rate Limit (req/min)
              </label>
              <input
                id="settings-rate-limit"
                type="number"
                min={5}
                max={1000}
                value={draft.rateLimitPerMinute}
                onChange={(e) =>
                  setDraft({ ...draft, rateLimitPerMinute: Number(e.target.value) || 60 })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="settings-body-limit" className="block text-xs font-medium text-slate-300 mb-1">
                Max Request Size (bytes)
              </label>
              <input
                id="settings-body-limit"
                type="number"
                min={65536}
                max={10485760}
                value={draft.maxRequestBodyBytes}
                onChange={(e) =>
                  setDraft({ ...draft, maxRequestBodyBytes: Number(e.target.value) || 2097152 })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>
        </section>

        {/* Native Messaging */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Native Messaging Bridge</h2>

          <div>
            <label htmlFor="settings-host-id" className="block text-xs font-medium text-slate-300 mb-1">
              Native Host Identifier
            </label>
            <input
              id="settings-host-id"
              type="text"
              value={draft.nativeHostId}
              onChange={(e) => setDraft({ ...draft, nativeHostId: e.target.value })}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="settings-ext-allowlist" className="block text-xs font-medium text-slate-300 mb-1">
              Allowed Chrome Extension IDs (comma-separated 32-char IDs)
            </label>
            <input
              id="settings-ext-allowlist"
              type="text"
              placeholder="e.g. abcdefghijklmnopqrstuvwxyzabcdef"
              value={extensionIdsText}
              onChange={(e) => setExtensionIdsText(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100"
            />
          </div>
        </section>

        {/* Logging, Retention, Concurrency & Timeouts */}
        <section className="rounded-xl bg-[#111723] border border-slate-800/90 p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Logging, Retention & Execution</h2>

          <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.logPromptsAndResponses}
              onChange={(e) => setDraft({ ...draft, logPromptsAndResponses: e.target.checked })}
              className="mt-0.5 rounded border-slate-600 bg-[#0B0F17] text-sky-500"
            />
            <span>
              Allow diagnostic prompt/response logging (OFF by default — database persists request metadata only)
            </span>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="settings-retention" className="block text-xs font-medium text-slate-300 mb-1">
                Retention (days)
              </label>
              <input
                id="settings-retention"
                type="number"
                min={1}
                max={365}
                value={draft.retentionDays}
                onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) || 14 })}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="settings-concurrency" className="block text-xs font-medium text-slate-300 mb-1">
                Max Concurrency
              </label>
              <input
                id="settings-concurrency"
                type="number"
                min={1}
                max={32}
                value={draft.maxConcurrency}
                onChange={(e) => setDraft({ ...draft, maxConcurrency: Number(e.target.value) || 4 })}
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="settings-timeout" className="block text-xs font-medium text-slate-300 mb-1">
                Timeout (ms)
              </label>
              <input
                id="settings-timeout"
                type="number"
                min={5000}
                max={300000}
                step={5000}
                value={draft.defaultTimeoutMs}
                onChange={(e) =>
                  setDraft({ ...draft, defaultTimeoutMs: Number(e.target.value) || 90000 })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-700 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}
