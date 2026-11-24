# Security Architecture

WebSession2API is engineered to minimize local attack surface and strictly respect user privacy and browser security boundaries:

1. **Zero Credential/Cookie Extraction**: The Chrome MV3 extension never requests `cookies` or `<all_urls>` permissions. It interacts strictly with visible, user-authorized DOM elements on the 7 allowlisted provider domains.
2. **Loopback-Only Gateway Binding**: `apps/gateway` refuses to start on non-loopback interfaces (`0.0.0.0` is rejected by default) and validates `req.ip` against `127.0.0.1` / `::1`.
3. **DNS Rebinding & Origin/CSRF Protection**: Every request validates `Host` against `localhost`/`127.0.0.1`/`[::1]`, blocks disallowed cross-origin `Origin` headers, and validates CSRF headers on state-changing requests.
4. **Timing-Safe API Authentication**: All `/v1/*` and `/admin/*` endpoints require a random `ws2a_...` local API key validated via SHA-256 + `crypto.timingSafeEqual`.
5. **Encrypted Official API Storage & SSRF Allowlist**: Official provider API keys are encrypted at rest with AES-256-GCM (`SecretVault`) and outbound requests are restricted to an explicit HTTPS allowlist of verified provider API hosts.
6. **Privacy-First Logging & Redaction**: SQLite persists request metadata (ID, provider, model, duration, status) without storing prompt or response bodies by default. Error strings pass through token/key redaction before persistence or logging.
7. **No Remote Command Execution**: The Chrome extension never executes shell commands or workspace file operations on behalf of coding agents.
