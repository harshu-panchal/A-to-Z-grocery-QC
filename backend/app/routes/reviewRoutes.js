import express from "express";
import {
    submitReview,
    getProductReviews,
    getPendingReviews,
    updateReviewStatus
} from "../controller/reviewController.js";
import { verifyToken, allowRoles, optionalVerifyToken } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { submitReviewSchema, updateReviewStatusSchema } from "../validation/reviewValidation.js";

const router = express.Router();

// Public routes
router.get("/product/:productId", optionalVerifyToken, getProductReviews);

// Authenticated User routes
router.post("/submit", verifyToken, validate(submitReviewSchema), submitReview);

// Admin only routes
router.get("/admin/pending", verifyToken, allowRoles("admin"), getPendingReviews);
router.patch(
  "/admin/status/:id",
  verifyToken,
  allowRoles("admin"),
  validate(updateReviewStatusSchema),
  updateReviewStatus,
);

export default router;
