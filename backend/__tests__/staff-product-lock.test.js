process.env.REDIS_DISABLED = "true";

const { isSellerStaff, lockStaffPriceAndStock } = await import("../app/services/staff/staffProductLock.js");

const stored = {
  mrp: 60, sellingPrice: 55, stock: 30,
  variants: [
    { _id: "v1", name: "500g", sku: "atta-001", mrp: 60, sellingPrice: 55, purchaseRate: 40, stock: 10, wholesalePrice: 50 },
    { _id: "v2", name: "1kg", sku: "atta-002", mrp: 110, sellingPrice: 100, purchaseRate: 80, stock: 20 },
  ],
};

describe("staff product edits", () => {
  it("only applies to a seller's staff", () => {
    expect(isSellerStaff({ user: { role: "seller" }, staff: { id: "s" } })).toBe(true);
    expect(isSellerStaff({ user: { role: "seller" } })).toBe(false);
    expect(isSellerStaff({ user: { role: "admin" }, staff: { id: "s" } })).toBe(false);
  });

  it("keeps stored prices and stock, takes name / code / rack / barcode", () => {
    const data = {
      mrp: 1, sellingPrice: 1, stock: 999,
      variants: [
        { _id: "v1", name: "500 g", sku: "ATTA-500", rackCode: "A3", barcode: "890123", mrp: 1, sellingPrice: 1, stock: 999, wholesalePrice: 1 },
        { _id: "v2", name: "1kg", sku: "atta-002", sellingPrice: 5 },
      ],
    };
    expect(lockStaffPriceAndStock(data, stored)).toBeNull();
    expect(data.mrp).toBeUndefined();
    expect(data.stock).toBeUndefined();
    expect(data.variants[0]).toMatchObject({ name: "500 g", sku: "ATTA-500", rackCode: "A3", barcode: "890123", mrp: 60, sellingPrice: 55, purchaseRate: 40, stock: 10, wholesalePrice: 50 });
    expect(data.variants[1]).toMatchObject({ mrp: 110, sellingPrice: 100, stock: 20 });
  });

  it("a new size starts with no price and no stock", () => {
    const data = { variants: [...stored.variants, { name: "5kg", sku: "atta-003", sellingPrice: 400, stock: 7 }] };
    expect(lockStaffPriceAndStock(data, stored)).toBeNull();
    expect(data.variants[2]).toMatchObject({ name: "5kg", mrp: 0, sellingPrice: 0, stock: 0 });
  });

  it("can't remove a size that still has stock", () => {
    const data = { variants: [stored.variants[0]] };
    expect(lockStaffPriceAndStock(data, stored)).toMatch(/1kg.*20 in stock/);
  });

  it("a new product is hidden with no price or stock", () => {
    const data = { name: "Atta", mrp: 50, sellingPrice: 45, stock: 5, variants: [{ name: "1kg", sellingPrice: 45, stock: 5 }] };
    expect(lockStaffPriceAndStock(data, null)).toBeNull();
    expect(data).toMatchObject({ mrp: 0, sellingPrice: 0, stock: 0, status: "inactive" });
    expect(data.variants[0]).toMatchObject({ sellingPrice: 0, stock: 0 });
  });
});
