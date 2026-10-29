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
