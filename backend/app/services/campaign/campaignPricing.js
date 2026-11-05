import DiscountCampaign from "../../models/discountCampaign.js";
import CampaignParticipation from "../../models/campaignParticipation.js";
import Product from "../../models/product.js";
import { roundCurrency } from "../../utils/money.js";

/**
 * Campaign price engine: the ONE place that decides a product's sale price.
 * Customer-facing reads (list, detail, cart, wishlist, offer sections) and
 * checkout (hydrateOrderItems) all go through here, so the price a customer
 * sees is the price they are charged.
 *
 * Real product prices are never written to; the sale price is applied on
 * the way out, so a campaign ending (or being paused) restores prices with
 * nothing to undo.
 */

// No single campaign may take more than this off a unit price.
export const MAX_CAMPAIGN_DISCOUNT_PERCENT = Math.min(
  100,
  Math.max(1, Number(process.env.MAX_CAMPAIGN_DISCOUNT_PERCENT || 50)),
);

const INDEX_TTL_MS = 60 * 1000;

/** Unit price the customer pays today without a campaign (same rule as checkout). */
export function basePriceOf(item) {
  const sale = Number(item?.sellingPrice);
  if (Number.isFinite(sale) && sale > 0) return sale;
  const mrp = Number(item?.mrp);
  return Number.isFinite(mrp) && mrp > 0 ? mrp : 0;
}

/** ₹ taken off one unit priced `basePrice`, before the cost floor. */
export function campaignDiscountFor(basePrice, campaign) {
  const base = Number(basePrice);
  if (!(base > 0) || !campaign) return 0;
  const value = Number(campaign.discountValue) || 0;
  let discount = campaign.discountType === "flat" ? value : (base * value) / 100;
  const cap = Number(campaign.maxDiscount);
  if (campaign.discountType !== "flat" && cap > 0) discount = Math.min(discount, cap);
  discount = Math.min(discount, (base * MAX_CAMPAIGN_DISCOUNT_PERCENT) / 100);
  return roundCurrency(Math.max(discount, 0));
}

/**
 * Sale price for one unit, never below `cost` (purchase rate) when known.
 * Returns null when the campaign doesn't lower the price.
 */
export function salePriceFor(basePrice, campaign, cost = 0) {
  const base = Number(basePrice);
  if (!(base > 0)) return null;
  let sale = roundCurrency(base - campaignDiscountFor(base, campaign));
  const floor = Number(cost) || 0;
  if (floor > 0 && sale < floor) sale = roundCurrency(Math.min(base, floor));
  return sale < base ? sale : null;
}

/** True when the campaign would push this price below cost (seller can't join it). */
export function isBelowCost(basePrice, campaign, cost = 0) {
  const floor = Number(cost) || 0;
  if (!(floor > 0)) return false;
  const raw = roundCurrency(Number(basePrice) - campaignDiscountFor(basePrice, campaign));
  return raw < floor;
}

export function discountLabel(campaign) {
  if (!campaign) return "";
  const value = Number(campaign.discountValue) || 0;
  if (campaign.discountType === "flat") return `₹${value} off`;
  const cap = Number(campaign.maxDiscount);
  return `${value}% off${cap > 0 ? ` up to ₹${cap}` : ""}`;
}

const variantKeys = (v) =>
  [String(v?.sku || "").trim(), String(v?.name || "").trim()].filter(Boolean);

function summarize(campaign) {
  return {
    _id: String(campaign._id),
    name: campaign.name,
    discountType: campaign.discountType,
    discountValue: campaign.discountValue,
    maxDiscount: campaign.maxDiscount,
    endAt: campaign.endAt,
  };
}

/**
 * productId -> { campaign, cost, variantCost } for every product a seller
 * joined into a campaign that is live right now.
 */
