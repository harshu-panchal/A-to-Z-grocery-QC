/**
 * Admin-controlled accept windows (Admin → Billing & Charges → Order timers).
 *
 *   sellerAcceptTimeoutSec       seller must accept a new order (the customer
 *                                waits on the same countdown); else cancelled
 *   deliveryAcceptTimeoutSec     a delivery offer stays open for riders
 *   returnPickupAcceptTimeoutSec a return-pickup offer stays open for riders
 *
 * The timers are read synchronously all over the order workflow, so the values
 * live in memory: loaded at startup, refreshed from the DB every 30s (keeps
 * API and worker processes in step) and updated at once when the admin saves.
 * Until a value is known, callers fall back to their env default.
 */
import mongoose from "mongoose";

export const ORDER_TIMEOUT_FIELDS = [
  "sellerAcceptTimeoutSec",
  "deliveryAcceptTimeoutSec",
  "returnPickupAcceptTimeoutSec",
];

export const MIN_ORDER_TIMEOUT_SEC = 15;
export const MAX_ORDER_TIMEOUT_SEC = 600;

const REFRESH_MS = 30 * 1000;

const cache = {
  sellerAcceptTimeoutSec: null,
  deliveryAcceptTimeoutSec: null,
  returnPickupAcceptTimeoutSec: null,
  loadedAt: 0,
};
let loading = null;

const toSeconds = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_ORDER_TIMEOUT_SEC, Math.max(MIN_ORDER_TIMEOUT_SEC, n));
};

/** Take the timer values from a settings document (e.g. right after an admin save). */
export function applyOrderTimeoutSettings(settings) {
  if (!settings) return;
  for (const field of ORDER_TIMEOUT_FIELDS) {
    cache[field] = toSeconds(settings[field]);
  }
  cache.loadedAt = Date.now();
}

/** Load the current values from the DB (startup and periodic refresh). */
export async function loadOrderTimeoutSettings() {
  if (loading) return loading;
  // without a live DB connection the query would just queue (scripts/tests)
  if (mongoose?.connection?.readyState !== 1) {
    cache.loadedAt = Date.now();
    return null;
  }
  loading = (async () => {
    try {
      const { default: Setting } = await import("../models/setting.js");
      const doc = await Setting.findOne({
        $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
      })
        .select(ORDER_TIMEOUT_FIELDS.join(" "))
        .lean();
      applyOrderTimeoutSettings(doc || {});
    } catch {
      // DB not reachable (scripts/tests): keep current values / env defaults
      cache.loadedAt = Date.now();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Configured window in ms, or null to use the caller's default. Never blocks. */
export function getOrderTimeoutMs(field) {
  if (Date.now() - cache.loadedAt > REFRESH_MS) {
    // background refresh: a failure must never break an order flow
    Promise.resolve()
      .then(loadOrderTimeoutSettings)
      .catch(() => {
        cache.loadedAt = Date.now();
      });
  }
  const seconds = cache[field];
  return seconds ? seconds * 1000 : null;
}
