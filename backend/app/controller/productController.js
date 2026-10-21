import mongoose from "mongoose";
import { validateProductBarcodes } from "../services/inventory/barcodeService.js";
import Product from "../models/product.js";
import Order from "../models/order.js";
import Cart from "../models/cart.js";
import crypto from "crypto";
import Review from "../models/review.js";
import { handleResponse } from "../utils/helper.js";
import { slugify } from "../utils/slugify.js";
import getPagination from "../utils/pagination.js";
import Admin from "../models/admin.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

async function getAdminIds() {
    const admins = await Admin.find().select("_id").lean();
    return (admins || []).map((a) => a?._id).filter(Boolean);
}
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import {
  enqueueProductIndex,
  enqueueProductRemoval,
} from "../services/searchSyncService.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary, replaceMedia, deleteMediaByUrl } from "../services/mediaService.js";
import logger from "../services/logger.js";
import { resolveCategoryName, resolveSellerName } from "../services/entityNameCache.js";
import {
  PRODUCT_APPROVAL_STATUS,
  getProductApprovalConfig,
  getApprovedOrLegacyFilter,
  buildApprovalStatusFilter,
  normalizeProductModerationFields,
  sanitizeApprovalNote,
  resolveProductApprovalStatus,
} from "../services/productModerationService.js";
import { buildSearchRegex } from "../utils/regex.js";
import { transformImageUrl, transformImageUrlList } from "../utils/cloudinaryImageUrl.js";

// Phase 3 P3-5: when search term is reasonably specific and the env flag
// is enabled, prefer Mongo's `name + tags` text index over case-insensitive
// regex. Default OFF — keeps existing substring-search semantics so the
// behavior of the customer-facing search bar is unchanged unless explicitly
// opted in by ops.
function isProductTextSearchEnabled() {
  return (
    String(process.env.PRODUCT_SEARCH_USE_TEXT || "false").toLowerCase() === "true"
  );
}

function buildProductListKey(queryParams) {
  const sorted = Object.keys(queryParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = String(queryParams[k] ?? "").trim().toLowerCase();
      return acc;
    }, {});
  return buildKey("catalog", "productList", JSON.stringify(sorted));
}

function isCustomerVisibilityRequest(req) {
  const role = String(req.user?.role || "").toLowerCase();
  // Admin and seller should not be subject to location filtering
  return !role || (role !== "admin" && role !== "seller" && role !== "delivery");
}

// purchaseRate (cost price) and rackCode (warehouse location) are internal
// to the seller/admin and must never reach customer- or delivery-facing
// responses. Applied post-fetch (not via .select()) so caching stays
// role-agnostic — see getProducts/getProductById.
function stripInternalPricingFields(product) {
  if (!product || typeof product !== "object") return product;
  const { purchaseRate, rackCode, wholesalePrice, ...rest } = product;
  if (Array.isArray(rest.variants)) {
    rest.variants = rest.variants.map((variant) => {
      if (!variant || typeof variant !== "object") return variant;
      const { purchaseRate: _vpr, wholesalePrice: _vwp, ...variantRest } = variant;
      return variantRest;
    });
  }
  return rest;
}

/**
 * POS wholesale price lives on each variant; the product-level value is the
 * fallback the counter uses, so keep it equal to the first variant's.
 * Empty / 0 means "no wholesale price" (the counter bills the selling price).
 */
function normalizeWholesalePrices(productData) {
  if (!Array.isArray(productData.variants) || productData.variants.length === 0) return;
  productData.variants = productData.variants.map((variant) => {
    const value = Number(variant?.wholesalePrice);
    return { ...variant, wholesalePrice: value > 0 ? Math.round(value * 100) / 100 : null };
  });
  productData.wholesalePrice = productData.variants[0].wholesalePrice;
}

// Manufacturing/expiry dates are shown to customers only when the seller opts
// in via showManufacturingDate / showExpiryDate flags. The flags themselves
// are internal and stripped from all customer-facing responses.
function applyDateVisibilityFilter(product) {
  if (!product || typeof product !== "object") return product;
  const result = { ...product };
  if (!result.showManufacturingDate) delete result.manufacturingDate;
  if (!result.showExpiryDate) delete result.expiryDate;
  delete result.showManufacturingDate;
  delete result.showExpiryDate;
  return result;
}

function isInternalPricingVisible(req) {
  const role = String(req.user?.role || "").toLowerCase();
  return role === "admin" || role === "seller";
}

function parseSellerIdFilters({ sellerId, sellerIds }) {
  if (typeof sellerIds === "string" && sellerIds.trim()) {
    return sellerIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map(String);
  }

  if (sellerId) {
    return [String(sellerId)];
  }

  return [];
}

// Shape of the SKUs the seller form auto-fills ("amulm-001"). Only these are
// regenerated on a clash; a SKU the seller typed is never silently changed.
const AUTO_SKU_PATTERN = /^[a-z0-9]{1,5}-\d{3}$/;

/**
 * `slug` and `sku` are unique across ALL sellers (DB unique index), and the
 * auto values only use the first 5 letters of the name. So a second seller
 * adding "Amul Milk", or the same seller adding "Amul Milk 1L" after
 * "Amul Milk 500ml", failed with "Slug or SKU already exists". Add a short
 * suffix until the value is free.
 */
