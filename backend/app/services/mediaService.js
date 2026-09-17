import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import MediaMetadata from "../models/mediaMetadata.js";
import logger from "./logger.js";
import storageService from "./storage/storageService.js";

function getMaxUploadBytes() {
  const raw = parseInt(process.env.MEDIA_MAX_FILE_SIZE || "10485760", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10485760;
}

function getSignedUrlExpirySeconds() {
  const raw = parseInt(process.env.MEDIA_SIGNED_URL_EXPIRY || "900", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 900;
}

function getAllowedMimeTypes() {
  return (
    process.env.MEDIA_ALLOWED_MIME_TYPES ||
    "image/jpeg,image/png,image/webp,image/gif,application/pdf"
  )
    .split(",")
    .map((mime) => mime.trim().toLowerCase())
    .filter(Boolean);
}

function getOptimizedImageFormat() {
  // Perf audit BE-I1: default to "auto" (Cloudinary picks the best format —
  // e.g. WebP/AVIF — per requesting browser) instead of the previous
  // empty-string-means-disabled default. Every product/category/banner
  // photo was previously uploaded and stored at whatever format the
  // uploading device produced (often full-size JPEG), with format
  // optimization only active if an operator had manually set
  // CLOUDINARY_IMAGE_UPLOAD_FORMAT in the environment — which, per the
  // audit, nobody had. Still fully overridable via env if a specific format
  // is ever required. New uploads only — never touches already-stored media.
  const raw = String(process.env.CLOUDINARY_IMAGE_UPLOAD_FORMAT ?? "auto").trim().toLowerCase();
  return raw;
}

function getOptimizedImageQuality() {
  // Perf audit BE-I1: same reasoning as format above — default to "auto"
  // instead of disabled.
  const raw = String(process.env.CLOUDINARY_IMAGE_UPLOAD_QUALITY ?? "auto").trim();
  // Allow legacy values like "q_auto:good" while Cloudinary expects quality "auto:good".
  return raw.startsWith("q_") ? raw.slice(2) : raw;
}

function getOptimizedImageMaxDimension() {
  // Perf audit BE-I1 (P6-2): cap the longest edge of newly-uploaded images.
  // 2000px is generous — no legitimate product/category/banner/profile
  // photo needs to exceed this — while capping what would otherwise be a
  // raw multi-thousand-pixel phone-camera original. Cloudinary's "limit"
  // crop mode (applied below) only ever shrinks an image that exceeds this;
  // it never upscales or crops content out of a smaller image.
  const raw = parseInt(process.env.CLOUDINARY_IMAGE_MAX_DIMENSION || "2000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 2000;
}

function isImageMimeType(mimeType = "") {
  return String(mimeType || "").trim().toLowerCase().startsWith("image/");
}

function buildImageUploadTransformation() {
  const quality = getOptimizedImageQuality();
  const maxDimension = getOptimizedImageMaxDimension();
  const transformation = {};
  if (quality) transformation.quality = quality;
  if (maxDimension) {
    transformation.width = maxDimension;
    transformation.height = maxDimension;
    transformation.crop = "limit";
  }
  if (Object.keys(transformation).length === 0) return null;
  // Use object form to avoid Cloudinary treating string values as a named transformation.
  return [transformation];
}

function getImageUploadOptions() {
  const format = getOptimizedImageFormat();
  const transformation = buildImageUploadTransformation();
  return {
    ...(format ? { format } : {}),
    ...(transformation ? { transformation } : {}),
  };
}

const ENTITY_FOLDER_MAP = {
  product: "products",
  profile: "users",
  category: "categories",
  offer: "offers",
  banner: "banners",
  document: "docs",
  other: "misc",
};

const RESOURCE_TYPE_MAP = {
  image: "image",
  document: "raw",
  raw: "raw",
};

function isSignedUploadsEnabled() {
  const enabled = process.env.ENABLE_SIGNED_UPLOADS;
  return enabled === undefined || enabled === "true" || enabled === "1";
}

function storageProvider() {
  return String(process.env.STORAGE_PROVIDER || "cloudinary").trim().toLowerCase();
}

function validateStorageConfig() {
  if (storageProvider() !== "cloudinary") {
    const err = new Error("Unsupported storage provider configuration");
    err.statusCode = 500;
    throw err;
  }
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    const err = new Error(
      "Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
    err.statusCode = 503;
    throw err;
  }
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function normalizeExtension(rawExtension = "") {
  return String(rawExtension || "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
}

function sanitizeEntityType(entityType = "other") {
  const normalized = String(entityType || "other").trim().toLowerCase();
  return ENTITY_FOLDER_MAP[normalized] ? normalized : "other";
}

function normalizeResourceType(resourceType = "image", mimeType = "") {
  const normalized = String(resourceType || "").trim().toLowerCase();
  if (RESOURCE_TYPE_MAP[normalized]) {
    return normalized === "document" ? "document" : normalized;
  }
  if (String(mimeType || "").toLowerCase() === "application/pdf") {
    return "document";
  }
  return "image";
}

function validateUploadRequest({
  mimeType,
  fileSize,
  extension,
  resourceType,
}) {
  const allowedMimeTypes = getAllowedMimeTypes();
  const maxUploadBytes = getMaxUploadBytes();
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const size = Number(fileSize || 0);
  const ext = normalizeExtension(extension);

  if (!normalizedMime || !allowedMimeTypes.includes(normalizedMime)) {
    const err = new Error("Unsupported MIME type for upload intent");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(size) || size <= 0 || size > maxUploadBytes) {
    const err = new Error(`Invalid file size. Maximum allowed is ${maxUploadBytes} bytes`);
    err.statusCode = 400;
    throw err;
  }

  if (!ext || !/^[a-z0-9]+$/.test(ext)) {
    const err = new Error("Invalid file extension");
    err.statusCode = 400;
    throw err;
  }

  const normalizedResourceType = normalizeResourceType(resourceType, normalizedMime);
  const isDocument = normalizedResourceType === "document";
  const isImage = normalizedResourceType === "image";
  if (isDocument && normalizedMime !== "application/pdf") {
    const err = new Error("Document uploads currently support PDF only");
    err.statusCode = 400;
    throw err;
  }
  if (isImage && !normalizedMime.startsWith("image/")) {
    const err = new Error("Image resource type requires an image MIME type");
    err.statusCode = 400;
    throw err;
  }

  return {
    mimeType: normalizedMime,
    fileSize: size,
    extension: ext,
    resourceType: normalizedResourceType,
  };
}

function buildObjectKey({ entityType, resourceType, userId, extension }) {
  const folder = ENTITY_FOLDER_MAP[entityType] || ENTITY_FOLDER_MAP.other;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const resourceFolder = resourceType === "document" ? "docs" : "images";
  return `quick-commerce/${folder}/${resourceFolder}/${day}/${userId}-${suffix}.${extension}`;
}

function buildIntentId() {
  return `upl_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildUploadFolderFromObjectKey(objectKey) {
  const parts = String(objectKey || "").split("/");
  if (parts.length <= 1) return "quick-commerce/uploads";
  return parts.slice(0, -1).join("/");
}

function buildCloudinarySignedPayload({
  objectKey,
  resourceType,
  expiresInSeconds,
}) {
  configureCloudinary();
  const cloudResourceType = RESOURCE_TYPE_MAP[resourceType] || "image";
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = buildUploadFolderFromObjectKey(objectKey);
  const imageUploadOptions =
    cloudResourceType === "image" ? getImageUploadOptions() : {};
  const signatureParams = {
    timestamp,
    public_id: objectKey,
    folder,
    resource_type: cloudResourceType,
    ...imageUploadOptions,
  };
  const signature = cloudinary.utils.api_sign_request(
    signatureParams,
    process.env.CLOUDINARY_API_SECRET,
  );
  const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${cloudResourceType}/upload`;
  const expiresAt = new Date((timestamp + expiresInSeconds) * 1000);
  return {
    uploadUrl,
    uploadFields: {
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      public_id: objectKey,
      folder,
      resource_type: cloudResourceType,
      ...imageUploadOptions,
    },
    expiresAt,
  };
}

async function createUploadIntent({
  userId,
  uploadedByModel,
  entityType = "other",
  entityId = null,
  resourceType = "image",
  mimeType,
  fileSize,
  extension,
  tags = [],
}) {
  validateStorageConfig();
  if (!isSignedUploadsEnabled()) {
    const err = new Error("Signed uploads are disabled");
    err.statusCode = 503;
    throw err;
  }
  if (!userId || !uploadedByModel) {
    const err = new Error("userId and uploadedByModel are required");
    err.statusCode = 400;
    throw err;
  }

  const normalized = validateUploadRequest({
    mimeType,
    fileSize,
    extension,
    resourceType,
  });
  const safeEntityType = sanitizeEntityType(entityType);
  const objectKey = buildObjectKey({
    entityType: safeEntityType,
    resourceType: normalized.resourceType,
    userId: String(userId),
    extension: normalized.extension,
  });
  const intentId = buildIntentId();
  const signedPayload = buildCloudinarySignedPayload({
    objectKey,
    resourceType: normalized.resourceType,
    expiresInSeconds: getSignedUrlExpirySeconds(),
  });

  const record = await MediaMetadata.create({
    intentId,
    provider: "cloudinary",
    status: "pending",
    objectKey,
    publicId: objectKey,
    secureUrl: "",
    resourceType: normalized.resourceType === "document" ? "raw" : "image",
    format: normalized.extension,
    mimeType: normalized.mimeType,
    extension: normalized.extension,
    bytes: 0,
    bytesExpected: normalized.fileSize,
    uploadedBy: userId,
    uploadedByModel,
    entityType: safeEntityType,
    entityId: entityId || undefined,
    folder: buildUploadFolderFromObjectKey(objectKey),
    tags: Array.isArray(tags) ? tags : [],
    expiresAt: signedPayload.expiresAt,
  });

  logger.info("Media upload intent created", {
    intentId,
    objectKey,
    resourceType: normalized.resourceType,
    uploadedByModel,
    userId,
  });

  return {
    intentId: record.intentId,
    provider: record.provider,
    objectKey: record.objectKey,
    publicId: record.publicId,
    uploadUrl: signedPayload.uploadUrl,
    uploadFields: signedPayload.uploadFields,
    expiresAt: signedPayload.expiresAt.toISOString(),
    constraints: {
      maxFileSize: getMaxUploadBytes(),
      allowedMimeTypes: getAllowedMimeTypes(),
      resourceType: normalized.resourceType,
    },
  };
}

async function confirmUpload(metadata) {
  const {
    intentId,
    publicId,
    secureUrl,
    resourceType = "image",
    format,
    mimeType,
    width,
    height,
    bytes,
    etag = null,
    checksum = null,
    uploadedBy,
    uploadedByModel,
    entityType,
    entityId,
    folder,
    tags = [],
  } = metadata || {};

  let mediaRecord = null;
  if (intentId) {
    mediaRecord = await MediaMetadata.findOne({ intentId });
  } else if (publicId) {
    mediaRecord = await MediaMetadata.findOne({ publicId });
  }

  if (!mediaRecord) {
    const err = new Error("Upload intent not found");
    err.statusCode = 404;
    throw err;
  }

  if (mediaRecord.status === "confirmed") {
    return {
      _id: mediaRecord._id,
      intentId: mediaRecord.intentId,
      publicId: mediaRecord.publicId,
      objectKey: mediaRecord.objectKey,
      secureUrl: mediaRecord.secureUrl,
      status: mediaRecord.status,
      createdAt: mediaRecord.createdAt,
    };
  }

  if (mediaRecord.expiresAt && mediaRecord.expiresAt.getTime() < Date.now()) {
    const err = new Error("Upload intent has expired");
    err.statusCode = 410;
    throw err;
  }

  if (publicId && publicId !== mediaRecord.publicId) {
    const err = new Error("Upload confirmation publicId does not match intent");
    err.statusCode = 400;
    throw err;
  }

  const resolvedSecureUrl = String(secureUrl || "").trim();
  if (!resolvedSecureUrl) {
    const err = new Error("secureUrl is required to confirm upload");
    err.statusCode = 400;
    throw err;
  }

  const normalizedResourceType = normalizeResourceType(resourceType, mimeType || mediaRecord.mimeType);
  const normalizedFormat = normalizeExtension(format || mediaRecord.extension || mediaRecord.format);
  const uploadedBytes = Number(bytes || mediaRecord.bytesExpected || 0);
  const maxUploadBytes = getMaxUploadBytes();
  if (!Number.isFinite(uploadedBytes) || uploadedBytes <= 0) {
    const err = new Error("Uploaded file size is required");
    err.statusCode = 400;
    throw err;
  }
  if (uploadedBytes > maxUploadBytes) {
    const err = new Error(`Uploaded file exceeds max size of ${maxUploadBytes} bytes`);
    err.statusCode = 400;
    throw err;
  }

  // Audit fix M5: the signed-upload flow has the client upload directly to
  // Cloudinary and then self-report success via this endpoint — nothing
  // server-side previously verified the asset actually exists before
  // flipping status to "confirmed". A buggy or malicious client could call
  // confirm without ever uploading (or after the upload failed) and
  // produce a MediaMetadata row that points at a non-existent asset,
  // rendering as a broken image in production. Verify against Cloudinary's
  // Admin API before confirming.
  if (storageProvider() === "cloudinary") {
    configureCloudinary();
    const verifyPublicId = mediaRecord.publicId || publicId;
    try {
      await cloudinary.api.resource(verifyPublicId, {
        resource_type: normalizedResourceType === "document" ? "raw" : "image",
      });
    } catch (verifyError) {
      const err = new Error("Uploaded asset could not be verified with the storage provider");
      err.statusCode = 502;
      throw err;
    }
  }

  mediaRecord.status = "confirmed";
  mediaRecord.publicId = mediaRecord.publicId || publicId;
  mediaRecord.objectKey = mediaRecord.objectKey || mediaRecord.publicId;
  mediaRecord.secureUrl = resolvedSecureUrl;
  mediaRecord.resourceType = normalizedResourceType === "document" ? "raw" : "image";
  mediaRecord.format = normalizedFormat || mediaRecord.format || "";
  mediaRecord.mimeType = String(mimeType || mediaRecord.mimeType || "").toLowerCase() || null;
  mediaRecord.extension = normalizedFormat || mediaRecord.extension || null;
  mediaRecord.width = Number.isFinite(Number(width)) ? Number(width) : mediaRecord.width;
  mediaRecord.height = Number.isFinite(Number(height)) ? Number(height) : mediaRecord.height;
  mediaRecord.bytes = uploadedBytes;
  mediaRecord.etag = etag || mediaRecord.etag;
  mediaRecord.checksum = checksum || mediaRecord.checksum;
  mediaRecord.expiresAt = null;
  mediaRecord.confirmedAt = new Date();

  if (uploadedBy) mediaRecord.uploadedBy = uploadedBy;
  if (uploadedByModel) mediaRecord.uploadedByModel = uploadedByModel;
  if (entityType) mediaRecord.entityType = sanitizeEntityType(entityType);
  if (entityId) mediaRecord.entityId = entityId;
  if (folder) mediaRecord.folder = folder;
  if (Array.isArray(tags) && tags.length > 0) mediaRecord.tags = tags;

  await mediaRecord.save();

  logger.info("Media upload confirmed", {
    intentId: mediaRecord.intentId,
    publicId: mediaRecord.publicId,
    uploadedBy: String(mediaRecord.uploadedBy || ""),
  });

  const thumbnailUrl = mediaRecord.getTransformedUrl({
    width: 200,
    height: 200,
    crop: "thumb",
  });

  return {
    _id: mediaRecord._id,
    intentId: mediaRecord.intentId,
    publicId: mediaRecord.publicId,
    objectKey: mediaRecord.objectKey,
    secureUrl: mediaRecord.secureUrl,
    thumbnailUrl,
    bytes: mediaRecord.bytes,
    mimeType: mediaRecord.mimeType,
    status: mediaRecord.status,
    createdAt: mediaRecord.createdAt,
  };
}

function getMediaURL(publicId, transformations = {}) {
  if (!publicId) return "";
  configureCloudinary();
  return cloudinary.url(publicId, {
    secure: true,
    ...transformations,
  });
}

async function deleteMedia(publicId, userId, userModel) {
  const media = await MediaMetadata.findOne({
    $or: [{ publicId }, { objectKey: publicId }],
    isDeleted: false,
  }).select("+localPath");
  if (!media) {
    const err = new Error("Media not found or already deleted");
    err.statusCode = 404;
    throw err;
  }
  if (
    String(media.uploadedBy || "") !== String(userId || "") ||
    media.uploadedByModel !== userModel
  ) {
    const err = new Error("User does not own this media");
    err.statusCode = 403;
    throw err;
  }
  // Audit fix: this used to be soft-delete only — the underlying asset
  // was never actually removed from Cloudinary (or, now, local disk).
  // Dispatch by media.provider (never inferred from the URL) so a
  // local file is never deleted via the Cloudinary API and vice versa.
  try {
    await storageService.deleteFile(media);
  } catch (providerError) {
    logger.error("Provider-side delete failed during deleteMedia", {
      publicId: media.publicId,
      provider: media.provider,
      error: providerError.message,
    });
  }
  await media.softDelete();
}

/**
 * Upload a buffer/file to the currently-configured storage provider
 * (Cloudinary or local disk, chosen via Setting.mediaStorage.provider).
 * Kept as a bare-string-returning function so every existing call site
 * (categoryController, productController, experienceController,
 * settingsController, sellerAuthController, deliveryAuthController,
 * mediaRoutes) works unchanged — the provider-switching abstraction
 * lives entirely underneath this stable interface.
 * @param {Buffer|{filePath:string}} fileBuffer
 */
async function uploadToCloudinary(fileBuffer, folder = "categories", options = {}) {
  const result = await storageService.upload(fileBuffer, {
    folder,
    entityType: options.entityType || folderToEntityType(folder),
    mimeType: options.mimeType,
    resourceType: options.resourceType,
    optimize: options.optimize,
    uploadedBy: options.uploadedBy,
    uploadedByModel: options.uploadedByModel,
    entityId: options.entityId,
  });
  return result.url;
}

/**
 * Upload a replacement file and best-effort delete the old one (via the
 * old file's own stored provider — see storageService.replace). New
 * capability: none of the buffer-upload call sites previously deleted
 * the file they were replacing.
 * @param {string} oldUrl - the URL currently stored on the parent document
 * @param {Buffer|{filePath:string}} fileBuffer
 */
async function replaceMedia(oldUrl, fileBuffer, folder = "categories", options = {}) {
  const result = await storageService.replace(oldUrl, fileBuffer, {
    folder,
    entityType: options.entityType || folderToEntityType(folder),
    mimeType: options.mimeType,
    resourceType: options.resourceType,
    optimize: options.optimize,
    uploadedBy: options.uploadedBy,
    uploadedByModel: options.uploadedByModel,
    entityId: options.entityId,
  });
  return result.url;
}

/**
 * Delete a tracked file by its stored URL (e.g. one entry from an image
 * gallery array that's being replaced wholesale). No-ops for untracked
 * legacy URLs. Dispatch is always by the record's own `provider` field.
 */
async function deleteMediaByUrl(url) {
  return storageService.deleteByUrl(url);
}

function folderToEntityType(folder = "") {
  const normalized = String(folder || "").toLowerCase();
  if (normalized.includes("product")) return "product";
  if (normalized.includes("categor")) return "category";
  if (normalized.includes("banner")) return "banner";
  if (normalized.includes("settings")) return "settings";
  if (normalized.includes("delivery") || normalized.includes("profile")) return "profile";
  if (normalized.includes("doc")) return "document";
  return "other";
}

async function generateSignedUploadURL(options) {
  const {
    userId,
    uploadedByModel = "Customer",
    entityType = "other",
    entityId = null,
    resourceType = "image",
    mimeType,
    fileSize,
    extension,
    tags = [],
  } = options || {};

  return createUploadIntent({
    userId,
    uploadedByModel,
    entityType,
    entityId,
    resourceType,
    mimeType,
    fileSize,
    extension,
    tags,
  });
}

export {
  createUploadIntent,
  generateSignedUploadURL,
  confirmUpload,
  getMediaURL,
  deleteMedia,
  uploadToCloudinary,
  replaceMedia,
  deleteMediaByUrl,
  isSignedUploadsEnabled,
};

export default {
  createUploadIntent,
  generateSignedUploadURL,
  confirmUpload,
  getMediaURL,
  deleteMedia,
  uploadToCloudinary,
  replaceMedia,
  deleteMediaByUrl,
  isSignedUploadsEnabled,
};
