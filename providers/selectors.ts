import type { ProviderSelectorConfig } from '../packages/provider-sdk/src/index';

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
