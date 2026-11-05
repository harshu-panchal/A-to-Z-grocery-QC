import mongoose from "mongoose";
import DiscountCampaign from "../../models/discountCampaign.js";
import CampaignParticipation from "../../models/campaignParticipation.js";
import Product from "../../models/product.js";
import Category from "../../models/category.js";
import { getApprovedOrLegacyFilter } from "../productModerationService.js";
import { calculateCategoryCommission } from "../finance/pricingService.js";
import {
  MAX_CAMPAIGN_DISCOUNT_PERCENT,
  basePriceOf,
  salePriceFor,
  isBelowCost,
  invalidateCampaignPriceIndex,
} from "./campaignPricing.js";

const isId = (v) => mongoose.isValidObjectId(v);
const idList = (list) =>
  Array.from(new Set((Array.isArray(list) ? list : []).map((v) => String(v?._id || v || "")).filter(isId)));

/**
 * draft | inviting | live | paused | ended | cancelled — what the campaign
 * is doing right now. Only "published" campaigns move with the clock.
 */
export function campaignPhase(campaign, now = new Date()) {
  if (!campaign) return "ended";
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "cancelled") return "cancelled";
  const t = now.getTime();
  if (t > new Date(campaign.endAt).getTime()) return "ended";
  if (campaign.status === "paused") return "paused";
  return t < new Date(campaign.startAt).getTime() ? "inviting" : "live";
}

/** Sellers can join / change their answer only before the sale starts and the deadline passes. */
export function canSellerRespond(campaign, now = new Date()) {
  return (
    campaign?.status === "published" &&
    now.getTime() <= new Date(campaign.joinDeadline).getTime() &&
    now.getTime() < new Date(campaign.startAt).getTime()
  );
}

/** Customer prices changed: drop every cache that holds them. */
export function onCampaignPricesChanged() {
  // Product / offer-section caches hold raw prices only (campaign prices are
  // applied after the cache read), so the price index is all there is.
  invalidateCampaignPriceIndex();
}

/**
 * Validate admin input. Returns { error } or { data } (normalized fields).
 * `existing` = the stored campaign when editing.
 */
export function normalizeCampaignInput(body = {}, existing = null) {
  const merged = { ...(existing || {}), ...body };
  const data = {};

  const name = String(merged.name || "").trim();
  if (!name) return { error: "Campaign name is required" };
  data.name = name.slice(0, 120);
  data.description = String(merged.description || "").trim().slice(0, 500);
  data.bannerImage = String(merged.bannerImage || "").trim();

  if (!["categories", "products"].includes(merged.targetType)) {
    return { error: "Choose what the campaign applies to (categories or products)" };
  }
  data.targetType = merged.targetType;
  data.categoryIds = data.targetType === "categories" ? idList(merged.categoryIds) : [];
  data.productIds = data.targetType === "products" ? idList(merged.productIds) : [];
  data.excludedProductIds = idList(merged.excludedProductIds);
  if (data.targetType === "categories" && !data.categoryIds.length) {
    return { error: "Pick at least one category" };
  }
  if (data.targetType === "products" && !data.productIds.length) {
    return { error: "Pick at least one product" };
  }

  if (!["percentage", "flat"].includes(merged.discountType)) {
    return { error: "Discount type must be percentage or flat" };
  }
  data.discountType = merged.discountType;
  const value = Number(merged.discountValue);
  if (!Number.isFinite(value) || value <= 0) return { error: "Discount must be more than 0" };
  if (data.discountType === "percentage" && value > MAX_CAMPAIGN_DISCOUNT_PERCENT) {
    return { error: `Discount cannot be more than ${MAX_CAMPAIGN_DISCOUNT_PERCENT}%` };
  }
  data.discountValue = value;
  const cap = merged.maxDiscount === "" || merged.maxDiscount == null ? null : Number(merged.maxDiscount);
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) return { error: "Max discount cannot be negative" };
  data.maxDiscount = data.discountType === "percentage" && cap > 0 ? cap : null;

  const joinDeadline = new Date(merged.joinDeadline);
  const startAt = new Date(merged.startAt);
  const endAt = new Date(merged.endAt);
  if ([joinDeadline, startAt, endAt].some((d) => Number.isNaN(d.getTime()))) {
    return { error: "Join deadline, start and end dates are required" };
  }
  if (endAt <= startAt) return { error: "End date must be after the start date" };
  if (joinDeadline > startAt) return { error: "Join deadline must be on or before the start date" };
  Object.assign(data, { joinDeadline, startAt, endAt });
  return { data };
}

