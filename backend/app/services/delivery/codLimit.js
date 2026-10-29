/**
 * COD cash limit for delivery partners.
 *
 * A rider may hold at most `limit` rupees of platform COD cash (Wallet
 * cashInHand, which is net of the rider's own commission). The limit is the
 * rider's own `Delivery.limit` when the admin set one, else the default from
 * Admin → Fees & Charges (`Setting.deliveryCodCashLimit`).
 *
 * A COD order is offered / accepted only if the rider stays within the limit
 * AFTER collecting it: cashInHand + this order's cash <= limit.
 */
import mongoose from "mongoose";
import { roundCurrency } from "../../utils/money.js";

export const FALLBACK_COD_CASH_LIMIT = 5000;
const REFRESH_MS = 30 * 1000;

let cached = { value: null, at: 0 };

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Default limit set by the admin (refreshed every 30s, updated at once on save). */
export async function getDefaultCodCashLimit() {
  if (cached.value != null && Date.now() - cached.at < REFRESH_MS) return cached.value;
  if (mongoose.connection?.readyState === 1) {
    try {
      const { default: Setting } = await import("../../models/setting.js");
      const doc = await Setting.findOne({}).select("deliveryCodCashLimit").lean();
      cached = { value: positive(doc?.deliveryCodCashLimit) ?? FALLBACK_COD_CASH_LIMIT, at: Date.now() };
      return cached.value;
    } catch {
      /* keep the last known value */
    }
  }
  return cached.value ?? FALLBACK_COD_CASH_LIMIT;
}

/** Called after the admin saves settings so the new limit applies right away. */
export function applyDefaultCodCashLimit(value) {
  const n = positive(value);
  if (n) cached = { value: n, at: Date.now() };
}

/** The rider's own limit, else the default. */
export function riderCodLimit(rider, defaultLimit) {
  return positive(rider?.limit) ?? defaultLimit;
}

export function isCodOrder(order) {
  const method = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase();
  return order?.paymentMode === "COD" || method === "cod" || method === "cash";
}

/** Cash this order adds to the rider's balance: order total minus rider commission. */
export function codOrderCashAmount(order) {
  const gross = Number(order?.paymentBreakdown?.grandTotal ?? order?.pricing?.total ?? 0);
  const commission = Number(order?.paymentBreakdown?.riderPayoutTotal ?? 0);
  return roundCurrency(Math.max(gross - commission, 0));
}

export function fitsCodLimit(cashInHand, limit, orderCash) {
  return Number(cashInHand || 0) + Number(orderCash || 0) <= Number(limit) + 0.01;
}
