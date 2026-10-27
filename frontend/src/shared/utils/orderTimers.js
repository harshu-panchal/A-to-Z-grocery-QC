/**
 * Seller accept window set by the admin (Fees & Charges → Order timers),
 * as readable text for customer messages. Falls back to 60 seconds.
 */
export function sellerAcceptWindowText(settings) {
  const sec = Math.round(Number(settings?.sellerAcceptTimeoutSec) || 60);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (!m) return `${s} seconds`;
  if (!s) return m === 1 ? "1 minute" : `${m} minutes`;
  return `${m} min ${s} sec`;
}
