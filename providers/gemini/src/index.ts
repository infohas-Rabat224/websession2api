import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const GEMINI_SELECTORS: ProviderSelectorConfig = {
  authIndicator: 'a[aria-label*="Google Account"], button[aria-label*="Google Account"], bard-sidenav-container',
  loginPromptIndicator: 'a[href*="accounts.google.com/ServiceLogin"], button[aria-label*="Sign in"]',
  composerInput: 'div.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]',
  submitButton: 'button.send-button, button[aria-label="Send message"]',
  responseContainer: 'model-response .markdown, message-content .markdown-main-panel',
  streamingIndicator: 'button[aria-label="Stop response"], mat-progress-bar',
  stopButton: 'button[aria-label="Stop response"], button.stop-button',
  modelBadge: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"]',
  errorBanner: '[role="alert"], snack-bar-container, .error-message',
  captchaIndicator: 'iframe[src*="recaptcha"], #captcha-form',
};

export class GeminiProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'gemini',
      name: 'Google Gemini',
      shortName: 'Gemini',
      domain: 'gemini.google.com',
      url: 'https://gemini.google.com',
      driverVersion: '1.0.0-gemini',
      verificationStatus: 'UNIT_TESTED',
      selectors: GEMINI_SELECTORS,
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
          'Independent Google Gemini Web adapter for gemini.google.com using accessible rich-textarea and model-response selectors. Official API Mode connects via Gemini OpenAI-compatible endpoint.',
      },
      officialApiCapabilities: {
        streaming: true,
        systemInstructions: true,
        multiTurnHistory: true,
        toolCallingMode: 'native_provider',
        nativeToolCalling: true,
        toolResults: true,
        fileAttachments: false,
        multimodalImages: true,
        cancellation: true,
        tokenCounting: true,
        jsonMode: true,
        notes: 'Official Gemini API supports native tool calling, vision, and JSON responses.',
      },
    });
  }
}
