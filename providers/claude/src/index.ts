import { BaseProviderAdapter } from '../../base/src/index';
import type { ProviderSelectorConfig } from '../../../packages/provider-sdk/src/index';

export const CLAUDE_SELECTORS: ProviderSelectorConfig = {
  authIndicator: '[data-testid="user-menu-button"], button[aria-label*="Account"], nav a[href*="/chats"]',
  loginPromptIndicator: 'input[type="email"][name="email"], button[data-testid="login-button"]',
  composerInput: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"][aria-label*="Claude"]',
  submitButton: 'button[aria-label="Send Message"], button[aria-label="Send message"], button[data-testid="send-button"]',
  responseContainer: '[data-is-streaming], .font-claude-message, [data-testid="assistant-turn"]',
  streamingIndicator: '[data-is-streaming="true"], button[aria-label="Stop Response"]',
  stopButton: 'button[aria-label="Stop Response"], button[aria-label="Stop response"]',
  modelBadge: 'button[data-testid="model-selector-dropdown"], [data-testid="model-picker"]',
  errorBanner: '[role="alert"], [data-testid="error-toast"]',
  captchaIndicator: 'iframe[src*="turnstile"], iframe[src*="cloudflare"], #challenge-running',
};

export class ClaudeProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super({
      id: 'claude',
      name: 'Claude Web',
      shortName: 'Claude',
      domain: 'claude.ai',
      url: 'https://claude.ai',
      driverVersion: '1.0.0-claude',
      verificationStatus: 'UNIT_TESTED',
      selectors: CLAUDE_SELECTORS,
      officialWireFormat: 'anthropic',
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
          'Independent Claude Web ProseMirror adapter for claude.ai. Does not bypass Cloudflare challenges; reports CAPTCHA_REQUIRED if challenge is present. Native Anthropic tool_use requires Official API Mode.',
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
        jsonMode: false,
        notes: 'Official Anthropic Messages API (api.anthropic.com) supports native tool_use, tool_result, vision, and count_tokens.',
      },
    });
  }
}