async function uniqueProductValue(field, base, excludeId = null) {
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const query = { [field]: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    if (!(await Product.exists(query))) return candidate;
    candidate = `${base}-${crypto.randomBytes(2).toString("hex")}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Resolve slug + sku for a create/update. Returns an error message or null. */
export async function assignUniqueSlugAndSku(productData, { excludeId = null, currentSku = null } = {}) {
  if (productData.slug) {
    productData.slug = await uniqueProductValue("slug", productData.slug, excludeId);
  }
  const sku = String(productData.sku || "").trim();
  if (!sku || sku === currentSku) return null;
  if (AUTO_SKU_PATTERN.test(sku)) {
    productData.sku = await uniqueProductValue("sku", sku, excludeId);
    return null;
  }
  const taken = await Product.exists({ sku, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
  return taken ? `Product code "${sku}" is already used by another product. Please use a different code.` : null;
}

/**
 * Prices: never negative, never above MRP, and something must cost more than
 * 0 (a product or pack with MRP 0 and no selling price was sold for ₹0).
 * `existing` supplies stored values for fields an update doesn't send.
 * Returns an error message or null.
 */
export function validateProductPrices(productData, existing = null) {
  const num = (v) => (v === undefined || v === null || String(v).trim() === "" ? undefined : Number(v));
  const check = (label, mrpIn, saleIn, fallback = {}) => {
    const mrp = num(mrpIn) ?? num(fallback.mrp);
    const sale = num(saleIn) ?? num(fallback.sellingPrice);
    for (const [name, v] of [["MRP", mrp], ["Selling price", sale]]) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) return `${name} must be 0 or more${label}`;
    }
    if (!((sale || 0) > 0 || (mrp || 0) > 0)) return `Enter an MRP or selling price above ₹0${label}`;
    if (mrp > 0 && sale > mrp) return `Selling price can't be more than MRP${label}`;
    return null;
  };

  if (Array.isArray(productData.variants) && productData.variants.length > 0) {
    for (const [i, v] of productData.variants.entries()) {
      const err = check(` (${v?.name || `variant ${i + 1}`})`, v?.mrp, v?.sellingPrice);
      if (err) return err;
    }
    return null;
  }
  const touchesPrice = productData.mrp !== undefined || productData.sellingPrice !== undefined;
  if (!existing || touchesPrice) {
    return check("", productData.mrp, productData.sellingPrice, existing || {});
  }
  return null;
}

/** Variant names and codes must be unique within a product (orders pick a variant by them). */
export function validateVariantIdentity(productData) {
  const variants = productData.variants;
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const names = new Set();
  const skus = new Set();
  for (const [i, v] of variants.entries()) {
    const name = String(v?.name || "").trim();
    if (variants.length > 1 && !name) return `Give every variant a name (variant ${i + 1} is empty)`;
    const nKey = name.toLowerCase();
    if (name && names.has(nKey)) return `Two variants are both named "${name}"`;
    names.add(nKey);
    const sku = String(v?.sku || "").trim().toLowerCase();
    if (sku && skus.has(sku)) return `Two variants use the same product code "${v.sku}"`;
    skus.add(sku);
  }
  return null;
}

/** Fields only the platform may set. */
const SELLER_FORBIDDEN_FIELDS = ["isFeatured"];

function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function parseJsonIfString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeUrl(value) {
  const normalized = String(value || "").trim();
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function parseImageList(input) {
  const candidate = parseJsonIfString(input);
  if (Array.isArray(candidate)) {
    return candidate.map((item) => normalizeUrl(item)).filter(Boolean);
  }
  if (typeof candidate === "string" && candidate.includes(",")) {
    return candidate
      .split(",")
      .map((item) => normalizeUrl(item))
      .filter(Boolean);
  }
  const single = normalizeUrl(candidate);
  return single ? [single] : [];
}

function applyMediaFields(productData) {
  const explicitMainImage = normalizeUrl(productData.mainImage || productData.mainImageUrl);
  const galleryImages = parseImageList(productData.galleryImages);
  const genericImages = parseImageList(productData.images);

  const mergedGallery = [...galleryImages, ...genericImages].filter(Boolean);
  if (explicitMainImage) {
    productData.mainImage = explicitMainImage;
  } else if (mergedGallery.length > 0) {
    productData.mainImage = mergedGallery[0];
    mergedGallery.shift();
  } else {
    delete productData.mainImage;
  }

  if (mergedGallery.length > 0) {
    productData.galleryImages = mergedGallery;
  } else if (!Array.isArray(productData.galleryImages)) {
    productData.galleryImages = [];
  }
}

// Purchasable = same rule stockService enforces at order time: master stock > 0
// AND (no variants, or at least one variant with stock > 0).
const IN_STOCK_FILTER = {
  stock: { $gt: 0 },
  $or: [
    { variants: { $exists: false } },
    { variants: { $size: 0 } },
    { "variants.stock": { $gt: 0 } },
  ],
};

/**
 * Stock is a whole number >= 0, and for products with variants the master
 * `stock` is always the SUM of the variant stocks (computed here, never trusted
 * from the client). Decimals used to be accepted, and after an order decrement
 * left values like 0.00999…, which kept a product "in stock" forever; the
 * master was also copied from the first variant only, so it drifted from the
 * variants that checkout actually checks.
 * Returns an error message, or null when the payload is valid (mutates it).
 */
function normalizeStockFields(productData) {
  const toWholeStock = (value, label) => {
    if (value === undefined || value === null || String(value).trim() === "") return { value: 0 };
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return { error: `Stock must be a whole number (0 or more)${label ? ` for ${label}` : ""}` };
    }
    return { value: n };
  };

  if (Array.isArray(productData.variants) && productData.variants.length > 0) {
    let total = 0;
    for (const [i, variant] of productData.variants.entries()) {
      const r = toWholeStock(variant?.stock, variant?.name || `variant ${i + 1}`);
      if (r.error) return r.error;
      variant.stock = r.value;
      total += r.value;
    }
    productData.stock = total;
    return null;
  }

  if (productData.stock !== undefined) {
    const r = toWholeStock(productData.stock);
    if (r.error) return r.error;
    productData.stock = r.value;
  }
  return null;
}

