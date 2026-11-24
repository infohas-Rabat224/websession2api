import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const KIMI_SELECTORS: ProviderSelectorConfig = {
  authIndicator: '[class*="user-info"], [data-testid="user-avatar"], aside [class*="history"]',
  loginPromptIndicator: 'button[class*="login"], input[type="tel"], form[action*="login"]',
  composerInput: 'div[contenteditable="true"][data-lexical-editor="true"], textarea[placeholder*="Kimi"]',
  submitButton: 'button[data-testid="send-btn"], button[aria-label*="Send"], div[class*="send-button"]',
  responseContainer: '[class*="segment-content-box"], [class*="markdown-body"], [data-testid="assistant-message"]',
  streamingIndicator: 'button[class*="stop"], [class*="generating-indicator"]',
  stopButton: 'button[class*="stop"], button[aria-label*="Stop"]',
  modelBadge: '[class*="model-switch"], [data-testid="model-name"]',
  errorBanner: '[role="alert"], [class*="toast-error"]',
  captchaIndicator: 'iframe[src*="captcha"], [class*="verify-modal"]',
};

export class KimiProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'kimi',
      name: 'Kimi',
      shortName: 'Kimi',
      domain: 'kimi.moonshot.cn',
      url: 'https://kimi.moonshot.cn',
      driverVersion: '1.0.0-kimi',
      verificationStatus: 'UNIT_TESTED',
      selectors: KIMI_SELECTORS,
      officialWireFormat: 'openai',
      browserCapabilities: {
        streaming: true,
        systemInstructions: true,
        multiTurnHistory: true,
        toolCallingMode: 'text_only',
        nativeToolCalling: false,
        toolResults: false,
        fileAttachments: false,
        multimodalImages: false,
        cancellation: true,
        tokenCounting: false,
        jsonMode: false,
        notes:
          'Independent Kimi browser adapter implemented with lexical editor input selectors. Automated adapter regression tested; requires live local browser verification on kimi.moonshot.cn.',
      },
      officialApiCapabilities: {
        streaming: true,
        systemInstructions: true,
        multiTurnHistory: true,
        toolCallingMode: 'native_provider',
        nativeToolCalling: true,
        toolResults: true,
        fileAttachments: false,
        multimodalImages: false,
        cancellation: true,
        tokenCounting: false,
        jsonMode: true,
        notes: 'Official Moonshot Kimi OpenAI-compatible API supports native tool calling.',
      },
    });
  }
}
