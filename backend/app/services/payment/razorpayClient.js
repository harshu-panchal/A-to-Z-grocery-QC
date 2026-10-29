/**
 * Minimal Razorpay REST client (orders + payments), no SDK dependency.
 *
 * Keys come from the environment only:
 *   RAZORPAY_KEY_ID      public key id (also sent to the browser checkout)
 *   RAZORPAY_KEY_SECRET  secret, server side only
 */
import crypto from "crypto";

const API_BASE = "https://api.razorpay.com/v1";

function getKeys() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    const err = new Error("Razorpay is not configured");
    err.statusCode = 503;
    throw err;
  }
  return { keyId, keySecret };
}

export function getRazorpayKeyId() {
  return getKeys().keyId;
}

async function request(method, path, body) {
  const { keyId, keySecret } = getKeys();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.description || `Razorpay request failed (${res.status})`);
    err.statusCode = res.status >= 500 ? 502 : 400;
    throw err;
  }
  return data;
}

/** amountPaise: integer paise. receipt: our reference (max 40 chars). */
export function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  return request("POST", "/orders", {
    amount: Math.round(amountPaise),
    currency: "INR",
    receipt: String(receipt).slice(0, 40),
    notes,
  });
}

export function fetchRazorpayOrder(orderId) {
  return request("GET", `/orders/${encodeURIComponent(orderId)}`);
}

export async function findRazorpayOrderByReceipt(receipt) {
  const data = await request("GET", `/orders?receipt=${encodeURIComponent(String(receipt).slice(0, 40))}&count=1`);
  return data?.items?.[0] || null;
}

export async function fetchRazorpayOrderPayments(orderId) {
  const data = await request("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * The order's successful payment, capturing it first if the account does not
 * auto-capture (an "authorized" payment is otherwise refunded by Razorpay).
 */
export async function getCapturedOrderPayment(orderId, paymentId = null) {
  const payments = await fetchRazorpayOrderPayments(orderId);
  const pick = (status) =>
    payments.find((p) => p.status === status && (!paymentId || p.id === paymentId));
  const captured = pick("captured");
  if (captured) return captured;
  const authorized = pick("authorized");
  if (!authorized) return null;
  return request("POST", `/payments/${encodeURIComponent(authorized.id)}/capture`, {
    amount: authorized.amount,
    currency: authorized.currency,
  });
}

/** Checkout handler signature: HMAC_SHA256(order_id|payment_id, secret). */
export function isValidRazorpaySignature({ orderId, paymentId, signature }) {
  const { keySecret } = getKeys();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
