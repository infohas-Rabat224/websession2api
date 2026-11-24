import crypto from 'node:crypto';

const API_KEY_PREFIX = 'ws2a_';
const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

export function generateLocalApiKey(): string {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `${API_KEY_PREFIX}${randomPart}`;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

export function getApiKeyPrefix(apiKey: string): string {
  if (!apiKey) return '';
  return `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`;
}

export function verifyApiKey(provided: string | undefined | null, expectedHash: string): boolean {
  if (!provided || !expectedHash) return false;
  const candidateHash = hashApiKey(provided.trim());
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function extractBearerOrApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'] ?? headers['Authorization'];
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  const xApiKey = headers['x-api-key'] ?? headers['X-API-Key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    return xApiKey.trim();
  }
  return null;
}

export function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const normalized = remoteAddress.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

export function isAllowedLoopbackHost(hostHeader: string | undefined, expectedPort?: number): boolean {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();
  const match = trimmed.match(/^(\[::1\]|127\.0\.0\.1|localhost)(?::(\d+))?$/);
  if (!match) return false;
  if (expectedPort && match[2] && Number(match[2]) !== expectedPort) {
    return false;
  }
  return true;
}

export function isAllowedOrigin(
  originHeader: string | undefined,
  allowedOrigins: string[] = []
): boolean {
  if (!originHeader) return true; // Non-browser clients (curl, coding agents) omit Origin
  try {
    const url = new URL(originHeader);
    if (url.protocol === 'chrome-extension:') {
      return allowedOrigins.length === 0 || allowedOrigins.includes(originHeader);
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') {
      return url.protocol === 'http:' || url.protocol === 'https:';
    }
    if (allowedOrigins.includes(originHeader)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function validateCsrfHeader(
  method: string,
  headers: Record<string, string | string[] | undefined>,
  allowedOrigins: string[] = []
): { ok: boolean; reason?: string } {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') {
    return { ok: true };
  }
  const origin = typeof headers['origin'] === 'string' ? headers['origin'] : undefined;
  const xRequestedWith =
    typeof headers['x-requested-with'] === 'string' ? headers['x-requested-with'] : undefined;
  const auth = extractBearerOrApiKey(headers);

  // API key / Bearer token callers are immune to cross-site cookie CSRF
  if (auth) {
    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return { ok: false, reason: 'Disallowed Origin header on authenticated request' };
    }
    return { ok: true };
  }

  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return { ok: false, reason: 'Cross-origin mutation blocked by CSRF policy' };
  }

  if (!origin && !xRequestedWith) {
    return { ok: true };
  }

  return { ok: true };
}

const REDACT_PATTERNS: RegExp[] = [
  /ws2a_[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{12,}/g,
  /sk-ant-[A-Za-z0-9_-]{12,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:api[_-]?key|token|secret|password|cookie|authorization)["']?\s*[:=]\s*["']?)([^"'\s,;}{]+)/gi,
];

export function redactSensitiveText(input: string): string {
  let output = input;
  for (const pattern of REDACT_PATTERNS) {
    output = output.replace(pattern, (match, prefix?: string) => {
      if (prefix && typeof prefix === 'string' && prefix.length < match.length) {
        return `${prefix}[REDACTED]`;
      }
      return '[REDACTED]';
    });
  }
  return output;
}

export function redactObject<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSensitiveText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(authorization|cookie|set-cookie|x-api-key|password|secret|token|apiKey|api_key)$/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactObject(v);
      }
    }
    return out as T;
  }
  return value;
}

export class SecretVault {
  private readonly key: Buffer;

  constructor(masterKeySecret?: string) {
    const material =
      masterKeySecret && masterKeySecret.trim().length >= 16
        ? masterKeySecret.trim()
        : crypto.randomBytes(32).toString('hex');
    this.key = crypto.createHash('sha256').update(material, 'utf8').digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(ciphertext: string): string | null {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 4 || parts[0] !== 'v1') return null;
      const iv = Buffer.from(parts[1], 'base64');
      const authTag = Buffer.from(parts[2], 'base64');
      const data = Buffer.from(parts[3], 'base64');
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, this.key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private maxPerWindow: number;
  private readonly windowMs: number;

  constructor(maxPerWindow = 60, windowMs = 60_000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  setLimit(maxPerWindow: number): void {
    this.maxPerWindow = Math.max(1, maxPerWindow);
  }

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const cutoff = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= this.maxPerWindow) {
      const oldest = timestamps[0] ?? now;
      this.hits.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1000, oldest + this.windowMs - now),
      };
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxPerWindow - timestamps.length),
      retryAfterMs: 0,
    };
  }
}

const ALLOWED_OFFICIAL_API_HOSTS = new Set([
  'api.deepseek.com',
  'open.bigmodel.cn',
  'api.z.ai',
  'api.moonshot.cn',
  'api.moonshot.ai',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
]);

export function validateOfficialApiBaseUrl(rawUrl: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Official API base URL must use HTTPS.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return { valid: false, reason: 'Private, loopback, or metadata addresses are blocked.' };
    }
    if (!ALLOWED_OFFICIAL_API_HOSTS.has(hostname)) {
      return {
        valid: false,
        reason: `Host "${hostname}" is not on the verified provider API allowlist.`,
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

export function isAllowedExtensionId(extensionId: string | undefined, allowlist: string[]): boolean {
  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) return false;
  if (allowlist.length === 0) return true;
  return allowlist.includes(extensionId);
}
