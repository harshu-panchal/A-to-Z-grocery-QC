import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAccess,
  can,
  cleanPermissions,
  getCatalog,
  getModules,
  getPresets,
  knownKeys,
} from "../app/services/staff/permissionCatalog.js";
import { SELF, __rulesForTests, matchRule, normalizePath } from "../app/services/staff/permissionRules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OWNER_TYPES = ["seller", "admin"];

describe("permission catalog", () => {
  it.each(OWNER_TYPES)("%s: keys are unique and every page path belongs to the panel", (owner) => {
    const keys = knownKeys(owner);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of getModules(owner)) {
      for (const s of m.subs) {
        for (const p of s.paths) expect(p.startsWith(`/${owner}`)).toBe(true);
        if (s.special) expect(s.paths).toEqual([]);
      }
    }
  });

  it.each(OWNER_TYPES)("%s: every built-in quick button only uses real permissions and opens something", (owner) => {
    const known = new Set(knownKeys(owner));
    for (const preset of getPresets(owner)) {
      expect(Object.keys(preset.permissions).length).toBeGreaterThan(0);
      for (const [key, level] of Object.entries(preset.permissions)) {
        expect(known.has(key)).toBe(true);
        expect(["view", "edit"]).toContain(level);
      }
      expect(buildAccess(owner, preset.permissions).modules.length).toBeGreaterThan(0);
    }
  });

  it("the seller's POS-only cashier lands on billing and is flagged POS-only", () => {
    const cashier = getPresets("seller").find((p) => p.key === "cashier");
    const access = buildAccess("seller", cashier.permissions);
    expect(access.posOnly).toBe(true);
    expect(access.landing).toBe("/seller/pos");
    expect(access.allowedPaths).toContainEqual({ path: "/seller/pos", exact: true });
    expect(access.allowedPaths.some((p) => p.path === "/seller/pos/report")).toBe(false);
    expect(access.specials["pos.cost"]).toBe(false);
    expect(access.specials["pos.quickadd"]).toBe(true);
  });

  it("a manager with orders and products is not POS-only", () => {
    const access = buildAccess("seller", { "orders.orders": "edit", "pos.billing": "edit" });
    expect(access.posOnly).toBe(false);
    expect(access.landing).toBe("/seller/orders");
  });

  it("admin order screens also open the shared order detail page", () => {
    const access = buildAccess("admin", { "orders.new": "view" });
    expect(access.allowedPaths).toContainEqual({ path: "/admin/orders/view", exact: false });
  });

  it("cleanPermissions keeps valid levels, turns switches into edit and reports unknown keys", () => {
    const { permissions, unknown } = cleanPermissions("seller", {
      "orders.orders": "edit",
      "orders.returns": "view",
      "orders.tracking": "bogus",
      "pos.cancel": true,
      "nope.key": "edit",
    });
    expect(permissions).toEqual({ "orders.orders": "edit", "orders.returns": "view", "pos.cancel": "edit" });
    expect(unknown).toEqual(["nope.key"]);
    expect(cleanPermissions("seller", null)).toEqual({ permissions: {}, unknown: [] });
  });

  it("can(): edit includes view, view does not include edit, wildcards and any-of work", () => {
    const perms = { "orders.returns": "view", "pos.billing": "edit" };
    expect(can(perms, "orders.returns", "view")).toBe(true);
    expect(can(perms, "orders.returns", "edit")).toBe(false);
    expect(can(perms, "pos.billing", "view")).toBe(true);
    expect(can(perms, "orders.*", "view")).toBe(true);
    expect(can(perms, "orders.*", "edit")).toBe(false);
    expect(can(perms, ["finance.earnings", "pos.billing"], "edit")).toBe(true);
    expect(can(perms, ["finance.earnings", "finance.reports"], "view")).toBe(false);
    expect(can({}, "pos.billing")).toBe(false);
  });

  it("getCatalog exposes only what the screens need (no paths)", () => {
    const cat = getCatalog("seller");
    expect(cat.modules.find((m) => m.key === "pos").subs.map((s) => s.key)).toContain("pos.cancel");
    expect(JSON.stringify(cat.modules)).not.toContain("paths");
  });
});

