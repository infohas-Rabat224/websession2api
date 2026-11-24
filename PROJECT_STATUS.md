# WebSession2API — Project Status

## Provider Verification Matrix

Providers are never marked `LIVE_VERIFIED` without real authenticated workstation browser testing.

| Provider | Domain | Alias | Prefixed Alias | Driver Version | Verification Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek Web | `chat.deepseek.com` | `deepseek-web` | `websession/deepseek` | `1.2.0-deepseek` | `UNIT_TESTED` | Priority adapter; full DOM selectors, streaming, cancel, diagnostics, and Official API Mode implemented & unit/integration tested via mock bridge. |
| Z.ai / GLM | `chat.z.ai` | `glm-web` | `websession/glm` | `1.2.0-zai` | `UNIT_TESTED` | Priority adapter; full DOM selectors, streaming, cancel, diagnostics, and Official API Mode implemented & unit tested. |
| Kimi | `kimi.moonshot.cn` | `kimi-web` | `websession/kimi` | `1.0.0-kimi` | `IMPLEMENTED` | Independent adapter & lexical editor driver implemented; awaiting live local Chrome verification. |
| Qwen Chat | `chat.qwen.ai` | `qwen-web` | `websession/qwen` | `1.0.0-qwen` | `IMPLEMENTED` | Independent adapter & content driver implemented; awaiting live local Chrome verification. |
| Claude Web | `claude.ai` | `claude-web` | `websession/claude` | `1.0.0-claude` | `IMPLEMENTED` | Independent ProseMirror adapter implemented with CAPTCHA detection and Official Anthropic API support; awaiting live local Chrome verification. |
| ChatGPT | `chatgpt.com` | `chatgpt-web` | `websession/chatgpt` | `1.0.0-chatgpt` | `IMPLEMENTED` | Independent adapter implemented with accessible `data-testid` selectors; awaiting live local Chrome verification. |
| Google Gemini | `gemini.google.com` | `gemini-web` | `websession/gemini` | `1.0.0-gemini` | `IMPLEMENTED` | Independent rich-textarea adapter implemented; Official API Mode supported; awaiting live local Chrome verification. |

## Component Build & Runtime Status

- **Dashboard (`src/`, `server.ts`)**: Implemented, compiled, and browser-verified in headless Chromium.
- **Standalone Local Gateway (`apps/gateway`)**: Implemented with Fastify, Zod, SQLite + Drizzle ORM, Pino, loopback & DNS rebinding guards; verified via automated integration tests.
- **Chrome MV3 Extension (`apps/extension`)**: Implemented and built with `esbuild` to `apps/extension/dist/`; requires local Chrome workstation to load unpacked.
- **Native Messaging Host (`apps/native-host`)**: Implemented and built with `esbuild` to `apps/native-host/dist/`; framing verified by unit tests; OS registration requires local workstation execution.
- **Coding Agent Configs**: Generated for Claude Code, Hermes Agent, OpenCode, Cline, and Roo Code with accurate tool-calling capability disclosures.
