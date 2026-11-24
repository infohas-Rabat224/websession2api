import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const CHATGPT_SELECTORS: ProviderSelectorConfig = {
  authIndicator: 'button[data-testid="profile-button"], nav[aria-label="Chat history"], [data-testid="accounts-profile-button"]',
  loginPromptIndicator: 'button[data-testid="login-button"], a[href*="/auth/login"]',
  composerInput: 'div#prompt-textarea[contenteditable="true"], textarea#prompt-textarea',
  submitButton: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
  responseContainer: '[data-message-author-role="assistant"] .markdown, article[data-testid^="conversation-turn"] .markdown',
  streamingIndicator: 'button[data-testid="stop-button"], [data-testid="streaming-indicator"]',
  stopButton: 'button[data-testid="stop-button"], button[aria-label="Stop streaming"]',
  modelBadge: 'button[data-testid="model-switcher-dropdown-button"]',
  errorBanner: '[role="alert"], [data-testid="error-message"]',
  captchaIndicator: 'iframe[src*="arkoselabs"], iframe[src*="turnstile"], #challenge-form',
};

export class ChatGptProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'chatgpt',
      name: 'ChatGPT',
      shortName: 'ChatGPT',
      domain: 'chatgpt.com',
      url: 'https://chatgpt.com',
      driverVersion: '1.0.0-chatgpt',
      verificationStatus: 'UNIT_TESTED',
      selectors: CHATGPT_SELECTORS,
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
          'Independent ChatGPT Web adapter targeting chatgpt.com via accessible data-testid selectors. Text-only in Browser Session Mode; Official API Mode enables native function calling.',
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
        tokenCounting: false,
        jsonMode: true,
        notes: 'Official OpenAI API (api.openai.com) supports native tool calling, vision, and JSON mode.',
      },
    });
  }
}
