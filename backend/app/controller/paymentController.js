import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyPaymentStatus as checkPaymentWithGateway,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  validateSchema,
} from "../validation/paymentValidation.js";
import logger from "../services/logger.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Payment gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Payment gateway request failed (${causeCode})`;

  return "Unable to start the payment right now";
}

export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        redirectUrl: result.redirectUrl,
        // Razorpay: the browser opens the payment popup with this
        checkout: result.checkout || null,
        merchantOrderId: result.payment.gatewayOrderId,
      },
    );
  } catch (error) {
    logger.error("createPaymentOrder failed", {
      scope: "PaymentController.createPaymentOrder",
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id || req.query.merchantOrderId;
    
    if (!merchantOrderId) {
        return handleResponse(res, 400, "merchantOrderId is required");
    }

    const verification = await checkPaymentWithGateway({
      merchantOrderId,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantOrderId = id;
    
        const verification = await checkPaymentWithGateway({
          merchantOrderId,
          userId: req.user?.id,
          correlationId: req.correlationId || null,
        });
    
        return handleResponse(res, 200, "Payment status retrieved", {
          status: verification.status,
          merchantOrderId: verification.payment.gatewayOrderId,
          amount: verification.payment.amount,
          currency: verification.payment.currency,
        });
      } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
      }
};
