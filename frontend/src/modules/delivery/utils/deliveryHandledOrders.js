/**
 * Persist order IDs for which the incoming-offer modal should never show again
 * (accept/skip/view active order). Sessions are bounded by:
 *   - MAX_ENTRIES  → keeps the list from growing unboundedly across a long shift
 *   - ENTRY_TTL_MS → drops stale IDs so a 3-day-old "skipped" offer can resurface
 *                    if the dispatcher ever re-offers it later.
 *
 * Stored as `{ ids: [{ id, ts }] }` envelopes; legacy `string[]` payloads are
 * still understood and silently migrated on the next write.
 */

import { rawGet, rawSet, rawRemove, safeParseJson, STORAGE_KEYS } from "@core/utils/storage";

export const HANDLED_INCOMING_ORDER_IDS_KEY = STORAGE_KEYS.DELIVERY_HANDLED_INCOMING;

const MAX_ENTRIES = 200;
const ENTRY_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours covers a single rider shift

// localStorage so the list survives page refreshes / app restarts (sessionStorage
// was lost on some mobile reloads, making handled offers pop up again).
const STORAGE = "local";

function parseEntries(raw, now) {
  const parsed = safeParseJson(raw, null);

  if (Array.isArray(parsed)) {
    return parsed.map((id) => ({ id: String(id), ts: now }));
  }

  if (parsed && Array.isArray(parsed.ids)) {
    return parsed.ids
      .filter((entry) => entry && typeof entry.id === "string")
      .filter((entry) => {
        const ts = typeof entry.ts === "number" ? entry.ts : 0;
        return ENTRY_TTL_MS <= 0 || now - ts <= ENTRY_TTL_MS;
      });
  }

  return [];
}

function readEnvelope() {
  const now = Date.now();
  const entries = parseEntries(rawGet(HANDLED_INCOMING_ORDER_IDS_KEY, { storage: STORAGE }), now);

  // Merge entries written by older builds to sessionStorage
  const legacy = parseEntries(rawGet(HANDLED_INCOMING_ORDER_IDS_KEY, { storage: "session" }), now);
  if (legacy.length) {
    const known = new Set(entries.map((e) => e.id));
    legacy.forEach((e) => !known.has(e.id) && entries.push(e));
    rawRemove(HANDLED_INCOMING_ORDER_IDS_KEY, { storage: "session" });
  }

  return entries;
}

function writeEnvelope(entries) {
  if (!entries.length) {
    rawRemove(HANDLED_INCOMING_ORDER_IDS_KEY, { storage: STORAGE });
    return;
  }
  const trimmed = entries
    .slice(-MAX_ENTRIES)
    .map((entry) => ({ id: String(entry.id), ts: entry.ts || Date.now() }));
  try {
    rawSet(
      HANDLED_INCOMING_ORDER_IDS_KEY,
      JSON.stringify({ ids: trimmed }),
      { storage: STORAGE },
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Handled-list key for an offer. A return pickup reuses the orderId of the
 * original delivery, so it gets its own key; otherwise the rider who
 * delivered the order (or skipped it) never saw the return pickup popup.
 */
export function incomingOfferKey(orderId, isReturnPickup = false) {
  if (!orderId) return "";
  return isReturnPickup ? `${orderId}:return` : String(orderId);
}

export function loadHandledIncomingOrderIds() {
  return readEnvelope().map((entry) => entry.id);
}

export function markIncomingOrderHandled(orderId) {
  if (!orderId) return;
  const id = String(orderId);
  const entries = readEnvelope().filter((entry) => entry.id !== id);
  entries.push({ id, ts: Date.now() });
  writeEnvelope(entries);
}
