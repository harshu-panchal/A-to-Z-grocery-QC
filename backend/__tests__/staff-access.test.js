import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { makeFakeModel } from "./helpers/fakeModel.js";

process.env.JWT_SECRET = "test-secret";
process.env.REDIS_DISABLED = "true";

const Staff = makeFakeModel("Staff");
const Seller = makeFakeModel("Seller");
const Admin = makeFakeModel("Admin");
const StaffActivity = makeFakeModel("StaffActivity");
jest.unstable_mockModule("../app/models/staff.js", () => ({ default: Staff }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: Seller }));
jest.unstable_mockModule("../app/models/admin.js", () => ({ default: Admin }));
jest.unstable_mockModule("../app/models/staffActivity.js", () => ({ default: StaffActivity }));

const { verifyToken, allowRoles, optionalVerifyToken } = await import("../app/middleware/authMiddleware.js");
const { withinWorkingHours } = await import("../app/services/staff/staffAccess.js");
const { getPresets } = await import("../app/services/staff/permissionCatalog.js");

const presetPerms = (owner, key) => getPresets(owner).find((p) => p.key === key).permissions;
const token = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
const wait = () => new Promise((r) => setTimeout(r, 25));

const echo = (req, res) =>
  res.json({ success: true, result: { role: req.user?.role ?? null, id: req.user?.id ?? null, isStaff: Boolean(req.user?.isStaff), staff: req.staff?.name ?? null } });

const app = express();
app.use(express.json());
const sellerOnly = [verifyToken, allowRoles("seller")];
app.get("/api/seller/pos/products", ...sellerOnly, echo);
app.post("/api/seller/pos/orders", ...sellerOnly, (req, res) => res.status(201).json({ success: true, result: { invoiceNumber: "INV-7", total: 450 } }));
app.delete("/api/seller/pos/orders/:id", ...sellerOnly, echo);
app.get("/api/seller/stats", ...sellerOnly, echo);
app.get("/api/seller/profile", ...sellerOnly, echo);
app.get("/api/seller/staff/members", ...sellerOnly, echo);
app.post("/api/seller/pos/orders/fail", ...sellerOnly, (req, res) => res.status(400).json({ success: false }));
app.get("/api/admin/stats", verifyToken, allowRoles("admin"), echo);
app.get("/api/products/:id", optionalVerifyToken, echo);

let seller;
let cashier;
let manager;
let admin;

beforeEach(() => {
  [Staff, Seller, Admin, StaffActivity].forEach((m) => m.reset());
  seller = Seller.seed({ isActive: true, isVerified: true, applicationStatus: "approved", shopName: "Kirana", name: "Owner", tokenVersion: 0 });
  admin = Admin.seed({ name: "Boss" });
  cashier = Staff.seed({
    name: "Ravi", jobTitle: "Cashier", ownerType: "seller", ownerId: seller._id, isActive: true, tokenVersion: 0,
    permissions: presetPerms("seller", "cashier"), workingHours: { enabled: false },
  });
  manager = Staff.seed({
    name: "Meena", ownerType: "seller", ownerId: seller._id, isActive: true, tokenVersion: 0,
    permissions: { "dashboard.overview": "view", "orders.orders": "edit" },
  });
});

const asStaff = (s, extra = {}) => token({ id: s._id, role: "staff", tokenVersion: 0, ...extra });
const asOwner = () => token({ id: seller._id, role: "seller", tokenVersion: 0 });

describe("staff token acts as the owner, within its permissions", () => {
  it("lets a cashier use POS billing and carries the owner's identity", async () => {
    const res = await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${asStaff(cashier)}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ role: "seller", id: String(seller._id), isStaff: true, staff: "Ravi" });
  });

  it("refuses what the cashier was not given", async () => {
    const auth = { Authorization: `Bearer ${asStaff(cashier)}` };
    expect((await request(app).delete("/api/seller/pos/orders/abc").set(auth)).status).toBe(403); // cancel a bill
    expect((await request(app).get("/api/seller/stats").set(auth)).status).toBe(403); // dashboard
  });

  it("refuses owner-only features even though a seller route exists", async () => {
    const res = await request(app).get("/api/seller/staff/members").set("Authorization", `Bearer ${asStaff(manager)}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not available for staff/i);
  });

  it("gives every staff member their own safe profile call", async () => {
    const res = await request(app).get("/api/seller/profile").set("Authorization", `Bearer ${asStaff(cashier)}`);
    expect(res.status).toBe(200);
    expect(res.body.result.isStaff).toBe(true);
  });

  it("owners are completely unaffected", async () => {
    const auth = { Authorization: `Bearer ${asOwner()}` };
    expect((await request(app).get("/api/seller/stats").set(auth)).status).toBe(200);
    expect((await request(app).delete("/api/seller/pos/orders/abc").set(auth)).status).toBe(200);
    expect((await request(app).get("/api/seller/staff/members").set(auth)).status).toBe(200);
    const res = await request(app).get("/api/seller/stats").set(auth);
    expect(res.body.result.isStaff).toBe(false);
  });

  it("a staff token is not accepted for the other panel", async () => {
    const res = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${asStaff(cashier)}`);
    expect(res.status).toBe(403);
  });

  it("view-only permission cannot write", async () => {
    const reader = Staff.seed({ name: "Viewer", ownerType: "seller", ownerId: seller._id, isActive: true, tokenVersion: 0, permissions: { "pos.billing": "view" } });
    const auth = { Authorization: `Bearer ${asStaff(reader)}` };
    expect((await request(app).get("/api/seller/pos/products").set(auth)).status).toBe(200);
    expect((await request(app).post("/api/seller/pos/orders").set(auth).send({})).status).toBe(403);
  });
});

