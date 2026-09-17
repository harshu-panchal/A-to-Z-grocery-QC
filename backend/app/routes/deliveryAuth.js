import express from "express";
import {
  signupDelivery,
  loginDelivery,
  verifyDeliveryOTP,
  getDeliveryProfile,
  updateDeliveryProfile,
} from "../controller/deliveryAuthController.js";
import {
  getDeliveryStats,
  getDeliveryEarnings,
  getDeliveryCodCashSummary,
  submitDeliveryCodCashToAdmin,
  getMyDeliveryOrders,
  requestWithdrawal,
  updateDeliveryLocation,
} from "../controller/deliveryController.js";
import { getRiderWalletSummaryController } from "../controller/adminFinanceController.js";

import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  authRouteRateLimiter,
  createContentLengthGuard,
  otpRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";
import multer from "multer";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MEDIA_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10),
    files: 10,
  },
});
const smallAuthPayload = createContentLengthGuard(
  parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
  "Auth payload too large",
);

router.post(
  "/send-signup-otp",
  authRouteRateLimiter,
  otpRouteRateLimiter,
  upload.any(),
  signupDelivery,
);
router.post("/send-login-otp", authRouteRateLimiter, otpRouteRateLimiter, smallAuthPayload, loginDelivery);
router.post("/verify-otp", authRouteRateLimiter, otpRouteRateLimiter, smallAuthPayload, verifyDeliveryOTP);

// Profile routes
router.get("/profile", verifyToken, getDeliveryProfile);
router.put("/profile", verifyToken, updateDeliveryProfile);
router.get("/stats", verifyToken, getDeliveryStats);
router.get("/earnings", verifyToken, getDeliveryEarnings);
router.get("/cod/summary", verifyToken, allowRoles("delivery"), getDeliveryCodCashSummary);
router.post("/cod/pay", verifyToken, allowRoles("delivery"), submitDeliveryCodCashToAdmin);
router.get("/wallet/summary", verifyToken, allowRoles("delivery"), getRiderWalletSummaryController);
router.get(
  "/order-history",
  verifyToken,
  allowRoles("delivery"),
  getMyDeliveryOrders,
);
router.post("/request-withdrawal", verifyToken, requestWithdrawal);
router.post("/location", verifyToken, updateDeliveryLocation);

// NOTE: Delivery-completion OTP generation/validation lives on the
// canonical workflow routes:
//   POST /orders/workflow/:orderId/otp/request
//   POST /orders/workflow/:orderId/otp/verify
// The previous /delivery/orders/:orderId/(generate|validate)-otp
// endpoints were removed once the workflow state machine became the
// single source of truth (see backend/app/services/orderWorkflowService.js
// requestHandoffOtpAtomic / verifyHandoffOtpAndDeliver).

export default router;
