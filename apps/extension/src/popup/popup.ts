declare const chrome: {
  runtime: {
    sendMessage: (msg: unknown) => Promise<{
      nativeConnected: boolean;
      extensionId: string;
      enabledProviders: Record<string, boolean>;
      tabs: Array<{ providerId: string; sessionStatus: string; visibleModelName: string | null }>;
    }>;
  };
};

const PROVIDERS = ['deepseek', 'zai', 'kimi', 'qwen', 'claude', 'chatgpt', 'gemini'];

async function renderPopup() {
  const statusEl = document.getElementById('bridge-status');
  const listEl = document.getElementById('provider-list');
  const extIdEl = document.getElementById('ext-id');
  if (!statusEl || !listEl || !extIdEl) return;

  const state = await chrome.runtime.sendMessage({ kind: 'GET_POPUP_STATE' });
  extIdEl.textContent = state.extensionId || 'unknown';
  statusEl.textContent = state.nativeConnected
    ? 'Native Messaging Host: Connected (127.0.0.1:8787)'
    : 'Native Messaging Host: Disconnected — verify local host registration';

  listEl.textContent = '';
  for (const id of PROVIDERS) {
    const tab = state.tabs.find((t) => t.providerId === id);
    const row = document.createElement('div');
    row.className = 'row';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = id.toUpperCase();
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = tab ? `${tab.sessionStatus}${tab.visibleModelName ? ` · ${tab.visibleModelName}` : ''}` : 'No open tab';
    left.appendChild(title);
    left.appendChild(meta);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = Boolean(state.enabledProviders[id]);
    toggle.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({
        kind: 'TOGGLE_PROVIDER',
        providerId: id,
        enabled: toggle.checked,
      });
    });

    row.appendChild(left);
    row.appendChild(toggle);
    listEl.appendChild(row);
  }
}

void renderPopup();