describe("sessions are checked on every request", () => {
  it("rejects a switched-off staff member immediately", async () => {
    const t = asStaff(cashier);
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(200);
    cashier.isActive = false;
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });

  it("rejects a token issued before a password reset", async () => {
    const t = asStaff(cashier);
    cashier.tokenVersion = 1;
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });

  it("rejects a deleted staff member", async () => {
    const t = asStaff(cashier);
    Staff.reset();
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });

  it("stops staff when the shop itself is not active or approved", async () => {
    const t = asStaff(cashier);
    seller.isActive = false;
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(403);
    seller.isActive = true;
    seller.applicationStatus = "rejected";
    expect((await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${t}`)).status).toBe(403);
  });

  it("stops staff outside their working hours", async () => {
    // start == end is a window that is never open, whatever the clock says
    cashier.workingHours = { enabled: true, start: "10:00", end: "10:00", days: [0, 1, 2, 3, 4, 5, 6] };
    const res = await request(app).get("/api/seller/pos/products").set("Authorization", `Bearer ${asStaff(cashier)}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/working hours/i);
  });
});

describe("working hours", () => {
  // 2026-10-28 is a Wednesday. 04:30 UTC = 10:00 in India.
  const at = (iso) => new Date(iso);
  const wh = (extra) => ({ enabled: true, start: "09:00", end: "18:00", days: [0, 1, 2, 3, 4, 5, 6], ...extra });

  it("is always open when switched off", () => {
    expect(withinWorkingHours({ enabled: false }, at("2026-10-28T20:00:00Z"))).toBe(true);
    expect(withinWorkingHours(undefined)).toBe(true);
  });
  it("allows inside the shift and blocks outside (shop time, IST)", () => {
    expect(withinWorkingHours(wh(), at("2026-10-28T04:30:00Z"))).toBe(true); // 10:00
    expect(withinWorkingHours(wh(), at("2026-10-28T14:30:00Z"))).toBe(false); // 20:00
    expect(withinWorkingHours(wh(), at("2026-10-28T03:00:00Z"))).toBe(false); // 08:30
  });
  it("handles a shift that runs past midnight", () => {
    const night = wh({ start: "18:00", end: "02:00" });
    expect(withinWorkingHours(night, at("2026-10-28T14:30:00Z"))).toBe(true); // 20:00
    expect(withinWorkingHours(night, at("2026-10-28T19:00:00Z"))).toBe(true); // 00:30
    expect(withinWorkingHours(night, at("2026-10-28T08:00:00Z"))).toBe(false); // 13:30
  });
  it("respects the working days", () => {
    expect(withinWorkingHours(wh({ days: [1, 2] }), at("2026-10-28T04:30:00Z"))).toBe(false); // Wednesday
    expect(withinWorkingHours(wh({ days: [3] }), at("2026-10-28T04:30:00Z"))).toBe(true);
  });
});

describe("activity log", () => {
  it("records what staff did, with the bill number and amount", async () => {
    const res = await request(app).post("/api/seller/pos/orders").set("Authorization", `Bearer ${asStaff(cashier)}`).send({});
    expect(res.status).toBe(201);
    await wait();
    expect(StaffActivity.rows).toHaveLength(1);
    expect(StaffActivity.rows[0]).toMatchObject({
      action: "Created a POS bill",
      detail: "#INV-7",
      amount: 450,
      staffName: "Ravi",
      jobTitle: "Cashier",
      ownerType: "seller",
      kind: "action",
    });
    expect(String(StaffActivity.rows[0].ownerId)).toBe(String(seller._id));
  });

  it("does not log reads or failed calls", async () => {
    const auth = { Authorization: `Bearer ${asStaff(cashier)}` };
    await request(app).get("/api/seller/pos/products").set(auth);
    await request(app).post("/api/seller/pos/orders/fail").set(auth).send({});
    await wait();
    expect(StaffActivity.rows).toHaveLength(0);
  });

  it("logs a blocked attempt when staff try a write they don't have", async () => {
    await request(app).delete("/api/seller/pos/orders/abc").set("Authorization", `Bearer ${asStaff(cashier)}`);
    await wait();
    expect(StaffActivity.rows).toHaveLength(1);
    expect(StaffActivity.rows[0]).toMatchObject({ kind: "blocked", staffName: "Ravi" });
    expect(StaffActivity.rows[0].action).toMatch(/cancelled a pos bill without permission/i);
  });
});

describe("public routes with an optional login", () => {
  const admin2 = () => Staff.seed({ name: "Editor", ownerType: "admin", ownerId: admin._id, isActive: true, tokenVersion: 0, permissions: { "marketing.hero": "edit" } });

  it("treats staff as the owner only where their permissions allow it", async () => {
    const editor = admin2();
    const allowed = await request(app).get("/api/products/abc").set("Authorization", `Bearer ${asStaff(editor)}`);
    expect(allowed.body.result).toMatchObject({ role: "admin", isStaff: true });
    const support = Staff.seed({ name: "Support", ownerType: "admin", ownerId: admin._id, isActive: true, tokenVersion: 0, permissions: { "support.tickets": "edit" } });
    const denied = await request(app).get("/api/products/abc").set("Authorization", `Bearer ${asStaff(support)}`);
    expect(denied.status).toBe(200);
    expect(denied.body.result).toMatchObject({ role: null, isStaff: false });
  });
});
