import { jest } from "@jest/globals";

const mockProductFind = jest.fn();
const mockCategoryFind = jest.fn();
const mockGetOrCreateFinanceSettings = jest.fn();

function createQueryChain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: mockProductFind,
  },
}));

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    find: mockCategoryFind,
  },
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: mockGetOrCreateFinanceSettings,
}));

const { buildCheckoutPricingSnapshot } = await import(
  "../app/services/checkoutPricingService.js"
);

describe("checkout pricing tip allocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockProductFind.mockReturnValue(
      createQueryChain([
        {
          _id: "p1",
          name: "Test Product",
          sellingPrice: 100,
          mrp: 120,
          mainImage: "",
          headerId: "h1",
          sellerId: "seller-1",
          status: "active",
          variants: [],
        },
      ]),
    );

    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "h1",
          name: "Header 1",
          adminCommissionType: "percentage",
          adminCommissionValue: 0,
          adminCommissionFixedRule: "per_qty",
          handlingFeeType: "fixed",
          handlingFeeValue: 5,
          handlingFees: 5,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 20,
      riderBasePayout: 20,
      baseDistanceCapacityKm: 1,
      incrementalKmSurcharge: 10,
      deliveryPartnerRatePerKm: 5,
      fixedDeliveryFee: 20,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
    });
  });

  it("allocates customer tip exactly once without doubling", async () => {
    const tipAmount = 30;

    const snapshot = await buildCheckoutPricingSnapshot({
      orderItems: [{ product: "p1", quantity: 1 }],
      address: {},
      tipAmount,
      session: null,
    });

    // Subtotal: 100, Delivery: 20, Handling: 5, Tip: 30 => GrandTotal: 155
    expect(snapshot.aggregateBreakdown.productSubtotal).toBe(100);
    expect(snapshot.aggregateBreakdown.deliveryFeeCharged).toBe(20);
    expect(snapshot.aggregateBreakdown.handlingFeeCharged).toBe(5);
    expect(snapshot.aggregateBreakdown.tipTotal).toBe(30);
    expect(snapshot.aggregateBreakdown.riderTipAmount).toBe(30);
    expect(snapshot.aggregateBreakdown.grandTotal).toBe(155);
    expect(snapshot.aggregateBreakdown.payableAmount).toBe(155);

    // Verify per-seller breakdown
    const seller = snapshot.sellerBreakdownEntries[0];
    expect(seller.breakdown.tipTotal).toBe(30);
    expect(seller.breakdown.riderTipAmount).toBe(30);
    expect(seller.breakdown.grandTotal).toBe(155);
    expect(seller.breakdown.payableAmount).toBe(155);
  });

  it("handles zero tip correctly", async () => {
    const snapshot = await buildCheckoutPricingSnapshot({
      orderItems: [{ product: "p1", quantity: 1 }],
      address: {},
      tipAmount: 0,
      session: null,
    });

    expect(snapshot.aggregateBreakdown.tipTotal).toBe(0);
    expect(snapshot.aggregateBreakdown.riderTipAmount).toBe(0);
    expect(snapshot.aggregateBreakdown.grandTotal).toBe(125);
    expect(snapshot.aggregateBreakdown.payableAmount).toBe(125);
  });
});
