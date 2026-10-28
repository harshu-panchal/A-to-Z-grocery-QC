import { describe, expect, it } from "@jest/globals";
import { filterNavForStaff, pathAllowed } from "../modules/staff/staffPaths";

// what the server sends for a cashier whose only permission is POS billing
const cashier = { allowedPaths: [{ path: "/seller/pos", exact: true }, { path: "/seller/pos/payment-return", exact: false }] };
// orders + returns
const packer = { allowedPaths: [{ path: "/seller/orders", exact: false }, { path: "/seller/returns", exact: false }] };
// dashboard only
const dashboardOnly = { allowedPaths: [{ path: "/seller", exact: true }] };

describe("pathAllowed", () => {
  it("opens exactly the pages that were given", () => {
    expect(pathAllowed(cashier, "/seller/pos")).toBe(true);
    expect(pathAllowed(cashier, "/seller/pos/")).toBe(true);
    expect(pathAllowed(cashier, "/seller/pos/payment-return")).toBe(true);
    expect(pathAllowed(cashier, "/seller/pos/report")).toBe(false); // exact match: not the other POS pages
    expect(pathAllowed(cashier, "/seller/orders")).toBe(false);
    expect(pathAllowed(cashier, "/seller")).toBe(false);
  });

  it("a non-exact entry also opens everything under it, but not look-alikes", () => {
    expect(pathAllowed(packer, "/seller/orders")).toBe(true);
    expect(pathAllowed(packer, "/seller/orders/123")).toBe(true);
    expect(pathAllowed(packer, "/seller/ordersx")).toBe(false);
    expect(pathAllowed(packer, "/seller/order")).toBe(false);
  });

  it("the dashboard entry opens only the dashboard", () => {
    expect(pathAllowed(dashboardOnly, "/seller")).toBe(true);
    expect(pathAllowed(dashboardOnly, "/seller/orders")).toBe(false);
    expect(pathAllowed(dashboardOnly, "/seller/staff")).toBe(false);
  });

  it("everyone can open their own account page, but never Staff Management or the owner's profile", () => {
    for (const access of [cashier, packer, dashboardOnly, { allowedPaths: [] }, null, undefined]) {
      expect(pathAllowed(access, "/seller/my-account")).toBe(true);
      expect(pathAllowed(access, "/admin/my-account")).toBe(true);
      expect(pathAllowed(access, "/seller/staff")).toBe(false);
      expect(pathAllowed(access, "/admin/staff")).toBe(false);
      expect(pathAllowed(access, "/seller/profile")).toBe(false);
      expect(pathAllowed(access, "/admin/env")).toBe(false);
    }
  });
});

describe("filterNavForStaff", () => {
  const nav = [
    { label: "Dashboard", path: "/seller" },
    { label: "Orders", path: "/seller/orders" },
    { label: "Earnings", path: "/seller/earnings" },
    {
      label: "POS (Counter Billing)",
      children: [
        { label: "Billing", path: "/seller/pos", end: true },
        { label: "Bills & Stock Report", path: "/seller/pos/report" },
        { label: "Settings", path: "/seller/pos/settings" },
      ],
    },
    { label: "Staff Management", path: "/seller/staff" },
  ];

  it("keeps only allowed entries", () => {
    expect(filterNavForStaff(nav, packer).map((i) => i.label)).toEqual(["Orders"]);
  });

  it("keeps a group with only the allowed sub-pages, and drops it when none are allowed", () => {
    const out = filterNavForStaff(nav, cashier);
    expect(out.map((i) => i.label)).toEqual(["POS (Counter Billing)"]);
    expect(out[0].children.map((c) => c.label)).toEqual(["Billing"]);
    expect(filterNavForStaff(nav, packer).some((i) => i.children)).toBe(false);
  });

  it("never offers Staff Management, and copes with empty input", () => {
    const everything = { allowedPaths: [{ path: "/seller", exact: true }, { path: "/seller/orders" }, { path: "/seller/pos" }] };
    expect(filterNavForStaff(nav, everything).some((i) => i.label === "Staff Management")).toBe(false);
    expect(filterNavForStaff(undefined, cashier)).toEqual([]);
    expect(filterNavForStaff(nav, null)).toEqual([]);
  });
});
