/**
 * Joi schemas for product-review endpoints.
 *
 * Audit fix H4: `submitReview`/`updateReviewStatus` previously took
 * `rating`/`comment`/`status` straight from `req.body` with no length caps,
 * no enum validation, and no type check on `rating` — any authenticated
 * customer could submit a review with an out-of-range or non-numeric
 * rating, or an admin endpoint could accept an arbitrary status string.
 */
import Joi from "joi";

const trimmedString = Joi.string().trim();

export const submitReviewSchema = Joi.object({
  productId: trimmedString.min(1).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: trimmedString.min(2).max(2000).required(),
});

export const updateReviewStatusSchema = Joi.object({
  status: trimmedString.valid("approved", "rejected").required(),
});
