import { jest } from "@jest/globals";

// Seller panel edge cases: product codes/prices/variants, profile edits,
// withdrawals and the lock fallback without Redis.

const mockProductExists = jest.fn();
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { exists: mockProductExists },
}));

const mockSellerFindById = jest.fn();
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById },
}));

const mockTxFind = jest.fn();
const mockTxCreate = jest.fn();
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { find: mockTxFind, create: mockTxCreate },
}));

// Withdrawable = settled wallet money minus withdrawals already requested.
// The fake reads the Withdrawal rows the controller has created so far.
const fakeLedger = { walletAvailable: 0, withdrawals: [] };
jest.unstable_mockModule("../app/services/finance/withdrawableBalance.js", () => ({
  getWithdrawableBalance: jest.fn(async () => {
    await new Promise((r) => setImmediate(r));
    const requested = fakeLedger.withdrawals.reduce((a, w) => a + Math.abs(w.amount), 0);
    return { withdrawable: Math.max(0, fakeLedger.walletAvailable - requested), pendingWithdrawals: requested };
  }),
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: () => null,
  isRedisEnabled: () => false,
}));

const {
  assignUniqueSlugAndSku,
  validateProductPrices,
  validateVariantIdentity,
  fillMissingMrp,
} = await import("../app/controller/productController.js");
const { updateSellerProfile, requestWithdrawal } = await import("../app/controller/sellerController.js");
const { withLock } = await import("../app/utils/distributedLock.js");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const msg = (res) => res.json.mock.calls[0][0].message;

beforeEach(() => jest.clearAllMocks());

