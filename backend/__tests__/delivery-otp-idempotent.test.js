import { jest } from "@jest/globals";

// A retried "verify delivery OTP" (double tap, Enter + button, or a request
// that timed out after the server had already delivered) used to fail with
// "Invalid state for delivery completion" while the customer already saw the
// order as delivered. It must answer success again, without side effects.

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockVerifyOtpAtomic = jest.fn();
const mockSettlement = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne, findOneAndUpdate: mockOrderFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/services/deliveryOtpService.js", () => ({
  verifyOtpAtomic: mockVerifyOtpAtomic,
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: async (id) => id,
  orderMatchQueryFromRouteParam: (id) => ({ orderId: id }),
}));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockSettlement,
}));
// Real Firebase would open connections and keep Jest running.
jest.unstable_mockModule("../app/services/firebaseService.js", () => ({
  clearOrderTracking: jest.fn(async () => {}),
  clearRiderPresence: jest.fn(async () => {}),
}));
jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: { findById: () => ({ select: async () => null }) },
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { verifyHandoffOtpAndDeliver } = await import("../app/services/orderWorkflowService.js");

const orderDoc = (fields) => ({
  orderId: "ORD-1",
  deliveryBoy: "rider-1",
  workflowVersion: 2,
  deliveredAt: new Date("2026-10-19T10:00:00Z"),
  paymentBreakdown: { codShortfallAmount: 0 },
  ...fields,
});
const findReturns = (...docs) => {
  docs.forEach((doc) => mockOrderFindOne.mockReturnValueOnce({ populate: async () => doc }));
};

describe("verifyHandoffOtpAndDeliver is safe to retry", () => {
  beforeEach(() => jest.clearAllMocks());

  test("already delivered by this rider: success again, OTP and settlement untouched", async () => {
    findReturns(orderDoc({ workflowStatus: "DELIVERED", status: "delivered" }));
    const result = await verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "1234");
    expect(result).toMatchObject({ orderId: "ORD-1", alreadyDelivered: true });
    expect(mockVerifyOtpAtomic).not.toHaveBeenCalled();
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSettlement).not.toHaveBeenCalled();
  });

  test("parallel request already consumed the OTP and delivered: success, not 'OTP used'", async () => {
    findReturns(
      orderDoc({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }),
      orderDoc({ workflowStatus: "DELIVERED", status: "delivered" }),
    );
    mockVerifyOtpAtomic.mockResolvedValue({ valid: false, error: "OTP_CONSUMED", message: "used" });
    const result = await verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "1234");
    expect(result.alreadyDelivered).toBe(true);
    expect(mockSettlement).not.toHaveBeenCalled();
  });

  test("OTP consumed but the order is NOT delivered: still an error", async () => {
    findReturns(
      orderDoc({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }),
      orderDoc({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }),
    );
    mockVerifyOtpAtomic.mockResolvedValue({ valid: false, error: "OTP_CONSUMED", message: "used" });
    await expect(verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "1234")).rejects.toMatchObject({ code: "OTP_CONSUMED" });
  });

  test("an order that is not out for delivery yet still refuses", async () => {
    findReturns(orderDoc({ workflowStatus: "PICKUP_READY", status: "confirmed" }));
    await expect(verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "1234")).rejects.toMatchObject({ code: "ORDER_NOT_READY" });
    expect(mockVerifyOtpAtomic).not.toHaveBeenCalled();
  });

  test("a wrong OTP on an undelivered order is still rejected", async () => {
    findReturns(orderDoc({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }));
    mockVerifyOtpAtomic.mockResolvedValue({ valid: false, error: "OTP_MISMATCH", message: "wrong", attemptsRemaining: 2 });
    await expect(verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "9999")).rejects.toMatchObject({ code: "OTP_MISMATCH", attemptsRemaining: 2 });
  });

  test("customer account missing at delivery: still a success, settlement still runs", async () => {
    findReturns(orderDoc({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", paymentMode: "COD" }));
    mockVerifyOtpAtomic.mockResolvedValue({ valid: true });
    const delivered = {
      ...orderDoc({ workflowStatus: "DELIVERED", status: "delivered" }),
      customer: "cust-gone",
      async populate() {
        this.customer = null; // populate finds no User document
        return this;
      },
    };
    mockOrderFindOneAndUpdate.mockResolvedValue(delivered);
    mockSettlement.mockResolvedValue(undefined);

    const result = await verifyHandoffOtpAndDeliver("rider-1", "ORD-1", "1234");

    expect(result.orderId).toBe("ORD-1");
    expect(result.alreadyDelivered).toBeUndefined();
    expect(delivered.customer).toBe("cust-gone"); // stored id kept
    expect(mockSettlement).toHaveBeenCalledWith(delivered, "ORD-1");
  });
});
