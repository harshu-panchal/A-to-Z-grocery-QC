import mongoose from "mongoose";
import Category from "../models/category.js";
import Product from "../models/product.js";

// Shared by Create Sections (banner sections) and Hero & categories per page,
// so both enforce the same rules.
export const MAX_BANNERS = 10;
const MAX_TITLE = 80;
const MAX_SUBTITLE = 160;
const MAX_URL = 500;
const LINK_TYPES = ["none", "header", "category", "subcategory", "product", "url"];
const CATEGORY_LINK_TYPES = ["header", "category", "subcategory"];

const bannerError = (index, message) => {
  const error = new Error(`Banner ${index + 1}: ${message}`);
  error.statusCode = 400;
  return error;
};

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(value);
const isValidId = (value) => mongoose.Types.ObjectId.isValid(String(value));

/**
 * Validate and normalise the banner list sent by the admin panel.
 * Rows without an image are dropped. Throws an Error (statusCode 400) with a
 * message naming the offending banner when something is wrong.
 */
export async function normalizeBannerItems(rawItems, { min = 0 } = {}) {
  const rows = (Array.isArray(rawItems) ? rawItems : []).filter(
    (b) => b && String(b.imageUrl || "").trim(),
  );

  if (rows.length < min) {
    const error = new Error("Add at least one banner image");
    error.statusCode = 400;
    throw error;
  }
  if (rows.length > MAX_BANNERS) {
    const error = new Error(`A banner list can hold at most ${MAX_BANNERS} banners`);
    error.statusCode = 400;
    throw error;
  }

  const items = [];
  for (let i = 0; i < rows.length; i += 1) {
    const b = rows[i];
    const imageUrl = String(b.imageUrl).trim();
    if (!isHttpUrl(imageUrl)) throw bannerError(i, "the image address is not valid");

    const title = String(b.title || "").trim();
    const subtitle = String(b.subtitle || "").trim();
    if (title.length > MAX_TITLE) throw bannerError(i, `the title is longer than ${MAX_TITLE} characters`);
    if (subtitle.length > MAX_SUBTITLE) {
      throw bannerError(i, `the subtitle is longer than ${MAX_SUBTITLE} characters`);
    }

    const linkType = LINK_TYPES.includes(b.linkType) ? b.linkType : "none";
    const linkValue = String(b.linkValue || "").trim();

    if (linkType !== "none") {
      if (!linkValue) throw bannerError(i, "choose where the banner should open, or set it to \"No link\"");

      if (linkType === "url") {
        if (linkValue.length > MAX_URL) throw bannerError(i, "the link is too long");
        if (!(isHttpUrl(linkValue) || /^\/[^\s/]/.test(linkValue))) {
          throw bannerError(i, "the link must start with https:// or /");
        }
      } else if (linkType === "product") {
        if (!isValidId(linkValue) || !(await Product.exists({ _id: linkValue }))) {
          throw bannerError(i, "the linked product no longer exists");
        }
      } else if (CATEGORY_LINK_TYPES.includes(linkType)) {
        if (!isValidId(linkValue) || !(await Category.exists({ _id: linkValue, type: linkType }))) {
          throw bannerError(i, `the linked ${linkType} no longer exists`);
        }
      }
    }

    items.push({
      imageUrl,
      title,
      subtitle,
      linkType,
      linkValue: linkType === "none" ? "" : linkValue,
      status: b.status === "inactive" ? "inactive" : "active",
    });
  }
  return items;
}

/** Customers only ever see banners that are switched on. */
export const activeBanners = (items) =>
  (Array.isArray(items) ? items : []).filter((b) => b && b.status !== "inactive");
