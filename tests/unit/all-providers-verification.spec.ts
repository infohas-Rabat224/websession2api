import { describe, expect, it } from 'vitest';
import { createFastifyGateway } from '../../apps/gateway/src/server';
import { initDatabase, providers, sessions, models, requests, providerVerifications } from '../../packages/database/src/index';
import type { ProviderId } from '../../packages/shared-types/src/index';

const ALL_PROVIDER_IDS: ProviderId[] = [
  'deepseek',
  'zai',
  'kimi',
  'qwen',
  'claude',
  'chatgpt',
  'gemini',
];

describe('All-Provider Functional Verification & Regression Suite (All 7 Providers)', () => {
  it('initializes Drizzle ORM SQLite schema for providers, sessions, models, requests, and provider_verifications', () => {
    const ctx = initDatabase(':memory:');
    try {
      expect(providers).toBeDefined();
      expect(sessions).toBeDefined();
      expect(models).toBeDefined();
      expect(requests).toBeDefined();
      expect(providerVerifications).toBeDefined();

      const tableRows = ctx.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const names = new Set(tableRows.map((r) => r.name));
      expect(names.has('providers')).toBe(true);
      expect(names.has('provider_sessions')).toBe(true);
      expect(names.has('models')).toBe(true);
      expect(names.has('requests')).toBe(true);
      expect(names.has('provider_verifications')).toBe(true);
    } finally {
      ctx.close();
    }
  });

  it('never marks any provider VERIFIED WORKING in Production Mode without a live bridge or Official API key', async () => {
    const apiKey = 'ws2a_verify_prod_honesty_key_001';
    const { app } = createFastifyGateway({
      dbPath: ':memory:',
      apiKey,
      enforceLoopbackHost: false,
      logger: false,
    });

    try {
      const verifyAllRes = await app.inject({
        method: 'POST',
        url: '/admin/verify-all',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(verifyAllRes.statusCode).toBe(200);
      const body = verifyAllRes.json() as {
        reports: Array<{ providerId: ProviderId; operationalStatus: string; failureReasons: string[] }>;
        matrix: Array<{ providerId: ProviderId; operationalStatus: string }>;
      };
      expect(body.reports).toHaveLength(7);
      expect(body.matrix).toHaveLength(7);

      for (const id of ALL_PROVIDER_IDS) {
        const report = body.reports.find((r) => r.providerId === id);
        expect(report).toBeDefined();
        expect(report?.operationalStatus).toBe('NOT INSTALLED');
        expect(report?.operationalStatus).not.toBe('VERIFIED WORKING');
        expect(report?.failureReasons.length).toBeGreaterThan(0);
      }
    } finally {
      await app.close();
    }
  });

  it.each(ALL_PROVIDER_IDS)(
    'runs end-to-end session detection, model discovery, prompt extraction, consecutive context, streaming, and error/recovery for %s',
    async (providerId) => {
      const apiKey = `ws2a_e2e_${providerId}_test_key_001`;
      const { app, engine } = createFastifyGateway({
        dbPath: ':memory:',
        apiKey,
        enforceLoopbackHost: false,
        logger: false,
      });

      try {
        // 1. Connect authenticated browser session over authenticated loopback Native Bridge
        engine.ingestBridgeEvent({
          type: 'SESSION_UPDATE',
          providerId,
          payload: {
            sessionStatus: 'connected',
            authStatus: 'authenticated',
            activeTabId: 700,
            activeTabTitle: `${providerId} Live Tab`,
            activeTabUrl: `https://example.test/${providerId}`,
            visibleModelName: `${providerId}-live-model`,
          },
        });

        // 2. Attach realistic loopback bridge responder handling prompt, consecutive turn & streaming
        const responder = setInterval(() => {
          const { outbound } = engine.ingestBridgeEvent({
            type: 'HEARTBEAT',
            payload: {},
          });
          for (const cmd of outbound) {
            if (cmd.type === 'SUBMIT_REQUEST') {
              const promptText = String(cmd.payload.promptText || '');
              const isStreaming = Boolean(cmd.payload.stream);
              const reply = promptText.includes('ALPHA-42')
                ? `Confirmed prior turn ALPHA-42 from ${cmd.providerId}.`
                : `Live response from ${cmd.providerId} adapter.`;

              if (isStreaming) {
                engine.ingestBridgeEvent({
                  type: 'STREAM_DELTA',
                  providerId: cmd.providerId,
                  payload: { requestId: cmd.requestId, deltaText: reply.slice(0, 12) },
                });
                engine.ingestBridgeEvent({
                  type: 'STREAM_DELTA',
                  providerId: cmd.providerId,
                  payload: { requestId: cmd.requestId, deltaText: reply.slice(12) },
                });
              }

              engine.ingestBridgeEvent({
                type: 'REQUEST_COMPLETE',
                providerId: cmd.providerId,
                payload: {
                  requestId: cmd.requestId,
                  content: reply,
                  visibleModelName: `${cmd.providerId}-live-model`,
                  inputTokens: 20,
                },
              });
            }
          }
        }, 10);

        try {
          // 3. Run full 10-step functional verification via Fastify endpoint
          const verifyRes = await app.inject({
            method: 'POST',
            url: `/admin/providers/${providerId}/verify`,
            headers: { authorization: `Bearer ${apiKey}` },
          });
          expect(verifyRes.statusCode).toBe(200);
          const { report, row } = verifyRes.json() as {
            report: {
              operationalStatus: string;
              passedCoreChecks: number;
              totalCoreChecks: number;
              capabilityResults: {
                streaming: string;
                attachments: string;
                images: string;
                toolCalling: string;
                consecutiveContext: string;
                timeoutRecovery: string;
              };
            };
            row: { operationalStatus: string; modelAvailable: boolean; lastSuccessfulTestAt: string | null };
          };

          // All 6 core E2E checks + streaming pass; attachments/images/toolCalling honestly reported as unsupported in browser mode -> PARTIALLY SUPPORTED
          expect(report.passedCoreChecks).toBe(6);
          expect(report.totalCoreChecks).toBe(6);
          expect(report.capabilityResults.streaming).toBe('verified');
          expect(report.capabilityResults.consecutiveContext).toBe('verified');
          expect(report.capabilityResults.timeoutRecovery).toBe('verified');
          expect(report.capabilityResults.attachments).toBe('unsupported');
          expect(report.capabilityResults.images).toBe('unsupported');
          expect(report.capabilityResults.toolCalling).toBe('unsupported');
          expect(report.operationalStatus).toBe('PARTIALLY SUPPORTED');
          expect(row.modelAvailable).toBe(true);
          expect(row.lastSuccessfulTestAt).not.toBeNull();

          // 4. Verify real OpenAI-compatible prompt route through Fastify gateway
          const chatRes = await app.inject({
            method: 'POST',
            url: '/v1/chat/completions',
            headers: { authorization: `Bearer ${apiKey}` },
            payload: {
              model: providerId,
              messages: [{ role: 'user', content: 'Say hello' }],
              stream: false,
            },
          });
          expect(chatRes.statusCode).toBe(200);
          expect(chatRes.json().choices[0].message.content).toContain(`Live response from ${providerId}`);

          // 5. Verify session expiry detection and recovery
          engine.ingestBridgeEvent({
            type: 'SESSION_UPDATE',
            providerId,
            payload: {
              sessionStatus: 'expired',
              authStatus: 'expired',
              activeTabId: 700,
              activeTabTitle: `${providerId} Sign In`,
              activeTabUrl: `https://example.test/${providerId}/login`,
              visibleModelName: null,
            },
          });
          const expiredRow = engine
            .getCompatibilityMatrix()
            .find((r) => r.providerId === providerId);
          expect(expiredRow?.operationalStatus).toBe('SESSION EXPIRED');

          // Recover session
          engine.ingestBridgeEvent({
            type: 'SESSION_UPDATE',
            providerId,
            payload: {
              sessionStatus: 'connected',
              authStatus: 'authenticated',
              activeTabId: 700,
              activeTabTitle: `${providerId} Live Tab`,
              activeTabUrl: `https://example.test/${providerId}`,
              visibleModelName: `${providerId}-live-model`,
            },
          });
          const recoveredRow = engine
            .getCompatibilityMatrix()
            .find((r) => r.providerId === providerId);
          expect(recoveredRow?.operationalStatus).toBe('PARTIALLY SUPPORTED');

          // 6. Verify UI drift -> INTERFACE CHANGED
          engine.ingestBridgeEvent({
            type: 'DIAGNOSTICS_RESULT',
            providerId,
            payload: {
              report: {
                checkedAt: new Date().toISOString(),
                driverVersion: '1.0.0',
                healthy: false,
                uiDriftDetected: true,
                results: [],
                summary: 'Composer selector missing',
              },
            },
          });
          const driftRow = engine
            .getCompatibilityMatrix()
            .find((r) => r.providerId === providerId);
          expect(driftRow?.operationalStatus).toBe('INTERFACE CHANGED');
        } finally {
          clearInterval(responder);
        }
      } finally {
        await app.close();
      }
    }
  );

  it('isolates failures so one broken provider never breaks verification of healthy providers', async () => {
    const apiKey = 'ws2a_isolation_test_key_001';
    const { app, engine } = createFastifyGateway({
      dbPath: ':memory:',
      apiKey,
      enforceLoopbackHost: false,
      logger: false,
    });

    try {
      // DeepSeek is connected & healthy, ChatGPT is expired, Kimi has UI drift
      engine.ingestBridgeEvent({
        type: 'SESSION_UPDATE',
        providerId: 'deepseek',
        payload: {
          sessionStatus: 'connected',
          authStatus: 'authenticated',
          activeTabId: 801,
          activeTabTitle: 'DeepSeek',
          activeTabUrl: 'https://chat.deepseek.com',
          visibleModelName: 'DeepSeek-V3',
        },
      });
      engine.ingestBridgeEvent({
        type: 'SESSION_UPDATE',
        providerId: 'chatgpt',
        payload: {
          sessionStatus: 'expired',
          authStatus: 'expired',
          activeTabId: 802,
          activeTabTitle: 'ChatGPT Login',
          activeTabUrl: 'https://chatgpt.com/auth',
          visibleModelName: null,
        },
      });
      engine.ingestBridgeEvent({
        type: 'DIAGNOSTICS_RESULT',
        providerId: 'kimi',
        payload: {
          report: {
            checkedAt: new Date().toISOString(),
            driverVersion: '1.0.0-kimi',
            healthy: false,
            uiDriftDetected: true,
            results: [],
            summary: 'Kimi composer selector changed',
          },
        },
      });

      const responder = setInterval(() => {
        const { outbound } = engine.ingestBridgeEvent({ type: 'HEARTBEAT', payload: {} });
        for (const cmd of outbound) {
          if (cmd.type === 'SUBMIT_REQUEST' && cmd.providerId === 'deepseek') {
            if (cmd.payload.stream) {
              engine.ingestBridgeEvent({
                type: 'STREAM_DELTA',
                providerId: 'deepseek',
                payload: { requestId: cmd.requestId, deltaText: 'OK from DeepSeek' },
              });
            }
            engine.ingestBridgeEvent({
              type: 'REQUEST_COMPLETE',
              providerId: 'deepseek',
              payload: {
                requestId: cmd.requestId,
                content: 'OK from DeepSeek',
                visibleModelName: 'DeepSeek-V3',
              },
            });
          }
        }
      }, 10);

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/verify-all',
          headers: { authorization: `Bearer ${apiKey}` },
        });
        expect(res.statusCode).toBe(200);
        const { matrix } = res.json() as {
          matrix: Array<{ providerId: ProviderId; operationalStatus: string }>;
        };
        const byId = Object.fromEntries(matrix.map((r) => [r.providerId, r.operationalStatus]));
        expect(byId.deepseek).toBe('PARTIALLY SUPPORTED');
        expect(byId.chatgpt).toBe('SESSION EXPIRED');
        expect(byId.kimi).toBe('INTERFACE CHANGED');
        expect(byId.zai).toBe('SESSION REQUIRED');
      } finally {
        clearInterval(responder);
      }
    } finally {
      await app.close();
    }
  });
});
