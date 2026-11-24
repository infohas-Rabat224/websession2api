import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  encodeNativeMessage,
  NativeMessageFrameDecoder,
} from '../../apps/native-host/src/framing';

describe('Chrome Native Messaging & MV3 Manifest Security', () => {
  it('encodes and decodes 32-bit little-endian framed messages across chunked buffers', () => {
    const msg1 = {
      id: 'm1',
      type: 'SESSION_UPDATE' as const,
      protocolVersion: '1.0' as const,
      providerId: 'deepseek' as const,
      timestamp: new Date().toISOString(),
      payload: { sessionStatus: 'connected', authStatus: 'authenticated' },
    };
    const msg2 = {
      id: 'm2',
      type: 'HEARTBEAT' as const,
      protocolVersion: '1.0' as const,
      timestamp: new Date().toISOString(),
      payload: { activeTabs: 2 },
    };

    const combined = Buffer.concat([encodeNativeMessage(msg1), encodeNativeMessage(msg2)]);
    const decoder = new NativeMessageFrameDecoder();

    // Feed in awkward split slices
    const out1 = decoder.push(combined.subarray(0, 7));
    expect(out1).toHaveLength(0);
    const out2 = decoder.push(combined.subarray(7));
    expect(out2).toHaveLength(2);
    expect(out2[0].id).toBe('m1');
    expect(out2[1].id).toBe('m2');
  });

  it('restricts extension manifest host_permissions and excludes cookies/all_urls', () => {
    const manifestPath = path.resolve(process.cwd(), 'apps/extension/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).not.toContain('cookies');
    expect(manifest.permissions).not.toContain('webRequest');
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).toContain('https://chat.deepseek.com/*');
    expect(manifest.host_permissions).toContain('https://chat.z.ai/*');
  });
});