// Look-back window for `sort=trending` on GET /products
const TRENDING_WINDOW_DAYS = parseInt(process.env.TRENDING_WINDOW_DAYS || "30", 10);

const RESTRICTED_MODERATION_FIELDS = [
  "approvalStatus",
  "approvalRequestedAt",
  "approvalReviewedAt",
  "approvalReviewedBy",
  "approvalNote",
  "lastSubmittedByRole",
];

function stripRestrictedModerationFields(payload = {}) {
  for (const field of RESTRICTED_MODERATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      delete payload[field];
    }
  }
}

// Perf audit BE-I1: apply a Cloudinary delivery-time resize/compress
// transform to outbound image URLs only — never touches what's stored on
// the document. `preset` defaults to "thumbnail" (grid/table contexts,
// which is the overwhelming majority of these call sites); the single
// customer-facing product-detail endpoint explicitly passes "detail" for a
// larger hero-sized image. Every product response (list, detail, seller
// list, moderation queue, create/update confirmations) funnels through this
// one function, so this is a single, low-risk insertion point.
function applyProductImageTransforms(product, preset = "thumbnail") {
  if (!product) return product;
  return {
    ...product,
    mainImage: transformImageUrl(product.mainImage, preset),
    galleryImages: transformImageUrlList(product.galleryImages, preset),
  };
}

function normalizeProductDocumentModeration(product, preset = "thumbnail") {
  if (!product) return product;
  return applyProductImageTransforms(normalizeProductModerationFields(product), preset);
}

function normalizeProductListModeration(items = [], preset = "thumbnail") {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeProductDocumentModeration(item, preset));
}

function buildSellerPendingModerationUpdate() {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
    approvalRequestedAt: new Date(),
    approvalReviewedAt: null,
    approvalReviewedBy: null,
    approvalNote: "",
    lastSubmittedByRole: "seller",
  };
}

function buildSellerApprovedModerationUpdate() {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED,
    approvalRequestedAt: null,
    approvalReviewedAt: null,
    approvalReviewedBy: null,
    approvalNote: "",
    lastSubmittedByRole: "seller",
  };
}

function buildAdminApprovedModerationUpdate(adminId, note = "") {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED,
    approvalRequestedAt: null,
    approvalReviewedAt: new Date(),
    approvalReviewedBy: adminId || null,
    approvalNote: sanitizeApprovalNote(note),
    lastSubmittedByRole: "admin",
  };
}

function buildAdminRejectedModerationUpdate(adminId, note = "") {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
    approvalRequestedAt: null,
    approvalReviewedAt: new Date(),
    approvalReviewedBy: adminId || null,
    approvalNote: sanitizeApprovalNote(note),
    lastSubmittedByRole: "admin",
  };
}

