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

  it("staff without it can sell at the shop price only (no wholesale)", async () => {
    const s = staff({ "pos.billing": "edit" });
    expect((await resolve(s, line({})))[0].unitPrice).toBe(250);
    expect((await resolve(s, line({ price: 250 })))[0].unitPrice).toBe(250);
    await expect(resolve(s, line({ price: 240, priceType: "wholesale" }))).rejects.toMatchObject({ statusCode: 403 });
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

describe("the cost scrubber keeps ids intact", () => {
  it("ObjectIds and dates survive and still serialise as before", async () => {
    const { default: mongoose } = await import("mongoose");
    const id = new mongoose.Types.ObjectId();
    const when = new Date("2026-10-29T10:00:00Z");
    const body = { result: { items: [{ _id: id, name: "Ravi", owner: id, createdAt: when, purchaseRate: 5 }] } };
    const out = JSON.parse(JSON.stringify(stripCostFields(body)));
    expect(out.result.items[0]).toEqual({ _id: String(id), name: "Ravi", owner: String(id), createdAt: when.toISOString() });
  });

  it("works on a mongoose document too", async () => {
    const { default: mongoose } = await import("mongoose");
    const Doc = mongoose.models.ScrubTest || mongoose.model("ScrubTest", new mongoose.Schema({ name: String, purchaseRate: Number }));
    const doc = new Doc({ name: "Atta", purchaseRate: 9 });
    const out = JSON.parse(JSON.stringify(stripCostFields({ result: doc })));
    expect(out.result).toMatchObject({ _id: String(doc._id), name: "Atta" });
    expect(out.result.purchaseRate).toBeUndefined();
  });
});

describe("customer due / advance is hidden from staff without Customers & Udhaar", () => {
  const run = (permissions) => {
    const req = { user: { id: OWNER }, staff: permissions ? { id: STAFF, name: "Ravi", permissions } : undefined };
    posScope("seller")(req, {}, () => {});
    let sent;
    const res = { json: (b) => { sent = b; return b; } };
    hideCostForStaff(req, res, () => {});
    res.json({ result: { items: [{ name: "Ravi", phone: "9876543210", creditBalance: 500, creditLimit: 1000 }], creditDue: { total: 500 } } });
    return sent.result;
  };

  it("cashier: dues removed, the rest kept", () => {
    const r = run({ "pos.billing": "edit" });
    expect(r.items[0]).toEqual({ name: "Ravi", phone: "9876543210" });
    expect(r.creditDue).toBeUndefined();
  });

  it("staff with Customers & Udhaar and the owner still see dues", () => {
    expect(run({ "pos.billing": "edit", "pos.customers": "view" }).items[0].creditBalance).toBe(500);
    expect(run(null).creditDue).toEqual({ total: 500 });
  });
});

describe("POS edge cases", () => {
  let resolve;
  const productId = "d".repeat(24);
  const sized = { _id: productId, name: "Rice", sellerId: OWNER, sellingPrice: 90, mrp: 100, gstRate: 0,
    variants: [{ sku: "R1", name: "1 kg", sellingPrice: 0, mrp: 0 }, { sku: "R5", name: "5 kg", sellingPrice: 400, mrp: 450 }] };

  beforeAll(async () => {
    const { default: Product } = await import("../app/models/product.js");
    Product.find = () => ({ select: () => ({ lean: async () => [sized] }) });
    ({ resolveLines: resolve } = await import("../app/services/pos/posService.js"));
  });
  const cashier = () => {
    const req = { user: { id: OWNER }, staff: { id: STAFF, name: "Ravi", permissions: { "pos.billing": "edit" } } };
    posScope("seller")(req, {}, () => {});
    return req.pos;
  };

  it("a size with no price of its own uses the product price, same as the billing screen", async () => {
    const [l] = await resolve(cashier(), [{ productId, variantSku: "R1", quantity: 1, price: 90 }]);
    expect(l.unitPrice).toBe(90);
  });

  it("an offline bill with an old price is kept and the difference is reported", async () => {
    const warnings = [];
    const [l] = await resolve(cashier(), [{ productId, variantSku: "R5", quantity: 1, price: 380 }], { priceWarnings: warnings });
    expect(l.unitPrice).toBe(380);
    expect(warnings[0]).toMatch(/Rice at ₹380 \(shop price ₹400\)/);
  });

  it("prices from an owner's quotation are allowed for the cashier", async () => {
    const known = [{ product: productId, variantSku: "R5", unitPrice: 370, lineDiscount: 0 }];
    expect((await resolve(cashier(), [{ productId, variantSku: "R5", quantity: 1, price: 370 }], { knownLines: known }))[0].unitPrice).toBe(370);
  });
});

describe("exchange refunds what the customer paid on the bill", () => {
  let takeBack, PosOrder;
  beforeAll(async () => {
    ({ takeBackFromBill: takeBack } = await import("../app/controller/pos/posOrderController.js"));
    ({ PosOrder } = await import("../app/models/pos.js"));
  });
  // shop price 100 x2 with ₹20 line discount (180) + 50 x1 = 230; bill discount 30 -> paid 200
  const bill = () => new PosOrder({
    owner: OWNER, channel: "seller", invoiceNumber: "S-1", paymentMethod: "Cash", subtotal: 230, billDiscount: 30, total: 200,
    items: [
      { product: "e".repeat(24), name: "Shirt", quantity: 2, unitPrice: 100, lineDiscount: 20, total: 180, stockDeducted: true },
      { product: null, name: "Loose item", quantity: 1, unitPrice: 50, total: 50, stockDeducted: false },
    ],
  });

  it("refunds the paid share, not today's shop price", () => {
    const doc = bill();
    const [l] = takeBack(doc, [{ lineId: doc.items[0]._id, quantity: 1 }]);
    expect(l.total).toBeCloseTo(78.26, 2); // 90 paid on the line, less its share of the ₹30 bill discount
    expect(doc.items[0].returnedQty).toBe(1);
  });

  it("can't return more than was bought (or already returned)", () => {
    const doc = bill();
    takeBack(doc, [{ lineId: doc.items[0]._id, quantity: 2 }]);
    expect(() => takeBack(doc, [{ lineId: doc.items[0]._id, quantity: 1 }])).toThrow(/Only 0 of "Shirt"/);
    expect(() => takeBack(doc, [{ lineId: "f".repeat(24), quantity: 1 }])).toThrow(/not on bill S-1/);
  });

  it("does not put stock back for a line that never took stock", () => {
    const doc = bill();
    const [l] = takeBack(doc, [{ lineId: doc.items[1]._id, quantity: 1 }]);
    expect(l.product).toBeNull();
  });
});