// ------------------------------------------------------------ product codes
describe("product slug / sku are made unique", () => {
  test("a taken auto slug and auto SKU get a suffix instead of failing", async () => {
    // first lookup of each value is taken, the suffixed one is free
    mockProductExists.mockResolvedValueOnce(true).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(true).mockResolvedValueOnce(null);
    const data = { slug: "amul-milk", sku: "amulm-001" };
    expect(await assignUniqueSlugAndSku(data)).toBeNull();
    expect(data.slug).toMatch(/^amul-milk-[0-9a-f]{4}$/);
    expect(data.sku).toMatch(/^amulm-001-[0-9a-f]{4}$/);
  });

  test("a SKU the seller typed is never changed silently: clear error", async () => {
    mockProductExists.mockResolvedValueOnce(null).mockResolvedValueOnce(true);
    const data = { slug: "x", sku: "MILK-FULL-CREAM" };
    expect(await assignUniqueSlugAndSku(data)).toMatch(/already used/);
    expect(data.sku).toBe("MILK-FULL-CREAM");
  });

  test("on update, keeping the same SKU doesn't check anything", async () => {
    const data = { sku: "amulm-001" };
    expect(await assignUniqueSlugAndSku(data, { excludeId: "p1", currentSku: "amulm-001" })).toBeNull();
    expect(mockProductExists).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------ prices
describe("product prices", () => {
  test.each([
    [{ mrp: 100, sellingPrice: 120 }, /more than MRP/],
    [{ mrp: -5, sellingPrice: 0 }, /0 or more/],
    [{ mrp: 0, sellingPrice: 0 }, /above ₹0/],
    [{ mrp: "abc" }, /0 or more/],
  ])("%p is refused", (data, error) => {
    expect(validateProductPrices(data)).toMatch(error);
  });

  test("valid prices pass; equal to MRP is fine", () => {
    expect(validateProductPrices({ mrp: 100, sellingPrice: 90 })).toBeNull();
    expect(validateProductPrices({ mrp: 100, sellingPrice: 100 })).toBeNull();
    expect(validateProductPrices({ mrp: 100 })).toBeNull();
  });

  test("each variant is checked and named in the message", () => {
    const err = validateProductPrices({ variants: [{ name: "500g", mrp: 50, sellingPrice: 45 }, { name: "1kg", mrp: 90, sellingPrice: 95 }] });
    expect(err).toMatch(/1kg/);
  });

  test("update that only changes MRP is checked against the stored selling price", () => {
    expect(validateProductPrices({ mrp: 50 }, { mrp: 100, sellingPrice: 80 })).toMatch(/more than MRP/);
    expect(validateProductPrices({ stock: 5 }, { mrp: 100, sellingPrice: 80 })).toBeNull();
  });
});

describe("MRP and purchase rate are optional", () => {
  test("blank MRP takes the selling price; blank purchase rate is 0", () => {
    const data = { mrp: "", sellingPrice: "120", purchaseRate: "", variants: [{ name: "1kg", mrp: "", sellingPrice: 99, purchaseRate: "" }] };
    fillMissingMrp(data);
    expect(data.mrp).toBe(120);
    expect(data.purchaseRate).toBe(0);
    expect(data.variants[0]).toMatchObject({ mrp: 99, purchaseRate: 0 });
    expect(validateProductPrices(data)).toBeNull();
  });

  test("an entered MRP is kept and still checked against the selling price", () => {
    const data = { variants: [{ name: "1kg", mrp: 100, sellingPrice: 120 }] };
    fillMissingMrp(data);
    expect(data.variants[0].mrp).toBe(100);
    expect(validateProductPrices(data)).toMatch(/more than MRP/);
  });

  test("no selling price and no MRP is refused", () => {
    const data = { variants: [{ name: "1kg", mrp: "", sellingPrice: "" }] };
    fillMissingMrp(data);
    expect(validateProductPrices(data)).toMatch(/selling price/);
  });
});

describe("variant identity", () => {
  test("duplicate names (any case) and duplicate codes are refused", () => {
    expect(validateVariantIdentity({ variants: [{ name: "1kg" }, { name: "1KG" }] })).toMatch(/both named/);
    expect(validateVariantIdentity({ variants: [{ name: "a", sku: "x-1" }, { name: "b", sku: "X-1" }] })).toMatch(/same product code/);
  });
  test("with several variants each needs a name; a single unnamed variant is fine", () => {
    expect(validateVariantIdentity({ variants: [{ name: "500g" }, { name: " " }] })).toMatch(/name/);
    expect(validateVariantIdentity({ variants: [{ name: "" }] })).toBeNull();
  });
});

// ------------------------------------------------------------ profile
describe("seller profile update", () => {
  const seller = () => ({ phone: "9876543210", save: jest.fn(async function save() { return this; }) });
  const update = async (body) => {
    const doc = seller();
    mockSellerFindById.mockResolvedValue(doc);
    const res = makeRes();
    await updateSellerProfile({ user: { id: "s1" }, body }, res);
    return { res, doc };
  };

  test("the registered phone can't be changed", async () => {
    const { res, doc } = await update({ phone: "9000000000" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test("sending the same phone back is fine", async () => {
    const { res } = await update({ phone: "9876543210", shopName: "Fresh Mart" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test.each([
    [{ lat: "abc", lng: 78 }, /latitude/],
    [{ lat: 25, lng: "x" }, /longitude/],
    [{ radius: "far" }, /Radius/],
    [{ radius: 0 }, /Radius/],
    [{ shopName: "   " }, /can't be empty/],
    [{ shopName: { $ne: 1 } }, /must be text/],
    [{ pincode: "12ab" }, /6 digits/],
  ])("%p is refused", async (body, error) => {
    const { res, doc } = await update(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(msg(res)).toMatch(error);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test("valid location is stored as [lng, lat] numbers", async () => {
    const { res, doc } = await update({ lat: "25.45", lng: "78.57", radius: "7" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(doc.location.coordinates).toEqual([78.57, 25.45]);
    expect(doc.serviceRadius).toBe(7);
  });
});

// ------------------------------------------------------------ withdrawals
describe("seller withdrawal", () => {
  const withdraw = async (amount) => {
    const res = makeRes();
    await requestWithdrawal({ user: { id: "s1" }, body: { amount } }, res);
    return res;
  };
  const balance = (available) => {
    fakeLedger.walletAvailable = available;
    fakeLedger.withdrawals = [];
  };

  test.each([[0], [0.5], [-10], ["abc"], [100.555]])("amount %p is refused", async (amount) => {
    balance(1000);
    const res = await withdraw(amount);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTxCreate).not.toHaveBeenCalled();
  });

  test("more than the balance is refused", async () => {
    balance(100);
    const res = await withdraw(150);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(msg(res)).toMatch(/Insufficient/);
  });

  test("without Redis, two parallel requests can't both spend the same balance", async () => {
    // ₹100 settled in the wallet; each request sees the withdrawals created so far
    balance(100);
    const created = fakeLedger.withdrawals;
    mockTxCreate.mockImplementation(async (doc) => {
      created.push(doc);
      return doc;
    });
    const [a, b] = await Promise.all([withdraw(80), withdraw(80)]);
    const statuses = [a.status.mock.calls[0][0], b.status.mock.calls[0][0]].sort();
    expect(statuses).toEqual([201, 400]);
    expect(created).toHaveLength(1);
  });
});

describe("withLock without Redis", () => {
  test("serializes work for the same key", async () => {
    const order = [];
    const job = (name) => withLock("k", 1000, async () => {
      order.push(`${name}-start`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`${name}-end`);
    });
    await Promise.all([job("a"), job("b")]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});
