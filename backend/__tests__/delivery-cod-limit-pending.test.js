import { jest } from "@jest/globals";

// Orders the riders already accepted (not delivered yet)
const activeOrders = [
  { deliveryBoy: "r1", paymentMode: "COD", paymentBreakdown: { grandTotal: 940, riderPayoutTotal: 40 } },
  { deliveryBoy: "r1", paymentMode: "COD", paymentBreakdown: { grandTotal: 530, riderPayoutTotal: 30 } },
  { deliveryBoy: "r1", paymentMode: "ONLINE", paymentBreakdown: { grandTotal: 2000, riderPayoutTotal: 40 } },
  { deliveryBoy: "r2", payment: { method: "cash" }, pricing: { total: 300 } },
];
const find = jest.fn(() => ({ select: () => ({ lean: async () => activeOrders }) }));

jest.unstable_mockModule("mongoose", () => ({ default: { connection: { readyState: 1 } } }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: { find } }));

const {
  codOverLimitMessage,
  fitsCodLimit,
  pendingCodCashByRider,
  riderCommittedCodCash,
} = await import("../app/services/delivery/codLimit.js");

describe("COD limit counts accepted but undelivered COD orders", () => {
  test("sums only COD cash per rider and skips delivered / cancelled orders", async () => {
    const map = await pendingCodCashByRider(["r1", "r2"]);
    expect(map.get("r1")).toBe(1400); // 900 + 500, online order ignored
    expect(map.get("r2")).toBe(300);
    const query = find.mock.calls[0][0];
    expect(query.status.$nin).toEqual(["delivered", "cancelled"]);
    expect(query.workflowStatus.$nin).toEqual(["DELIVERED", "CANCELLED"]);
  });

  test("a rider at ₹4000 holding two ₹900 orders can no longer take a third", async () => {
    // cash in hand 3000 + 1400 still to collect = 4400; next ₹900 order -> 5300 > 5000
    const committed = await riderCommittedCodCash("r1", 3000);
    expect(committed).toBe(4400);
    expect(fitsCodLimit(committed, 5000, 900)).toBe(false);
    expect(fitsCodLimit(committed, 5000, 600)).toBe(true);
  });

  test("no riders -> no query", async () => {
    find.mockClear();
    expect((await pendingCodCashByRider([])).size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});

describe("checkout blocks COD orders no rider could accept", () => {
  test("rejects when any seller order's cash is above the limit", () => {
    expect(codOverLimitMessage([{ grandTotal: 6000, riderPayoutTotal: 50 }], 5000)).toMatch(/pay online/i);
    expect(
      codOverLimitMessage([{ grandTotal: 1000, riderPayoutTotal: 40 }, { grandTotal: 5100, riderPayoutTotal: 40 }], 5000),
    ).toMatch(/pay online/i);
  });

  test("allows orders within the limit, including exactly at it", () => {
    expect(codOverLimitMessage([{ grandTotal: 5040, riderPayoutTotal: 40 }], 5000)).toBeNull();
    expect(codOverLimitMessage([{ grandTotal: 300, riderPayoutTotal: 30 }], 5000)).toBeNull();
    expect(codOverLimitMessage([], 5000)).toBeNull();
  });
});
