import type {
  AuthenticationStatus,
  ProviderId,
  SelectorDiagnosticResult,
  SelectorHealthReport,
  SessionStatus,
} from '../../../../packages/shared-types/src/index';
import type { ProviderSelectorConfig } from '../../../../packages/provider-sdk/src/index';

export interface ExtensionProviderDriver {
  readonly providerId: ProviderId;
  readonly domain: string;
  readonly driverVersion: string;
  readonly selectors: ProviderSelectorConfig;
  detectSessionState(): {
    sessionStatus: SessionStatus;
    authStatus: AuthenticationStatus;
    visibleModelName: string | null;
    errorBannerText: string | null;
  };
  runSelectorDiagnostics(): SelectorHealthReport;
  submitPrompt(
    requestId: string,
    promptText: string,
    options: {
      timeoutMs: number;
      onDelta: (delta: string) => void;
    }
  ): Promise<{ content: string; visibleModelName: string | null }>;
  cancelActiveGeneration(): boolean;
}

function isVisibleElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export class DomProviderDriver implements ExtensionProviderDriver {
  readonly providerId: ProviderId;
  readonly domain: string;
  readonly driverVersion: string;
  readonly selectors: ProviderSelectorConfig;
  private activeCancelFn: (() => void) | null = null;

  constructor(config: {
    providerId: ProviderId;
    domain: string;
    driverVersion: string;
    selectors: ProviderSelectorConfig;
  }) {
    this.providerId = config.providerId;
    this.domain = config.domain;
    this.driverVersion = config.driverVersion;
    this.selectors = config.selectors;
  }

  detectSessionState() {
    const captchaEl = document.querySelector(this.selectors.captchaIndicator);
    if (captchaEl && isVisibleElement(captchaEl)) {
      return {
        sessionStatus: 'captcha_required' as SessionStatus,
        authStatus: 'unknown' as AuthenticationStatus,
        visibleModelName: null,
        errorBannerText: 'Provider challenge/CAPTCHA visible; user intervention required.',
      };
    }

    const loginEl = document.querySelector(this.selectors.loginPromptIndicator);
    const composerEl = document.querySelector(this.selectors.composerInput);
    const authEl = document.querySelector(this.selectors.authIndicator);
    const errorEl = document.querySelector(this.selectors.errorBanner);
    const modelEl = document.querySelector(this.selectors.modelBadge);

    const visibleModelName = modelEl?.textContent?.trim() || null;
    const errorBannerText = errorEl && isVisibleElement(errorEl) ? errorEl.textContent?.trim() || null : null;

    if (loginEl && isVisibleElement(loginEl) && (!composerEl || !isVisibleElement(composerEl))) {
      return {
        sessionStatus: 'expired' as SessionStatus,
        authStatus: 'unauthenticated' as AuthenticationStatus,
        visibleModelName,
        errorBannerText,
      };
    }

    if (composerEl && isVisibleElement(composerEl)) {
      return {
        sessionStatus: 'connected' as SessionStatus,
        authStatus: authEl ? ('authenticated' as AuthenticationStatus) : ('authenticated' as AuthenticationStatus),
        visibleModelName,
        errorBannerText,
      };
    }

    return {
      sessionStatus: 'disconnected' as SessionStatus,
      authStatus: 'unknown' as AuthenticationStatus,
      visibleModelName,
      errorBannerText,
    };
  }

  runSelectorDiagnostics(): SelectorHealthReport {
    const keys = Object.keys(this.selectors) as (keyof ProviderSelectorConfig)[];
    const results: SelectorDiagnosticResult[] = keys.map((key) => {
      const cssSelector = this.selectors[key];
      let nodes: NodeListOf<Element> | null = null;
      let warning: string | undefined;
      try {
        nodes = document.querySelectorAll(cssSelector);
      } catch {
        warning = 'Selector syntax not supported in current browser engine.';
      }
      const count = nodes?.length ?? 0;
      const visible = nodes ? Array.from(nodes).some((n) => isVisibleElement(n)) : false;
      if (
        count === 0 &&
        (key === 'composerInput' || key === 'submitButton' || key === 'responseContainer')
      ) {
        warning = 'Critical interactive selector did not match any DOM element on active tab.';
      }
      return {
        selectorKey: key,
        cssSelector,
        matched: count > 0,
        elementCount: count,
        visible,
        warning,
      };
    });

    const criticalMissing = results.some(
      (r) =>
        (r.selectorKey === 'composerInput' || r.selectorKey === 'submitButton') &&
        !r.matched
    );

    return {
      checkedAt: new Date().toISOString(),
      driverVersion: this.driverVersion,
      healthy: !criticalMissing,
      uiDriftDetected: criticalMissing,
      results,
      summary: criticalMissing
        ? `UI drift detected on ${this.domain}: critical input/submit selectors did not match.`
        : `Selectors verified on live ${this.domain} tab.`,
    };
  }

  async submitPrompt(
    _requestId: string,
    promptText: string,
    options: { timeoutMs: number; onDelta: (delta: string) => void }
  ): Promise<{ content: string; visibleModelName: string | null }> {
    const state = this.detectSessionState();
    if (state.sessionStatus === 'captcha_required') {
      throw new Error('CAPTCHA_REQUIRED: Solve the visible challenge directly in Chrome.');
    }
    if (state.sessionStatus !== 'connected') {
      throw new Error('SESSION_EXPIRED: Provider tab is not authenticated or composer is unavailable.');
    }

    const composer = document.querySelector(this.selectors.composerInput) as HTMLElement | null;
    if (!composer || !isVisibleElement(composer)) {
      throw new Error('UI_SELECTOR_CHANGED: Composer input element not found.');
    }

    const existingResponses = document.querySelectorAll(this.selectors.responseContainer).length;

    // Authorized visible UI input insertion
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(composer),
        'value'
      )?.set;
      if (setter) {
        setter.call(composer, promptText);
      } else {
        composer.value = promptText;
      }
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (composer.isContentEditable) {
      composer.textContent = promptText;
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText }));
    }

    await new Promise((r) => setTimeout(r, 80));

    const submitBtn = document.querySelector(this.selectors.submitButton) as HTMLElement | null;
    if (submitBtn && isVisibleElement(submitBtn)) {
      submitBtn.click();
    } else {
      composer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
      );
    }

    return new Promise((resolve, reject) => {
      let lastText = '';
      let stableTicks = 0;
      let finished = false;

      const cleanup = () => {
        finished = true;
        clearInterval(poller);
        clearTimeout(timeoutTimer);
        this.activeCancelFn = null;
      };

      this.activeCancelFn = () => {
        if (finished) return;
        const stopBtn = document.querySelector(this.selectors.stopButton) as HTMLElement | null;
        if (stopBtn && isVisibleElement(stopBtn)) {
          stopBtn.click();
        }
        cleanup();
        reject(new Error('CANCELLED: Generation cancelled in browser tab.'));
      };

      const timeoutTimer = setTimeout(() => {
        if (finished) return;
        cleanup();
        reject(new Error(`TIMEOUT: No completed response received within ${options.timeoutMs}ms.`));
      }, options.timeoutMs);

      const poller = setInterval(() => {
        if (finished) return;

        const errEl = document.querySelector(this.selectors.errorBanner);
        if (errEl && isVisibleElement(errEl) && errEl.textContent?.trim()) {
          cleanup();
          reject(new Error(`UPSTREAM_ERROR: ${errEl.textContent.trim()}`));
          return;
        }

        const responses = document.querySelectorAll(this.selectors.responseContainer);
        if (responses.length <= existingResponses) {
          return;
        }

        const latest = responses[responses.length - 1];
        const currentText = latest?.textContent?.trim() || '';
        if (currentText.length > lastText.length) {
          const delta = currentText.slice(lastText.length);
          lastText = currentText;
          stableTicks = 0;
          options.onDelta(delta);
        } else if (currentText.length > 0) {
          const streamingEl = document.querySelector(this.selectors.streamingIndicator);
          const stillStreaming = streamingEl && isVisibleElement(streamingEl);
          if (!stillStreaming) {
            stableTicks += 1;
            if (stableTicks >= 4) {
              cleanup();
              const modelEl = document.querySelector(this.selectors.modelBadge);
              resolve({
                content: lastText,
                visibleModelName: modelEl?.textContent?.trim() || null,
              });
            }
          }
        }
      }, 250);
    });
  }

  cancelActiveGeneration(): boolean {
    if (this.activeCancelFn) {
      this.activeCancelFn();
      return true;
    }
    const stopBtn = document.querySelector(this.selectors.stopButton) as HTMLElement | null;
    if (stopBtn && isVisibleElement(stopBtn)) {
      stopBtn.click();
      return true;
    }
    return false;
  }
}
