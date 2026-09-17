/**
 * Cloudinary storage provider.
 *
 * Thin wrapper around the pre-existing Cloudinary upload logic that used
 * to live directly in mediaService.js — same folder conventions, same
 * CLOUDINARY_IMAGE_UPLOAD_FORMAT/QUALITY options, same credentials.
 * Behavior for existing uploads is unchanged; the only new capability
 * here is a real deleteFile() (cloudinary.uploader.destroy was never
 * called anywhere in the codebase before this feature).
 *
 * @module services/storage/providers/cloudinaryProvider
 */

import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import logger from "../../logger.js";

// Perf audit BE-I1 (P6-2): same defaults/reasoning as the mirrored copy of
// these functions in ../../mediaService.js — default to "auto"/auto-quality
// and a generous max-dimension cap instead of the previous
// empty-string-means-disabled defaults, so new uploads through this
// provider get resized/compressed without requiring manual env
// configuration. New uploads only; never touches already-stored media.
function getOptimizedImageFormat() {
  const format = String(process.env.CLOUDINARY_IMAGE_UPLOAD_FORMAT || "").trim().toLowerCase();
  return format === "auto" ? "" : format;
}


function getOptimizedImageQuality() {
  const raw = String(process.env.CLOUDINARY_IMAGE_UPLOAD_QUALITY ?? "auto").trim();
  return raw.startsWith("q_") ? raw.slice(2) : raw;
}

function getOptimizedImageMaxDimension() {
  const raw = parseInt(process.env.CLOUDINARY_IMAGE_MAX_DIMENSION || "2000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 2000;
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

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export function validateConfig() {
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

function uploadResultToStandardShape(result, { folder, mimeType, resourceType }) {
  return {
    provider: "cloudinary",
    url: result.secure_url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    localPath: null,
    objectKey: result.public_id,
    fileName: result.public_id ? result.public_id.split("/").pop() : null,
    mimeType: mimeType || null,
    size: result.bytes || 0,
    width: result.width || null,
    height: result.height || null,
    format: result.format || null,
    resourceType: resourceType || "image",
    folder: folder || result.folder || null,
  };
}

/**
 * Upload a file to Cloudinary.
 * @param {Buffer|{filePath:string}} input - file bytes, or a path descriptor
 *   for the disk-backed generic upload route (avoids buffering large files).
 */
export async function upload(input, { folder = "misc", mimeType = "", resourceType = "image", optimize = true } = {}) {
  validateConfig();
  configureCloudinary();

  const isImage = resourceType === "image" || String(mimeType || "").toLowerCase().startsWith("image/");
  const shouldOptimizeImage = optimize !== false && isImage;
  const uploadOptions = {
    folder,
    resource_type: shouldOptimizeImage ? "image" : "auto",
    ...(shouldOptimizeImage ? getImageUploadOptions() : {}),
  };

  const filePath = input && typeof input === "object" && !Buffer.isBuffer(input) ? input.filePath : null;

  let result;
  if (filePath) {
    // Path-based upload: Cloudinary streams straight from disk, nothing
    // buffered fully in Node memory. Always clean up the temp file
    // afterwards, success or failure, so it never leaks.
    try {
      result = await cloudinary.uploader.upload(filePath, uploadOptions);
    } finally {
      fs.promises.unlink(filePath).catch(() => {});
    }
  } else {
    result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, res) => {
        if (error) reject(error);
        else resolve(res);
      });
      uploadStream.end(input);
    });
  }

  return uploadResultToStandardShape(result, { folder, mimeType, resourceType });
}

/**
 * Delete a Cloudinary asset. Dispatch must always be by the media's
 * stored `provider`/`publicId` fields — never inferred from the URL.
 */
export async function deleteFile(media) {
  if (!media || !media.publicId) return { deleted: false, reason: "no-public-id" };
  validateConfig();
  configureCloudinary();
  const resourceType = media.resourceType === "raw" ? "raw" : media.resourceType === "video" ? "video" : "image";
  try {
    const result = await cloudinary.uploader.destroy(media.publicId, { resource_type: resourceType });
    if (result.result !== "ok" && result.result !== "not found") {
      logger.warn("Cloudinary delete returned unexpected result", { publicId: media.publicId, result: result.result });
    }
    return { deleted: true, result: result.result };
  } catch (error) {
    logger.error("Cloudinary delete failed", { publicId: media.publicId, error: error.message });
    throw error;
  }
}

export default { upload, deleteFile, validateConfig };
