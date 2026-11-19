import {
  codOrderCashAmount,
  fitsCodLimit,
  isCodOrder,
  riderCodLimit,
} from "../app/services/delivery/codLimit.js";

describe("delivery COD cash limit", () => {
  test("a rider's own limit wins over the default", () => {
    expect(riderCodLimit({ limit: 8000 }, 5000)).toBe(8000);
    expect(riderCodLimit({ limit: null }, 5000)).toBe(5000);
    expect(riderCodLimit({}, 3000)).toBe(3000);
  });

  test("order cash is the total minus the rider's commission", () => {
    expect(codOrderCashAmount({ paymentBreakdown: { grandTotal: 1200, riderPayoutTotal: 40 } })).toBe(1160);
    expect(codOrderCashAmount({ pricing: { total: 300 } })).toBe(300);
    expect(codOrderCashAmount({ paymentBreakdown: { grandTotal: 20, riderPayoutTotal: 40 } })).toBe(0);
  });

  test("the limit must still hold after collecting the order", () => {
    // ₹4,900 in hand + ₹2,000 order would be ₹6,900: over a ₹5,000 limit
    expect(fitsCodLimit(4900, 5000, 2000)).toBe(false);
    expect(fitsCodLimit(4900, 5000, 100)).toBe(true);
    expect(fitsCodLimit(0, 5000, 5000)).toBe(true);
  });

  test("detects COD orders", () => {
    expect(isCodOrder({ paymentMode: "COD" })).toBe(true);
    expect(isCodOrder({ payment: { method: "cash" } })).toBe(true);
    expect(isCodOrder({ paymentMode: "ONLINE" })).toBe(false);
  });
});

describe("rider base pay distance is separate from the customer's", () => {
  test("rider pay uses riderBaseDistanceKm, customer fee keeps baseDistanceCapacityKm", async () => {
    const { calculateRiderPayout, calculateCustomerDeliveryFee } = await import(
      "../app/services/finance/pricingService.js"
    );
    const { normalizeFinanceSettings } = await import(
      "../app/services/finance/financeSettingsService.js"
    );
    const settings = normalizeFinanceSettings({
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 30,
      baseDistanceCapacityKm: 2,
      incrementalKmSurcharge: 10,
      riderBasePayout: 25,
      riderBaseDistanceKm: 1,
      deliveryPartnerRatePerKm: 5,
    });
    // 3 km: customer pays base + 1 extra km, rider gets base + 2 extra km
    expect(calculateCustomerDeliveryFee(3, settings).deliveryFeeCharged).toBe(40);
    expect(calculateRiderPayout(3, settings).riderPayoutTotal).toBe(35);
  });

  test("old settings without riderBaseDistanceKm keep the shared distance", async () => {
    const { normalizeFinanceSettings } = await import(
      "../app/services/finance/financeSettingsService.js"
    );
    expect(normalizeFinanceSettings({ baseDistanceCapacityKm: 2 }).riderBaseDistanceKm).toBe(2);
    expect(normalizeFinanceSettings({ baseDistanceCapacityKm: 2, riderBaseDistanceKm: 0 }).riderBaseDistanceKm).toBe(0);
  });
});
