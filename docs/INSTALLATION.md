# Local Installation & Export Guide

## Prerequisites

- Node.js 20+ (Node 22 recommended)
- Google Chrome (Desktop)
- Windows PowerShell 5.1+/7+, macOS Terminal, or Linux bash

## Step 1: Export Repository

Export the WebSession2API project from Google AI Studio (Download ZIP or sync to GitHub) and extract it to a local directory, e.g. `~/websession2api` or `C:\dev\websession2api`.

## Step 2: Configure Local Environment

Copy `.env.example` to `.env` and set strong local values:

```bash
cp .env.example .env
```

Set at minimum:
- `WEBSESSION2API_API_KEY` — a strong random local key (e.g. `ws2a_...`) used by coding agents and the Native Messaging host.
- `WEBSESSION2API_MASTER_KEY` — a 32+ character secret used to encrypt any Official API keys stored in SQLite.

## Step 3: Install Dependencies & Build All Components

```bash
npm install
npm run build:all
```

This builds:
- Dashboard frontend (`dist/`)
- Chrome MV3 Extension (`apps/extension/dist/`)
- Native Messaging Host (`apps/native-host/dist/host.js`)

## Step 4: Load the Chrome MV3 Extension

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `apps/extension/dist`.
4. Copy the 32-character **Extension ID** shown on the extension card.

## Step 5: Register the Native Messaging Host

### Windows (PowerShell)
```powershell
.\scripts\windows\install.ps1 -ExtensionId <YOUR_EXTENSION_ID>
```

### macOS / Linux
```bash
chmod +x scripts/unix/*.sh
./scripts/unix/install.sh <YOUR_EXTENSION_ID>
```

## Step 6: Start the Local Gateway & Dashboard

### Start Standalone Local API Gateway (`127.0.0.1:8787`)
- Windows: `.\scripts\windows\start.ps1`
- macOS / Linux: `./scripts/unix/start.sh`
- Direct CLI: `npm run gateway`

### Open the Developer Control Plane (`http://127.0.0.1:3000`)
```bash
WEBSESSION2API_LOCAL=1 npm run dev
```

## Step 7: Connect Provider Sessions & Configure Coding Agents

1. Log into your desired AI provider websites in Chrome (e.g. `https://chat.deepseek.com`, `https://chat.z.ai`).
2. Click the WebSession2API Chrome extension icon to confirm Native Messaging connection and enable/disable individual providers.
3. Open **Agents** in the dashboard to copy or download verified configurations for Claude Code, Hermes Agent, OpenCode, Cline, or Roo Code.

## Uninstall

- Windows: `.\scripts\windows\uninstall.ps1`
- macOS / Linux: `./scripts/unix/uninstall.sh`
