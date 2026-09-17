import express from "express";
import {
    signupSeller,
    loginSeller,
    sendSellerSignupOtp,
    verifySellerSignupOtp,
    sendSellerResetOtp,
    verifySellerResetOtp,
    resetSellerPassword,
    checkSellerExists,
} from "../controller/sellerAuthController.js";
import { getSellerProfile, updateSellerProfile, requestWithdrawal, getNearbySellers, getSellerSidebarBadgesController } from "../controller/sellerController.js";
import { getSellerStats, getSellerEarnings } from "../controller/sellerStatsController.js";
import { getSellerWalletSummaryController } from "../controller/adminFinanceController.js";
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
const sellerOtpPayloadGuard = createContentLengthGuard(
    parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
    "Verification payload too large",
);

router.post(
    "/verification/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    sendSellerSignupOtp
);
router.post(
    "/verification/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    verifySellerSignupOtp
);

// Forgot / Reset Password
router.post(
    "/forgot-password/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    sendSellerResetOtp
);
router.post(
    "/forgot-password/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    verifySellerResetOtp
);
router.post(
    "/reset-password",
    authRouteRateLimiter,
    sellerOtpPayloadGuard,
    resetSellerPassword
);

router.post(
    "/signup",
    authRouteRateLimiter,
    upload.any(),
    signupSeller
);
router.post("/check-exists", authRouteRateLimiter, sellerOtpPayloadGuard, checkSellerExists);
router.post("/login", authRouteRateLimiter, sellerOtpPayloadGuard, loginSeller);
router.get("/nearby", getNearbySellers);

// Profile routes
router.get(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    getSellerProfile
);

router.put(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    updateSellerProfile
);

// Analytics & Financials
router.get("/stats", verifyToken, allowRoles("seller"), getSellerStats);
router.get(
  "/sidebar-badges",
  verifyToken,
  allowRoles("seller"),
  getSellerSidebarBadgesController,
);
router.get("/earnings", verifyToken, allowRoles("seller"), getSellerEarnings);
router.get("/wallet/summary", verifyToken, allowRoles("seller"), getSellerWalletSummaryController);
router.post("/request-withdrawal", verifyToken, allowRoles("seller"), requestWithdrawal);

export default router;
