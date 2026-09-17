/**
 * Minimal Redis-backed distributed mutex, extracted for reuse outside
 * `distributedScheduler.js` (whose acquireLock/releaseLock hardcode a
 * `scheduler:lock:` key namespace and job-scheduling semantics).
 *
 * Audit fix M2: withdrawal requests (seller + delivery) computed
 * `availableBalance` from a read, then separately created a new `Pending`
 * withdrawal `Transaction` — with no lock tying the read to the write.
 * Firing two withdrawal requests concurrently (double-tap, scripted) could
 * pass the balance check twice before either `Pending` transaction was
 * visible to the other, letting a seller/rider request withdrawals
 * exceeding their real available balance.
 *
 * Uses `SET key value PX ttl NX` for atomic acquire and a compare-then-del
 * for release (only the lock holder can release its own lock). Degrades
 * to "no lock" when Redis is unavailable, consistent with how the rest of
 * the codebase treats Redis as an optional accelerator rather than a hard
 * dependency — callers that need a hard guarantee should pair this with a
 * DB-level invariant, but for the withdrawal race the practical risk
 * (Redis down AND a concurrent double-submit within the same request)
 * is low enough that failing open here is preferable to blocking every
 * withdrawal whenever Redis is unavailable.
 */
import { getRedisClient } from "../config/redis.js";
import logger from "../services/logger.js";

export async function withLock(lockKey, ttlMs, fn) {
  const client = getRedisClient();
  if (!client) {
    return fn();
  }

  const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  let acquired = false;
  try {
    const result = await client.set(lockKey, lockValue, "PX", ttlMs, "NX");
    acquired = result === "OK";
  } catch (error) {
    logger.warn?.("distributedLock acquire failed, proceeding without lock", {
      lockKey,
      error: error?.message,
    });
    return fn();
  }

  if (!acquired) {
    const err = new Error("Another request is already in progress. Please try again.");
    err.statusCode = 409;
    throw err;
  }

  try {
    return await fn();
  } finally {
    try {
      const currentValue = await client.get(lockKey);
      if (currentValue === lockValue) {
        await client.del(lockKey);
      }
    } catch (error) {
      logger.warn?.("distributedLock release failed", { lockKey, error: error?.message });
    }
  }
}
