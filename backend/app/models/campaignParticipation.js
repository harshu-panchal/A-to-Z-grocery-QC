import mongoose from "mongoose";

/**
 * One seller's answer to one campaign. Created as "invited" when admin
 * publishes; the seller moves it to "joined" (with the products they chose)
 * or "declined". Only joined products get the campaign price.
 */
const campaignParticipationSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "DiscountCampaign", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    status: {
      type: String,
      enum: ["invited", "joined", "declined"],
      default: "invited",
    },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    // Products admin took out after the seller joined (kept for the record).
    removedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

campaignParticipationSchema.index({ campaignId: 1, sellerId: 1 }, { unique: true });
campaignParticipationSchema.index({ sellerId: 1, status: 1 });
campaignParticipationSchema.index({ status: 1, productIds: 1 });

export default mongoose.model("CampaignParticipation", campaignParticipationSchema);
