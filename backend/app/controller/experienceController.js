import ExperienceSection from "../models/experienceSection.js";
import HeroConfig from "../models/heroConfig.js";
import Category from "../models/category.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { normalizeBannerItems, activeBanners } from "../services/bannerItems.js";

/* ===============================
   Helpers
================================ */
const validateBasePayload = async (body) => {
  const {
    pageType,
    headerId,
    displayType,
    title,
    order,
    status,
    config = {},
  } = body;

  if (!["home", "header"].includes(pageType)) {
    throw new Error("Invalid pageType");
  }

  if (!["banners", "categories", "subcategories", "products"].includes(displayType)) {
    throw new Error("Invalid displayType");
  }

  if (pageType === "header") {
    if (!headerId) {
      throw new Error("headerId is required for header pageType");
    }
    const header = await Category.findOne({ _id: headerId, type: "header" });
    if (!header) {
      throw new Error("Invalid headerId");
    }
  }

  if (["categories", "subcategories", "products"].includes(displayType)) {
    if (!title || !title.trim()) {
      throw new Error("Title is required for this displayType");
    }
  }

  if (order !== undefined && Number.isNaN(Number(order))) {
    throw new Error("order must be a number");
  }

  if (status && !["active", "inactive"].includes(status)) {
    throw new Error("Invalid status");
  }

  return {
    pageType,
    headerId: headerId || null,
    displayType,
    title: title?.trim() || "",
    order: order === undefined || order === null || order === "" ? undefined : Number(order),
    status: status || "active",
    config,
  };
};

const normalizeUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    return "";
  }
  return normalized;
};

// Layout numbers from the admin form: whole numbers within what the
// storefront can lay out.
const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const MAX_ROWS = 10;
const MAX_TILE_COLUMNS = 8; // category / subcategory tiles
const MAX_PRODUCT_COLUMNS = 6; // product grid on desktop

const validateAndNormalizeConfig = async (displayType, config = {}) => {
  const normalized = {};

  if (displayType === "banners") {
    normalized.banners = {
      items: await normalizeBannerItems(config.items, { min: 1 }),
    };
    return normalized;
  }

  if (displayType === "categories") {
    const maxItems = config.maxItems ? clampInt(config.maxItems, 1, 100, undefined) : undefined;
    const rows = clampInt(config.rows, 1, MAX_ROWS, 1);
    const columns = clampInt(config.columns, 1, MAX_TILE_COLUMNS, 4);
    const categoryIds = Array.isArray(config.categoryIds)
      ? [...new Set(config.categoryIds.filter(Boolean).map(String))]
      : [];

    if (!categoryIds.length) {
      throw new Error("At least one categoryId is required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");

    if (categories.length !== categoryIds.length) {
      throw new Error("Provided categoryIds are invalid");
    }

    // Keep the admin's pick order (the storefront shows them in this order).
    normalized.categories = {
      maxItems,
      categoryIds,
      rows,
      columns,
    };
    return normalized;
  }

  if (displayType === "subcategories") {
    const rows = clampInt(config.rows, 1, MAX_ROWS, 1);
    const columns = clampInt(config.columns, 1, MAX_TILE_COLUMNS, 4);
    const categoryIds = Array.isArray(config.categoryIds)
      ? [...new Set(config.categoryIds.filter(Boolean).map(String))]
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? [...new Set(config.subcategoryIds.filter(Boolean).map(String))]
      : [];

    if (!categoryIds.length || !subcategoryIds.length) {
      throw new Error("categoryIds and subcategoryIds are required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");
    const subcategories = await Category.find({
      _id: { $in: subcategoryIds },
      type: "subcategory",
    }).select("_id parentId");

    const chosenCategories = new Set(categories.map((c) => String(c._id)));
    if (
      categories.length !== categoryIds.length ||
      subcategories.length !== subcategoryIds.length ||
      subcategories.some((s) => !chosenCategories.has(String(s.parentId)))
    ) {
      throw new Error("Provided categoryIds or subcategoryIds are invalid");
    }

    normalized.subcategories = {
      categoryIds,
      subcategoryIds,
      rows,
      columns,
    };
    return normalized;
  }

  if (displayType === "products") {
    const rows = clampInt(config.rows, 1, MAX_ROWS, 1);
    const columns = clampInt(config.columns, 1, MAX_PRODUCT_COLUMNS, 2);
    const singleRowScrollable = Boolean(config.singleRowScrollable);

    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? config.subcategoryIds.filter(Boolean)
      : [];
    const productIds = Array.isArray(config.productIds)
      ? config.productIds.filter(Boolean)
      : [];

    const normalizedRows = singleRowScrollable ? 1 : rows;
    const normalizedColumns = columns;

    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, type: "category" }).select("_id")
      : [];
    const subcategories = subcategoryIds.length
      ? await Category.find({
          _id: { $in: subcategoryIds },
          type: "subcategory",
        }).select("_id")
      : [];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select("_id")
      : [];

    // A section with nothing chosen renders nothing on the storefront.
    if (!categories.length && !subcategories.length && !products.length) {
      throw new Error("Choose at least one product, category or subcategory");
    }

    normalized.products = {
      categoryIds: categories.map((c) => c._id),
      subcategoryIds: subcategories.map((s) => s._id),
      productIds: products.map((p) => p._id),
      rows: normalizedRows,
      columns: normalizedColumns,
      singleRowScrollable,
    };
    return normalized;
  }

  return normalized;
};

/* ===============================
   ADMIN: List sections
================================ */
export const getAdminExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;
    const query = {};

    if (pageType) query.pageType = pageType;
    if (headerId) query.headerId = headerId;

    const sections = await ExperienceSection.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return handleResponse(res, 200, "Experience sections fetched", sections);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Create section
