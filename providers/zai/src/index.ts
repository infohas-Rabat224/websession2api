import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const ZAI_SELECTORS: ProviderSelectorConfig = {
  authIndicator: '[data-testid="user-menu"], button[aria-label*="Profile"], [class*="user-avatar"], aside [class*="chat-history"]',
  loginPromptIndicator: 'button[data-testid="sign-in"], a[href*="/login"], form input[type="password"]',
  composerInput: 'textarea#chat-input, textarea[placeholder*="Ask"], div[contenteditable="true"][role="textbox"]',
  submitButton: 'button#send-message-button, button[type="submit"][aria-label*="Send"], button[data-testid="send-button"]',
  responseContainer: '[data-role="assistant"] .markdown-prose, .response-message-content, [class*="assistant-message"] .prose',
  streamingIndicator: 'button[aria-label*="Stop"], [data-testid="stop-button"], [class*="generating"]',
  stopButton: 'button[aria-label*="Stop"], button[data-testid="stop-button"]',
  modelBadge: '[data-testid="model-switcher"], button[aria-haspopup="listbox"], [class*="model-selector"]',
  errorBanner: '[role="alert"], [data-sonner-toast][data-type="error"], .toast-error',
  captchaIndicator: 'iframe[src*="captcha"], iframe[src*="challenge"], [id*="captcha"]',
};

export class ZaiProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'zai',
      name: 'Z.ai / GLM',
      shortName: 'Z.ai GLM',
      domain: 'chat.z.ai',
      url: 'https://chat.z.ai',
      driverVersion: '1.2.0-zai',
      verificationStatus: 'UNIT_TESTED',
      selectors: ZAI_SELECTORS,
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
          'Priority provider adapter for chat.z.ai (GLM). Supports visible composer interaction, markdown response extraction, stop-button cancellation, and visible model switcher detection. Native structured tool calling requires Official API Mode.',
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
        notes: 'Official Z.ai / Zhipu GLM API supports native function calling and structured JSON output.',
      },
    });
  }
}
