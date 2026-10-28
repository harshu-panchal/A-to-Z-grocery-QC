import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// The banner upload route must refuse oversized or non-image files with a
// readable 400 instead of accepting anything.

jest.unstable_mockModule("../app/middleware/authMiddleware.js", () => ({
  verifyToken: (_req, _res, next) => next(),
  allowRoles: () => (_req, _res, next) => next(),
}));

const mockUploadBannerImage = jest.fn((_req, res) => res.status(200).json({ success: true, result: { url: "ok" } }));
jest.unstable_mockModule("../app/controller/experienceController.js", () => {
  const noop = (_req, res) => res.status(200).json({ success: true });
  return {
    getAdminExperienceSections: noop,
    createExperienceSection: noop,
    updateExperienceSection: noop,
    deleteExperienceSection: noop,
    reorderExperienceSections: noop,
    getPublicExperienceSections: noop,
    uploadBannerImage: mockUploadBannerImage,
    getPublicHeroConfig: noop,
    getAdminHeroConfig: noop,
    upsertHeroConfig: noop,
  };
});

const { default: router } = await import("../app/routes/experienceRoutes.js");
const app = express();
app.use("/api", router);

const PNG = Buffer.from("89504e470d0a1a0a", "hex");

describe("POST /admin/experience/upload-banner", () => {
  beforeEach(() => mockUploadBannerImage.mockClear());

  it("accepts a small image", async () => {
    const res = await request(app).post("/api/admin/experience/upload-banner").attach("image", PNG, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(mockUploadBannerImage).toHaveBeenCalledTimes(1);
  });

  it("rejects files that are not images", async () => {
    const res = await request(app)
      .post("/api/admin/experience/upload-banner")
      .attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "a.html", contentType: "text/html" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPG, PNG, WebP, GIF or AVIF/);
    expect(mockUploadBannerImage).not.toHaveBeenCalled();
  });

  it("rejects images over 5 MB with a clear message", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1);
    const res = await request(app).post("/api/admin/experience/upload-banner").attach("image", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/larger than 5 MB/);
    expect(mockUploadBannerImage).not.toHaveBeenCalled();
  });
});
