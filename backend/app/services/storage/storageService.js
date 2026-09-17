/**
 * Storage abstraction facade.
 *
 * Controller → storageService → {cloudinaryProvider|localProvider}. The
 * rest of the app should never branch on provider itself, and must never
 * infer a media file's provider from its URL — the provider is always
 * read from the explicit `provider` field stored on MediaMetadata (or,
 * for the current-upload-destination decision, from Setting.mediaStorage
 * .provider in MongoDB).
 *
 * @module services/storage/storageService
 */

import Setting from "../../models/setting.js";
import MediaMetadata from "../../models/mediaMetadata.js";
import logger from "../logger.js";
import { getOrSet, invalidate } from "../cacheService.js";
import * as cloudinaryProvider from "./providers/cloudinaryProvider.js";
import * as localProvider from "./providers/localProvider.js";

const PROVIDER_SETTING_CACHE_KEY = "cache:platform:mediaStorageProvider";
const VALID_PROVIDERS = ["cloudinary", "local"];

const PROVIDERS = {
  cloudinary: cloudinaryProvider,
  local: localProvider,
};

function getEnvDefaultProvider() {
  const raw = String(process.env.STORAGE_PROVIDER || "cloudinary").trim().toLowerCase();
  return VALID_PROVIDERS.includes(raw) ? raw : "cloudinary";
}

/**
 * Current storage provider for NEW uploads, read from MongoDB
 * (Setting.mediaStorage.provider) with a short cache. Falls back to the
 * env default only when no Setting document exists yet — this is what
 * guarantees existing deployments keep using Cloudinary with zero
 * manual DB changes.
 */
export async function getCurrentProvider() {
  const provider = await getOrSet(
    PROVIDER_SETTING_CACHE_KEY,
    async () => {
      const setting = await Setting.findOne({}).select("mediaStorage").lean();
      const configured = setting?.mediaStorage?.provider;
      return VALID_PROVIDERS.includes(configured) ? configured : getEnvDefaultProvider();
    },
    60,
  );
  return VALID_PROVIDERS.includes(provider) ? provider : getEnvDefaultProvider();
}

export async function invalidateProviderCache() {
  await invalidate(PROVIDER_SETTING_CACHE_KEY);
}

function resolveResourceType(resourceType = "image", mimeType = "") {
  const normalized = String(resourceType || "").trim().toLowerCase();
  if (["image", "video", "document", "raw"].includes(normalized)) {
    return normalized === "raw" ? "document" : normalized;
  }
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function providerFor(name) {
  const impl = PROVIDERS[name];
  if (!impl) {
    const err = new Error(`Unsupported storage provider: ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return impl;
}

/**
 * Upload a file via the currently-configured provider and record it in
 * MediaMetadata. Returns a standardized result `{ url, mediaId, provider, ... }`.
 *
 * @param {Buffer|{filePath:string}} input
 * @param {object} options
 * @param {string} [options.entityType] - product|profile|category|offer|banner|document|settings|other
 * @param {string} [options.resourceType] - image|video|document
 * @param {string} [options.mimeType]
 * @param {string} [options.folder] - Cloudinary folder override (ignored by localProvider, which derives its own layout from entityType)
 * @param {string} [options.originalName]
 * @param {import('mongoose').Types.ObjectId|string} [options.uploadedBy]
 * @param {string} [options.uploadedByModel]
 * @param {string} [options.entityId]
 */
export async function upload(input, options = {}) {
  const provider = await getCurrentProvider();
  const impl = providerFor(provider);
  const resourceType = resolveResourceType(options.resourceType, options.mimeType);

  const uploadResult = await impl.upload(input, {
    folder: options.folder || "misc",
    entityType: options.entityType || "other",
    mimeType: options.mimeType || "",
    resourceType,
    optimize: options.optimize,
  });

  try {
    const media = await MediaMetadata.create({
      provider: uploadResult.provider,
      status: "confirmed",
      objectKey: uploadResult.objectKey,
      publicId: uploadResult.publicId,
      localPath: uploadResult.localPath,
      secureUrl: uploadResult.url,
      resourceType: resourceType === "document" ? "raw" : resourceType,
      format: uploadResult.format || "",
      mimeType: uploadResult.mimeType,
      width: uploadResult.width || undefined,
      height: uploadResult.height || undefined,
      bytes: uploadResult.size || 0,
      uploadedBy: options.uploadedBy,
      uploadedByModel: options.uploadedByModel,
      entityType: options.entityType || "other",
      entityId: options.entityId || undefined,
      folder: uploadResult.folder,
      confirmedAt: new Date(),
    });

    return {
      url: uploadResult.url,
      mediaId: media._id,
      provider: uploadResult.provider,
      publicId: uploadResult.publicId,
      width: uploadResult.width,
      height: uploadResult.height,
      size: uploadResult.size,
    };
  } catch (dbError) {
    // Step 27: never leave an orphaned upload behind a failed DB write.
    logger.error("MediaMetadata write failed after successful upload; cleaning up orphan", {
      provider: uploadResult.provider,
      objectKey: uploadResult.objectKey,
      error: dbError.message,
    });
    try {
      await impl.deleteFile({
        publicId: uploadResult.publicId,
        localPath: uploadResult.localPath,
        resourceType: resourceType === "document" ? "raw" : resourceType,
      });
    } catch (cleanupError) {
      logger.error("Orphan cleanup after DB failure also failed", {
        objectKey: uploadResult.objectKey,
        error: cleanupError.message,
      });
    }
    throw dbError;
  }
}

/**
 * Delete a MediaMetadata-tracked file. Provider is always taken from the
 * record itself (`media.provider`), never inferred from the URL.
 */
export async function deleteFile(media) {
  if (!media) return { deleted: false, reason: "no-media" };
  const impl = providerFor(media.provider);
  return impl.deleteFile(media);
}

/**
 * Delete a tracked file by its stored URL (looked up via an exact
 * MediaMetadata.secureUrl match — a DB lookup key, not URL-content
 * branching). No-ops silently for untracked/legacy URLs, matching the
 * "never auto-delete files this feature didn't create" rule.
 */
export async function deleteByUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return { deleted: false, reason: "no-url" };
  const media = await MediaMetadata.findOne({ secureUrl: trimmed, isDeleted: false })
    .select("+localPath")
    .lean();
  if (!media) return { deleted: false, reason: "not-tracked" };
  try {
    await deleteFile(media);
    await MediaMetadata.updateOne(
      { _id: media._id },
      { $set: { isDeleted: true, deletedAt: new Date(), status: "deleted" } },
    );
    return { deleted: true };
  } catch (error) {
    logger.error("deleteByUrl failed", { url: trimmed, error: error.message });
    return { deleted: false, reason: error.message };
  }
}

/**
 * Upload a replacement file, then best-effort delete the old one via its
 * own stored provider. Upload happens FIRST and delete SECOND (not the
 * other way around): if the new upload fails, the old file/DB reference
 * is untouched — the caller's document never ends up with a broken or
 * missing image. If oldUrl doesn't match any tracked MediaMetadata row
 * (e.g. it predates this feature), the delete step is skipped — legacy,
 * untracked files are never auto-deleted.
 */
export async function replace(oldUrl, input, options = {}) {
  const result = await upload(input, options);

  // Best-effort: the new file is already uploaded and returned to the
  // caller above, so a delete failure on the old file is a harmless
  // orphan, not a broken reference — deleteByUrl already logs internally.
  await deleteByUrl(oldUrl);

  return result;
}

export default { getCurrentProvider, invalidateProviderCache, upload, deleteFile, deleteByUrl, replace };