export async function buildCampaignPriceIndex(now = new Date()) {
  const [campaigns, nextStart] = await Promise.all([
    DiscountCampaign.find({ status: "published", startAt: { $lte: now }, endAt: { $gte: now } })
      .select("_id name discountType discountValue maxDiscount endAt excludedProductIds createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    DiscountCampaign.findOne({ status: "published", startAt: { $gt: now } })
      .select("startAt")
      .sort({ startAt: 1 })
      .lean(),
  ]);

  // Rebuild at the next start/end so prices switch on time, not up to a TTL late.
  let expiresAt = now.getTime() + INDEX_TTL_MS;
  if (nextStart?.startAt) expiresAt = Math.min(expiresAt, new Date(nextStart.startAt).getTime());
  for (const c of campaigns) expiresAt = Math.min(expiresAt, new Date(c.endAt).getTime() + 1);

  const byProduct = new Map();
  if (!campaigns.length) return { byProduct, expiresAt };

  const campaignById = new Map(campaigns.map((c) => [String(c._id), c]));
  const participations = await CampaignParticipation.find({
    campaignId: { $in: campaigns.map((c) => c._id) },
    status: "joined",
  })
    .select("campaignId sellerId productIds")
    .lean();

  const productIds = participations.flatMap((p) => p.productIds || []);
  if (!productIds.length) return { byProduct, expiresAt };

  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id sellerId purchaseRate variants.sku variants.name variants.purchaseRate")
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  // Oldest campaign first, so if a product were ever in two, the first one wins.
  participations.sort(
    (a, b) =>
      new Date(campaignById.get(String(a.campaignId))?.createdAt || 0) -
      new Date(campaignById.get(String(b.campaignId))?.createdAt || 0),
  );

  for (const part of participations) {
    const campaign = campaignById.get(String(part.campaignId));
    if (!campaign) continue;
    const excluded = new Set((campaign.excludedProductIds || []).map(String));
    for (const rawId of part.productIds || []) {
      const id = String(rawId);
      if (excluded.has(id) || byProduct.has(id)) continue;
      const product = productById.get(id);
      // A seller can only ever discount their own product.
      if (!product || String(product.sellerId) !== String(part.sellerId)) continue;
      const variantCost = new Map();
      for (const v of product.variants || []) {
        for (const key of variantKeys(v)) variantCost.set(key, Number(v.purchaseRate) || 0);
      }
      byProduct.set(id, {
        campaign: summarize(campaign),
        cost: Number(product.purchaseRate) || 0,
        variantCost,
      });
    }
  }

  return { byProduct, expiresAt };
}

let cachedIndex = null;
let pendingBuild = null;

/** Drop the cached index (call after any campaign / participation change). */
export function invalidateCampaignPriceIndex() {
  cachedIndex = null;
}

/**
 * The live index. `fresh: true` (checkout) always rebuilds so money is
 * decided on current data; browsing reuses a ≤60 s copy.
 */
export async function getCampaignPriceIndex({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cachedIndex && cachedIndex.expiresAt > now) return cachedIndex.byProduct;
  if (!fresh && pendingBuild) return (await pendingBuild).byProduct;
  const build = buildCampaignPriceIndex(new Date(now));
  if (!fresh) pendingBuild = build;
  try {
    const index = await build;
    cachedIndex = index;
    return index.byProduct;
  } finally {
    if (!fresh) pendingBuild = null;
  }
}

function costForVariant(entry, variant) {
  for (const key of variantKeys(variant)) {
    if (entry.variantCost.has(key)) return entry.variantCost.get(key);
  }
  return 0;
}

/** Copy of `product` with campaign prices applied (product + every variant). */
export function applyCampaignToProduct(product, byProduct) {
  if (!product || typeof product !== "object" || !byProduct?.size) return product;
  const entry = byProduct.get(String(product._id || product.id || ""));
  if (!entry) return product;

  const out = { ...product };
  let discounted = false;
  const base = basePriceOf(product);
  const sale = salePriceFor(base, entry.campaign, entry.cost);
  if (sale !== null) {
    out.sellingPrice = sale;
    // keep the struck-through price meaningful even if mrp was entered wrong
    if (!(Number(out.mrp) >= base)) out.mrp = base;
    discounted = true;
  }

  if (Array.isArray(product.variants)) {
    out.variants = product.variants.map((variant) => {
      if (!variant || typeof variant !== "object") return variant;
      const vBase = basePriceOf(variant) || base;
      const vSale = salePriceFor(vBase, entry.campaign, costForVariant(entry, variant));
      if (vSale === null) return variant;
      discounted = true;
      return {
        ...variant,
        sellingPrice: vSale,
        mrp: Number(variant.mrp) >= vBase ? variant.mrp : vBase,
      };
    });
  }

  if (!discounted) return product;
  out.campaign = {
    _id: entry.campaign._id,
    name: entry.campaign.name,
    endAt: entry.campaign.endAt,
    label: discountLabel(entry.campaign),
    regularPrice: base,
  };
  return out;
}

export async function applyCampaignPrices(products, options = {}) {
  if (!Array.isArray(products) || !products.length) return products;
  const byProduct = await getCampaignPriceIndex(options);
  if (!byProduct.size) return products;
  return products.map((p) => applyCampaignToProduct(p, byProduct));
}

/**
 * Checkout: campaign price for one order line whose regular unit price is
 * `unitPrice`. Returns { price, campaignId, campaignDiscount } or null.
 */
export function campaignLinePrice(byProduct, productId, variant, unitPrice) {
  const entry = byProduct?.get(String(productId));
  if (!entry) return null;
  const cost = variant ? costForVariant(entry, variant) : entry.cost;
  const sale = salePriceFor(unitPrice, entry.campaign, cost);
  if (sale === null) return null;
  return {
    price: sale,
    campaignId: entry.campaign._id,
    campaignDiscount: roundCurrency(Number(unitPrice) - sale),
  };
}
