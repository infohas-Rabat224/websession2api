import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultCapabilityMatrix,
  createProviderError,
  deriveOperationalStatus,
  ProviderAdapterBase,
  ProviderRegistry,
  runAdapterVerificationSuite,
  validateRequestAgainstCapabilities,
} from '../../packages/provider-sdk/src/index';
import { DeepSeekProviderAdapter } from '../../providers/deepseek/src/index';
import { ZaiProviderAdapter } from '../../providers/zai/src/index';
import { KimiProviderAdapter } from '../../providers/kimi/src/index';
import { QwenProviderAdapter } from '../../providers/qwen/src/index';
import { ClaudeProviderAdapter } from '../../providers/claude/src/index';
import { ChatGptProviderAdapter } from '../../providers/chatgpt/src/index';
import { GeminiProviderAdapter } from '../../providers/gemini/src/index';
import type { ProviderCapabilities } from '../../packages/shared-types/src/index';

const ALL_ADAPTERS = () => [
  new DeepSeekProviderAdapter(),
  new ZaiProviderAdapter(),
  new KimiProviderAdapter(),
  new QwenProviderAdapter(),
  new ClaudeProviderAdapter(),
  new ChatGptProviderAdapter(),
  new GeminiProviderAdapter(),
];

test('deriveOperationalStatus covers all 10 canonical provider statuses accurately', () => {
  const base = {
    enabled: true,
    mode: 'browser_session' as const,
    bridgeConnected: false,
    officialApiConfigured: false,
    sessionStatus: 'disconnected' as const,
    authStatus: 'unknown' as const,
    testing: false,
    lastError: null,
    selectorHealth: null,
    lastVerificationReport: null,
    isSimulated: false,
  };

  assert.equal(deriveOperationalStatus(base), 'NOT INSTALLED');
  assert.equal(deriveOperationalStatus({ ...base, testing: true }), 'TESTING');
  assert.equal(deriveOperationalStatus({ ...base, bridgeConnected: true }), 'SESSION REQUIRED');
  assert.equal(
    deriveOperationalStatus({ ...base, bridgeConnected: true, sessionStatus: 'expired', authStatus: 'expired' }),
    'SESSION EXPIRED'
  );
  assert.equal(
    deriveOperationalStatus({
      ...base,
      bridgeConnected: true,
      sessionStatus: 'connected',
      authStatus: 'authenticated',
    }),
    'CONNECTED'
  );
  assert.equal(
    deriveOperationalStatus({
      ...base,
      bridgeConnected: true,
      sessionStatus: 'rate_limited',
    }),
    'TEMPORARILY UNAVAILABLE'
  );
  assert.equal(
    deriveOperationalStatus({
      ...base,
      bridgeConnected: true,
      selectorHealth: {
        checkedAt: new Date().toISOString(),
        driverVersion: '1.0.0',
        healthy: false,
        uiDriftDetected: true,
        results: [],
        summary: 'UI changed',
      },
    }),
    'INTERFACE CHANGED'
  );
  assert.equal(
    deriveOperationalStatus({
      ...base,
      bridgeConnected: true,
      sessionStatus: 'connected',
      authStatus: 'authenticated',
      lastError: createProviderError('INVALID_REQUEST', 'Adapter failure', 500),
    }),
    'FAILED'
  );

  const partialReport = {
    id: 'ver_1',
    providerId: 'deepseek' as const,
    providerName: 'DeepSeek Web',
    driverVersion: '1.2.0-deepseek',
    mode: 'browser_session' as const,
    operationalStatus: 'PARTIALLY SUPPORTED' as const,
    passedCoreChecks: 6,
    totalCoreChecks: 6,
    steps: [],
    capabilityResults: buildDefaultCapabilityMatrix(new DeepSeekProviderAdapter().getCapabilities()),
    modelsDiscovered: ['deepseek-web'],
    lastSuccessfulTestAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    failureReasons: [],
    summary: 'Passed core checks',
    isSimulated: false,
  };

  assert.equal(
    deriveOperationalStatus({
      ...base,
      bridgeConnected: true,
      sessionStatus: 'connected',
      authStatus: 'authenticated',
      lastVerificationReport: partialReport,
    }),
    'PARTIALLY SUPPORTED'
  );

  assert.equal(
    deriveOperationalStatus({
      ...base,
      mode: 'official_api',
      officialApiConfigured: true,
      lastVerificationReport: {
        ...partialReport,
        mode: 'official_api',
        operationalStatus: 'VERIFIED WORKING',
      },
    }),
    'VERIFIED WORKING'
  );
});

