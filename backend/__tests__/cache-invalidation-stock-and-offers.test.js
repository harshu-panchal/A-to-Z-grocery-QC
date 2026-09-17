import { jest } from "@jest/globals";

// Regression tests for the cache-invalidation gaps found in the cache/
// search infra audit:
//  - stockService.reserveStockForItems / releaseReservedStockForOrder
//    (order placement / cancellation) never invalidated the product cache.
//  - stockController.adjustStock (seller manual restock/correction) had
//    the same gap.
//  - offerSectionController's create/update/delete/reorder never
//    invalidated their own public cache namespace.

const mockInvalidate = jest.fn().mockResolvedValue(undefined);
const mockProductFindOneAndUpdate = jest.fn();
const mockProductUpdateOne = jest.fn();
const mockProductFindOne = jest.fn();
const mockStockHistoryCreate = jest.fn().mockResolvedValue([{}]);
// Perf audit BE-D7: stockService now batches the per-item StockHistory
// writes into a single insertMany() after the loop instead of one create()
// call per item — mock needs both.
const mockStockHistoryInsertMany = jest.fn().mockResolvedValue([{}]);

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  invalidate: mockInvalidate,
  buildKey: (...parts) => `cache:${parts.join(":")}`,
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    findOneAndUpdate: mockProductFindOneAndUpdate,
    updateOne: mockProductUpdateOne,
    findOne: mockProductFindOne,
  },
}));

jest.unstable_mockModule("../app/models/stockHistory.js", () => ({
  default: { create: mockStockHistoryCreate, insertMany: mockStockHistoryInsertMany },
}));

jest.unstable_mockModule("../app/services/lowStockAlertService.js", () => ({
  createLowStockAlertCandidate: jest.fn(() => null),
  isLowStockAlertsEnabled: jest.fn().mockResolvedValue(false),
}));

const mockOfferSectionCreate = jest.fn();
const mockOfferSectionFindById = jest.fn();
const mockOfferSectionFindByIdAndDelete = jest.fn();
const mockOfferSectionBulkWrite = jest.fn().mockResolvedValue({});
const mockOfferSectionCountDocuments = jest.fn().mockResolvedValue(0);

jest.unstable_mockModule("../app/models/offerSection.js", () => ({
  default: {
    create: mockOfferSectionCreate,
    findById: mockOfferSectionFindById,
    findByIdAndDelete: mockOfferSectionFindByIdAndDelete,
    bulkWrite: mockOfferSectionBulkWrite,
    countDocuments: mockOfferSectionCountDocuments,
  },
}));

jest.unstable_mockModule("../app/services/customerVisibilityService.js", () => ({
  parseCustomerCoordinates: jest.fn(),
  getNearbySellerIdsForCustomer: jest.fn(),
}));

jest.unstable_mockModule("../app/services/productModerationService.js", () => ({
  getApprovedOrLegacyFilter: jest.fn(),
}));

const { reserveStockForItems, releaseReservedStockForOrder } = await import(
  "../app/services/stockService.js"
);

const {
  createOfferSection,
  updateOfferSection,
  deleteOfferSection,
  reorderOfferSections,
} = await import("../app/controller/offerSectionController.js");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("stock mutations invalidate product cache (audit gap)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reserveStockForItems invalidates the touched product's detail + list cache", async () => {
    mockProductFindOneAndUpdate.mockResolvedValue({
      _id: "prod-1",
      stock: 5,
      variants: [],
    });

    await reserveStockForItems({
      items: [{ productId: "prod-1", quantity: 2, productName: "Apple" }],
      sellerId: "seller-1",
      orderId: "ORD-1",
      session: null,
      paymentMode: "COD",
    });

    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:product:prod-1");
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:productList:*");
  });

  it("releaseReservedStockForOrder invalidates every touched product's cache", async () => {
    const order = {
      _id: "order-1",
      orderId: "ORD-1",
      seller: "seller-1",
      items: [
        { product: "prod-1", quantity: 2 },
        { product: "prod-2", quantity: 1 },
      ],
      stockReservation: { status: "RESERVED" },
    };

    await releaseReservedStockForOrder(order, { reason: "Cancelled" });

    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:product:prod-1");
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:product:prod-2");
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:productList:*");
  });

  it("does not invalidate anything when the reservation is already released (idempotent no-op)", async () => {
    const order = {
      _id: "order-1",
      orderId: "ORD-1",
      items: [{ product: "prod-1", quantity: 2 }],
      stockReservation: { status: "RELEASED" },
    };

    await releaseReservedStockForOrder(order);

    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});

describe("offer section mutations invalidate their public cache (audit gap)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOfferSectionCreate.mockResolvedValue({ _id: "sec-1", title: "Deals" });
    mockOfferSectionFindById.mockResolvedValue({
      _id: "sec-1",
      title: "Deals",
      save: jest.fn().mockResolvedValue(true),
    });
    mockOfferSectionFindByIdAndDelete.mockResolvedValue({ _id: "sec-1" });
  });

  it("createOfferSection invalidates the public offer-sections cache", async () => {
    const req = { body: { title: "Deals", categoryIds: ["cat-1"] } };
    await createOfferSection(req, makeRes());

    expect(mockInvalidate).toHaveBeenCalledWith("cache:offersections:public:*");
  });

  it("updateOfferSection invalidates the public offer-sections cache", async () => {
    const req = { params: { id: "sec-1" }, body: { title: "New Deals" } };
    await updateOfferSection(req, makeRes());

    expect(mockInvalidate).toHaveBeenCalledWith("cache:offersections:public:*");
  });

  it("deleteOfferSection invalidates the public offer-sections cache", async () => {
    const req = { params: { id: "sec-1" } };
    await deleteOfferSection(req, makeRes());

    expect(mockInvalidate).toHaveBeenCalledWith("cache:offersections:public:*");
  });

  it("reorderOfferSections invalidates the public offer-sections cache", async () => {
    const req = { body: { items: [{ id: "sec-1", order: 0 }] } };
    await reorderOfferSections(req, makeRes());

    expect(mockInvalidate).toHaveBeenCalledWith("cache:offersections:public:*");
  });
});
