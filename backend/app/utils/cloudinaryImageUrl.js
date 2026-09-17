/**
 * Perf audit BE-I1: a pure, reusable helper for appending Cloudinary
 * delivery-time transformations (resize/compress) to an already-uploaded
 * image's secure_url — WITHOUT touching what's stored in the database.
 *
 * The existing `MediaMetadata.getTransformedUrl()` instance method
 * (backend/app/models/mediaMetadata.js) does the same URL-rewriting but
 * requires a MediaMetadata document; most product/category/offer image URLs
 * are plain strings on those models, not MediaMetadata-backed, so this
 * extracts the same logic into a standalone function both can share.
 */

/**
 * Rewrite a Cloudinary `secure_url` to request a resized/compressed
 * delivery, by inserting a transformation segment after `/upload/`.
 * Non-Cloudinary URLs (or anything that doesn't match the expected shape)
 * are returned unchanged — this must never throw or break an existing URL.
 * @param {string} url
 * @param {{width?: number, height?: number, crop?: string, quality?: string|number, format?: string}} transformations
 * @returns {string}
 */
export function getCloudinaryTransformedUrl(url, transformations = {}) {
  if (!url || typeof url !== "string") return url;
  if (Object.keys(transformations).length === 0) return url;

  const urlParts = url.split("/upload/");
  if (urlParts.length !== 2) return url;

  // Never double-apply a transformation (e.g. if this ever runs twice on
  // the same value, or the URL already carries one from elsewhere).
  if (/^[a-z]_[^/]+/i.test(urlParts[1].split("/")[0])) return url;

  const transformParts = [];
  if (transformations.width) transformParts.push(`w_${transformations.width}`);
  if (transformations.height) transformParts.push(`h_${transformations.height}`);
  if (transformations.crop) transformParts.push(`c_${transformations.crop}`);
  if (transformations.quality) transformParts.push(`q_${transformations.quality}`);
  if (transformations.format) transformParts.push(`f_${transformations.format}`);

  if (!transformParts.length) return url;

  return `${urlParts[0]}/upload/${transformParts.join(",")}/${urlParts[1]}`;
}

// Presets tuned per the context an image is actually displayed at. `q_auto`
// and `f_auto` let Cloudinary pick the best compression/format (e.g. WebP)
// per requesting browser — this is a delivery-time transform only, so it's
// fully reversible and never mutates stored data.
export const IMAGE_PRESETS = {
  // Product/category grid thumbnails (customer catalog, seller/admin tables).
  thumbnail: { width: 400, crop: "limit", quality: "auto", format: "auto" },
  // Product detail hero image / larger single-product views.
  detail: { width: 1000, crop: "limit", quality: "auto", format: "auto" },
  // Small avatar/logo-sized images (category icons, seller/delivery avatars).
  avatar: { width: 150, crop: "limit", quality: "auto", format: "auto" },
};

/**
 * Apply a preset transform to a single image URL.
 * @param {string} url
 * @param {keyof IMAGE_PRESETS} preset
 */
export function transformImageUrl(url, preset = "thumbnail") {
  return getCloudinaryTransformedUrl(url, IMAGE_PRESETS[preset] || IMAGE_PRESETS.thumbnail);
}

/**
 * Apply a preset transform to every URL in an array (skips non-strings).
 * @param {string[]} urls
 * @param {keyof IMAGE_PRESETS} preset
 */
export function transformImageUrlList(urls, preset = "thumbnail") {
  if (!Array.isArray(urls)) return urls;
  return urls.map((u) => (typeof u === "string" ? transformImageUrl(u, preset) : u));
}
