/**
 * CORS allow-list configuration, extracted out of index.js so it can be
 * unit-tested without triggering the server-startup side effects that
 * importing index.js directly would cause (DB connect, queue init, etc).
 *
 * Audit fix H2: the allow-list computed here was previously built and then
 * never actually applied — both the Express CORS config and the Socket.IO
 * CORS config used `origin: true`, which reflects whatever origin sent the
 * request (with `credentials: true`), making the allow-list exist in name
 * only. `buildCorsOriginValidator` is the real validator both configs use.
 */

/**
 * Parse allowed origins from environment.
 */
export function parseAllowedOrigins() {
  const raw =
    process.env.CORS_ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173,http://localhost:3000";
  const parsed = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const expanded = new Set(parsed);
  for (const origin of parsed) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        expanded.add(`${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`);
      } else if (url.hostname === "127.0.0.1") {
        expanded.add(`${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`);
      }
    } catch {
      // Ignore invalid origin entries; startup validation handles env quality elsewhere.
    }
  }

  return [...expanded];
}

/**
 * Build a `cors`/Socket.IO-compatible origin validator callback from a list
 * of allowed origins. Requests with no Origin header (server-to-server
 * calls, curl, health checks, native mobile clients) are allowed through,
 * matching standard `cors` middleware practice — only browser-sent
 * cross-origin requests carry an Origin header to check in the first place.
 */
export function buildCorsOriginValidator(allowedOrigins) {
  const allowSet = new Set(allowedOrigins);
  return (origin, callback) => {
    if (!origin || allowSet.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  };
}
