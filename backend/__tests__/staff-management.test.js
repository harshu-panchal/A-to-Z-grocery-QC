import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { makeFakeModel } from "./helpers/fakeModel.js";

process.env.JWT_SECRET = "test-secret";
process.env.REDIS_DISABLED = "true";

const dupCheck = (doc, rows) => {
  for (const field of ["email", "phone"]) {
    if (doc[field] && rows.some((r) => String(r._id) !== String(doc._id) && r[field] === doc[field])) {
      throw Object.assign(new Error("dup"), { code: 11000 });
    }
  }
};
const Staff = makeFakeModel("Staff", {
  passwords: true,
  onSave: dupCheck,
  // what the real schema fills in
  defaults: { isActive: true, tokenVersion: 0, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null, typeId: null, workingHours: { enabled: false } },
});
const StaffType = makeFakeModel("StaffType", {
  onSave: (doc, rows) => {
    if (rows.some((r) => String(r._id) !== String(doc._id) && r.name === doc.name && String(r.ownerId) === String(doc.ownerId))) {
      throw Object.assign(new Error("dup"), { code: 11000 });
    }
  },
});
const StaffActivity = makeFakeModel("StaffActivity");
const Seller = makeFakeModel("Seller");
const Admin = makeFakeModel("Admin");
jest.unstable_mockModule("../app/models/staff.js", () => ({ default: Staff }));
jest.unstable_mockModule("../app/models/staffType.js", () => ({ default: StaffType }));
jest.unstable_mockModule("../app/models/staffActivity.js", () => ({ default: StaffActivity }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: Seller }));
jest.unstable_mockModule("../app/models/admin.js", () => ({ default: Admin }));
// the real rate limiter is not what is being tested
jest.unstable_mockModule("../app/middleware/securityMiddlewares.js", () => ({
  authRouteRateLimiter: (req, res, next) => next(),
}));

const { staffAuthRouter, sellerStaffRouter, adminStaffRouter } = await import("../app/routes/staffRoutes.js");
const { getPresets } = await import("../app/services/staff/permissionCatalog.js");

const app = express();
app.use(express.json());
app.use("/api/staff", staffAuthRouter);
app.use("/api/seller/staff", sellerStaffRouter);
app.use("/api/admin/staff", adminStaffRouter);

const wait = () => new Promise((r) => setTimeout(r, 25));
const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
const cashierPerms = () => getPresets("seller").find((p) => p.key === "cashier").permissions;

let seller;
let otherSeller;
let admin;
let sellerAuth;
let adminAuth;

beforeEach(() => {
  [Staff, StaffType, StaffActivity, Seller, Admin].forEach((m) => m.reset());
  seller = Seller.seed({ isActive: true, isVerified: true, applicationStatus: "approved", shopName: "Kirana", name: "Owner", tokenVersion: 0 });
  otherSeller = Seller.seed({ isActive: true, isVerified: true, applicationStatus: "approved", shopName: "Other", name: "Other", tokenVersion: 0 });
  admin = Admin.seed({ name: "Boss", tokenVersion: 0 });
  sellerAuth = { Authorization: `Bearer ${sign({ id: seller._id, role: "seller", tokenVersion: 0 })}` };
  adminAuth = { Authorization: `Bearer ${sign({ id: admin._id, role: "admin", tokenVersion: 0 })}` };
});

const addCashier = (extra = {}) =>
  request(app).post("/api/seller/staff/members").set(sellerAuth).send({
    name: "Ravi", phone: "9876543210", password: "secret1", jobTitle: "Cashier", permissions: cashierPerms(), ...extra,
  });

