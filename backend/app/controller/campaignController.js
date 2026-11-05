import mongoose from "mongoose";
import DiscountCampaign from "../models/discountCampaign.js";
import CampaignParticipation from "../models/campaignParticipation.js";
import Product from "../models/product.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import {
  campaignPhase,
  canSellerRespond,
  normalizeCampaignInput,
  eligibleProductFilter,
  inviteEligibleSellers,
  sellerCampaignProducts,
  findCampaign,
  onCampaignPricesChanged,
} from "../services/campaign/campaignService.js";
import { applyCampaignPrices, discountLabel } from "../services/campaign/campaignPricing.js";
import { emitNotificationEvent } from "../modules/notifications/notification.service.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import { attachStoreStatus } from "../services/seller/storeStatus.js";

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const withPhase = (c) => {
  const plain = typeof c?.toObject === "function" ? c.toObject() : c;
  return { ...plain, phase: campaignPhase(plain), discountLabel: discountLabel(plain) };
};

function notifySellers(eventType, campaign, sellerIds) {
  if (!sellerIds.length) return;
  emitNotificationEvent(eventType, {
    sellerIds,
    campaignName: campaign.name,
    discountLabel: discountLabel(campaign),
    joinDeadlineText: fmtDate(campaign.joinDeadline),
    // dedupe: one invite per campaign; reminders once per day
    messageId:
      eventType === NOTIFICATION_EVENTS.CAMPAIGN_INVITE
        ? `campaign:${campaign._id}:invite`
        : `campaign:${campaign._id}:reminder:${new Date().toISOString().slice(0, 10)}`,
    data: { campaignId: String(campaign._id) },
  });
}

async function participationCounts(campaignIds) {
  const rows = await CampaignParticipation.aggregate([
    { $match: { campaignId: { $in: campaignIds } } },
    {
      $group: {
        _id: { campaignId: "$campaignId", status: "$status" },
        sellers: { $sum: 1 },
        products: { $sum: { $size: { $ifNull: ["$productIds", []] } } },
      },
    },
  ]);
  const out = new Map();
  for (const r of rows) {
    const key = String(r._id.campaignId);
    const entry = out.get(key) || { invited: 0, joined: 0, declined: 0, joinedProducts: 0 };
    entry[r._id.status] = r.sellers;
    if (r._id.status === "joined") entry.joinedProducts = r.products;
    out.set(key, entry);
  }
  return out;
}

/* =============================== ADMIN =============================== */

