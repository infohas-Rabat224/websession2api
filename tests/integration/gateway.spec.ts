import { describe, it, expect, afterAll } from 'vitest';
import { createFastifyGateway } from '../../apps/gateway/src/server';

const TEST_API_KEY = 'ws2a_integration_test_key_99999999';
const { app, engine } = createFastifyGateway({
  dbPath: ':memory:',
  apiKey: TEST_API_KEY,
  enforceLoopbackHost: true,
  logger: false,
});

afterAll(async () => {
  await app.close();
});

describe('Standalone Fastify Local Gateway Integration', () => {
  it('blocks unauthenticated requests and DNS rebinding Host headers', async () => {
    const unauth = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { host: '127.0.0.1:8787' },
    });
    expect(unauth.statusCode).toBe(401);

    const badHost = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: {
        host: 'attacker.evil.com:8787',
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });
    expect(badHost.statusCode).toBe(403);
  });

  it('exposes /v1/models and reports honest 503 when disconnected in Production Mode', async () => {
    const modelsRes = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: {
        host: '127.0.0.1:8787',
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });
    expect(modelsRes.statusCode).toBe(200);
    const body = modelsRes.json();
    expect(body.object).toBe('list');
    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain('deepseek-web');
    expect(ids).toContain('websession/deepseek');
    expect(ids).toContain('glm-web');
    expect(ids).toContain('websession/glm');

    const chatRes = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: {
        host: '127.0.0.1:8787',
        authorization: `Bearer ${TEST_API_KEY}`,
      },
      payload: {
        model: 'deepseek-web',
        messages: [{ role: 'user', content: 'Test disconnected production mode' }],
      },
    });
    expect(chatRes.statusCode).toBe(503);
    expect(chatRes.json().error.code).toBe('PROVIDER_DISCONNECTED');
  });

  it('completes real bridged browser-session roundtrip via /internal/bridge/event', async () => {
    // Simulate Native Messaging host registering a live DeepSeek tab
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/internal/bridge/event',
      headers: {
        host: '127.0.0.1:8787',
        authorization: `Bearer ${TEST_API_KEY}`,
      },
      payload: {
        type: 'SESSION_UPDATE',
        providerId: 'deepseek',
        payload: {
          sessionStatus: 'connected',
          authStatus: 'authenticated',
          activeTabId: 77,
          activeTabTitle: 'DeepSeek Chat',
          activeTabUrl: 'https://chat.deepseek.com',
          visibleModelName: 'DeepSeek-V3',
        },
      },
    });
    expect(sessionRes.statusCode).toBe(200);

    // Start an Anthropic /v1/messages request and fulfill it from the bridge event
    const msgPromise = app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        host: '127.0.0.1:8787',
        'x-api-key': TEST_API_KEY,
      },
      payload: {
        model: 'deepseek-web',
        max_tokens: 128,
        messages: [{ role: 'user', content: 'Say hello' }],
      },
    });

    // Poll bridge for queued SUBMIT_REQUEST and send back REQUEST_COMPLETE
    await new Promise((r) => setTimeout(r, 25));
    const poll = engine.ingestBridgeEvent({ type: 'HEARTBEAT', payload: {} });
    const submitCmd = poll.outbound.find((c) => c.type === 'SUBMIT_REQUEST');
    expect(submitCmd).toBeDefined();

    engine.ingestBridgeEvent({
      type: 'REQUEST_COMPLETE',
      providerId: 'deepseek',
      payload: {
        requestId: submitCmd!.requestId,
        content: 'Hello from bridged DeepSeek tab!',
        visibleModelName: 'DeepSeek-V3',
      },
    });

    const msgRes = await msgPromise;
    expect(msgRes.statusCode).toBe(200);
    const json = msgRes.json();
    expect(json.type).toBe('message');
    expect(json.content[0].text).toBe('Hello from bridged DeepSeek tab!');

    // Verify request metadata persisted in SQLite without prompt content
    const logs = engine.listRequests(10, 'production');
    expect(logs.some((l) => l.status === 'success' && l.protocol === 'anthropic')).toBe(true);
  });

  it('supports Anthropic /v1/messages/count_tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages/count_tokens',
      headers: {
        host: '127.0.0.1:8787',
        'x-api-key': TEST_API_KEY,
      },
      payload: {
        model: 'deepseek-web',
        messages: [{ role: 'user', content: 'How many tokens is this prompt?' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().input_tokens).toBeGreaterThan(0);
  });
});
