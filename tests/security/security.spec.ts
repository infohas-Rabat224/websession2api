import { describe, it, expect } from 'vitest';
import {
  generateLocalApiKey,
  hashApiKey,
  verifyApiKey,
  isLoopbackAddress,
  isAllowedLoopbackHost,
  isAllowedOrigin,
  validateCsrfHeader,
  redactSensitiveText,
  SecretVault,
  SlidingWindowRateLimiter,
  validateOfficialApiBaseUrl,
  isAllowedExtensionId,
} from '../../packages/security/src/index';

describe('Security Package', () => {
  it('generates and timing-safe verifies local API keys', () => {
    const key = generateLocalApiKey();
    expect(key.startsWith('ws2a_')).toBe(true);
    const hash = hashApiKey(key);
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey(`${key}x`, hash)).toBe(false);
    expect(verifyApiKey(undefined, hash)).toBe(false);
  });

  it('enforces loopback addresses and DNS rebinding Host validation', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.50')).toBe(false);

    expect(isAllowedLoopbackHost('127.0.0.1:8787')).toBe(true);
    expect(isAllowedLoopbackHost('localhost:8787')).toBe(true);
    expect(isAllowedLoopbackHost('evil.attacker.com:8787')).toBe(false);
  });

  it('blocks disallowed origins and cross-site mutations', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);

    const blocked = validateCsrfHeader('POST', { origin: 'https://evil.example' });
    expect(blocked.ok).toBe(false);
  });

  it('redacts sensitive tokens and API keys from logs', () => {
    const text = 'Auth failed with Bearer ws2a_superSecretToken12345 and sk-ant-abcdef123456789';
    const redacted = redactSensitiveText(text);
    expect(redacted).not.toContain('ws2a_superSecretToken12345');
    expect(redacted).not.toContain('sk-ant-abcdef123456789');
    expect(redacted).toContain('[REDACTED]');
  });

  it('encrypts and decrypts official provider keys with AES-256-GCM', () => {
    const vault = new SecretVault('test-master-secret-key-at-least-32-chars');
    const cipher = vault.encrypt('sk-live-secret-value');
    expect(cipher).not.toContain('sk-live-secret-value');
    expect(vault.decrypt(cipher)).toBe('sk-live-secret-value');
    expect(vault.decrypt('v1:bad:data:here')).toBeNull();
  });

  it('blocks SSRF targets on official API base URLs', () => {
    expect(validateOfficialApiBaseUrl('https://api.deepseek.com/v1').valid).toBe(true);
    expect(validateOfficialApiBaseUrl('http://api.deepseek.com/v1').valid).toBe(false);
    expect(validateOfficialApiBaseUrl('https://169.254.169.254/latest').valid).toBe(false);
    expect(validateOfficialApiBaseUrl('https://127.0.0.1:8787/v1').valid).toBe(false);
    expect(validateOfficialApiBaseUrl('https://untrusted.example.com/v1').valid).toBe(false);
  });

  it('enforces sliding-window rate limits and extension allowlist', () => {
    const rl = new SlidingWindowRateLimiter(2, 10_000);
    expect(rl.check('client1', 1000).allowed).toBe(true);
    expect(rl.check('client1', 1100).allowed).toBe(true);
    expect(rl.check('client1', 1200).allowed).toBe(false);

    const validExt = 'abcdefghijklmnopabcdefghijklmnop';
    expect(isAllowedExtensionId(validExt, [validExt])).toBe(true);
    expect(isAllowedExtensionId('invalid-id', [validExt])).toBe(false);
  });
});
