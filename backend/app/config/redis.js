import Redis from "ioredis";

let _client = null;
let _lastSharedErrorLog = 0;
let _connectionAttempts = 0;

const REDIS_ERROR_LOG_INTERVAL_MS = () =>
  parseInt(process.env.REDIS_ERROR_LOG_INTERVAL_MS || "60000", 10);

/**
 * When false, no Redis connections are created: shared client is null and Bull
 * queues are no-op stubs (use MongoDB orderAutoCancelJob for timeouts).
 *
 * Redis may be disabled in any environment via REDIS_DISABLED=true (or
 * REDIS_ENABLED=false). Prefer Redis in multi-instance production; without it,
 * timeouts fall back to the scheduler job and locks/cache degrade gracefully.
 */
export function isRedisEnabled() {
  const d = process.env.REDIS_DISABLED;
  const e = process.env.REDIS_ENABLED;
  const isProduction = process.env.NODE_ENV === "production";

  // Default: disable Redis in Jest to avoid open handles + noisy retries.
  // Opt-in by setting REDIS_ENABLED=true.
  if (process.env.NODE_ENV === "test" && !(e === "true" || e === "1")) return false;
  if (d === "true" || d === "1") return false;
  if (e === "false" || e === "0") return false;

  // In production with Redis left enabled, require connection config so a
  // misconfigured deploy fails fast instead of silently running degraded.
  if (isProduction) {
    const hasConfig = !!(
      process.env.REDIS_URL ||
      process.env.REDIS_HOST ||
      e === "true" ||
      e === "1"
    );
    if (!hasConfig) {
      throw new Error(
        "Redis is enabled in production but not configured. " +
        "Set REDIS_URL or REDIS_HOST, or set REDIS_DISABLED=true to run without Redis."
      );
    }
  }

  return true;
}

/**
 * Single error handler so ioredis does not emit "Unhandled error event" when
 * Redis is down; logs are rate-limited.
 */
function attachRedisErrorHandler(client) {
  if (!client || client.__qcRedisErrorHandler) return;
  client.__qcRedisErrorHandler = true;

  client.on("connect", () => {
    _connectionAttempts = 0;
  });

  client.on("ready", () => {
    // suppress per-connection ready noise
  });

  client.on("error", (err) => {
    const now = Date.now();
    const interval = REDIS_ERROR_LOG_INTERVAL_MS();
    if (now - _lastSharedErrorLog > interval) {
      _lastSharedErrorLog = now;
      const message =
        `[Redis] ${err?.code || err?.message || String(err)} — ` +
        `set REDIS_DISABLED=true to run without Redis.`;
      console.warn(message);
    }
  });

  client.on("close", () => {
    // suppress close noise
  });

  client.on("reconnecting", () => {
    _connectionAttempts++;
  });
}

// Keep reconnecting forever (capped backoff). Giving up left the shared client
// permanently closed after a short outage, so Redis never came back until a restart.
function retryStrategy(times) {
  return Math.min(times * 200, 5000);
}

// Shared client fails fast: commands error out within REDIS_COMMAND_TIMEOUT_MS
// while Redis is unreachable, so callers drop to their in-memory/Mongo fallback
// instead of hanging the request. (Bull clients keep their own settings.)
// No offline queue: while disconnected, commands reject immediately instead of
// waiting, and the client connects eagerly so it is ready before traffic.
function sharedClientOptions() {
  return {
    lazyConnect: false,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || "2000", 10),
    retryStrategy,
  };
}

function standaloneOptions() {
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ...sharedClientOptions(),
  };
}

/**
 * Shared Redis client for caching / rate limits (optional).
 * Returns null when REDIS_DISABLED=true.
 */
export function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  _client = url
    ? new Redis(url, sharedClientOptions())
    : new Redis(standaloneOptions());

  attachRedisErrorHandler(_client);
  return _client;
}

/**
 * Bull passes (type, config) where config is merged from options.redis.
 * Mirrors bull/lib/queue.js defaults and attaches the same error handler.
 */
export function createBullRedisClient(type, config) {
  let client;
  if (typeof config === "string") {
    client = new Redis(config, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy,
    });
  } else if (["bclient", "subscriber"].includes(type)) {
    client = new Redis({
      ...config,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  } else {
    client = new Redis({
      ...config,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }
  attachRedisErrorHandler(client);
  return client;
}

/**
 * Parse REDIS_URL or host/port for Bull.
 */
export function getRedisOptionsForBull() {
  const url = process.env.REDIS_URL;
  if (url) {
    return url;
  }
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Validate Redis connectivity with PING command
 * @returns {Promise<boolean>} True if Redis responds to PING
 */
export async function validateRedisConnection() {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    console.error("[Redis] Validation failed:", error.message);
    return false;
  }
}

/**
 * Wait for Redis connection with exponential backoff retry logic
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @param {number} baseDelay - Base delay in ms (default: 1000)
 * @returns {Promise<void>}
 * @throws {Error} if connection fails after max retries
 */
export async function waitForRedis(maxRetries = 10, baseDelay = 1000) {
  if (!isRedisEnabled()) {
    return;
  }

  const client = getRedisClient();
  if (!client) {
    throw new Error("Redis client is not initialized");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const maxDelay = 30000; // 30 seconds max delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // lazyConnect: only start a connection if none is in progress; while
      // ioredis is reconnecting on its own, calling connect() would throw.
      if (client.status === "wait" || client.status === "end") {
        await client.connect();
      }
      // The shared client has no offline queue, so wait for "ready" before
      // PING rather than reporting a failure while it is still connecting.
      if (client.status !== "ready") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            client.off("ready", onReady);
            reject(new Error(`not ready (status: ${client.status})`));
          }, 5000);
          function onReady() {
            clearTimeout(timer);
            resolve();
          }
          client.once("ready", onReady);
        });
      }
      if (await validateRedisConnection()) {
        return;
      }
      throw new Error("PING did not return PONG");
    } catch (error) {
      if (attempt === maxRetries) {
        const errorMessage = `Failed to connect to Redis after ${maxRetries} attempts: ${error.message}`;
        // Production treats Redis as required when enabled (order-timeout queues
        // run on it), so stop here with a clear reason instead of claiming to
        // continue and then failing dependency validation.
        if (isProduction) {
          throw new Error(`${errorMessage}. Fix REDIS_URL or set REDIS_DISABLED=true.`);
        }
        console.warn(`[Redis] ${errorMessage} - Continuing without Redis (development only).`);
        return;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      console.log(
        `[Redis] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