/* ===============================
   GET ALL PRODUCTS (Public/Admin)
================================ */
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      header,
      status,
      approvalStatus,
      sellerId,
      featured,
      categoryId,
      subcategoryId,
      headerId,
      categoryIds,
      sellerIds,
      sort,
      lat,
      lng,
      includeOutOfStock,
    } = req.query;
    const enforceRadius = isCustomerVisibilityRequest(req);
    // Customer browsing hides out-of-stock products; search opts back in to show them greyed out
    const hideOutOfStock = enforceRadius && String(includeOutOfStock || "").toLowerCase() !== "true";

    const query = {};
    if (search) {
      const term = String(search).trim();
      if (term) {
        if (isProductTextSearchEnabled() && term.length >= 3) {
          query.$text = { $search: term };
        } else {
          // P3-5: substring search is preserved (so customer-facing UX
          // doesn't shift) but the term is now regex-escaped to avoid
          // injection and runtime errors on `(`, `*`, etc.
          query.name = buildSearchRegex(term, { anchored: false });
        }
      }
    }

    // Support both field names for flexibility (backward compatibility)
    const finalHeaderId = header || headerId;
    const finalCategoryId = category || categoryId;
    const finalSubcategoryId = subcategory || subcategoryId;

    if (finalHeaderId && finalHeaderId !== "all") query.headerId = finalHeaderId;
    if (finalCategoryId && finalCategoryId !== "all") query.categoryId = finalCategoryId;
    if (finalSubcategoryId && finalSubcategoryId !== "all") query.subcategoryId = finalSubcategoryId;

    const requestedSellerIds = parseSellerIdFilters({ sellerId, sellerIds });
    const coords = parseCustomerCoordinates({ lat, lng });
    const shouldApplyLocationFilter = enforceRadius || coords.valid;
    if (enforceRadius && !coords.valid) {
      return handleResponse(
        res,
        400,
        "lat and lng are required for customer product visibility",
      );
    }
    if (shouldApplyLocationFilter) {
      const nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );

      if (!nearbySellerIds.length) {
        return handleResponse(res, 200, "No sellers found in your area", {
          items: [],
          page: 1,
          limit: 24,
          total: 0,
          totalPages: 1,
        });
      }

      const nearbySet = new Set(nearbySellerIds.map(String));
      const finalSellerIds = requestedSellerIds.length
        ? requestedSellerIds.filter((id) => nearbySet.has(String(id)))
        : nearbySellerIds;

      if (!finalSellerIds.length) {
        return handleResponse(res, 200, "No products available in your area", {
          items: [],
          page: 1,
          limit: 24,
          total: 0,
          totalPages: 1,
        });
      }

      query.sellerId = { $in: finalSellerIds };
    }

    if (categoryIds && typeof categoryIds === "string") {
      const ids = categoryIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && id !== "all");
      if (ids.length) query.categoryId = { $in: ids };
    }
    // Multiple sellers: sellerIds=id1,id2 (or single sellerId)
    if (!query.sellerId) {
      if (sellerIds && typeof sellerIds === "string") {
        const ids = sellerIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id && id !== "all");
        if (ids.length) query.sellerId = { $in: ids };
      } else if (sellerId) {
        query.sellerId = sellerId;
      }
    }

    if (featured !== undefined) query.isFeatured = featured === "true";

    let finalQuery = { ...query };
    if (enforceRadius) {
      finalQuery.status = "active";
      finalQuery = {
        $and: [finalQuery, getApprovedOrLegacyFilter(), ...(hideOutOfStock ? [IN_STOCK_FILTER] : [])],
      };
    } else {
      if (status && status !== "all") {
        finalQuery.status = status;
      }
      if (approvalStatus && String(approvalStatus).trim().toLowerCase() !== "all") {
        const moderationFilter = buildApprovalStatusFilter(approvalStatus);
        if (Object.keys(moderationFilter).length > 0) {
          finalQuery = { $and: [finalQuery, moderationFilter] };
        }
      }
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 24,
      maxLimit: 100,
    });

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { mrp: 1, createdAt: -1 },
      "price-desc": { mrp: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortKey = String(sort || "newest").toLowerCase();
    const sortQuery = sortMap[sortKey] || sortMap.newest;
    const PRODUCT_LIST_FIELDS =
      "name slug description sku mrp sellingPrice purchaseRate stock brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants barcode rackCode wholesalePrice manufacturingDate expiryDate showManufacturingDate showExpiryDate createdAt";

    // sort=trending: products ranked by units ordered in the last 30 days
    // (cancelled orders excluded). Only products that actually sold are returned;
    // all other filters (header/category, nearby sellers, approval) still apply.
    const fetchTrending = async () => {
      const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const ranked = await Order.aggregate([
        { $match: { createdAt: { $gte: since }, status: { $ne: "cancelled" } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.product", units: { $sum: "$items.quantity" } } },
        { $sort: { units: -1 } },
        { $limit: 300 },
      ]);
      const rank = new Map(ranked.map((r, i) => [String(r._id), i]));
      if (!rank.size) return { rawProducts: [], total: 0 };
      const matched = await Product.find({
        $and: [finalQuery, { _id: { $in: ranked.map((r) => r._id) } }],
      })
        .select(PRODUCT_LIST_FIELDS)
        .lean();
      matched.sort((a, b) => rank.get(String(a._id)) - rank.get(String(b._id)));
      return { rawProducts: matched.slice(skip, skip + limit), total: matched.length };
    };

    const fetchFn = async () => {
      const [rawProducts, total] = sortKey === "trending"
        ? await fetchTrending().then((r) => [r.rawProducts, r.total])
        : await Promise.all([
            Product.find(finalQuery)
              .select(PRODUCT_LIST_FIELDS)
              // No .populate() — names resolved via cache-backed entityNameCache
              .sort(sortQuery)
              .skip(skip)
              .limit(limit)
              .lean(),
            Product.countDocuments(finalQuery),
          ]);

      // Collect unique category IDs (headerId, categoryId, subcategoryId) and seller IDs
      const categoryIdSet = new Set();
      const sellerIdSet = new Set();
      for (const p of rawProducts) {
        if (p.headerId) categoryIdSet.add(String(p.headerId));
        if (p.categoryId) categoryIdSet.add(String(p.categoryId));
        if (p.subcategoryId) categoryIdSet.add(String(p.subcategoryId));
        if (p.sellerId) sellerIdSet.add(String(p.sellerId));
      }

      // Resolve names in parallel via cache-backed service
      const [categoryEntries, sellerEntries] = await Promise.all([
        Promise.all(
          [...categoryIdSet].map(async (id) => [id, await resolveCategoryName(id)]),
        ),
        Promise.all(
          [...sellerIdSet].map(async (id) => [id, await resolveSellerName(id)]),
        ),
      ]);

      const nameMap = Object.fromEntries([...categoryEntries, ...sellerEntries]);

      // Enrich products to match the shape previously returned by .populate()
      const products = rawProducts.map((p) => ({
        ...p,
        headerId: p.headerId
          ? { _id: p.headerId, name: nameMap[String(p.headerId)] ?? null }
          : null,
        categoryId: p.categoryId
          ? { _id: p.categoryId, name: nameMap[String(p.categoryId)] ?? null }
          : null,
        subcategoryId: p.subcategoryId
          ? { _id: p.subcategoryId, name: nameMap[String(p.subcategoryId)] ?? null }
          : null,
        sellerId: p.sellerId
          ? { _id: p.sellerId, shopName: nameMap[String(p.sellerId)] ?? null }
          : null,
      }));

      return {
        items: normalizeProductListModeration(products),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      };
    };

    const role = String(req.user?.role || "").toLowerCase();
    const shouldCache = !role || (role !== "admin" && role !== "seller");

    const result = shouldCache
      ? await getOrSet(buildProductListKey(req.query), fetchFn, getTTL("productList"))
      : await fetchFn();

    if (!isInternalPricingVisible(req) && Array.isArray(result?.items)) {
      result.items = result.items
        .map(stripInternalPricingFields)
        .map(applyDateVisibilityFilter);
    }

    return handleResponse(res, 200, "Products fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PRODUCTS
================================ */
export const getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { stockStatus, sort, approvalStatus, search, categoryId } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const baseSellerQuery = { sellerId };
    const query = { ...baseSellerQuery };
    // Search / category apply to the whole catalogue, not just the current page
    const term = String(search || "").trim();
    if (term) {
      const regex = buildSearchRegex(term, { anchored: false });
      query.$or = [{ name: regex }, { sku: regex }, { "variants.sku": regex }];
    }
    if (categoryId && categoryId !== "all" && mongoose.isValidObjectId(categoryId)) {
      query.$and = [{ $or: [{ categoryId }, { headerId: categoryId }] }];
    }
    if (stockStatus === "in") {
      query.stock = { $gt: 0 };
    } else if (stockStatus === "out") {
      query.stock = { $lte: 0 };
    }

    if (approvalStatus && String(approvalStatus).trim().toLowerCase() !== "all") {
      const approvalFilter = buildApprovalStatusFilter(approvalStatus);
      if (Object.keys(approvalFilter).length > 0) {
        Object.assign(query, approvalFilter);
      }
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { mrp: 1, createdAt: -1 },
      "price-desc": { mrp: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    const [
      products,
      total,
      totalAll,
      activeCount,
      lowStockCount,
      outOfStockCount,
      pendingCount,
      approvedCount,
      rejectedCount,
    ] = await Promise.all([
      Product.find(query)
        .select(
          "name slug description sku mrp sellingPrice purchaseRate stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants barcode rackCode wholesalePrice manufacturingDate expiryDate showManufacturingDate showExpiryDate createdAt",
        )
        .populate("headerId", "name")
        .populate("categoryId", "name")
        .populate("subcategoryId", "name")
        .populate("sellerId", "shopName")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      Product.countDocuments(baseSellerQuery),
      Product.countDocuments({ ...baseSellerQuery, status: "active" }),
      Product.countDocuments({
        ...baseSellerQuery,
        $expr: {
          $and: [
            {
              $gt: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
            {
              $lte: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $let: {
                    vars: {
                      rawThreshold: {
                        $convert: {
                          input: "$lowStockAlert",
                          to: "double",
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    },
                    in: {
                      $cond: [{ $gt: ["$$rawThreshold", 0] }, "$$rawThreshold", 5],
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      Product.countDocuments({ ...baseSellerQuery, stock: { $lte: 0 } }),
      Product.countDocuments({
        ...baseSellerQuery,
        approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
      }),
      Product.countDocuments({
        ...baseSellerQuery,
        $and: [
          { ...baseSellerQuery },
          buildApprovalStatusFilter(PRODUCT_APPROVAL_STATUS.APPROVED),
        ],
      }),
      Product.countDocuments({
        ...baseSellerQuery,
        approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
      }),
    ]);

    return handleResponse(res, 200, "Seller products fetched", {
      items: normalizeProductListModeration(products),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      summary: {
        total: totalAll,
        active: activeCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE PRODUCT
================================ */
export const createProduct = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const productData = { ...req.body };
    stripRestrictedModerationFields(productData);

    if (role === "admin") {
      if (!productData.sellerId) {
        return handleResponse(res, 400, "sellerId is required for admin-created products");
      }
    } else {
      productData.sellerId = req.user.id;
      for (const field of SELLER_FORBIDDEN_FIELDS) delete productData[field];
    }

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    let failedUploads = 0;
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          failedUploads += 1;
          logger.error("Cloudinary upload failed", {
            scope: "createProduct",
            error: err,
          });
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    }
    // Don't create a product without the photos the seller added.
    if (failedUploads > 0) {
      return handleResponse(res, 502, `${failedUploads} image${failedUploads > 1 ? "s" : ""} failed to upload. Please try again.`);
    }

    // Parse JSON fields if they come as strings from FormData
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        // was logged and silently replaced by [] (product saved without variants)
        return handleResponse(res, 400, "Variants data is invalid. Please check the variant rows and try again.");
      }
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    productData.name = typeof productData.name === "string" ? productData.name.trim() : productData.name;
    if (!productData.name || typeof productData.name !== "string") {
      return handleResponse(res, 400, "Product name is required");
    }
    if (productData.name.length > 200) {
      return handleResponse(res, 400, "Product name is too long (200 characters max)");
    }
    
    // Auto-generate slug
    if (!productData.slug || productData.slug.trim() === "") {
      productData.slug = slugify(productData.name);
    } else {
      productData.slug = slugify(productData.slug);
    }

    productData.description =
      typeof productData.description === "string"
        ? productData.description.trim()
        : productData.description || "";

    // Auto-generate product SKU if missing
    if (!productData.sku || String(productData.sku).trim() === "") {
      productData.sku = makeProductSku(productData.name, 1);
    }

    applyMediaFields(productData);

    // Handle tags if string
    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    // Handle variants if string (multipart/form-data sends as string)
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        productData.variants = [];
      }
    }

    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map((variant, idx) => ({
        ...variant,
        sku:
          variant?.sku && String(variant.sku).trim()
            ? variant.sku
            : makeProductSku(productData.name, idx + 1),
      }));
    }

    normalizeWholesalePrices(productData);
    const identityError = validateVariantIdentity(productData);
    if (identityError) return handleResponse(res, 400, identityError);
    const priceError = validateProductPrices(productData);
    if (priceError) return handleResponse(res, 400, priceError);

    const barcodeError = await validateProductBarcodes(productData, productData.sellerId);
    if (barcodeError) return handleResponse(res, 409, barcodeError);

    const stockError = normalizeStockFields(productData);
    if (stockError) return handleResponse(res, 400, stockError);

    const skuError = await assignUniqueSlugAndSku(productData);
    if (skuError) return handleResponse(res, 409, skuError);

    let moderationUpdate = {};
    let successMessage = "Product created successfully";

    let isPendingApproval = false;
    if (role === "admin") {
      moderationUpdate = buildAdminApprovedModerationUpdate(req.user?.id || null);
    } else {
      const approvalConfig = await getProductApprovalConfig();
      if (approvalConfig.sellerCreateRequiresApproval) {
        moderationUpdate = buildSellerPendingModerationUpdate();
        successMessage = "Product submitted for admin approval";
        isPendingApproval = true;
      } else {
        moderationUpdate = buildSellerApprovedModerationUpdate();
      }
    }
    Object.assign(productData, moderationUpdate);

    const product = await Product.create(productData);
    
    if (isPendingApproval && product && product._id) {
      try {
        const adminIds = await getAdminIds();
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_MODERATION_REQUEST, {
          productId: product._id,
          productName: product.name,
          sellerId: req.user.id,
          adminIds,
          action: 'create'
        });
      } catch (e) {
        logger.error("Notification emission failed", { error: e });
      }
    }
    
    if (product && product._id) {
      // Enqueue search indexing asynchronously
      await enqueueProductIndex(product._id.toString());
      await invalidate(`cache:catalog:product:${product._id.toString()}`);
    }

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "createProduct",
        error: cacheErr,
      });
    }

    return handleResponse(
      res,
      201,
      successMessage,
      normalizeProductDocumentModeration(product?.toObject?.() || product),
    );
  } catch (error) {
    logger.error("Create Product Error", { scope: "createProduct", error });
    if (error.name === "ValidationError") {
      return handleResponse(res, 400, Object.values(error.errors).map((e) => e.message).join(", "));
    }
    if (error.name === "CastError") {
      return handleResponse(res, 400, `Invalid ${error.path}`);
    }
    if (error.code === 11000) {
      return handleResponse(res, 409, "This product code or link is already used. Please try again.");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE PRODUCT
================================ */
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = String(req.user.role || "").toLowerCase();
    const productData = { ...req.body };
    stripRestrictedModerationFields(productData);
    if (Object.prototype.hasOwnProperty.call(productData, "sellerId")) {
      delete productData.sellerId;
    }
    if (role !== "admin") {
      for (const field of SELLER_FORBIDDEN_FIELDS) delete productData[field];
    }
    if (!mongoose.isValidObjectId(id)) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    // Admin bypasses sellerId check
    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOne(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    let failedUploads = 0;
    if (files.length > 0) {
      const galleryUrls = [];
      const oldGalleryImages = Array.isArray(product.galleryImages) ? [...product.galleryImages] : [];
      let gallerySeen = false;
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            // Replaces (and best-effort deletes) the previous main image
            // via its own stored provider — a new capability; this used
            // to leave the old image orphaned on every replace.
            const url = await replaceMedia(product.mainImage, file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            gallerySeen = true;
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          failedUploads += 1;
          logger.error("Cloudinary upload failed during update", {
            scope: "updateProduct",
            error: err,
          });
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
        // The gallery field is replaced wholesale (not appended), so the
        // entire previous set of gallery images is now orphaned — clean
        // each one up via its own stored provider. Best-effort: a
        // cleanup failure here doesn't affect the already-saved new URLs.
        if (gallerySeen && oldGalleryImages.length > 0) {
          for (const oldUrl of oldGalleryImages) {
            deleteMediaByUrl(oldUrl).catch((err) => {
              logger.error("Failed to clean up replaced gallery image", { scope: "updateProduct", error: err.message });
            });
          }
        }
      }
    }

    if (failedUploads > 0) {
      return handleResponse(res, 502, `${failedUploads} image${failedUploads > 1 ? "s" : ""} failed to upload. Please try again.`);
    }

    // Parse JSON fields
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        return handleResponse(res, 400, "Variants data is invalid. Please check the variant rows and try again.");
      }
    }
    if (productData.name !== undefined) {
      productData.name = String(productData.name).trim();
      if (!productData.name) return handleResponse(res, 400, "Product name is required");
      if (productData.name.length > 200) return handleResponse(res, 400, "Product name is too long (200 characters max)");
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    if (productData.name) {
      if (!productData.slug || productData.slug.trim() === "") {
        productData.slug = slugify(productData.name);
      } else {
        productData.slug = slugify(productData.slug);
      }
    }

    if (productData.description !== undefined) {
      productData.description =
        typeof productData.description === "string"
          ? productData.description.trim()
          : productData.description || "";
    }

    const skuBaseName = productData.name || product.name;
    if (!productData.sku || String(productData.sku).trim() === "") {
      productData.sku = product.sku || makeProductSku(skuBaseName, 1);
    }

    applyMediaFields(productData);

    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        // keep existing if invalid?
      }
    }

    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map((variant, idx) => ({
        ...variant,
        sku:
          variant?.sku && String(variant.sku).trim()
            ? variant.sku
            : makeProductSku(skuBaseName, idx + 1),
      }));
    }

    normalizeWholesalePrices(productData);
    const identityError = validateVariantIdentity(productData);
    if (identityError) return handleResponse(res, 400, identityError);
    const priceError = validateProductPrices(productData, product);
    if (priceError) return handleResponse(res, 400, priceError);

    const barcodeError = await validateProductBarcodes(productData, product.sellerId, product._id);
    if (barcodeError) return handleResponse(res, 409, barcodeError);

    const stockError = normalizeStockFields(productData);
    if (stockError) return handleResponse(res, 400, stockError);

    if (productData.slug === product.slug) delete productData.slug;
    const skuError = await assignUniqueSlugAndSku(productData, { excludeId: product._id, currentSku: product.sku });
    if (skuError) return handleResponse(res, 409, skuError);

    let moderationUpdate = {};
    let successMessage = "Product updated successfully";

    let isPendingApproval = false;
    if (role === "admin") {
      moderationUpdate = buildAdminApprovedModerationUpdate(req.user?.id || null);
    } else {
      const approvalConfig = await getProductApprovalConfig();
      if (approvalConfig.sellerEditRequiresApproval) {
        moderationUpdate = buildSellerPendingModerationUpdate();
        successMessage = "Product changes submitted for admin approval";
        isPendingApproval = true;
      } else {
        moderationUpdate = buildSellerApprovedModerationUpdate();
      }
    }
    Object.assign(productData, moderationUpdate);

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: productData },
      { new: true, runValidators: true },
    );
    
    if (isPendingApproval && updatedProduct) {
      try {
        const adminIds = await getAdminIds();
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_MODERATION_REQUEST, {
          productId: updatedProduct._id,
          productName: updatedProduct.name,
          sellerId: req.user.id,
          adminIds,
          action: 'update'
        });
      } catch (e) {
        logger.error("Notification emission failed", { error: e });
      }
    }

    // Enqueue search indexing asynchronously
    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "updateProduct",
        error: cacheErr,
      });
    }

    return handleResponse(
      res,
      200,
      successMessage,
      normalizeProductDocumentModeration(updatedProduct?.toObject?.() || updatedProduct),
    );
  } catch (error) {
    logger.error("Update Product Error", { scope: "updateProduct", error });
    if (error.name === "ValidationError") {
      return handleResponse(
        res,
        400,
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", "),
      );
    }
    if (error.name === "CastError") {
      return handleResponse(res, 400, `Invalid ${error.path}: ${error.value}`);
    }
    if (error.code === 11000) {
      return handleResponse(res, 409, "This product code or link is already used. Please try again.");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   DELETE PRODUCT
================================ */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;

    if (!mongoose.isValidObjectId(id)) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }
    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOneAndDelete(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    // Carts kept the deleted line, and coupon checks / checkout pricing then
    // failed for those customers with "Product not found for line item".
    Cart.updateMany({ "items.productId": product._id }, { $pull: { items: { productId: product._id } } })
      .catch((err) => logger.error("Cart cleanup after product delete failed", { scope: "deleteProduct", error: err.message }));
    
    // Enqueue search index removal asynchronously
    await enqueueProductRemoval(id);
    await invalidate(`cache:catalog:product:${id}`);

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "deleteProduct",
        error: cacheErr,
      });
    }

    return handleResponse(res, 200, "Product deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SINGLE PRODUCT
================================ */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const enforceRadius = isCustomerVisibilityRequest(req);

    let nearbySellerSet = null;
    const coords = parseCustomerCoordinates(req.query || {});
    if (enforceRadius) {
      if (!coords.valid) {
        return handleResponse(
          res,
          400,
          "lat and lng are required for customer product visibility",
        );
      }
      const nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );
      nearbySellerSet = new Set(nearbySellerIds.map(String));
    }

    const cacheKey = buildKey("catalog", "product", id);
    const product = await getOrSet(
      cacheKey,
      async () =>
        Product.findById(id)
          .select(
            "name slug description sku mrp sellingPrice purchaseRate stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants barcode rackCode wholesalePrice manufacturingDate expiryDate showManufacturingDate showExpiryDate createdAt",
          )
          .populate("headerId", "name")
          .populate("categoryId", "name")
          .populate("subcategoryId", "name")
          .populate("sellerId", "shopName")
          .lean(),
      getTTL("product"),
    );

    if (!product) {
      return handleResponse(res, 404, "Product not found");
    }

    if (enforceRadius) {
      const approvalState = resolveProductApprovalStatus(product);
      if (product.status !== "active" || approvalState !== PRODUCT_APPROVAL_STATUS.APPROVED) {
        return handleResponse(res, 404, "Product not found");
      }
    }

    if (enforceRadius) {
      const sellerIdForProduct = String(product?.sellerId?._id || product?.sellerId);
      if (!nearbySellerSet || !nearbySellerSet.has(sellerIdForProduct)) {
        return handleResponse(res, 404, "Product not available in your area");
      }
    }

    let payload = normalizeProductDocumentModeration(product, "detail");
    if (!isInternalPricingVisible(req)) {
      payload = stripInternalPricingFields(payload);
      payload = applyDateVisibilityFilter(payload);
    }

    if (req.user) {
        const userId = req.user.id;
        const purchase = await Order.findOne({
            customer: userId,
            "items.product": id,
            $or: [
                { orderStatus: { $regex: /^delivered$/i } },
                { status: { $regex: /^delivered$/i } }
            ]
        });
        payload.hasPurchased = !!purchase;

        const existingReview = await Review.findOne({
            userId,
            productId: id
        });
        payload.hasReviewed = !!existingReview;
    }

    return handleResponse(
      res,
      200,
      "Product details fetched",
      payload,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN MODERATION LIST
================================ */
export const getModerationProducts = async (req, res) => {
  try {
    const {
      approvalStatus = "all",
      status = "all",
      search = "",
      sellerId,
      category,
      categoryId,
      subcategory,
      subcategoryId,
      header,
      headerId,
      sort = "newest",
    } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const baseQuery = {};
    if (status && status !== "all") {
      baseQuery.status = status;
    }
    if (sellerId && sellerId !== "all") {
      baseQuery.sellerId = sellerId;
    }

    const finalHeaderId = header || headerId;
    const finalCategoryId = category || categoryId;
    const finalSubcategoryId = subcategory || subcategoryId;
    if (finalHeaderId && finalHeaderId !== "all") {
      baseQuery.headerId = finalHeaderId;
    }
    if (finalCategoryId && finalCategoryId !== "all") {
      baseQuery.categoryId = finalCategoryId;
    }
    if (finalSubcategoryId && finalSubcategoryId !== "all") {
      baseQuery.subcategoryId = finalSubcategoryId;
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      if (isProductTextSearchEnabled() && term.length >= 3) {
        baseQuery.$text = { $search: term };
      } else {
        // P3-5: same substring semantics, now safely escaped.
        const safe = buildSearchRegex(term, { anchored: false });
        baseQuery.$or = [
          { name: safe },
          { slug: safe },
          { sku: safe },
        ];
      }
    }

    const effectiveStockExpr = {
      $cond: {
        if: { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
        then: {
          $sum: {
            $map: {
              input: "$variants",
              as: "v",
              in: { $convert: { input: "$$v.stock", to: "double", onError: 0, onNull: 0 } }
            }
          }
        },
        else: { $convert: { input: "$stock", to: "double", onError: 0, onNull: 0 } }
      }
    };

    const thresholdExpr = {
      $let: {
        vars: {
          rawThreshold: { $convert: { input: "$lowStockAlert", to: "double", onError: 0, onNull: 0 } }
        },
        in: { $cond: [{ $gt: ["$$rawThreshold", 0] }, "$$rawThreshold", 10] }
      }
    };

    const { stockStatus = "all" } = req.query;
    if (stockStatus !== "all") {
      if (stockStatus === "out") {
        baseQuery.$expr = { $eq: [effectiveStockExpr, 0] };
      } else if (stockStatus === "low") {
        baseQuery.$expr = {
          $and: [
            { $gt: [effectiveStockExpr, 0] },
            { $lte: [effectiveStockExpr, thresholdExpr] }
          ]
        };
      }
    }

    let moderatedQuery = { ...baseQuery };
    const approvalFilter = buildApprovalStatusFilter(approvalStatus);
    if (Object.keys(approvalFilter).length > 0) {
      moderatedQuery = { $and: [moderatedQuery, approvalFilter] };
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { mrp: 1, createdAt: -1 },
      "price-desc": { mrp: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    // Compute base counts for stats cards, ignoring status/stock filters
    const baseStatsQuery = { ...baseQuery };
    delete baseStatsQuery.status;
    delete baseStatsQuery.$expr;

    const [items, total, allCount, pendingCount, approvedCount, rejectedCount, activeCount, lowStockCount, outOfStockCount] =
      await Promise.all([
        Product.find(moderatedQuery)
          .select(
            "name slug description sku mrp sellingPrice purchaseRate stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants barcode rackCode wholesalePrice manufacturingDate expiryDate showManufacturingDate showExpiryDate createdAt",
          )
          .populate("headerId", "name")
          .populate("categoryId", "name")
          .populate("subcategoryId", "name")
          .populate("sellerId", "shopName name")
          .populate("approvalReviewedBy", "name email")
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(moderatedQuery),
        Product.countDocuments(baseStatsQuery),
        Product.countDocuments({
          ...baseStatsQuery,
          approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
        }),
        Product.countDocuments({
          $and: [
            { ...baseStatsQuery },
            buildApprovalStatusFilter(PRODUCT_APPROVAL_STATUS.APPROVED),
          ],
        }),
        Product.countDocuments({
          ...baseStatsQuery,
          approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
        }),
        Product.countDocuments({ ...baseStatsQuery, status: "active" }),
        Product.countDocuments({
          ...baseStatsQuery,
          $expr: {
            $and: [
              { $gt: [effectiveStockExpr, 0] },
              { $lte: [effectiveStockExpr, thresholdExpr] }
            ]
          }
        }),
        Product.countDocuments({ ...baseStatsQuery, $expr: { $eq: [effectiveStockExpr, 0] } }),
      ]);

    return handleResponse(res, 200, "Moderation products fetched", {
      items: normalizeProductListModeration(items),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      counts: {
        all: allCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        active: activeCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN MODERATION ACTIONS
================================ */
export const approveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const note = req.body?.approvalNote ?? req.body?.note ?? "";
    const moderationUpdate = buildAdminApprovedModerationUpdate(
      req.user?.id || null,
      note,
    );

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: moderationUpdate },
      { new: true, runValidators: true },
    )
      .populate("headerId", "name")
      .populate("categoryId", "name")
      .populate("subcategoryId", "name")
      .populate("sellerId", "shopName name")
      .populate("approvalReviewedBy", "name email");

    if (!updated) {
      return handleResponse(res, 404, "Product not found");
    }

    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");

    return handleResponse(
      res,
      200,
      "Product approved successfully",
      normalizeProductDocumentModeration(updated?.toObject?.() || updated),
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const note = req.body?.approvalNote ?? req.body?.note ?? "";
    const moderationUpdate = buildAdminRejectedModerationUpdate(
      req.user?.id || null,
      note,
    );

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: moderationUpdate },
      { new: true, runValidators: true },
    )
      .populate("headerId", "name")
      .populate("categoryId", "name")
      .populate("subcategoryId", "name")
      .populate("sellerId", "shopName name")
      .populate("approvalReviewedBy", "name email");

    if (!updated) {
      return handleResponse(res, 404, "Product not found");
    }

    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");

    return handleResponse(
      res,
      200,
      "Product rejected successfully",
      normalizeProductDocumentModeration(updated?.toObject?.() || updated),
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