describe("owner adds and manages staff", () => {
  it("creates a staff member whose password is stored hashed", async () => {
    const res = await addCashier();
    expect(res.status).toBe(201);
    expect(res.body.result).toMatchObject({ name: "Ravi", jobTitle: "Cashier", phone: "9876543210", isActive: true });
    expect(res.body.result.modules).toEqual(["POS (Counter Billing)"]);
    expect(res.body.result.password).toBeUndefined();
    expect(Staff.rows[0].password).not.toBe("secret1");
    expect(Staff.rows[0].password.startsWith("$2")).toBe(true);
    expect(String(Staff.rows[0].ownerId)).toBe(String(seller._id));
  });

  it("validates the form", async () => {
    const bad = async (body, text) => {
      const res = await request(app).post("/api/seller/staff/members").set(sellerAuth).send({ name: "A", phone: "9876543211", password: "secret1", permissions: cashierPerms(), ...body });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(text);
    };
    await bad({ name: "" }, /name is required/i);
    await bad({ phone: "", email: "" }, /phone number or an email/i);
    await bad({ phone: "123" }, /10 digits/);
    await bad({ phone: "", email: "nope" }, /email/i);
    await bad({ password: "abc" }, /password must be/i);
    await bad({ permissions: {} }, /at least one section/i);
    await bad({ permissions: { "pos.cancel": "edit" } }, /at least one section/i); // only a switch, nothing to open
    await bad({ permissions: { "made.up": "edit" } }, /unknown permission/i);
    await bad({ workingHours: { enabled: true, start: "9am", end: "6pm" } }, /working hours/i);
    await bad({ workingHours: { enabled: true, start: "09:00", end: "18:00", days: [] } }, /working day/i);
  });

  it("rejects a duplicate phone or email", async () => {
    expect((await addCashier()).status).toBe(201);
    const dup = await addCashier({ name: "Another" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already used/i);
  });

  it("only lists and edits its own shop's staff", async () => {
    await addCashier();
    Staff.seed({ name: "Stranger", phone: "9000000000", ownerType: "seller", ownerId: otherSeller._id, permissions: cashierPerms(), password: "x" });
    const list = await request(app).get("/api/seller/staff/members").set(sellerAuth);
    expect(list.body.results.map((s) => s.name)).toEqual(["Ravi"]); // lists come back as `results`

    const strangerId = Staff.rows.find((s) => s.name === "Stranger")._id;
    expect((await request(app).put(`/api/seller/staff/members/${strangerId}`).set(sellerAuth).send({ name: "Hacked" })).status).toBe(404);
    expect((await request(app).delete(`/api/seller/staff/members/${strangerId}`).set(sellerAuth)).status).toBe(404);
    expect((await request(app).put(`/api/seller/staff/members/${strangerId}/password`).set(sellerAuth).send({ password: "abcdef" })).status).toBe(404);
    expect(Staff.rows.find((s) => s.name === "Stranger")).toBeTruthy();
  });

  it("edits permissions, switches off, resets the password and deletes", async () => {
    const created = await addCashier();
    const id = created.body.result.id;

    const edited = await request(app).put(`/api/seller/staff/members/${id}`).set(sellerAuth).send({
      jobTitle: "Night Cashier", permissions: { ...cashierPerms(), "pos.report": "view" },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.result.jobTitle).toBe("Night Cashier");
    expect(Object.keys(edited.body.result.permissions)).toContain("pos.report");

    const off = await request(app).put(`/api/seller/staff/members/${id}`).set(sellerAuth).send({ isActive: false });
    expect(off.body.result.isActive).toBe(false);

    const reset = await request(app).put(`/api/seller/staff/members/${id}/password`).set(sellerAuth).send({ password: "brandnew9" });
    expect(reset.status).toBe(200);
    expect(Staff.rows[0].tokenVersion).toBe(1);
    expect((await request(app).put(`/api/seller/staff/members/${id}/password`).set(sellerAuth).send({ password: "x" })).status).toBe(400);

    expect((await request(app).delete(`/api/seller/staff/members/${id}`).set(sellerAuth)).status).toBe(200);
    expect(Staff.rows).toHaveLength(0);
  });

  it("limits how many staff one owner can add", async () => {
    for (let i = 0; i < 30; i += 1) {
      Staff.seed({ name: `S${i}`, phone: `90000000${String(i).padStart(2, "0")}`, ownerType: "seller", ownerId: seller._id, permissions: cashierPerms(), password: "x" });
    }
    const res = await addCashier({ phone: "9111111111" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/up to 30/);
  });

  it("staff can never reach staff management, and customers cannot either", async () => {
    await addCashier();
    const login = await request(app).post("/api/staff/login").send({ identifier: "9876543210", password: "secret1" });
    const staffAuth = { Authorization: `Bearer ${login.body.result.token}` };
    expect((await request(app).get("/api/seller/staff/members").set(staffAuth)).status).toBe(403);
    expect((await request(app).post("/api/seller/staff/members").set(staffAuth).send({})).status).toBe(403);
    expect((await request(app).get("/api/seller/staff/members")).status).toBe(401);
    expect((await request(app).get("/api/admin/staff/members").set(sellerAuth)).status).toBe(403);
  });
});

describe("quick buttons (staff types)", () => {
  it("serves the catalog with built-in buttons and this owner's own", async () => {
    await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "Night Cashier", permissions: cashierPerms() });
    const res = await request(app).get("/api/seller/staff/catalog").set(sellerAuth);
    expect(res.status).toBe(200);
    expect(res.body.result.presets.map((p) => p.label)).toEqual(expect.arrayContaining(["Cashier", "Stock Manager", "Order Packer"]));
    expect(res.body.result.types.map((t) => t.name)).toEqual(["Night Cashier"]);
    expect(res.body.result.modules.find((m) => m.key === "pos").subs.length).toBeGreaterThan(8);
  });

  it("creates, renames, edits and deletes a type; deleting never changes existing staff", async () => {
    const made = await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "Returns Desk", permissions: { "orders.returns": "edit" } });
    expect(made.status).toBe(201);
    const typeId = made.body.result.id;

    const staff = await addCashier({ typeId, permissions: { "orders.returns": "edit" } });
    expect(staff.status).toBe(201);

    expect((await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "Returns Desk", permissions: { "orders.returns": "view" } })).status).toBe(409);
    expect((await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "", permissions: { "orders.returns": "view" } })).status).toBe(400);
    expect((await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "Empty", permissions: {} })).status).toBe(400);

    const renamed = await request(app).put(`/api/seller/staff/types/${typeId}`).set(sellerAuth).send({ name: "Returns Counter", permissions: { "orders.returns": "view" } });
    expect(renamed.body.result).toMatchObject({ name: "Returns Counter", permissions: { "orders.returns": "view" } });
    // people created from it keep their own permissions
    expect(Staff.rows[0].permissions).toEqual({ "orders.returns": "edit" });

    expect((await request(app).delete(`/api/seller/staff/types/${typeId}`).set(sellerAuth)).status).toBe(200);
    expect(StaffType.rows).toHaveLength(0);
    expect(Staff.rows[0].permissions).toEqual({ "orders.returns": "edit" });
    expect(Staff.rows[0].typeId).toBeNull();
  });

  it("types are private to their owner", async () => {
    const mine = await request(app).post("/api/seller/staff/types").set(sellerAuth).send({ name: "Mine", permissions: cashierPerms() });
    const otherAuth = { Authorization: `Bearer ${sign({ id: otherSeller._id, role: "seller", tokenVersion: 0 })}` };
    expect((await request(app).get("/api/seller/staff/types").set(otherAuth)).body.results).toEqual([]);
    expect((await request(app).put(`/api/seller/staff/types/${mine.body.result.id}`).set(otherAuth).send({ name: "Stolen" })).status).toBe(404);
    // and a staff member can't be given someone else's type
    const res = await addCashier({ typeId: mine.body.result.id });
    expect(res.status).toBe(201);
    const bad = await request(app).post("/api/seller/staff/members").set(otherAuth).send({ name: "X", phone: "9222222222", password: "secret1", permissions: cashierPerms(), typeId: mine.body.result.id });
    expect(bad.status).toBe(400);
  });
});

