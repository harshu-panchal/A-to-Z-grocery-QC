/**
 * Local-disk storage provider.
 *
 * Writes uploads under LOCAL_STORAGE_ROOT (recommended: a directory
 * outside the application source tree, e.g. /var/www/ecommerce-storage)
 * and serves them via a public URL (Nginx `alias` in production, an
 * express.static fallback mount in development). Never exposes the
 * absolute filesystem path to callers outside this module.
 *
 * @module services/storage/providers/localProvider
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import logger from "../../logger.js";
import { getOrSet } from "../../cacheService.js";

// Folder layout mirrors the entity types already used by the Cloudinary
// side (mediaService.js ENTITY_FOLDER_MAP) so both providers organize
// media the same conceptual way.
const ENTITY_FOLDER_MAP = {
  product: "products",
  profile: "users",
  category: "categories",
  offer: "offers",
  banner: "banners",
  document: "documents",
  settings: "settings",
  other: "misc",
};

const RESOURCE_BUCKET_MAP = {
  image: "images",
  video: "videos",
  document: "documents",
  raw: "documents",
};

const IMAGE_MAGIC_BYTES = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

function isWebpBuffer(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

/**
 * Server-side MIME sniff for images — never trusts the client-declared
 * mimetype alone (Step 12/23 requirement).
 */
function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (isWebpBuffer(buffer)) return "image/webp";
  for (const { mime, bytes } of IMAGE_MAGIC_BYTES) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) {
      return mime;
    }
  }
  return null;
}

export function getStorageRoot() {
  const configured = String(process.env.LOCAL_STORAGE_ROOT || "").trim();
  if (configured) return path.resolve(configured);
  // Dev-only fallback: outside the repo (OS temp dir), so local testing
  // works without any .env changes. Production MUST set LOCAL_STORAGE_ROOT.
  return path.join(os.tmpdir(), "ecommerce-storage-dev");
}

