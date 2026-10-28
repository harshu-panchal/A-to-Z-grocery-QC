export const MAX_BANNERS = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

let keyCounter = 0;
const nextKey = () => `banner-${Date.now()}-${(keyCounter += 1)}`;

export const newBanner = () => ({
  key: nextKey(),
  imageUrl: "",
  title: "",
  subtitle: "",
  linkType: "none",
  linkValue: "",
  status: "active",
  isUploading: false,
});

/** Saved banners -> editor rows (adds the stable key the list needs). */
export const toEditorItems = (items) =>
  (items || []).map((b) => ({ ...newBanner(), ...b, key: nextKey(), isUploading: false }));

/** Editor rows -> what the API stores (rows without an image are dropped). */
export const bannerPayload = (items) =>
  (items || [])
    .filter((b) => b.imageUrl)
    .map((b) => ({
      imageUrl: b.imageUrl,
      title: (b.title || "").trim(),
      subtitle: (b.subtitle || "").trim(),
      linkType: b.linkType || "none",
      linkValue: b.linkType && b.linkType !== "none" ? (b.linkValue || "").trim() : "",
      status: b.status === "inactive" ? "inactive" : "active",
    }));

/** First problem found in the editor rows, or null when they can be saved. */
export const validateBanners = (items) => {
  const rows = items || [];
  if (rows.some((b) => b.isUploading)) return "Please wait for all banner images to finish uploading";
  for (let i = 0; i < rows.length; i += 1) {
    const b = rows[i];
    const touched = b.title || b.subtitle || (b.linkType && b.linkType !== "none");
    if (!b.imageUrl && touched) return `Banner ${i + 1} has details but no image. Upload an image or remove it.`;
    if (!b.imageUrl) continue;
    if (b.linkType && b.linkType !== "none" && !String(b.linkValue || "").trim()) {
      return `Banner ${i + 1}: choose where it opens, or set the link to "No link".`;
    }
    if (b.linkType === "url" && !/^(https?:\/\/\S+|\/[^\s/]\S*)$/i.test(String(b.linkValue || "").trim())) {
      return `Banner ${i + 1}: the web address must start with https:// or /`;
    }
  }
  return null;
};
