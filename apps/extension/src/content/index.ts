import type { ExtensionProviderDriver } from '../drivers/base-driver';
import { createDeepSeekDriver } from '../drivers/deepseek';
import { createZaiDriver } from '../drivers/zai';
import { createKimiDriver } from '../drivers/kimi';
import { createQwenDriver } from '../drivers/qwen';
import { createClaudeDriver } from '../drivers/claude';
import { createChatGptDriver } from '../drivers/chatgpt';
import { createGeminiDriver } from '../drivers/gemini';

declare const chrome: {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (
        cb: (
          message: Record<string, unknown>,
          sender: unknown,
          sendResponse: (res?: unknown) => void
        ) => boolean | void
      ) => void;
    };
  };
};

function selectDriverForHost(hostname: string): ExtensionProviderDriver | null {
  if (hostname === 'chat.deepseek.com') return createDeepSeekDriver();
  if (hostname === 'chat.z.ai') return createZaiDriver();
  if (hostname === 'kimi.moonshot.cn') return createKimiDriver();
  if (hostname === 'chat.qwen.ai') return createQwenDriver();
  if (hostname === 'claude.ai') return createClaudeDriver();
  if (hostname === 'chatgpt.com') return createChatGptDriver();
  if (hostname === 'gemini.google.com') return createGeminiDriver();
  return null;
}

const driver = selectDriverForHost(window.location.hostname);

if (driver) {
  const reportSession = () => {
    const state = driver.detectSessionState();
    chrome.runtime
      .sendMessage({
        kind: 'TAB_SESSION_STATUS',
        providerId: driver.providerId,
        payload: {
          ...state,
          activeTabTitle: document.title,
          activeTabUrl: window.location.href,
        },
      })
      .catch(() => {});
  };

  reportSession();
  setInterval(reportSession, 8000);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.kind === 'PING_DIAGNOSTICS') {
      sendResponse({ ok: true, report: driver.runSelectorDiagnostics() });
      return true;
    }

    if (message.kind === 'CANCEL_PROMPT') {
      const cancelled = driver.cancelActiveGeneration();
      sendResponse({ ok: cancelled });
      return true;
    }

    if (message.kind === 'SUBMIT_PROMPT') {
      const requestId = String(message.requestId || '');
      const promptText = String(message.promptText || '');
      const timeoutMs = Number(message.timeoutMs || 90000);

      driver
        .submitPrompt(requestId, promptText, {
          timeoutMs,
          onDelta: (deltaText) => {
            chrome.runtime
              .sendMessage({
                kind: 'PROMPT_STREAM_DELTA',
                providerId: driver.providerId,
                requestId,
                deltaText,
              })
              .catch(() => {});
          },
        })
        .then((result) => {
          chrome.runtime
            .sendMessage({
              kind: 'PROMPT_COMPLETE',
              providerId: driver.providerId,
              requestId,
              content: result.content,
              visibleModelName: result.visibleModelName,
            })
            .catch(() => {});
          sendResponse({ ok: true });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Prompt execution failed';
          const code = msg.startsWith('CAPTCHA_REQUIRED')
            ? 'CAPTCHA_REQUIRED'
            : msg.startsWith('SESSION_EXPIRED')
              ? 'SESSION_EXPIRED'
              : msg.startsWith('UI_SELECTOR_CHANGED')
                ? 'UI_SELECTOR_CHANGED'
                : msg.startsWith('CANCELLED')
                  ? 'CANCELLED'
                  : msg.startsWith('TIMEOUT')
                    ? 'TIMEOUT'
                    : 'UPSTREAM_ERROR';
          chrome.runtime
            .sendMessage({
              kind: 'PROMPT_ERROR',
              providerId: driver.providerId,
              requestId,
              code,
              message: msg,
            })
            .catch(() => {});
          sendResponse({ ok: false, error: msg });
        });

      return true;
    }

    return false;
  });
}
