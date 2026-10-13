/**
 * PhonePe for POS (online counter sales and credit repayments).
 * Reuses the app's PhonePe adapter; POS merchant order ids start with "POS"
 * so the shared webhook ignores them (it only knows online-order payments).
 * Completion is confirmed by asking PhonePe for the status on verify.
 */
import crypto from "crypto";
import { getActivePaymentProvider } from "../payment/providerRegistry.js";

const frontendBase = () => String(process.env.FRONTEND_URL || "").replace(/\/$/, "");

export function newPosMerchantOrderId(kind) {
  const tag = kind === "credit" ? "POSC" : "POSS";
  return `${tag}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Start a PhonePe checkout. Returns { redirectUrl }.
 * The customer pays on PhonePe and is sent back to the POS return page,
 * which calls verify.
 */
export async function startPosPhonePe({ merchantOrderId, amountRupees, portal }) {
  const provider = getActivePaymentProvider();
  const redirectUrl = `${frontendBase()}/${portal}/pos/payment-return?mo=${encodeURIComponent(merchantOrderId)}`;
  const callbackBase = String(process.env.BACKEND_URL || process.env.API_BASE_URL || "").replace(/\/$/, "");
  const result = await provider.initiatePayment({
    merchantOrderId,
    amountPaise: Math.round(Number(amountRupees) * 100),
    redirectUrl,
    callbackUrl: callbackBase ? `${callbackBase}/api/payment/webhook/phonepe` : redirectUrl,
  });
  return { redirectUrl: result.redirectUrl };
}

/** Ask PhonePe for the payment state: "completed" | "failed" | "pending". */
export async function checkPosPhonePe(merchantOrderId) {
  const provider = getActivePaymentProvider();
  const resp = await provider.getPaymentStatus({ merchantOrderId });
  const state = String(resp.state || "").toUpperCase();
  return {
    status: state === "COMPLETED" ? "completed" : state === "FAILED" ? "failed" : "pending",
    transactionId: resp.transactionId || "",
    state,
  };
}
