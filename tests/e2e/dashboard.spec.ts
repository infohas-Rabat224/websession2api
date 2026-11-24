/**
 * Local Playwright E2E test specification for WebSession2API Dashboard.
 * Run locally after starting the dev server on http://127.0.0.1:3000.
 *
 * Inside Google AI Studio, browser verification is executed via the pre-installed
 * `playwright-cli` tool against http://localhost:3000.
 */
export const E2E_JOURNEYS = [
  {
    name: 'Production vs Development Simulation Mode Isolation',
    steps: [
      'Open http://127.0.0.1:3000',
      'Verify Overview shows Production Mode and 0 connected local tabs in hosted environment',
      'Switch to Dev Simulation and verify isolated simulated tabs appear with amber warning banner',
      'Switch back to Production Mode and verify live state remains unpolluted',
    ],
  },
  {
    name: 'Providers, Models, and Selector Diagnostics',
    steps: [
      'Navigate to Providers and verify all 7 provider cards render (DeepSeek, Z.ai / GLM, Kimi, Qwen, Claude, ChatGPT, Gemini)',
      'Navigate to Models and verify deepseek-web, glm-web, and websession/* aliases',
      'Navigate to Diagnostics and click Run Selector Check for DeepSeek and Z.ai / GLM',
    ],
  },
  {
    name: 'API Playground, Request Logs, Agents, Routing, and Settings',
    steps: [
      'Navigate to API Playground, send request in Production Mode, observe explicit PROVIDER_DISCONNECTED error',
      'Switch to Dev Simulation, send OpenAI and Anthropic streaming requests, verify real SSE output',
      'Enable tool schema checkbox on browser-session provider and verify explicit 422 UNSUPPORTED_CAPABILITY error',
      'Navigate to Request Logs and confirm persisted metadata rows',
      'Navigate to Agents and inspect configs for Claude Code, Hermes, OpenCode, Cline, Roo Code',
      'Navigate to Routing and Settings, modify values, save, reload, and verify persistence',
    ],
  },
];
