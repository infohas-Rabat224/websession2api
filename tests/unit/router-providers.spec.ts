import { describe, it, expect } from 'vitest';
import { createDefaultRoutingConfig } from '../../packages/configuration/src/index';
import { ModelRouter, resolveAliasToProviderId } from '../../apps/gateway/src/router';
import { DeepSeekProviderAdapter } from '../../providers/deepseek/src/index';
import { ZaiProviderAdapter } from '../../providers/zai/src/index';

describe('Routing Engine & Priority Provider Adapters', () => {
  it('resolves both direct aliases and websession/* prefixed aliases', () => {
    expect(resolveAliasToProviderId('deepseek-web')).toBe('deepseek');
    expect(resolveAliasToProviderId('websession/deepseek')).toBe('deepseek');
    expect(resolveAliasToProviderId('glm-web')).toBe('zai');
    expect(resolveAliasToProviderId('websession/glm')).toBe('zai');
    expect(resolveAliasToProviderId('kimi-web')).toBe('kimi');
    expect(resolveAliasToProviderId('websession/gemini')).toBe('gemini');
    expect(resolveAliasToProviderId('non-existent-model')).toBeNull();
  });

  it('routes task preferences and falls back when enabled, but never switches mid-conversation', () => {
    const router = new ModelRouter(createDefaultRoutingConfig());

    const first = router.resolveRoute({
      requestId: 'r1',
      requestedModel: 'auto:coding',
      conversationId: 'conv-42',
      candidates: [
        { providerId: 'deepseek', enabled: true, available: false },
        { providerId: 'zai', enabled: true, available: true },
        { providerId: 'claude', enabled: true, available: true },
      ],
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.providerId).toBe('zai');
      expect(first.fallbackUsed).toBe(true);
    }

    // Now zai disconnects mid-conversation -> router MUST reject instead of silently switching to claude
    const second = router.resolveRoute({
      requestId: 'r2',
      requestedModel: 'auto:coding',
      conversationId: 'conv-42',
      candidates: [
        { providerId: 'deepseek', enabled: true, available: true },
        { providerId: 'zai', enabled: true, available: false },
        { providerId: 'claude', enabled: true, available: true },
      ],
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('PROVIDER_DISCONNECTED');
      expect(second.error.message).toContain('silently switch');
    }
  });

  it('verifies DeepSeek and Z.ai adapter metadata, selector diagnostics, and honest status', async () => {
    const deepseek = new DeepSeekProviderAdapter();
    const zai = new ZaiProviderAdapter();

    expect(deepseek.domain).toBe('chat.deepseek.com');
    expect(zai.domain).toBe('chat.z.ai');
    expect(deepseek.verificationStatus).not.toBe('LIVE_VERIFIED');
    expect(zai.verificationStatus).not.toBe('LIVE_VERIFIED');

    const dsDiag = await deepseek.runDiagnostics();
    expect(dsDiag.results.length).toBeGreaterThanOrEqual(8);
    expect(dsDiag.driverVersion).toBe(deepseek.driverVersion);

    const zaiModels = await zai.getAvailableModels();
    expect(zaiModels[0].alias).toBe('glm-web');
    expect(zaiModels[0].prefixedAlias).toBe('websession/glm');
    expect(zaiModels[0].available).toBe(false);
  });
});