================================ */
export const createExperienceSection = async (req, res) => {
  try {
    const base = await validateBasePayload(req.body);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    const count = await ExperienceSection.countDocuments({
      pageType: base.pageType,
      headerId: base.headerId,
    });

    const section = await ExperienceSection.create({
      ...base,
      order: base.order ?? count,
      config,
    });
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 201, "Experience section created", section);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Update section
================================ */
export const updateExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await ExperienceSection.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Section not found");
    }

    const merged = {
      ...existing.toObject(),
      ...req.body,
      config: { ...(existing.config || {}), ...(req.body.config || {}) },
    };

    const base = await validateBasePayload(merged);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    existing.pageType = base.pageType;
    existing.headerId = base.headerId;
    existing.displayType = base.displayType;
    existing.title = base.title;
    existing.order = base.order ?? existing.order;
    existing.status = base.status;
    existing.config = config;

    await existing.save();
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section updated", existing);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Delete section
================================ */
export const deleteExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await ExperienceSection.findByIdAndDelete(id);

    if (!section) {
      return handleResponse(res, 404, "Section not found");
    }
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Reorder sections
================================ */
export const reorderExperienceSections = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      // Nothing to reorder – treat as success to avoid noisy errors
      return handleResponse(res, 200, "No sections to reorder");
    }

    const bulkOps = items
      .filter(
        (it) => it && it.id && mongoose.Types.ObjectId.isValid(it.id)
      )
      .map((it) => ({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { order: it.order } },
        },
      }));

    if (!bulkOps.length) {
      // If all items were empty / malformed, avoid throwing and just ack
      return handleResponse(res, 200, "No valid sections to reorder");
    }

    await ExperienceSection.bulkWrite(bulkOps);
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Sections reordered");
  } catch (error) {
    console.error("Error while reordering experience sections:", error);
    return handleResponse(res, 500, "Failed to reorder sections");
  }
};

/* ===============================
   PUBLIC: Get sections for page
================================ */
export const getPublicExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    const query = { pageType, status: "active" };
    if (pageType === "header") {
      if (!headerId) {
        return handleResponse(res, 400, "headerId is required for header pageType");
      }
      query.headerId = headerId;
    }

    const cacheKey = buildKey(
      "experience",
      "public",
      `${pageType}:${headerId || "root"}`,
    );
    const sections = await getOrSet(
      cacheKey,
      async () =>
        ExperienceSection.find(query)
          .sort({ order: 1, createdAt: 1, _id: 1 })
          .lean(),
      getTTL("homepage"),
    );

    const visible = sections
      .map((section) =>
        section.displayType === "banners"
          ? {
              ...section,
              config: {
                ...section.config,
                banners: { items: activeBanners(section.config?.banners?.items) },
              },
            }
          : section,
      )
      .filter(
        (section) =>
          section.displayType !== "banners" || section.config.banners.items.length > 0,
      );

    return handleResponse(res, 200, "Experience sections fetched", visible);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Upload banner image
================================ */
export const uploadBannerImage = async (req, res) => {
  try {
    if (req.file) {
      const uploadedUrl = await uploadToCloudinary(req.file.buffer, "banners", {
        mimeType: req.file.mimetype,
        resourceType: "image",
      });
      await invalidate("cache:experience:public:*");
      return handleResponse(res, 200, "Banner image uploaded", { url: uploadedUrl });
    }

    const url = normalizeUrl(req.body?.url || req.body?.imageUrl);
    if (!url) {
      return handleResponse(res, 400, "A valid image URL is required");
    }
    await invalidate("cache:experience:public:*");
    return handleResponse(res, 200, "Banner image uploaded", { url });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   HERO CONFIG (separate from experience sections)
   Public: get hero config for a page (with fallback to home)
   Admin: get one / list, upsert
================================ */

export const getPublicHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const cacheKey = buildKey(
      "experience",
      "hero",
      `${pageType}:${headerId || "root"}`,
    );
    const config = await getOrSet(
      cacheKey,
      async () => {
        let resolved = null;
        if (pageType === "header") {
          resolved = await HeroConfig.findOne({
            pageType: "header",
            headerId,
          }).lean();
        }
        if (!resolved && (pageType === "home" || pageType === "header")) {
          resolved = await HeroConfig.findOne({
            pageType: "home",
            headerId: null,
          }).lean();
        }
        return resolved || null;
      },
      getTTL("homepage"),
    );

    const payload = config
      ? {
          banners: { items: activeBanners(config.banners?.items) },
          categoryIds: config.categoryIds || [],
        }
      : { banners: { items: [] }, categoryIds: [] };

    return handleResponse(res, 200, "Hero config fetched", payload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const config = await HeroConfig.findOne({
      pageType,
      headerId: pageType === "header" ? headerId : null,
    }).lean();

    return handleResponse(
      res,
      200,
      "Hero config fetched",
      config || { banners: { items: [] }, categoryIds: [] }
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const upsertHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId, banners, categoryIds } = req.body;

    if (!["home", "header"].includes(pageType)) {
      return handleResponse(res, 400, "Invalid pageType");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    if (pageType === "header") {
      const header = await Category.findOne({ _id: headerId, type: "header" });
      if (!header) {
        return handleResponse(res, 400, "Invalid headerId");
      }
    }

    const bannerItems = await normalizeBannerItems(banners?.items);

    const ids = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];

    const filter = {
      pageType,
      headerId: pageType === "header" ? headerId : null,
    };

    const update = {
      banners: { items: bannerItems },
      categoryIds: ids,
    };

    const config = await HeroConfig.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    await invalidate("cache:experience:hero:*");

    return handleResponse(res, 200, "Hero config saved", config);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
