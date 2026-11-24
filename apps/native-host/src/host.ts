import { NativeMessageFrameDecoder, encodeNativeMessage } from './framing';
import { isAllowedExtensionId } from '../../../packages/security/src/index';
import type { NativeMessagingEnvelope } from '../../../packages/shared-types/src/index';

const GATEWAY_HOST = process.env.WEBSESSION2API_HOST || '127.0.0.1';
const GATEWAY_PORT = Number(process.env.WEBSESSION2API_PORT || 8787);
const GATEWAY_API_KEY = process.env.WEBSESSION2API_API_KEY || '';
const ALLOWED_EXTENSION_IDS = (process.env.WEBSESSION2API_ALLOWED_EXTENSION_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const GATEWAY_BRIDGE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}/internal/bridge/event`;

function sendToExtension(message: NativeMessagingEnvelope) {
  const frame = encodeNativeMessage(message);
  process.stdout.write(frame);
}

async function relayToGateway(envelope: NativeMessagingEnvelope) {
  if (envelope.extensionId && !isAllowedExtensionId(envelope.extensionId, ALLOWED_EXTENSION_IDS)) {
    return;
  }

  const supportedEventTypes = new Set([
    'HEARTBEAT',
    'SESSION_UPDATE',
    'STREAM_DELTA',
    'REQUEST_COMPLETE',
    'REQUEST_ERROR',
    'DIAGNOSTICS_RESULT',
  ]);
  const eventType = supportedEventTypes.has(envelope.type) ? envelope.type : 'HEARTBEAT';

  try {
    const res = await fetch(GATEWAY_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_API_KEY ? { Authorization: `Bearer ${GATEWAY_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        type: eventType,
        providerId: envelope.providerId,
        payload: envelope.payload,
      }),
    });

    if (!res.ok) return;
    const data = (await res.json()) as {
      outbound?: Array<{
        type: 'SUBMIT_REQUEST' | 'CANCEL_REQUEST' | 'RUN_DIAGNOSTICS';
        providerId: NativeMessagingEnvelope['providerId'];
        requestId: string;
        payload: Record<string, unknown>;
      }>;
    };

    if (Array.isArray(data.outbound)) {
      for (const cmd of data.outbound) {
        sendToExtension({
          id: `host_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: cmd.type,
          protocolVersion: '1.0',
          providerId: cmd.providerId,
          timestamp: new Date().toISOString(),
          payload: cmd.payload,
        });
      }
    }
  } catch {
    // Gateway may not be running yet; Chrome extension heartbeat retries cleanly.
  }
}

const decoder = new NativeMessageFrameDecoder();

process.stdin.on('data', (chunk: Buffer) => {
  try {
    const messages = decoder.push(chunk);
    for (const msg of messages) {
      void relayToGateway(msg);
    }
  } catch {
    // Drop malformed frame safely
  }
});

// Poll gateway outbound command queue every 500ms so incoming API requests dispatch immediately
setInterval(() => {
  void relayToGateway({
    id: `poll_${Date.now()}`,
    type: 'HEARTBEAT',
    protocolVersion: '1.0',
    timestamp: new Date().toISOString(),
    payload: { poll: true },
  });
}, 500);
