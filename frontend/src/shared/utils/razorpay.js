/**
 * Razorpay Checkout popup. The script loads on first use only.
 */
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise = null;

function loadRazorpayScript() {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null; // allow a retry
        reject(new Error("Could not load Razorpay. Check your internet and try again."));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Open the popup for a Razorpay order created on the server.
 * Resolves with { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * on success; rejects with `dismissed: true` when the user closes it.
 */
export async function openRazorpayCheckout({ keyId, razorpayOrderId, amount, currency = "INR", name, description, prefill }) {
  await loadRazorpayScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount,
      currency,
      name: name || "A to Z Grocery",
      description,
      prefill,
      theme: { color: "#0c831f" },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => {
          const err = new Error("Payment cancelled");
          err.dismissed = true;
          reject(err);
        },
      },
    });
    rzp.on("payment.failed", (response) => {
      // the popup stays open so the user can retry; just surface the reason
      console.warn("Razorpay payment failed:", response?.error?.description);
    });
    rzp.open();
  });
}
