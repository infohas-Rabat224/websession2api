# WebSession2API — Implementation Checklist

- [x] **Milestone 1**: Monorepo structure initialized, metadata & HTML synced, dark developer SaaS dashboard foundation built with 9 navigation views.
- [x] **Milestone 2**: Shared TypeScript contracts (`packages/shared-types`), Drizzle ORM + SQLite schema with all 9 required tables (`providers`, `provider_sessions`, `models`, `model_aliases`, `requests`, `routing_rules`, `agent_profiles`, `settings`, `diagnostics`) and safe WAL migrations.
- [x] **Milestone 3**: Local Fastify API gateway (`127.0.0.1:8787`), timing-safe API key authentication, loopback/Host/Origin/CSRF protection, sliding-window rate limiter, request size limits, AES-256-GCM SecretVault, credential redaction.
- [x] **Milestone 4**: OpenAI-compatible protocol (`GET /v1/models`, `POST /v1/chat/completions`), strict Zod validation, explicit rejection of unsupported parameters (`n`, `logprobs`, `audio`, unknown keys), SSE streaming & client cancellation.
- [x] **Milestone 5**: Anthropic-compatible protocol (`POST /v1/messages`, `POST /v1/messages/count_tokens`), system prompt normalization, explicit rejection of unsupported `thinking` & text-only tool schemas, Anthropic SSE event framing.
- [x] **Milestone 6**: Buildable Manifest V3 Chrome Extension (`apps/extension`) with restricted 7-domain `host_permissions`, zero cookie access, background service worker with Native Messaging & reconnect backoff, popup, options page, and all 7 provider drivers.
- [x] **Milestone 7**: Buildable Native Messaging Host (`apps/native-host`) with 32-bit LE stdio framing, extension ID allowlist verification, loopback gateway relay, and manifest template.
- [x] **Milestone 8**: DeepSeek Web priority adapter (`providers/deepseek` + `apps/extension/src/drivers/deepseek.ts`) with selector diagnostics, Official API Mode, and automated tests.
- [x] **Milestone 9**: Z.ai / GLM priority adapter (`providers/zai` + `apps/extension/src/drivers/zai.ts`) with selector diagnostics, Official API Mode, and automated tests.
- [x] **Milestone 10**: Independent Kimi and Qwen Chat adapters and extension drivers (accurately marked `IMPLEMENTED`, pending live workstation verification).
- [x] **Milestone 11**: Independent Claude Web, ChatGPT, and Google Gemini adapters and extension drivers (accurately marked `IMPLEMENTED`, pending live workstation verification).
- [x] **Milestone 12**: Dashboard wired end-to-end to real SQLite-backed backend APIs with strict Production Mode vs Development Simulation Mode isolation.
- [x] **Milestone 13**: Model registry (`deepseek-web`, `glm-web`, `websession/*`, etc.) and configurable Routing Engine (default provider, priority order, task preferences, fallback, concurrency queue, strict conversation pinning).
- [x] **Milestone 14**: Verified configuration generators, downloads, and contract tests for Claude Code, Hermes Agent, OpenCode, Cline, and Roo Code.
- [x] **Milestone 15**: Vitest + `node:test` test suites, Windows PowerShell + Linux/macOS install/start/stop/uninstall/diagnostics scripts, security hardening, and documentation.
