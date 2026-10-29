/**
 * RazorpayAdapter
 *
 * Razorpay pays in a popup on our own page (Checkout.js), not by redirect:
 * initiatePayment creates a Razorpay order (receipt = our merchantOrderId)
 * and returns what the browser needs to open the popup. After the popup the
 * customer lands on /payment-status, which asks the server for the status;
 * the server reads it straight from Razorpay, so the browser is never trusted.
 */
import { PAYMENT_STATUS, PAYMENT_GATEWAY } from "../../../constants/payment.js";
import { PaymentProviderPort } from "../ports/paymentProviderPort.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  findRazorpayOrderByReceipt,
  getCapturedOrderPayment,
  getRazorpayKeyId,
} from "../razorpayClient.js";

export class RazorpayAdapter extends PaymentProviderPort {
  get providerName() {
    return PAYMENT_GATEWAY.RAZORPAY;
  }

  // eslint-disable-next-line no-unused-vars
  async initiatePayment({ merchantOrderId, amountPaise, redirectUrl, callbackUrl }) {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: merchantOrderId,
      notes: { merchantOrderId },
    });
    return {
      redirectUrl: null,
      checkout: {
        provider: "razorpay",
        keyId: getRazorpayKeyId(),
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: order.currency,
        statusUrl: redirectUrl,
      },
      gatewayResponse: order,
    };
  }

  async getPaymentStatus({ merchantOrderId, payment }) {
    // the Razorpay order id is saved on the payment when it is created
    const razorpayOrderId = payment?.rawGatewayResponse?.checkout?.razorpayOrderId;
    const order = razorpayOrderId
      ? await fetchRazorpayOrder(razorpayOrderId)
      : await findRazorpayOrderByReceipt(merchantOrderId);
    if (!order) return { state: "CREATED", gatewayResponse: null };
    if (order.status === "paid" || order.status === "attempted") {
      const captured = await getCapturedOrderPayment(order.id);
      if (captured) return { state: "PAID", transactionId: captured.id, gatewayResponse: order };
    }
    // "attempted": a try failed or is still running; the customer can retry
    return { state: String(order.status || "created").toUpperCase(), gatewayResponse: order };
  }

  async validateWebhook() {
    return false; // status is confirmed by polling Razorpay, no webhook route
  }

  async decodeWebhookPayload() {
    const err = new Error("Razorpay webhooks are not used");
    err.statusCode = 400;
    throw err;
  }

  mapStatusToInternal(gatewayState) {
    return String(gatewayState || "").toUpperCase() === "PAID"
      ? PAYMENT_STATUS.CAPTURED
      : PAYMENT_STATUS.PENDING;
  }
}

export default RazorpayAdapter;
