import type { NativeMessagingEnvelope, ProviderId } from '../../../../packages/shared-types/src/index';

declare const chrome: {
  runtime: {
    id: string;
    lastError?: { message?: string };
    connectNative: (hostName: string) => {
      postMessage: (msg: unknown) => void;
      onMessage: { addListener: (cb: (msg: NativeMessagingEnvelope) => void) => void };
      onDisconnect: { addListener: (cb: () => void) => void };
      disconnect: () => void;
    };
    onMessage: {
      addListener: (
        cb: (
          msg: Record<string, unknown>,
          sender: { tab?: { id?: number; title?: string; url?: string } },
          sendResponse: (res?: unknown) => void
        ) => boolean | void
      ) => void;
    };
  };
  storage: {
    local: {
      get: (keys: string[]) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
  tabs: {
    sendMessage: (tabId: number, msg: unknown) => Promise<unknown>;
    onRemoved: { addListener: (cb: (tabId: number) => void) => void };
  };
};

const NATIVE_HOST_NAME = 'com.websession2api.host';

interface RegisteredTab {
  providerId: ProviderId;
  tabId: number;
  title: string;
  url: string;
  sessionStatus: string;
  authStatus: string;
  visibleModelName: string | null;
  updatedAt: string;
}

let nativePort: ReturnType<typeof chrome.runtime.connectNative> | null = null;
let nativeConnected = false;
let reconnectDelayMs = 2000;
const providerTabs = new Map<ProviderId, RegisteredTab>();
let enabledProviders: Record<ProviderId, boolean> = {
  deepseek: true,
  zai: true,
  kimi: true,
  qwen: true,
  claude: true,
  chatgpt: true,
  gemini: true,
};

async function loadUserSettings() {
  const stored = await chrome.storage.local.get(['enabledProviders']);
  if (stored.enabledProviders && typeof stored.enabledProviders === 'object') {
    enabledProviders = { ...enabledProviders, ...(stored.enabledProviders as Record<ProviderId, boolean>) };
  }
}

function postToNative(
  type: NativeMessagingEnvelope['type'],
  payload: Record<string, unknown>,
  providerId?: ProviderId
) {
  if (!nativePort || !nativeConnected) return;
  const envelope: NativeMessagingEnvelope = {
    id: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    protocolVersion: '1.0',
    extensionId: chrome.runtime.id,
    providerId,
    timestamp: new Date().toISOString(),
    payload,
  };
  try {
    nativePort.postMessage(envelope);
  } catch {
    nativeConnected = false;
  }
}

function connectNativeHost() {
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativeConnected = true;
    reconnectDelayMs = 2000;

    postToNative('HELLO', { extensionId: chrome.runtime.id, version: '1.0.0' });

    nativePort.onMessage.addListener((msg) => {
      void handleNativeCommand(msg);
    });

    nativePort.onDisconnect.addListener(() => {
      nativeConnected = false;
      nativePort = null;
      const delay = reconnectDelayMs;
      reconnectDelayMs = Math.min(30_000, reconnectDelayMs * 2);
      setTimeout(connectNativeHost, delay);
    });
  } catch {
    nativeConnected = false;
    setTimeout(connectNativeHost, reconnectDelayMs);
  }
}

async function handleNativeCommand(msg: NativeMessagingEnvelope) {
  const providerId = msg.providerId;
  if (!providerId) return;

  if (!enabledProviders[providerId]) {
    postToNative(
      'REQUEST_ERROR',
      {
        requestId: msg.payload.requestId,
        code: 'PROVIDER_DISABLED',
        message: `Provider "${providerId}" is disabled by the user in Chrome Extension settings.`,
        httpStatus: 503,
      },
      providerId
    );
    return;
  }

  const tab = providerTabs.get(providerId);
  if (!tab) {
    postToNative(
      'REQUEST_ERROR',
      {
        requestId: msg.payload.requestId,
        code: 'PROVIDER_DISCONNECTED',
        message: `No active Chrome tab registered for ${providerId}. Open the provider website and sign in.`,
        httpStatus: 503,
      },
      providerId
    );
    return;
  }

  if (msg.type === 'SUBMIT_REQUEST') {
    await chrome.tabs.sendMessage(tab.tabId, {
      kind: 'SUBMIT_PROMPT',
      requestId: msg.payload.requestId,
      promptText: msg.payload.promptText,
      timeoutMs: msg.payload.timeoutMs,
    });
  } else if (msg.type === 'CANCEL_REQUEST') {
    await chrome.tabs.sendMessage(tab.tabId, {
      kind: 'CANCEL_PROMPT',
      requestId: msg.payload.requestId,
    });
  } else if (msg.type === 'RUN_DIAGNOSTICS') {
    const res = (await chrome.tabs.sendMessage(tab.tabId, { kind: 'PING_DIAGNOSTICS' })) as {
      ok?: boolean;
      report?: unknown;
    };
    if (res?.report) {
      postToNative('DIAGNOSTICS_RESULT', { report: res.report }, providerId);
    }
  }
}

chrome.tabs.onRemoved.addListener((closedTabId) => {
  for (const [providerId, info] of providerTabs.entries()) {
    if (info.tabId === closedTabId) {
      providerTabs.delete(providerId);
      postToNative(
        'SESSION_UPDATE',
        {
          sessionStatus: 'disconnected',
          authStatus: 'unknown',
          activeTabId: null,
          activeTabTitle: null,
          activeTabUrl: null,
          visibleModelName: null,
        },
        providerId
      );
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.kind === 'TAB_SESSION_STATUS' && sender.tab?.id) {
    const providerId = message.providerId as ProviderId;
    const payload = message.payload as Record<string, unknown>;
    const tabRecord: RegisteredTab = {
      providerId,
      tabId: sender.tab.id,
      title: String(payload.activeTabTitle || sender.tab.title || ''),
      url: String(payload.activeTabUrl || sender.tab.url || ''),
      sessionStatus: String(payload.sessionStatus || 'disconnected'),
      authStatus: String(payload.authStatus || 'unknown'),
      visibleModelName: typeof payload.visibleModelName === 'string' ? payload.visibleModelName : null,
      updatedAt: new Date().toISOString(),
    };
    providerTabs.set(providerId, tabRecord);

    if (enabledProviders[providerId]) {
      postToNative(
        'SESSION_UPDATE',
        {
          sessionStatus: tabRecord.sessionStatus,
          authStatus: tabRecord.authStatus,
          activeTabId: tabRecord.tabId,
          activeTabTitle: tabRecord.title,
          activeTabUrl: tabRecord.url,
          visibleModelName: tabRecord.visibleModelName,
        },
        providerId
      );
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.kind === 'PROMPT_STREAM_DELTA') {
    postToNative(
      'STREAM_DELTA',
      { requestId: message.requestId, deltaText: message.deltaText },
      message.providerId as ProviderId
    );
    return false;
  }

  if (message.kind === 'PROMPT_COMPLETE') {
    postToNative(
      'REQUEST_COMPLETE',
      {
        requestId: message.requestId,
        content: message.content,
        visibleModelName: message.visibleModelName,
      },
      message.providerId as ProviderId
    );
    return false;
  }

  if (message.kind === 'PROMPT_ERROR') {
    postToNative(
      'REQUEST_ERROR',
      {
        requestId: message.requestId,
        code: message.code,
        message: message.message,
      },
      message.providerId as ProviderId
    );
    return false;
  }

  if (message.kind === 'GET_POPUP_STATE') {
    sendResponse({
      nativeConnected,
      extensionId: chrome.runtime.id,
      enabledProviders,
      tabs: Array.from(providerTabs.values()),
    });
    return true;
  }

  if (message.kind === 'TOGGLE_PROVIDER') {
    const providerId = message.providerId as ProviderId;
    enabledProviders[providerId] = Boolean(message.enabled);
    void chrome.storage.local.set({ enabledProviders });
    sendResponse({ ok: true, enabledProviders });
    return true;
  }

  return false;
});

setInterval(() => {
  if (nativeConnected) {
    postToNative('HEARTBEAT', { activeTabs: providerTabs.size });
  }
}, 10_000);

void loadUserSettings().then(connectNativeHost);