export const adminListCampaigns = async (req, res) => {
  try {
    const campaigns = await DiscountCampaign.find({}).sort({ createdAt: -1 }).limit(200).lean();
    const counts = await participationCounts(campaigns.map((c) => c._id));
    const result = campaigns.map((c) => ({
      ...withPhase(c),
      stats: counts.get(String(c._id)) || { invited: 0, joined: 0, declined: 0, joinedProducts: 0 },
    }));
    return handleResponse(res, 200, "Campaigns fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetCampaign = async (req, res) => {
  try {
    const campaign = await DiscountCampaign.findById(req.params.id)
      .populate("categoryIds", "name type")
      .populate("productIds", "name mainImage")
      .populate("excludedProductIds", "name")
      .lean();
    if (!campaign) return handleResponse(res, 404, "Campaign not found");

    const [participants, eligibleCount] = await Promise.all([
      CampaignParticipation.find({ campaignId: campaign._id })
        .populate("sellerId", "shopName name phone")
        .populate("productIds", "name mainImage mrp sellingPrice")
        .sort({ status: 1, updatedAt: -1 })
        .lean(),
      Product.countDocuments(eligibleProductFilter(campaign)),
    ]);

    // joined products customers can actually buy (active + approved)
    const joinedIds = participants
      .filter((p) => p.status === "joined")
      .flatMap((p) => (p.productIds || []).map((x) => x?._id || x));
    const visibleProductCount = joinedIds.length
      ? await Product.countDocuments({ _id: { $in: joinedIds }, ...eligibleProductFilter(campaign) })
      : 0;

    return handleResponse(res, 200, "Campaign fetched", {
      ...withPhase(campaign),
      eligibleProductCount: eligibleCount,
      visibleProductCount,
      participants,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminCreateCampaign = async (req, res) => {
  try {
    const { error, data } = normalizeCampaignInput(req.body);
    if (error) return handleResponse(res, 400, error);
    const campaign = await DiscountCampaign.create({ ...data, status: "draft", createdBy: req.user?.id });
    return handleResponse(res, 201, "Campaign created as draft", withPhase(campaign));
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

// Once sellers have been invited, the deal they agreed to can't change:
// only the wording, banner and (later) join deadline / end date can.
const EDITABLE_AFTER_PUBLISH = ["name", "description", "bannerImage", "joinDeadline", "startAt", "endAt"];

export const adminUpdateCampaign = async (req, res) => {
  try {
    const campaign = await findCampaign(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    if (campaign.status === "cancelled" || campaignPhase(campaign) === "ended") {
      return handleResponse(res, 400, "This campaign has finished and can't be edited");
    }

    let body = req.body || {};
    if (campaign.status !== "draft") {
      body = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE_AFTER_PUBLISH.includes(k)));
      if (body.endAt && new Date(body.endAt) < campaign.endAt && campaignPhase(campaign) === "live") {
        // ending early is the "end" action, not an edit
        return handleResponse(res, 400, "Use 'End now' to stop a live campaign early");
      }
      if (body.joinDeadline && new Date(body.joinDeadline) < campaign.joinDeadline) {
        return handleResponse(res, 400, "Join deadline can only be extended");
      }
      // Start time can move until the sale begins, never into the past.
      if (body.startAt && new Date(body.startAt).getTime() !== new Date(campaign.startAt).getTime()) {
        if (campaignPhase(campaign) !== "inviting") {
          return handleResponse(res, 400, "The sale has already started, so its start time can't change");
        }
        if (new Date(body.startAt) <= new Date()) {
          return handleResponse(res, 400, "Start time must be in the future");
        }
      }
    }

    const { error, data } = normalizeCampaignInput(body, campaign.toObject());
    if (error) return handleResponse(res, 400, error);
    Object.assign(campaign, data);
    await campaign.save();
    onCampaignPricesChanged();
    return handleResponse(res, 200, "Campaign updated", withPhase(campaign));
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const adminDeleteCampaign = async (req, res) => {
  try {
    const campaign = await findCampaign(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    // A running sale can't vanish mid-way: end or pause-and-end it first.
    const phase = campaignPhase(campaign);
    if (phase === "live" || phase === "paused") {
      return handleResponse(res, 400, "This sale is running. Use 'End now' first, then delete it.");
    }
    await Promise.all([
      campaign.deleteOne(),
      CampaignParticipation.deleteMany({ campaignId: campaign._id }),
    ]);
    onCampaignPricesChanged();
    return handleResponse(res, 200, "Campaign deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminPublishCampaign = async (req, res) => {
  try {
    const campaign = await findCampaign(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    if (campaign.status !== "draft") return handleResponse(res, 400, "Campaign is already published");
    if (new Date(campaign.joinDeadline) <= new Date()) {
      return handleResponse(res, 400, "Join deadline has already passed. Move it later before publishing.");
    }

    const sellerIds = await inviteEligibleSellers(campaign);
    if (!sellerIds.length) {
      await CampaignParticipation.deleteMany({ campaignId: campaign._id });
      return handleResponse(
        res,
        400,
        "Can't publish: no active, approved product matches the chosen categories/products, so there is no seller to invite. Edit the campaign and pick categories that have live products.",
      );
    }
    campaign.status = "published";
    campaign.publishedAt = new Date();
    await campaign.save();
    onCampaignPricesChanged();
    notifySellers(NOTIFICATION_EVENTS.CAMPAIGN_INVITE, campaign, sellerIds);
    return handleResponse(res, 200, `Published. ${sellerIds.length} seller(s) invited.`, withPhase(campaign));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** pause | resume | end | cancel */
export const adminCampaignAction = async (req, res) => {
  try {
    const campaign = await findCampaign(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    const phase = campaignPhase(campaign);
    const action = String(req.body?.action || "");

    if (["ended", "cancelled", "draft"].includes(phase)) {
      return handleResponse(res, 400, `A ${phase} campaign can't be changed`);
    }
    if (action === "pause") {
      if (campaign.status !== "published") return handleResponse(res, 400, "Campaign isn't running");
      campaign.status = "paused";
    } else if (action === "resume") {
      if (campaign.status !== "paused") return handleResponse(res, 400, "Campaign isn't paused");
      campaign.status = "published";
    } else if (action === "end") {
      if (phase !== "live" && phase !== "paused") return handleResponse(res, 400, "Only a running campaign can be ended");
      campaign.endAt = new Date();
      campaign.status = "published";
    } else if (action === "cancel") {
      campaign.status = "cancelled";
    } else {
      return handleResponse(res, 400, "Unknown action");
    }
    await campaign.save();
    onCampaignPricesChanged();
    return handleResponse(res, 200, "Campaign updated", withPhase(campaign));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminRemindSellers = async (req, res) => {
  try {
    const campaign = await findCampaign(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    if (!canSellerRespond(campaign)) return handleResponse(res, 400, "Sellers can no longer join this campaign");
    // also invites sellers who added matching products after publishing
    await inviteEligibleSellers(campaign);
    const pending = await CampaignParticipation.find({ campaignId: campaign._id, status: "invited" })
      .select("sellerId")
      .lean();
    const sellerIds = pending.map((p) => String(p.sellerId));
    notifySellers(NOTIFICATION_EVENTS.CAMPAIGN_REMINDER, campaign, sellerIds);
    return handleResponse(res, 200, `Reminder sent to ${sellerIds.length} seller(s)`);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminRemoveProduct = async (req, res) => {
  try {
    const { id, sellerId, productId } = req.params;
    if (![id, sellerId, productId].every((v) => mongoose.isValidObjectId(v))) {
      return handleResponse(res, 404, "Not found");
    }
    const updated = await CampaignParticipation.findOneAndUpdate(
      { campaignId: id, sellerId, productIds: productId },
      { $pull: { productIds: productId }, $addToSet: { removedProductIds: productId } },
      { new: true },
    );
    if (!updated) return handleResponse(res, 404, "Product isn't in this campaign");
    onCampaignPricesChanged();
    return handleResponse(res, 200, "Product removed from campaign");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminCampaignReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return handleResponse(res, 404, "Campaign not found");
    const campaignId = new mongoose.Types.ObjectId(id);
    const rows = await Order.aggregate([
      { $match: { "items.campaignId": campaignId, status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      { $match: { "items.campaignId": campaignId } },
      {
        $group: {
          _id: "$seller",
          orders: { $addToSet: "$_id" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          discount: { $sum: { $multiply: [{ $ifNull: ["$items.campaignDiscount", 0] }, "$items.quantity"] } },
        },
      },
      { $lookup: { from: "sellers", localField: "_id", foreignField: "_id", as: "seller" } },
      {
        $project: {
          sellerId: "$_id",
          shopName: { $ifNull: [{ $arrayElemAt: ["$seller.shopName", 0] }, "Seller"] },
          orders: { $size: "$orders" },
          units: 1,
          revenue: { $round: ["$revenue", 2] },
          discount: { $round: ["$discount", 2] },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    const totals = rows.reduce(
      (t, r) => ({
        orders: t.orders + r.orders,
        units: t.units + r.units,
        revenue: Math.round((t.revenue + r.revenue) * 100) / 100,
        discount: Math.round((t.discount + r.discount) * 100) / 100,
      }),
      { orders: 0, units: 0, revenue: 0, discount: 0 },
    );
    return handleResponse(res, 200, "Campaign report", { totals, sellers: rows });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* =============================== SELLER =============================== */

export const sellerListCampaigns = async (req, res) => {
  try {
    const parts = await CampaignParticipation.find({ sellerId: req.user.id })
      .populate("campaignId")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const result = parts
      .filter((p) => p.campaignId && p.campaignId.status !== "draft")
      .map((p) => ({
        participationStatus: p.status,
        joinedProductCount: (p.productIds || []).length,
        respondedAt: p.respondedAt,
        canRespond: canSellerRespond(p.campaignId),
        campaign: withPhase(p.campaignId),
      }));
    return handleResponse(res, 200, "Campaigns fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

async function loadSellerParticipation(req, res) {
  const campaign = await findCampaign(req.params.id);
  const part = campaign
    ? await CampaignParticipation.findOne({ campaignId: campaign._id, sellerId: req.user.id })
    : null;
  if (!campaign || !part || campaign.status === "draft") {
    handleResponse(res, 404, "Campaign not found");
    return null;
  }
  return { campaign, part };
}

export const sellerGetCampaign = async (req, res) => {
  try {
    const loaded = await loadSellerParticipation(req, res);
    if (!loaded) return;
    const { campaign, part } = loaded;
    const products = await sellerCampaignProducts(campaign, req.user.id);
    const joined = new Set((part.productIds || []).map(String));
    const removed = new Set((part.removedProductIds || []).map(String));
    return handleResponse(res, 200, "Campaign fetched", {
      campaign: withPhase(campaign),
      participationStatus: part.status,
      canRespond: canSellerRespond(campaign),
      products: products.map((p) => ({
        ...p,
        joined: joined.has(String(p._id)),
        removedByAdmin: removed.has(String(p._id)),
      })),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const sellerJoinCampaign = async (req, res) => {
  try {
    const loaded = await loadSellerParticipation(req, res);
    if (!loaded) return;
    const { campaign, part } = loaded;
    if (!canSellerRespond(campaign)) {
      return handleResponse(res, 400, "Joining is closed for this campaign");
    }
    const wanted = new Set(
      (Array.isArray(req.body?.productIds) ? req.body.productIds : []).map(String),
    );
    if (!wanted.size) return handleResponse(res, 400, "Pick at least one product to join");

    const products = await sellerCampaignProducts(campaign, req.user.id);
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const problems = [];
    for (const id of wanted) {
      const p = byId.get(id);
      if (!p) problems.push(`A selected product isn't part of this campaign`);
      else if (p.blockedReason) problems.push(`${p.name}: ${p.blockedReason}`);
    }
    if (problems.length) return handleResponse(res, 400, problems.slice(0, 3).join(". "));

    part.status = "joined";
    part.productIds = [...wanted];
    part.respondedAt = new Date();
    await part.save();
    onCampaignPricesChanged();
    return handleResponse(res, 200, `Joined with ${wanted.size} product(s)`);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const sellerDeclineCampaign = async (req, res) => {
  try {
    const loaded = await loadSellerParticipation(req, res);
    if (!loaded) return;
    const { campaign, part } = loaded;
    if (!canSellerRespond(campaign)) {
      return handleResponse(res, 400, "This campaign can no longer be changed");
    }
    part.status = "declined";
    part.productIds = [];
    part.respondedAt = new Date();
    await part.save();
    onCampaignPricesChanged();
    return handleResponse(res, 200, "Campaign declined");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* =============================== PUBLIC =============================== */

const PUBLIC_PRODUCT_FIELDS =
  "name slug mrp sellingPrice stock brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status variants.name variants.sku variants.mrp variants.sellingPrice variants.stock";

/** Joined, customer-visible products of live campaigns, optionally limited to nearby sellers. */
async function liveCampaignProducts(campaignIds, req) {
  const parts = await CampaignParticipation.find({ campaignId: { $in: campaignIds }, status: "joined" })
    .select("campaignId sellerId productIds")
    .lean();
  let allowedSellers = null;
  const coords = parseCustomerCoordinates(req.query || {});
  if (coords.valid) {
    allowedSellers = new Set((await getNearbySellerIdsForCustomer(coords.lat, coords.lng)).map(String));
  }
  const ids = parts
    .filter((p) => !allowedSellers || allowedSellers.has(String(p.sellerId)))
    .flatMap((p) => p.productIds || []);
  if (!ids.length) return [];
  const products = await Product.find({ _id: { $in: ids }, status: "active" })
    .select(PUBLIC_PRODUCT_FIELDS)
    .limit(500)
    .lean();
  const priced = await applyCampaignPrices(products);
  // only products whose price actually dropped (and that belong to these campaigns)
  const wanted = new Set(campaignIds.map(String));
  return priced.filter((p) => p.campaign && wanted.has(String(p.campaign._id)));
}

export const publicListCampaigns = async (req, res) => {
  try {
    const now = new Date();
    const campaigns = await DiscountCampaign.find({
      status: "published",
      startAt: { $lte: now },
      endAt: { $gte: now },
    })
      .populate("categoryIds", "name type image")
      .sort({ endAt: 1 })
      .lean();
    if (!campaigns.length) return handleResponse(res, 200, "Campaigns fetched", []);

    const products = await liveCampaignProducts(campaigns.map((c) => c._id), req);
    const withStatus = await attachStoreStatus(products);
    const byCampaign = new Map();
    for (const p of withStatus) {
      const key = String(p.campaign._id);
      if (!byCampaign.has(key)) byCampaign.set(key, []);
      byCampaign.get(key).push(p);
    }

    const result = campaigns
      .map((c) => ({
        _id: c._id,
        name: c.name,
        description: c.description,
        bannerImage: c.bannerImage,
        discountLabel: discountLabel(c),
        endAt: c.endAt,
        categories: (c.categoryIds || []).map((cat) => ({ _id: cat._id, name: cat.name, type: cat.type, image: cat.image })),
        products: byCampaign.get(String(c._id)) || [],
      }))
      .filter((c) => c.products.length > 0);
    return handleResponse(res, 200, "Campaigns fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
