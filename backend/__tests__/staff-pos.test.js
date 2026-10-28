import { jest } from "@jest/globals";

process.env.REDIS_DISABLED = "true";

const { stripCostFields, hideCostForStaff } = await import("../app/services/staff/redactCost.js");
const { posScope } = await import("../app/services/pos/posService.js");

const OWNER = "a".repeat(24);
const STAFF = "b".repeat(24);

describe("cost fields are hidden from staff without the permission", () => {
  it("removes purchase rate and profit anywhere in a response, keeps the rest", () => {
    const body = {
      success: true,
      result: {
        items: [
          { name: "Atta", sellingPrice: 250, purchaseRate: 200, variants: [{ sku: "A1", purchaseRate: 190, price: 250 }] },
          { name: "Oil", costPrice: 90, profit: 12, nested: { margin: 5, keep: 1 } },
        ],
        totalProfit: 500,
        total: 1000,
      },
    };
    const out = stripCostFields(body);
    expect(JSON.stringify(out)).not.toMatch(/purchaseRate|costPrice|"profit"|totalProfit|margin/);
    expect(out.result.items[0]).toMatchObject({ name: "Atta", sellingPrice: 250, variants: [{ sku: "A1", price: 250 }] });
    expect(out.result.items[1].nested).toEqual({ keep: 1 });
    expect(out.result.total).toBe(1000);
    expect(body.result.items[0].purchaseRate).toBe(200); // the original is untouched
  });

  it("leaves dates and primitives alone", () => {
    const d = new Date("2026-10-28T00:00:00Z");
    expect(stripCostFields({ at: d, n: 1, s: "x", z: null }).at).toBe(d);
    expect(stripCostFields("text")).toBe("text");
  });

  const run = (pos) => {
    const sent = [];
    const res = { json: (b) => { sent.push(b); return res; } };
    let nexted = false;
    hideCostForStaff({ pos }, res, () => { nexted = true; });
    res.json({ result: { purchaseRate: 5, price: 9 } });
    return { sent: sent[0], nexted };
  };

  it("scrubs responses only when the person cannot see cost", () => {
    expect(run({ canSeeCost: false })).toEqual({ sent: { result: { price: 9 } }, nexted: true });
    expect(run({ canSeeCost: true }).sent.result.purchaseRate).toBe(5);
    expect(run(undefined).sent.result.purchaseRate).toBe(5);
  });
});

describe("POS scope records who acted", () => {
  const scopeFor = (req, role = "seller") => {
    posScope(role)(req, {}, () => {});
    return req.pos;
  };

  it("an owner acts as themselves and sees cost", () => {
    const pos = scopeFor({ user: { id: OWNER, role: "seller" } });
    expect(String(pos.owner)).toBe(OWNER);
    expect(String(pos.actor)).toBe(OWNER);
    expect(pos.actorName).toBe("");
    expect(pos.isStaff).toBe(false);
    expect(pos.canSeeCost).toBe(true);
  });

  it("staff work on the owner's shop but are recorded as themselves", () => {
    const pos = scopeFor({
      user: { id: OWNER, role: "seller", isStaff: true },
      staff: { id: STAFF, name: "Ravi", permissions: { "pos.billing": "edit" } },
    });
    expect(String(pos.owner)).toBe(OWNER); // the shop's data
    expect(String(pos.actor)).toBe(STAFF); // who made the bill
    expect(pos.actorName).toBe("Ravi");
    expect(pos.isStaff).toBe(true);
    expect(pos.canSeeCost).toBe(false);
  });

  it("staff with the cost permission see it", () => {
    const pos = scopeFor({
      user: { id: OWNER, role: "seller", isStaff: true },
      staff: { id: STAFF, name: "Meena", permissions: { "pos.billing": "edit", "pos.cost": "edit" } },
    });
    expect(pos.canSeeCost).toBe(true);
  });

  it("admin staff use the admin's shared POS (no owner)", () => {
    const pos = scopeFor({ user: { id: OWNER, role: "admin", isStaff: true }, staff: { id: STAFF, name: "Priya", permissions: {} } }, "admin");
    expect(pos.owner).toBeNull();
    expect(pos.isAdmin).toBe(true);
    expect(String(pos.actor)).toBe(STAFF);
  });
});
