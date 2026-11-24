import type { NativeMessagingEnvelope } from '../../../packages/shared-types/src/index';

export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024; // Chrome Native Messaging 1 MiB limit

export function encodeNativeMessage(message: NativeMessagingEnvelope | Record<string, unknown>): Buffer {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, 'utf8');
  if (payload.length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native message exceeds 1 MiB limit (${payload.length} bytes).`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class NativeMessageFrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): NativeMessagingEnvelope[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: NativeMessagingEnvelope[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_NATIVE_MESSAGE_BYTES) {
        this.buffer = Buffer.alloc(0);
        throw new Error(`Invalid native message frame length: ${length}`);
      }
      if (this.buffer.length < 4 + length) {
        break;
      }
      const rawJson = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      messages.push(JSON.parse(rawJson) as NativeMessagingEnvelope);
    }

    return messages;
  }
}
