import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLocalApiKey,
  hashApiKey,
  verifyApiKey,
  isAllowedLoopbackHost,
  validateOfficialApiBaseUrl,
  SecretVault,
} from '../../packages/security/src/index';
import { parseOpenAiChatRequest } from '../../packages/openai-compat/src/index';
import { parseAnthropicMessagesRequest, countAnthropicTokens } from '../../packages/anthropic-compat/src/index';
import { createDefaultRoutingConfig } from '../../packages/configuration/src/index';
import { ModelRouter } from '../../apps/gateway/src/router';
import { encodeNativeMessage, NativeMessageFrameDecoder } from '../../apps/native-host/src/framing';
import { DeepSeekProviderAdapter } from '../../providers/deepseek/src/index';
import { ZaiProviderAdapter } from '../../providers/zai/src/index';
import { validateRequestAgainstCapabilities } from '../../packages/provider-sdk/src/index';

test('security: API keys, loopback host validation, SSRF allowlist, and SecretVault', () => {
  const key = generateLocalApiKey();
  assert.equal(verifyApiKey(key, hashApiKey(key)), true);
  assert.equal(verifyApiKey('wrong', hashApiKey(key)), false);
  assert.equal(isAllowedLoopbackHost('127.0.0.1:8787'), true);
  assert.equal(isAllowedLoopbackHost('attacker.local:8787'), false);
  assert.equal(validateOfficialApiBaseUrl('https://api.deepseek.com/v1').valid, true);
  assert.equal(validateOfficialApiBaseUrl('http://127.0.0.1:8787/v1').valid, false);

  const vault = new SecretVault('master-secret-for-unit-test-123456');
  const enc = vault.encrypt('sk-secret-abc');
  assert.equal(vault.decrypt(enc), 'sk-secret-abc');
});

test('protocols: OpenAI/Anthropic validation rejects unsupported params and tools on text-only sessions', () => {
  const oaBad = parseOpenAiChatRequest(
    { model: 'deepseek-web', messages: [{ role: 'user', content: 'hi' }], n: 2 },
    'req_1'
  );
  assert.equal(oaBad.ok, false);

  const antCount = countAnthropicTokens({
    model: 'glm-web',
    messages: [{ role: 'user', content: 'Estimate tokens' }],
  });
  assert.equal(antCount.ok, true);

  const deepseek = new DeepSeekProviderAdapter();
  const antTools = parseAnthropicMessagesRequest(
    {
      model: 'deepseek-web',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'use tool' }],
      tools: [{ name: 'exec', input_schema: { type: 'object' } }],
    },
    'req_2'
  );
  assert.equal(antTools.ok, true);
  if (antTools.ok) {
    const capErr = validateRequestAgainstCapabilities(
      antTools.request,
      deepseek.getCapabilities(),
      'deepseek'
    );
    assert.equal(capErr?.code, 'UNSUPPORTED_CAPABILITY');
  }
});

test('router: enforces fallback on new threads and blocks silent mid-conversation provider switch', () => {
  const router = new ModelRouter(createDefaultRoutingConfig());
  const first = router.resolveRoute({
    requestId: 'r1',
    requestedModel: 'auto:coding',
    conversationId: 'thread-1',
    candidates: [
      { providerId: 'deepseek', enabled: true, available: false },
      { providerId: 'zai', enabled: true, available: true },
    ],
  });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.providerId, 'zai');

  const second = router.resolveRoute({
    requestId: 'r2',
    requestedModel: 'auto:coding',
    conversationId: 'thread-1',
    candidates: [
      { providerId: 'deepseek', enabled: true, available: true },
      { providerId: 'zai', enabled: true, available: false },
    ],
  });
  assert.equal(second.ok, false);
});

test('native messaging framing & priority providers', async () => {
  const frame = encodeNativeMessage({
    id: 'n1',
    type: 'HELLO',
    protocolVersion: '1.0',
    timestamp: new Date().toISOString(),
    payload: { version: '1.0.0' },
  });
  const decoder = new NativeMessageFrameDecoder();
  const decoded = decoder.push(frame);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].id, 'n1');

  const zai = new ZaiProviderAdapter();
  const diag = await zai.runDiagnostics();
  assert.equal(diag.driverVersion, '1.2.0-zai');
  assert.ok(diag.results.length >= 8);
});
