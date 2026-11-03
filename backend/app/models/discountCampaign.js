import mongoose from "mongoose";

/**
 * Seller-funded sale campaign. Admin defines the discount and the target;
 * sellers opt their own products in (CampaignParticipation). The discount
 * only ever applies to products a seller joined.
 *
 * `status` is what admin set; the live phase (inviting / live / ended) is
 * derived from the dates — see campaignPhase() in campaignService.
 */
const discountCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    bannerImage: { type: String, trim: true, default: "" },

    // "categories": products whose header, category or subcategory is in
    // categoryIds. "products": exactly productIds.
    targetType: { type: String, enum: ["categories", "products"], required: true },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    excludedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    discountType: { type: String, enum: ["percentage", "flat"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    // Per-unit cap for percentage discounts (₹). Optional.
    maxDiscount: { type: Number, min: 0, default: null },

    joinDeadline: { type: Date, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["draft", "published", "paused", "cancelled"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

discountCampaignSchema.index({ status: 1, startAt: 1, endAt: 1 });

export default mongoose.model("DiscountCampaign", discountCampaignSchema);
