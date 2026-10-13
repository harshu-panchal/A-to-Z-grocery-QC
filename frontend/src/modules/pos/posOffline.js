/**
 * Offline support for the POS terminal and weighing-scale barcodes.
 *
 * - Catalogue cache: every product row the terminal sees is kept on the
 *   device, so search and scanning keep working without internet.
 * - Bill queue: bills made offline are stored with a device id (clientRef)
 *   and uploaded later; the server ignores a clientRef it already saved.
 */
import { loadLocal, saveLocal, storageKey, round2 } from "./posUtils";

const MAX_CACHE = 1500;

// -------------------------------------------------------- catalogue cache
export function cacheRows(portal, rows) {
  if (!rows?.length) return;
  const key = storageKey(portal, "catalog");
  const map = new Map(loadLocal(key, []).map((r) => [`${r.productId}::${r.variantSku}`, r]));
  for (const r of rows) map.set(`${r.productId}::${r.variantSku}`, { ...r, cachedAt: Date.now() });
  const all = [...map.values()].sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0)).slice(0, MAX_CACHE);
  saveLocal(key, all);
}

export function searchCache(portal, { search = "", barcode = "" } = {}) {
  const rows = loadLocal(storageKey(portal, "catalog"), []);
  const code = String(barcode).trim();
  if (code) return rows.filter((r) => r.barcode === code || r.sku === code);
  const term = String(search).trim().toLowerCase();
  if (!term) return rows.slice(0, 48);
  return rows.filter((r) => `${r.name} ${r.variantName} ${r.sku} ${r.barcode}`.toLowerCase().includes(term)).slice(0, 48);
}

/** True when the request never reached the server (no internet / server down). */
export const isNetworkError = (err) => !err?.response && (err?.code === "ERR_NETWORK" || err?.message === "Network Error" || !navigator.onLine || err?.code === "ECONNABORTED");

// --------------------------------------------------------------- bill queue
const queueKey = (portal) => storageKey(portal, "offline_queue");
export const loadQueue = (portal) => loadLocal(queueKey(portal), []);
export const saveQueue = (portal, q) => saveLocal(queueKey(portal), q);
export const newClientRef = (portal) => `${portal}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function queueBill(portal, entry) {
  const q = loadQueue(portal);
  if (!q.some((e) => e.clientRef === entry.clientRef)) q.push(entry);
  saveQueue(portal, q);
  return q.length;
}

const syncing = {};

/**
 * Upload queued bills; returns { synced, failed, left }.
 * One run at a time per portal, and only bills that really uploaded are
 * removed from the latest queue (a bill queued meanwhile is kept).
 */
export async function syncQueue(portal, api) {
  if (syncing[portal]) return { synced: 0, failed: 0, left: loadQueue(portal).length };
  syncing[portal] = true;
  try {
    const q = loadQueue(portal);
    const done = new Set();
    const errors = {};
    for (const entry of q) {
      try {
        await api.createOrder({ ...entry.payload, clientRef: entry.clientRef, offline: true, billedAt: entry.billedAt });
        done.add(entry.clientRef);
      } catch (err) {
        if (isNetworkError(err)) break; // still offline: try the rest later
        errors[entry.clientRef] = err?.response?.data?.message || err.message;
      }
    }
    const left = loadQueue(portal)
      .filter((e) => !done.has(e.clientRef))
      .map((e) => (errors[e.clientRef] ? { ...e, error: errors[e.clientRef] } : e));
    saveQueue(portal, left);
    return { synced: done.size, failed: Object.keys(errors).length, left: left.length };
  } finally {
    syncing[portal] = false;
  }
}

// ----------------------------------------------------- weighing scale codes
export const DEFAULT_SCALE = { enabled: false, prefix: "21", pluLength: 5, valueType: "weight" };

/**
 * Parse an EAN-13 printed by a shop scale: <prefix><PLU><value><check>.
 * weight: value is grams -> quantity in kg. price: value is paise.
 * Returns { plu, quantity?, amount? } or null.
 */
export function parseScaleBarcode(code, scale = DEFAULT_SCALE) {
  const s = { ...DEFAULT_SCALE, ...(scale || {}) };
  const c = String(code).trim();
  if (!s.enabled || !/^\d{13}$/.test(c) || !c.startsWith(s.prefix)) return null;
  const pluStart = s.prefix.length;
  const plu = c.slice(pluStart, pluStart + Number(s.pluLength));
  const value = Number(c.slice(pluStart + Number(s.pluLength), 12));
  if (!plu || !(value > 0)) return null;
  // grams -> kg keeps 3 decimals (1.234 kg), paise -> rupees keeps 2
  return s.valueType === "price" ? { plu, amount: round2(value / 100) } : { plu, quantity: Math.round(value) / 1000 };
}