test('all 7 provider adapters extend ProviderAdapterBase and register in ProviderRegistry with fault isolation', async () => {
  const registry = new ProviderRegistry();
  const adapters = ALL_ADAPTERS();
  assert.equal(adapters.length, 7);

  for (const adapter of adapters) {
    assert.ok(adapter instanceof ProviderAdapterBase, `${adapter.id} must extend ProviderAdapterBase`);
    registry.register(adapter);
  }
  assert.deepEqual(registry.ids().sort(), [
    'chatgpt',
    'claude',
    'deepseek',
    'gemini',
    'kimi',
    'qwen',
    'zai',
  ]);

  // Simulate one adapter throwing during model discovery and confirm the other 6 still succeed
  const faulty = registry.getOrThrow('kimi');
  faulty.getAvailableModels = async () => {
    throw new Error('Simulated Kimi DOM parse failure');
  };

  const discovery = await registry.discoverAllModels();
  assert.equal(discovery.models.length, 6);
  assert.equal(discovery.errors.length, 1);
  assert.equal(discovery.errors[0].providerId, 'kimi');
});

test('validateRequestAgainstCapabilities explicitly rejects unsupported attachments, images, and tools', () => {
  const caps: ProviderCapabilities = new DeepSeekProviderAdapter().getCapabilities();

  const attErr = validateRequestAgainstCapabilities(
    {
      requestId: 'req_att',
      protocol: 'openai',
      requestedModel: 'deepseek-web',
      messages: [
        {
          role: 'user',
          content: [{ type: 'file_attachment', filename: 'spec.pdf', mimeType: 'application/pdf' }],
        },
      ],
      stream: false,
    },
    caps,
    'deepseek'
  );
  assert.equal(attErr?.code, 'UNSUPPORTED_CAPABILITY');

  const imgErr = validateRequestAgainstCapabilities(
    {
      requestId: 'req_img',
      protocol: 'openai',
      requestedModel: 'deepseek-web',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', imageUrl: 'https://example.com/a.png' }],
        },
      ],
      stream: false,
    },
    caps,
    'deepseek'
  );
  assert.equal(imgErr?.code, 'UNSUPPORTED_CAPABILITY');

  const toolErr = validateRequestAgainstCapabilities(
    {
      requestId: 'req_tool',
      protocol: 'openai',
      requestedModel: 'deepseek-web',
      messages: [{ role: 'user', content: 'run tool' }],
      tools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
      stream: false,
    },
    caps,
    'deepseek'
  );
  assert.equal(toolErr?.code, 'UNSUPPORTED_CAPABILITY');
});

test('Production verification never simulates success when bridge is disconnected', async () => {
  for (const adapter of ALL_ADAPTERS()) {
    const report = await runAdapterVerificationSuite({
      adapter,
      mode: 'browser_session',
      bridgeConnected: false,
      officialApiConfigured: false,
      isSimulated: false,
      executePrompt: async () => {
        throw new Error('Must never be invoked without active session');
      },
    });
    assert.equal(report.operationalStatus, 'NOT INSTALLED');
    assert.notEqual(report.operationalStatus, 'VERIFIED WORKING');
    assert.equal(report.passedCoreChecks, 0);
    assert.ok(report.failureReasons.length > 0);
  }
});
