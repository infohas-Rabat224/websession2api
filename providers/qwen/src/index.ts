import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const QWEN_SELECTORS: ProviderSelectorConfig = {
  authIndicator: '[data-testid="user-avatar"], button[aria-label*="Account"], [class*="sidebar-history"]',
  loginPromptIndicator: 'button[data-testid="login-btn"], a[href*="/auth"], input[type="password"]',
  composerInput: 'textarea#chat-input, textarea[placeholder*="Qwen"], div[contenteditable="true"][role="textbox"]',
  submitButton: 'button#send-message-button, button[type="submit"][aria-label*="Send"]',
  responseContainer: '[class*="response-message"] .markdown-prose, [data-role="assistant"] .prose',
  streamingIndicator: 'button[aria-label*="Stop"], [class*="stop-generating"]',
  stopButton: 'button[aria-label*="Stop"], button[data-testid="stop-button"]',
  modelBadge: '[data-testid="model-selector"], button[aria-label*="Model"]',
  errorBanner: '[role="alert"], .ant-message-error, [class*="error-banner"]',
  captchaIndicator: 'iframe[src*="captcha"], #nc_1_n1z, [class*="captcha"]',
};

export class QwenProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'qwen',
      name: 'Qwen Chat',
      shortName: 'Qwen',
      domain: 'chat.qwen.ai',
      url: 'https://chat.qwen.ai',
      driverVersion: '1.0.0-qwen',
      verificationStatus: 'UNIT_TESTED',
      selectors: QWEN_SELECTORS,
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
          'Independent Qwen Chat adapter targeting chat.qwen.ai. Automated adapter regression tested; awaiting live workstation verification.',
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
        notes: 'Official Alibaba DashScope OpenAI-compatible mode supports native tools and JSON mode.',
      },
    });
  }
}
