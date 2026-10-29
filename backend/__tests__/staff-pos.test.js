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

describe("staff price changes need the owner's permission", () => {

  let resolve;
  const productId = "c".repeat(24);
  const product = { _id: productId, name: "Atta", sellerId: OWNER, sellingPrice: 250, mrp: 260, wholesalePrice: 240, gstRate: 0, variants: [] };

  beforeAll(async () => {
    const { default: Product } = await import("../app/models/product.js");
    Product.find = () => ({ select: () => ({ lean: async () => [product] }) });
    ({ resolveLines: resolve } = await import("../app/services/pos/posService.js"));
  });

  const scope = (req) => {
    let pos;
    posScope("seller")(req, {}, () => { pos = req.pos; });
    return pos;
  };
  const owner = () => scope({ user: { id: OWNER } });
  const staff = (permissions) => scope({ user: { id: OWNER }, staff: { id: STAFF, name: "Ravi", permissions } });
  const line = (extra) => [{ productId, quantity: 2, ...extra }];

  it("owner and staff with the switch can change the price", async () => {
    expect((await resolve(owner(), line({ price: 200 })))[0].unitPrice).toBe(200);
    expect((await resolve(staff({ "pos.price": "edit" }), line({ price: 200, lineDiscount: 10 })))[0].total).toBe(390);
  });

  it("staff without it can sell at the shop or wholesale price only", async () => {
    const s = staff({ "pos.billing": "edit" });
    expect((await resolve(s, line({})))[0].unitPrice).toBe(250);
    expect((await resolve(s, line({ price: 250 })))[0].unitPrice).toBe(250);
    expect((await resolve(s, line({ price: 240, priceType: "wholesale" })))[0].unitPrice).toBe(240);
  });

  it("staff without it are refused a changed price or a line discount", async () => {
    const s = staff({ "pos.billing": "edit" });
    await expect(resolve(s, line({ price: 100 }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(resolve(s, line({ price: 250, lineDiscount: 5 }))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("editing a bill keeps the price it was already sold at", async () => {
    const s = staff({ "pos.billing": "edit" });
    const known = [{ product: productId, variantSku: "", unitPrice: 230, lineDiscount: 0 }];
    expect((await resolve(s, line({ price: 230 }), { knownLines: known }))[0].unitPrice).toBe(230);
    await expect(resolve(s, line({ price: 229 }), { knownLines: known })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("items not in the product list need the Quick add switch", () => {
  let resolve;
  beforeAll(async () => {
    ({ resolveLines: resolve } = await import("../app/services/pos/posService.js"));
  });
  const scope = (permissions) => {
    const req = { user: { id: OWNER }, staff: { id: STAFF, name: "Ravi", permissions } };
    let pos;
    posScope("seller")(req, {}, () => { pos = req.pos; });
    return pos;
  };
  const loose = [{ productId: null, name: "Loose sugar", quantity: 1, price: 40 }];

  it("staff with Quick add can bill a typed-in item", async () => {
    expect((await resolve(scope({ "pos.billing": "edit", "pos.quickadd": "edit" }), loose))[0].unitPrice).toBe(40);
  });

  it("staff without it are refused, unless the bill being edited already had that item", async () => {
    const s = scope({ "pos.billing": "edit" });
    await expect(resolve(s, loose)).rejects.toMatchObject({ statusCode: 403 });
    expect((await resolve(s, loose, { knownLines: [{ product: null, name: "Loose sugar" }] }))[0].name).toBe("Loose sugar");
  });
});