describe("the admin team", () => {
  it("shares one staff list and uses admin permissions", async () => {
    const res = await request(app).post("/api/admin/staff/members").set(adminAuth).send({
      name: "Priya", email: "Priya@Example.com", password: "secret1", jobTitle: "Support", permissions: { "support.tickets": "edit", "people.customers": "view" },
    });
    expect(res.status).toBe(201);
    expect(res.body.result.email).toBe("priya@example.com");
    const admin2 = Admin.seed({ name: "Second" });
    const auth2 = { Authorization: `Bearer ${sign({ id: admin2._id, role: "admin", tokenVersion: 0 })}` };
    expect((await request(app).get("/api/admin/staff/members").set(auth2)).body.results.map((s) => s.name)).toEqual(["Priya"]);
  });

  it("rejects seller permissions on the admin side and vice versa", async () => {
    const res = await request(app).post("/api/admin/staff/members").set(adminAuth).send({ name: "P", email: "p@x.com", password: "secret1", permissions: { "catalog.stock": "edit" } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown permission/i);
  });
});

describe("staff login", () => {
  const login = (identifier, password) => request(app).post("/api/staff/login").send({ identifier, password });

  beforeEach(async () => {
    expect((await addCashier({ email: "ravi@shop.com" })).status).toBe(201);
  });

  it("logs in with phone or email and returns what the panel needs", async () => {
    for (const id of ["9876543210", "+91 98765-43210", "RAVI@shop.com"]) {
      const res = await login(id, "secret1");
      expect(res.status).toBe(200);
      expect(res.body.result.role).toBe("seller");
      expect(res.body.result).toMatchObject({ isStaff: true, shopName: "Kirana", isVerified: true, applicationStatus: "approved" });
      expect(res.body.result.staff.access).toMatchObject({ landing: "/seller/pos", posOnly: true });
      const decoded = jwt.verify(res.body.result.token, process.env.JWT_SECRET);
      expect(decoded).toMatchObject({ role: "staff", ownerType: "seller" });
    }
    await wait();
    expect(StaffActivity.rows.filter((r) => r.kind === "login")).toHaveLength(3);
    expect(Staff.rows[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it("does not reveal whether the account exists", async () => {
    const unknown = await login("9000000001", "whatever");
    const wrong = await login("9876543210", "wrongpass");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toMatch(/Invalid login details/);
    expect(wrong.body.message).toMatch(/Invalid login details/);
  });

  it("locks the account after 5 wrong passwords, even for the right one", async () => {
    for (let i = 0; i < 4; i += 1) expect((await login("9876543210", "bad")).status).toBe(401);
    const fifth = await login("9876543210", "bad");
    expect(fifth.status).toBe(401);
    expect(fifth.body.message).toMatch(/locked/i);
    const locked = await login("9876543210", "secret1");
    expect(locked.status).toBe(423);
    // the owner resets the password and the lock is lifted
    const id = String(Staff.rows[0]._id);
    await request(app).put(`/api/seller/staff/members/${id}/password`).set(sellerAuth).send({ password: "fresh123" });
    expect((await login("9876543210", "fresh123")).status).toBe(200);
  });

  it("counts down the tries left and resets after a good login", async () => {
    expect((await login("9876543210", "bad")).body.message).toMatch(/4 tries left/);
    expect((await login("9876543210", "secret1")).status).toBe(200);
    expect((await login("9876543210", "bad")).body.message).toMatch(/4 tries left/);
  });

  it("refuses a switched-off account, an inactive shop and closed working hours", async () => {
    Staff.rows[0].isActive = false;
    expect((await login("9876543210", "secret1")).status).toBe(403);
    Staff.rows[0].isActive = true;
    seller.isActive = false;
    expect((await login("9876543210", "secret1")).status).toBe(403);
    seller.isActive = true;
    Staff.rows[0].workingHours = { enabled: true, start: "10:00", end: "10:00", days: [0, 1, 2, 3, 4, 5, 6] };
    const closed = await login("9876543210", "secret1");
    expect(closed.status).toBe(403);
    expect(closed.body.message).toMatch(/working hours/i);
  });

  it("requires both fields", async () => {
    expect((await login("", "x")).status).toBe(400);
    expect((await login("9876543210", "")).status).toBe(400);
  });

  it("records failed logins in the activity log", async () => {
    await login("9876543210", "bad");
    await wait();
    expect(StaffActivity.rows.map((r) => r.kind)).toEqual(["login_failed"]);
  });
});

describe("staff change their own password", () => {
  it("needs the current password, signs out other devices and returns a fresh token", async () => {
    await addCashier();
    const first = await request(app).post("/api/staff/login").send({ identifier: "9876543210", password: "secret1" });
    const oldAuth = { Authorization: `Bearer ${first.body.result.token}` };

    expect((await request(app).put("/api/staff/me/password").set(oldAuth).send({ currentPassword: "nope", newPassword: "newpass1" })).status).toBe(400);
    expect((await request(app).put("/api/staff/me/password").set(oldAuth).send({ currentPassword: "secret1", newPassword: "abc" })).status).toBe(400);

    const changed = await request(app).put("/api/staff/me/password").set(oldAuth).send({ currentPassword: "secret1", newPassword: "newpass1" });
    expect(changed.status).toBe(200);
    expect((await request(app).get("/api/staff/me").set(oldAuth)).status).toBe(401); // old token is dead
    const fresh = { Authorization: `Bearer ${changed.body.result.token}` };
    expect((await request(app).get("/api/staff/me").set(fresh)).status).toBe(200);
    expect((await request(app).post("/api/staff/login").send({ identifier: "9876543210", password: "newpass1" })).status).toBe(200);
  });

  it("the profile endpoints refuse owners and anonymous callers", async () => {
    expect((await request(app).get("/api/staff/me")).status).toBe(401);
    expect((await request(app).get("/api/staff/me").set(sellerAuth)).status).toBe(403);
  });
});

describe("activity log", () => {
  it("lists what staff did for this owner only, with filters and paging", async () => {
    await addCashier();
    const staff = Staff.rows[0];
    const other = Staff.seed({ name: "Stranger", ownerType: "seller", ownerId: otherSeller._id, permissions: cashierPerms(), password: "x" });
    const mk = (extra) => StaffActivity.seed({ ownerType: "seller", ownerId: seller._id, staffId: staff._id, staffName: "Ravi", kind: "action", action: "Created a POS bill", ...extra });
    mk({ detail: "#INV-1", amount: 100, createdAt: new Date("2026-10-27T10:00:00Z") });
    mk({ detail: "#INV-2", amount: 200, createdAt: new Date("2026-10-28T10:00:00Z") });
    mk({ kind: "blocked", action: "Tried to cancel a pos bill without permission", createdAt: new Date("2026-10-28T11:00:00Z") });
    StaffActivity.seed({ ownerType: "seller", ownerId: otherSeller._id, staffId: other._id, staffName: "Stranger", kind: "action", action: "Created a POS bill", detail: "#X" });

    const all = await request(app).get("/api/seller/staff/activity").set(sellerAuth);
    expect(all.status).toBe(200);
    expect(all.body.result.total).toBe(3);
    expect(all.body.result.items[0].action).toMatch(/Tried to cancel/); // newest first
    expect(all.body.result.items.some((i) => i.staffName === "Stranger")).toBe(false);

    const day = await request(app).get("/api/seller/staff/activity?from=2026-10-28&to=2026-10-28").set(sellerAuth);
    expect(day.body.result.total).toBe(2);
    expect((await request(app).get("/api/seller/staff/activity?kind=blocked").set(sellerAuth)).body.result.total).toBe(1);
    expect((await request(app).get("/api/seller/staff/activity?q=INV-2").set(sellerAuth)).body.result.items.map((i) => i.detail)).toEqual(["#INV-2"]);
    expect((await request(app).get(`/api/seller/staff/activity?staffId=${staff._id}&limit=1&page=2`).set(sellerAuth)).body.result).toMatchObject({ page: 2, pages: 3, total: 3 });
    expect((await request(app).get("/api/seller/staff/activity?from=garbage").set(sellerAuth)).status).toBe(400);
    expect((await request(app).get("/api/seller/staff/activity?staffId=nope").set(sellerAuth)).status).toBe(400);
  });

  it("the admin team sees admin staff activity only", async () => {
    StaffActivity.seed({ ownerType: "admin", ownerId: null, staffId: "a".repeat(24), staffName: "Priya", kind: "action", action: "Replied to a ticket" });
    StaffActivity.seed({ ownerType: "seller", ownerId: seller._id, staffId: "b".repeat(24), staffName: "Ravi", kind: "action", action: "Created a POS bill" });
    const res = await request(app).get("/api/admin/staff/activity").set(adminAuth);
    expect(res.body.result.items.map((i) => i.staffName)).toEqual(["Priya"]);
  });
});
