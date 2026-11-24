import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const DEEPSEEK_SELECTORS: ProviderSelectorConfig = {
  authIndicator: '[data-testid="user-avatar"], [class*="avatar"], button[aria-label*="Account"], nav [href*="/a/chat"]',
  loginPromptIndicator: 'input[type="password"], button[data-testid="login-button"], form[action*="login"]',
  composerInput: 'textarea#chat-input, textarea[placeholder*="DeepSeek"], textarea[placeholder*="Message"]',
  submitButton: 'div[role="button"][aria-disabled="false"]:has(svg), button[aria-label*="Send"], button[type="submit"]',
  responseContainer: '.ds-markdown, [class*="ds-markdown"], [data-testid="assistant-message"]',
  streamingIndicator: '[data-testid="stop-generating"], button[aria-label*="Stop"], .ds-loading',
  stopButton: 'button[aria-label*="Stop"], div[role="button"][aria-label*="Stop"]',
  modelBadge: '[data-testid="model-selector"], button[aria-label*="DeepThink"], [class*="model-tag"]',
  errorBanner: '[role="alert"], .ds-toast-error, [class*="error-message"]',
  captchaIndicator: 'iframe[src*="captcha"], iframe[src*="turnstile"], [class*="captcha"]',
};

export class DeepSeekProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'deepseek',
      name: 'DeepSeek Web',
      shortName: 'DeepSeek',
      domain: 'chat.deepseek.com',
      url: 'https://chat.deepseek.com',
      driverVersion: '1.2.0-deepseek',
      verificationStatus: 'UNIT_TESTED',
      selectors: DEEPSEEK_SELECTORS,
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
          'Priority provider adapter. Browser session supports visible composer input, streaming DOM extraction, stop-button cancellation, and DeepThink/Chat visible model detection. Native structured tool calling requires Official API Mode.',
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
        notes: 'Official DeepSeek API (api.deepseek.com) supports OpenAI-compatible native function calling and JSON mode.',
      },
    });
  }
}