describe("route rules", () => {
  const needsOf = (rule) => (Array.isArray(rule.need) ? rule.need : [rule.need]);

  it.each([
    ["seller", "SELLER_RULES"],
    ["admin", "ADMIN_RULES"],
  ])("%s: every permission a rule asks for exists in the catalog", (owner, listName) => {
    const known = knownKeys(owner);
    for (const r of __rulesForTests[listName]) {
      for (const need of needsOf(r)) {
        if (need === SELF) continue;
        if (need.endsWith(".*")) expect(known.some((k) => k.startsWith(need.slice(0, -1)))).toBe(true);
        else expect(known).toContain(need);
      }
    }
  });

  it("normalizes urls the way Express sees them", () => {
    expect(normalizePath("/api/seller/pos/orders?limit=5")).toBe("/seller/pos/orders");
    expect(normalizePath("/api/admin/categories/")).toBe("/admin/categories");
    expect(normalizePath("//api//seller//stats")).toBe("/seller/stats");
  });

  it("maps calls to the right permission and level", () => {
    expect(matchRule("seller", "POST", "/api/seller/pos/orders")).toMatchObject({ need: "pos.billing", level: "edit", label: "Created a POS bill" });
    expect(matchRule("seller", "GET", "/api/seller/pos/orders")).toMatchObject({ level: "view" });
    expect(matchRule("seller", "DELETE", "/api/seller/pos/orders/abc")).toMatchObject({ need: "pos.cancel" });
    expect(matchRule("seller", "POST", "/api/seller/pos/orders/bulk-cancel")).toMatchObject({ need: "pos.cancel" });
    expect(matchRule("seller", "PUT", "/api/seller/pos/settings")).toMatchObject({ need: "pos.settings" });
    expect(matchRule("seller", "GET", "/api/seller/profile")).toMatchObject({ self: true });
    expect(matchRule("admin", "GET", "/api/admin/experience/hero")).toMatchObject({ need: ["marketing.hero"] });
    expect(matchRule("admin", "PUT", "/api/admin/experience/abc")).toMatchObject({ need: "marketing.sections" });
    expect(matchRule("admin", "PUT", "/api/orders/status/123")).toMatchObject({ need: "orders.*", level: "edit" });
  });

  it("refuses everything that has no rule, including owner-only features", () => {
    const none = [
      ["seller", "GET", "/api/seller/staff/members"],
      ["seller", "POST", "/api/seller/staff/members"],
      ["seller", "PUT", "/api/seller/profile"],
      ["seller", "GET", "/api/seller/pos/something-new"],
      ["seller", "GET", "/api/admin/stats"],
      ["admin", "GET", "/api/admin/staff/members"],
      ["admin", "PUT", "/api/admin/profile/password"],
      ["admin", "GET", "/api/admin/settings/storage"],
      ["admin", "GET", "/api/admin/env"],
      ["admin", "GET", "/api/seller/stats"],
    ];
    for (const [owner, method, url] of none) expect(matchRule(owner, method, url)).toBeNull();
  });

  it("a rule for one panel never applies to the other", () => {
    expect(matchRule("seller", "GET", "/api/admin/users")).toBeNull();
    expect(matchRule("admin", "GET", "/api/seller/earnings")).toBeNull();
  });
});

describe("drift guards", () => {
  const posRoutesSrc = fs.readFileSync(path.resolve(here, "../app/routes/posRoutes.js"), "utf8");
  const posCalls = [...posRoutesSrc.matchAll(/router\.(get|post|put|patch|delete)\("([^"]+)"/g)].map((m) => [m[1].toUpperCase(), m[2]]);

  it("finds the POS routes it is guarding", () => {
    expect(posCalls.length).toBeGreaterThan(40);
  });

  it.each(["seller", "admin"])("%s: every POS route has a staff rule", (portal) => {
    const unmapped = posCalls
      .filter(([method, p]) => !matchRule(portal, method, `/api/${portal}/pos${p.replace(/:[A-Za-z]+/g, "x")}`))
      .map(([method, p]) => `${method} ${p}`);
    // admin-only list of sellers is the one call that only exists for the admin portal
    expect(unmapped.filter((r) => !(portal === "seller" && r === "GET /sellers"))).toEqual([]);
  });

  // Every API call the panels' screens make must be either covered by a rule
  // or be on this explicit owner-only list - so a new screen can't ship
  // that silently breaks for staff.
  const OWNER_ONLY = new Set([
    // account / sign-in (owners only; staff have /staff/*)
    "POST /admin/login", "POST /admin/signup", "PUT /admin/profile", "PUT /admin/profile/password",
    "POST /seller/login", "POST /seller/signup", "POST /seller/check-exists",
    "POST /seller/verification/send-otp", "POST /seller/verification/verify-otp",
    "POST /seller/forgot-password/send-otp", "POST /seller/forgot-password/verify-otp", "POST /seller/reset-password",
    "PUT /seller/profile",
    // system / owner-only settings
    "GET /admin/settings/storage", "PUT /admin/settings/storage",
    // notification inbox belongs to the owner
    "GET /notifications", "PUT /notifications/:id/read", "PUT /notifications/mark-all-read",
    // public endpoints (no login needed)
    "GET /public/faqs", "GET /settings",
  ]);
  const apiFiles = [
    ...["authApi", "catalogApi", "contentApi", "deliveryApi", "financeApi", "ordersApi", "settingsApi", "supportApi", "usersApi"].map((f) => ["admin", `admin/services/api/${f}.js`]),
    ["seller", "seller/services/sellerApi.js"],
  ];
  const frontend = path.resolve(here, "../../frontend/src/modules");

  it.each(apiFiles)("%s panel: every call in %s is covered or owner-only", (owner, file) => {
    const full = path.join(frontend, file);
    if (!fs.existsSync(full)) return; // frontend not checked out next to the backend
    const src = fs.readFileSync(full, "utf8");
    const calls = [...src.matchAll(/(?:axiosInstance|api)\.(get|post|put|patch|delete)\(\s*([`'"])([^`'"]*)\2/g)].map((m) => [
      m[1].toUpperCase(),
      m[3].replace(/\$\{[^}]*\}/g, ":id").split("?")[0],
    ]);
    const missing = calls
      .filter(([method, url]) => !OWNER_ONLY.has(`${method} ${url}`) && !matchRule(owner, method, `/api${url.replace(/:id/g, "x")}`))
      .map(([method, url]) => `${method} ${url}`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