function getPublicUrlBase() {
  const configured = String(process.env.LOCAL_STORAGE_PUBLIC_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const port = parseInt(process.env.PORT || "7000", 10);
  return `http://localhost:${port}/uploads`;
}

function sanitizeEntityType(entityType = "other") {
  const normalized = String(entityType || "other").trim().toLowerCase();
  return ENTITY_FOLDER_MAP[normalized] ? normalized : "other";
}

function getMaxBytesFor(resourceType) {
  if (resourceType === "video") {
    const raw = parseInt(process.env.LOCAL_STORAGE_MAX_VIDEO_SIZE || String(100 * 1024 * 1024), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 100 * 1024 * 1024;
  }
  const raw = parseInt(process.env.MEDIA_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10 * 1024 * 1024;
}

/**
 * Resolve a relative path against the storage root and verify the
 * result is still contained within it (path-traversal defense). Throws
 * on any escape attempt (e.g. a relativePath containing "../../etc").
 */
function resolveContainedPath(relativePath) {
  const root = getStorageRoot();
  const resolved = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    const err = new Error("Resolved storage path escapes the storage root");
    err.statusCode = 400;
    throw err;
  }
  return resolved;
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function extensionForMime(mimeType, fallback = "bin") {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  return map[String(mimeType || "").toLowerCase()] || fallback;
}

/**
 * Validate a buffer-based upload before it touches disk. Not just
 * client-declared MIME: images are magic-byte sniffed too.
 */
function validateBufferUpload(buffer, { mimeType, resourceType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error("Empty or invalid file upload");
    err.statusCode = 400;
    throw err;
  }

  const maxBytes = getMaxBytesFor(resourceType);
  if (buffer.length > maxBytes) {
    const err = new Error(`File exceeds maximum allowed size of ${maxBytes} bytes`);
    err.statusCode = 400;
    throw err;
  }

  if (resourceType === "image") {
    const sniffed = sniffImageMime(buffer);
    if (!sniffed) {
      const err = new Error("Unsupported or corrupted image file");
      err.statusCode = 400;
      throw err;
    }
    return sniffed;
  }

  return String(mimeType || "").trim().toLowerCase();
}

/**
 * Upload a file to local disk.
 * @param {Buffer|{filePath:string}} input - file bytes, or a path
 *   descriptor for the disk-backed generic upload route.
 */
export async function upload(input, { entityType = "other", mimeType = "", resourceType = "image", optimize = true } = {}) {
  const safeEntityType = sanitizeEntityType(entityType);
  const entityFolder = ENTITY_FOLDER_MAP[safeEntityType] || ENTITY_FOLDER_MAP.other;
  const bucket = RESOURCE_BUCKET_MAP[resourceType] || "documents";
  const relativeDir = path.posix.join(bucket, entityFolder);
  const absoluteDir = resolveContainedPath(relativeDir);
  await ensureDir(absoluteDir);

  const isPathInput = input && typeof input === "object" && !Buffer.isBuffer(input);
  const isImage = resourceType === "image";
  const shouldOptimizeImage = optimize !== false && isImage;

  let buffer = null;
  let sourcePath = null;
  if (isPathInput) {
    sourcePath = input.filePath;
  } else {
    buffer = input;
    validateBufferUpload(buffer, { mimeType, resourceType });
  }

  const fileId = crypto.randomUUID();
  let width = null;
  let height = null;
  let finalExt;
  let finalBytes;
  let relativeFilePath;
  let absoluteFilePath;

  try {
    if (shouldOptimizeImage) {
      // Convert to WebP (mirrors the existing Cloudinary default format),
      // reasonable quality, single output — the app expects one image URL
      // per field, so no thumbnail/medium/large variants are generated.
      finalExt = "webp";
      relativeFilePath = path.posix.join(relativeDir, `${fileId}.${finalExt}`);
      absoluteFilePath = resolveContainedPath(relativeFilePath);
      // Perf audit BE-I1 (P6-2): also cap the longest edge — previously
      // only format/quality were optimized here, so a raw multi-thousand-
      // pixel phone-camera original kept its full dimensions even after
      // WebP conversion. `fit: "inside"` mirrors Cloudinary's "limit" crop
      // mode: only shrinks images that exceed the cap, never upscales or
      // crops a smaller image. New uploads only.
      const maxDimension = parseInt(process.env.CLOUDINARY_IMAGE_MAX_DIMENSION || "2000", 10) || 2000;
      const pipeline = sharp(sourcePath || buffer, { failOn: "none" })
        .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 });
      const info = await pipeline.toFile(absoluteFilePath);
      width = info.width || null;
      height = info.height || null;
      finalBytes = info.size || 0;
      if (sourcePath) {
        await fs.promises.unlink(sourcePath).catch(() => {});
      }
    } else {
      finalExt = extensionForMime(mimeType);
      relativeFilePath = path.posix.join(relativeDir, `${fileId}.${finalExt}`);
      absoluteFilePath = resolveContainedPath(relativeFilePath);

      if (sourcePath) {
        const maxBytes = getMaxBytesFor(resourceType);
        const stat = await fs.promises.stat(sourcePath);
        if (stat.size > maxBytes) {
          const err = new Error(`File exceeds maximum allowed size of ${maxBytes} bytes`);
          err.statusCode = 400;
          throw err;
        }
        finalBytes = stat.size;
        try {
          await fs.promises.rename(sourcePath, absoluteFilePath);
        } catch (renameErr) {
          if (renameErr.code === "EXDEV") {
            await fs.promises.copyFile(sourcePath, absoluteFilePath);
            await fs.promises.unlink(sourcePath).catch(() => {});
          } else {
            throw renameErr;
          }
        }
      } else {
        await fs.promises.writeFile(absoluteFilePath, buffer);
        finalBytes = buffer.length;
      }
    }
  } catch (error) {
    if (sourcePath) {
      await fs.promises.unlink(sourcePath).catch(() => {});
    }
    throw error;
  }

  const publicUrl = `${getPublicUrlBase()}/${relativeFilePath}`;

  logger.info("Local media upload stored", { relativeFilePath, bytes: finalBytes, resourceType });

  return {
    provider: "local",
    url: publicUrl,
    secureUrl: publicUrl,
    publicId: null,
    localPath: relativeFilePath,
    objectKey: relativeFilePath,
    fileName: path.posix.basename(relativeFilePath),
    mimeType: shouldOptimizeImage ? "image/webp" : (mimeType || null),
    size: finalBytes,
    width,
    height,
    format: finalExt,
    resourceType,
    folder: relativeDir,
  };
}

/**
 * Delete a locally-stored file. Dispatch must always be by the media's
 * stored `provider`/`localPath` fields — never inferred from the URL.
 * Tolerant of the file already being gone.
 */
export async function deleteFile(media) {
  if (!media || !media.localPath) return { deleted: false, reason: "no-local-path" };
  const absolutePath = resolveContainedPath(media.localPath);
  try {
    await fs.promises.unlink(absolutePath);
    return { deleted: true };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { deleted: false, reason: "already-missing" };
    }
    logger.error("Local delete failed", { localPath: media.localPath, error: error.message });
    throw error;
  }
}

/**
 * Disk usage stats for the storage root's volume. Computed via the
 * filesystem, not by scanning every uploaded file, and cached briefly so
 * a burst of admin requests doesn't hammer the OS syscall.
 */
export async function getDiskStats() {
  return getOrSet(
    "cache:storage:local-disk-stats",
    async () => {
      const root = getStorageRoot();
      await ensureDir(root);
      try {
        if (typeof fs.promises.statfs !== "function") {
          return { supported: false, reason: "fs.promises.statfs unavailable on this Node version" };
        }
        const stats = await fs.promises.statfs(root);
        const total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        return {
          supported: true,
          root,
          totalBytes: total,
          freeBytes: free,
          usedBytes: total - free,
        };
      } catch (error) {
        return { supported: false, reason: error.message };
      }
    },
    300,
  );
}

export function _internal() {
  return { getStorageRoot, getPublicUrlBase, resolveContainedPath, sniffImageMime };
}

export default { upload, deleteFile, getDiskStats, getStorageRoot };
