# WebSession2API

**Universal AI Web Session to Local API Gateway**

WebSession2API connects your authenticated AI web sessions (via a scoped Chrome Manifest V3 extension and Native Messaging bridge) and/or official provider API keys to a local loopback API gateway exposing standardized **OpenAI-compatible** (`http://127.0.0.1:8787/v1`) and **Anthropic-compatible** (`http://127.0.0.1:8787`) endpoints.

## Architecture (Five Independent Layers)

1. **AI Provider Websites**: DeepSeek Web (`chat.deepseek.com`), Z.ai / GLM (`chat.z.ai`), Kimi (`kimi.moonshot.cn`), Qwen Chat (`chat.qwen.ai`), Claude Web (`claude.ai`), ChatGPT (`chatgpt.com`), Google Gemini (`gemini.google.com`).
2. **Chrome MV3 Extension (`apps/extension`)**: Scoped `host_permissions` only for supported domains, visible DOM interaction drivers, session detection, user-controlled provider toggles, selector diagnostics. Never reads or exports cookies, passwords, or session tokens.
3. **Native Messaging Host (`apps/native-host`)**: Authenticated local stdio IPC (`com.websession2api.host`) using Chrome's 32-bit little-endian message framing, forwarding events to the loopback gateway.
4. **Local Node.js API Gateway (`apps/gateway`)**: Fastify + Zod + SQLite + Drizzle ORM + Pino bound strictly to `127.0.0.1:8787`, providing OpenAI/Anthropic protocol translation, capability enforcement, routing, queues, streaming SSE, cancellation, and encrypted official API storage.
5. **Coding Agents & Control Plane (`src/`, `apps/dashboard`)**: Developer SaaS dashboard + verified configuration generators for **Claude Code**, **Hermes Agent**, **OpenCode**, **Cline**, and **Roo Code**.

## Repository Structure

```text
websession2api/
├── apps/
│   ├── dashboard/          # Workspace wrapper for React/Vite control plane (src/)
│   ├── gateway/            # Standalone Fastify local API gateway (127.0.0.1:8787)
│   ├── extension/          # Buildable Manifest V3 Chrome Extension
│   └── native-host/        # Buildable Chrome Native Messaging Host
├── packages/
│   ├── shared-types/       # Common TypeScript contracts
│   ├── provider-sdk/       # ProviderAdapter interface, capability validator, selector diagnostics
│   ├── openai-compat/      # OpenAI /v1/models & /v1/chat/completions adapter
│   ├── anthropic-compat/   # Anthropic /v1/messages & count_tokens adapter
│   ├── security/           # API key hashing, loopback/DNS-rebinding/Origin/CSRF, AES-256-GCM vault
│   ├── database/           # SQLite + Drizzle ORM schema, migrations, repository
│   └── configuration/      # Defaults, model alias map, agent config generators
├── providers/
│   ├── base/               # Shared Browser Session + Official API base adapter
│   ├── deepseek/           # Priority adapter (chat.deepseek.com)
│   ├── zai/                # Priority adapter (chat.z.ai)
│   ├── kimi/               # kimi.moonshot.cn
│   ├── qwen/               # chat.qwen.ai
│   ├── claude/             # claude.ai
│   ├── chatgpt/            # chatgpt.com
│   └── gemini/             # gemini.google.com
├── scripts/
│   ├── windows/            # install.ps1, start.ps1, stop.ps1, uninstall.ps1, diagnostics.ps1
│   └── unix/               # install.sh, start.sh, stop.sh, uninstall.sh, diagnostics.sh
├── tests/                  # unit, protocol, security, extension, integration, e2e
├── docs/                   # INSTALLATION.md, SECURITY.md, PROTOCOLS.md
├── server.ts               # Full-stack Express + Vite server (port 3000)
└── src/                    # React + Tailwind developer dashboard
```

## Quick Start (Local Workstation After Export)

```bash
# 1. Install dependencies
npm install

# 2. Build dashboard, Chrome MV3 extension, and Native Messaging host
npm run build:all

# 3. Run automated tests
npm test

# 4. Load apps/extension/dist in Chrome (chrome://extensions -> Developer mode -> Load unpacked)
#    Copy the Extension ID shown in Chrome.

# 5. Register Native Messaging Host
#    Windows:
.\scripts\windows\install.ps1 -ExtensionId <YOUR_32_CHAR_EXTENSION_ID>
#    macOS / Linux:
./scripts/unix/install.sh <YOUR_32_CHAR_EXTENSION_ID>

# 6. Start the standalone local API gateway (127.0.0.1:8787)
npm run gateway

# 7. Start the control plane dashboard (http://127.0.0.1:3000)
npm run dev
```

See [docs/INSTALLATION.md](docs/INSTALLATION.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/PROTOCOLS.md](docs/PROTOCOLS.md) for detailed instructions.
