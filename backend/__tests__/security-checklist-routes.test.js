import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret-for-security-checklist-routes";

const ok = (name) => jest.fn((req, res) => res.status(200).json({ route: name, user: req.user?.id || null }));

const couponController = {
  listCoupons: ok("listCoupons"),
  listActiveCoupons: ok("listActiveCoupons"),
  createCoupon: ok("createCoupon"),
  updateCoupon: ok("updateCoupon"),
  deleteCoupon: ok("deleteCoupon"),
  validateCoupon: ok("validateCoupon"),
};
const faqController = {
  getFAQs: ok("getFAQs"),
  getPublishedFAQs: ok("getPublishedFAQs"),
  createFAQ: ok("createFAQ"),
  updateFAQ: ok("updateFAQ"),
  deleteFAQ: ok("deleteFAQ"),
};

jest.unstable_mockModule("../app/controller/couponController.js", () => couponController);
jest.unstable_mockModule("../app/controller/faqController.js", () => faqController);

// verifyToken checks tokenVersion for admin/seller tokens against the DB.
const tokenVersionModel = {
  default: {
    findById: () => ({ select: () => ({ lean: async () => ({ tokenVersion: 0 }) }) }),
  },
};
jest.unstable_mockModule("../app/models/admin.js", () => tokenVersionModel);
jest.unstable_mockModule("../app/models/seller.js", () => tokenVersionModel);

const couponRoutes = (await import("../app/routes/couponRoutes.js")).default;
const faqModule = await import("../app/routes/faqRoutes.js");
const { stripUnsafeKeys, sanitizeRequestBody } = await import("../app/middleware/sanitizeInput.js");

const app = express();
app.use(express.json());
app.use(sanitizeRequestBody);
app.post("/echo", (req, res) => res.json(req.body));
app.use("/api", couponRoutes);
app.use("/api/admin/faqs", faqModule.default);
app.use("/api/public/faqs", faqModule.publicFaqRouter);

const tokenFor = (role, id = `${role}-1`) =>
  `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" })}`;

describe("coupon routes access control", () => {
  const adminCalls = [
    ["get", "/api/admin/coupons"],
    ["post", "/api/admin/coupons"],
    ["put", "/api/admin/coupons/abc"],
    ["delete", "/api/admin/coupons/abc"],
  ];

  it.each(adminCalls)("%s %s rejects anonymous callers", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it.each(adminCalls)("%s %s rejects non-admin tokens", async (method, path) => {
    const res = await request(app)[method](path).set("Authorization", tokenFor("customer"));
    expect(res.status).toBe(403);
  });

  it.each(adminCalls)("%s %s allows admins", async (method, path) => {
    const res = await request(app)[method](path).set("Authorization", tokenFor("admin"));
    expect(res.status).toBe(200);
  });

  it("public coupon list only uses the active-only handler", async () => {
    const res = await request(app).get("/api/coupons?status=expired");
    expect(res.body.route).toBe("listActiveCoupons");
  });

  it("coupon validation identifies the customer from the token", async () => {
    const res = await request(app)
      .post("/api/coupons/validate")
      .set("Authorization", tokenFor("customer", "cust-42"))
      .send({ code: "X", customerId: "someone-else" });
    expect(res.body.user).toBe("cust-42");
  });

  it("rejects tokens signed with a different algorithm", async () => {
    const none = jwt.sign({ id: "a", role: "admin" }, null, { algorithm: "none" });
    const res = await request(app).get("/api/admin/coupons").set("Authorization", `Bearer ${none}`);
    expect(res.status).toBe(401);
  });
});

describe("FAQ routes access control", () => {
  it.each([
    ["post", "/api/admin/faqs"],
    ["put", "/api/admin/faqs/1"],
    ["delete", "/api/admin/faqs/1"],
  ])("%s %s requires admin", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
    expect((await request(app)[method](path).set("Authorization", tokenFor("seller"))).status).toBe(403);
    expect((await request(app)[method](path).set("Authorization", tokenFor("admin"))).status).toBe(200);
  });

  it.each([
    ["post", "/api/public/faqs"],
    ["put", "/api/public/faqs/1"],
    ["delete", "/api/public/faqs/1"],
  ])("%s %s is not writable through the public mount", async (method, path) => {
    const res = await request(app)[method](path).set("Authorization", tokenFor("admin"));
    expect(res.status).toBe(404);
  });

  it("public FAQ list is served by the published-only handler", async () => {
    const res = await request(app).get("/api/public/faqs?status=draft");
    expect(res.status).toBe(200);
    expect(res.body.route).toBe("getPublishedFAQs");
  });
});

describe("request body sanitization", () => {
  it("strips Mongo operators and prototype-pollution keys at any depth", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send('{"phone":{"$ne":null},"items":[{"qty":1,"$where":"1"}],"__proto__":{"admin":true},"name":"ok"}');
    expect(res.body).toEqual({ phone: {}, items: [{ qty: 1 }], name: "ok" });
    expect({}.admin).toBeUndefined();
  });

  it("leaves ordinary values untouched", () => {
    const body = { a: "x", b: [1, 2], c: { d: "$not-a-key-just-a-value" } };
    expect(stripUnsafeKeys(structuredClone(body))).toEqual(body);
  });
});