/** Mongo filter for the products a campaign can include (any seller). */
export function eligibleProductFilter(campaign) {
  const filter = { status: "active", ...getApprovedOrLegacyFilter() };
  const and = [];
  // idList, not .map(String): the ids may be populated documents
  // (String(doc) is "[object Object]" and breaks the query).
  if (campaign.targetType === "products") {
    and.push({ _id: { $in: idList(campaign.productIds) } });
  } else {
    const ids = idList(campaign.categoryIds);
    and.push({ $or: [{ headerId: { $in: ids } }, { categoryId: { $in: ids } }, { subcategoryId: { $in: ids } }] });
  }
  const excluded = idList(campaign.excludedProductIds);
  if (excluded.length) and.push({ _id: { $nin: excluded } });
  return { ...filter, $and: and };
}

/** Invite every seller who has at least one eligible product. Returns invited seller ids. */
export async function inviteEligibleSellers(campaign) {
  const sellerIds = (await Product.distinct("sellerId", eligibleProductFilter(campaign)))
    .map(String)
    .filter(isId);
  if (sellerIds.length) {
    await CampaignParticipation.bulkWrite(
      sellerIds.map((sellerId) => ({
        updateOne: {
          filter: { campaignId: campaign._id, sellerId },
          update: { $setOnInsert: { campaignId: campaign._id, sellerId, status: "invited" } },
          upsert: true,
        },
      })),
    );
  }
  return sellerIds;
}

/**
 * Products of `sellerId` already joined into ANOTHER campaign whose dates
 * overlap this one (one campaign per product at a time).
 */
async function productsInOverlappingCampaigns(campaign, sellerId) {
  const overlapping = await DiscountCampaign.find({
    _id: { $ne: campaign._id },
    status: { $in: ["published", "paused"] },
    startAt: { $lt: campaign.endAt },
    endAt: { $gt: campaign.startAt },
  })
    .select("_id name")
    .lean();
  if (!overlapping.length) return new Map();
  const nameById = new Map(overlapping.map((c) => [String(c._id), c.name]));
  const parts = await CampaignParticipation.find({
    campaignId: { $in: overlapping.map((c) => c._id) },
    sellerId,
    status: "joined",
  })
    .select("campaignId productIds")
    .lean();
  const taken = new Map();
  for (const part of parts) {
    for (const pid of part.productIds || []) taken.set(String(pid), nameById.get(String(part.campaignId)));
  }
  return taken;
}

/**
 * The seller's eligible products for a campaign, each with a payout
 * preview and, when it can't join, the reason.
 */
export async function sellerCampaignProducts(campaign, sellerId) {
  const products = await Product.find({ ...eligibleProductFilter(campaign), sellerId })
    .select("_id name mainImage mrp sellingPrice purchaseRate headerId variants.name variants.sku variants.mrp variants.sellingPrice variants.purchaseRate")
    .sort({ name: 1 })
    .limit(500)
    .lean();
  if (!products.length) return [];

  const headerIds = idList(products.map((p) => p.headerId));
  const [categories, taken] = await Promise.all([
    Category.find({ _id: { $in: headerIds } })
      .select("_id adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
      .lean(),
    productsInOverlappingCampaigns(campaign, sellerId),
  ]);
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));

  return products.map((p) => {
    const category = categoryById.get(String(p.headerId));
    const regularPrice = basePriceOf(p);
    const salePrice = salePriceFor(regularPrice, campaign, p.purchaseRate) ?? regularPrice;
    const payoutNow = calculateCategoryCommission({ price: regularPrice, quantity: 1 }, category).sellerPayout;
    const payoutAfter = calculateCategoryCommission({ price: salePrice, quantity: 1 }, category).sellerPayout;

    let blockedReason = "";
    const belowCost =
      isBelowCost(regularPrice, campaign, p.purchaseRate) ||
      (p.variants || []).some((v) => isBelowCost(basePriceOf(v) || regularPrice, campaign, v.purchaseRate));
    if (taken.has(String(p._id))) blockedReason = `Already in "${taken.get(String(p._id))}"`;
    else if (belowCost) blockedReason = "Sale price would be below your purchase cost";
    else if (salePrice >= regularPrice) blockedReason = "Price too low for this discount";

    return {
      _id: p._id,
      name: p.name,
      mainImage: p.mainImage,
      regularPrice,
      salePrice,
      payoutNow,
      payoutAfter,
      variantCount: (p.variants || []).length,
      blockedReason,
    };
  });
}

export async function findCampaign(id) {
  if (!isId(id)) return null;
  return DiscountCampaign.findById(id);
}
