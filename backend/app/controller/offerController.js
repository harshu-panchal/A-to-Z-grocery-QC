import Offer from "../models/offer.js";
import Coupon from "../models/coupon.js";
import handleResponse from "../utils/helper.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";

const PUBLIC_OFFERS_CACHE_KEY = buildKey("catalog", "offers", "public");

const COUPON_FIELDS =
  "code discountType discountValue maxDiscount minOrderValue validFrom validTill isActive usageLimit usedCount";

// A linked coupon that can't be redeemed right now means the card would
// advertise a dead code, so it's hidden. Checked after the cache read so
// expiry takes effect without waiting for the TTL.
export const isCouponUsable = (coupon, now = new Date()) => {
  if (!coupon || !coupon.isActive) return false;
  if (coupon.validFrom && new Date(coupon.validFrom) > now) return false;
  if (coupon.validTill && new Date(coupon.validTill) < now) return false;
  if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) return false;
  return true;
};

const isOfferLive = (offer, now = new Date()) => {
  if (offer.validFrom && new Date(offer.validFrom) > now) return false;
  if (offer.validTo && new Date(offer.validTo) < now) return false;
  // A deleted coupon populates to null just like "not linked", so the
  // hasCoupon flag (taken before populate) tells the two apart.
  if (offer.hasCoupon && !isCouponUsable(offer.couponId, now)) return false;
  return true;
};

export const getPublicOffers = async (req, res) => {
  try {
    const offers = await getOrSet(
      PUBLIC_OFFERS_CACHE_KEY,
      async () => {
        const raw = await Offer.find({ status: "active" })
          .sort({ order: 1, createdAt: 1 })
          .lean();
        const linkedIds = new Set(raw.filter((o) => o.couponId).map((o) => String(o._id)));
        const populated = await Offer.populate(raw, [
          { path: "categoryIds", select: "name" },
          { path: "couponId", select: COUPON_FIELDS },
        ]);
        return populated.map((o) => ({ ...o, hasCoupon: linkedIds.has(String(o._id)) }));
      },
      getTTL("homepage"),
    );

    const now = new Date();
    const live = (offers || [])
      .filter((o) => isOfferLive(o, now))
      .map(({ hasCoupon, couponId, ...o }) => {
        if (!hasCoupon) return o;
        return {
          ...o,
          code: couponId.code,
          coupon: {
            code: couponId.code,
            discountType: couponId.discountType,
            discountValue: couponId.discountValue,
            maxDiscount: couponId.maxDiscount,
            minOrderValue: couponId.minOrderValue,
            validTill: couponId.validTill,
          },
        };
      });

    return handleResponse(res, 200, "Offers fetched successfully", live);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Resolve the coupon an offer links to. Returns { couponId, code } to merge
// into the offer, or { error } for a bad id. "" / null unlinks.
async function resolveCouponLink(couponId) {
  if (couponId === undefined) return {};
  if (!couponId) return { couponId: null };
  if (!/^[a-f\d]{24}$/i.test(String(couponId))) return { error: "Invalid coupon" };
  const coupon = await Coupon.findById(couponId).select("code").lean();
  if (!coupon) return { error: "Linked coupon not found" };
  return { couponId: coupon._id, code: coupon.code };
}

export function invalidatePublicOffersCache() {
  invalidate(PUBLIC_OFFERS_CACHE_KEY).catch((err) => {
    console.warn("[Offers] Public offers cache invalidation failed:", err.message);
  });
}

export const getAdminOffers = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status && ["active", "inactive"].includes(status)) {
      query.status = status;
    }

    const offers = await Offer.find(query)
      .sort({ order: 1, createdAt: 1 })
      .populate("couponId", COUPON_FIELDS)
      .lean();

    return handleResponse(res, 200, "Admin offers fetched", offers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createOffer = async (req, res) => {
  try {
    const {
      title,
      description,
      code,
      style,
      icon,
      appliesOnOrderNumber,
      order,
      status,
      productIds = [],
      categoryIds = [],
      validFrom,
      validTo,
      couponId,
    } = req.body;

    if (!title || !title.trim()) {
      return handleResponse(res, 400, "Title is required");
    }

    const link = await resolveCouponLink(couponId);
    if (link.error) return handleResponse(res, 400, link.error);

    const baseOrder =
      typeof order === "number"
        ? order
        : await Offer.countDocuments({});

    const offer = await Offer.create({
      title: title.trim(),
      description,
      code,
      style,
      icon,
      appliesOnOrderNumber,
      order: baseOrder,
      status,
      productIds,
      categoryIds,
      validFrom,
      validTo,
      ...link,
    });

    invalidatePublicOffersCache();

    return handleResponse(res, 201, "Offer created", offer);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Offer.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Offer not found");
    }

    const payload = req.body || {};

    if (payload.title && !payload.title.trim()) {
      return handleResponse(res, 400, "Title cannot be empty");
    }

    const link = await resolveCouponLink(payload.couponId);
    if (link.error) return handleResponse(res, 400, link.error);

    const { _id, couponId: _ignored, ...rest } = payload;
    Object.assign(existing, {
      ...rest,
      ...link,
      title: payload.title !== undefined ? payload.title.trim() : existing.title,
    });

    await existing.save();
    await existing.populate("couponId", COUPON_FIELDS);

    invalidatePublicOffersCache();

    return handleResponse(res, 200, "Offer updated", existing);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Offer.findByIdAndDelete(id);
    if (!deleted) {
      return handleResponse(res, 404, "Offer not found");
    }

    invalidatePublicOffersCache();

    return handleResponse(res, 200, "Offer deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const reorderOffers = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return handleResponse(res, 200, "No offers to reorder");
    }

    const bulkOps = items
      .filter((it) => it && it.id)
      .map((it) => ({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { order: it.order } },
        },
      }));

    if (!bulkOps.length) {
      return handleResponse(res, 200, "No valid offers to reorder");
    }

    await Offer.bulkWrite(bulkOps);

    invalidatePublicOffersCache();

    return handleResponse(res, 200, "Offers reordered");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

