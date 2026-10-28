import express from "express";
import multer from "multer";
import {
  getAdminExperienceSections,
  createExperienceSection,
  updateExperienceSection,
  deleteExperienceSection,
  reorderExperienceSections,
  getPublicExperienceSections,
  uploadBannerImage,
  getPublicHeroConfig,
  getAdminHeroConfig,
  upsertHeroConfig,
} from "../controller/experienceController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const BANNER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BANNER_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (BANNER_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    const error = new Error("Only JPG, PNG, WebP, GIF or AVIF images can be uploaded");
    error.statusCode = 400;
    return cb(error);
  },
});

// Turn multer failures into a readable 400 instead of a generic server error.
const uploadBannerFile = (req, res, next) =>
  bannerUpload.single("image")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(error.statusCode || 400).json({
      success: false,
      error: true,
      message: tooLarge ? "Image is larger than 5 MB. Choose a smaller file." : error.message,
      result: {},
    });
  });

// Admin routes (protected)
router.get(
  "/admin/experience",
  verifyToken,
  allowRoles("admin"),
  getAdminExperienceSections
);

router.post(
  "/admin/experience",
  verifyToken,
  allowRoles("admin"),
  createExperienceSection
);

// Specific routes MUST come before generic parameterized route /admin/experience/:id
router.put(
  "/admin/experience/reorder",
  verifyToken,
  allowRoles("admin"),
  reorderExperienceSections
);

// Admin hero config (separate from experience sections) - before :id so "hero" is not matched as id
router.get(
  "/admin/experience/hero",
  verifyToken,
  allowRoles("admin"),
  getAdminHeroConfig
);
router.put(
  "/admin/experience/hero",
  verifyToken,
  allowRoles("admin"),
  upsertHeroConfig
);

router.put(
  "/admin/experience/:id",
  verifyToken,
  allowRoles("admin"),
  updateExperienceSection
);

router.delete(
  "/admin/experience/:id",
  verifyToken,
  allowRoles("admin"),
  deleteExperienceSection
);

router.post(
  "/admin/experience/upload-banner",
  verifyToken,
  allowRoles("admin"),
  uploadBannerFile,
  uploadBannerImage
);

// Public routes
router.get("/experience", getPublicExperienceSections);
router.get("/experience/hero", getPublicHeroConfig);

export default router;
