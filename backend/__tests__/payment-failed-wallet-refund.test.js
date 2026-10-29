import { jest } from "@jest/globals";

// Regression test for audit finding C-NEW-3: a wallet redemption taken at
// order placement must be refunded when the online payment itself later
// fails or is cancelled — previously this branch of
// handleOrderSideEffectsFromPaymentStatus only released stock and flipped
// the order to "cancelled"; it never called compensateOrderCancellation,
// so the customer's redeemed wallet amount was silently lost.

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  abortTransaction: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn(),
};
const mockStartSession = jest.fn().mockResolvedValue(mockSession);

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockPaymentFindOne = jest.fn();
const mockWebhookEventCreate = jest.fn().mockResolvedValue({});
const mockWebhookEventUpdateOne = jest.fn().mockResolvedValue({});
const mockCompensateOrderCancellation = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("mongoose", () => ({
  default: { startSession: mockStartSession },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
  },
}));

jest.unstable_mockModule("../app/models/checkoutGroup.js", () => ({
  default: { updateOne: jest.fn().mockResolvedValue({}) },
}));

jest.unstable_mockModule("../app/models/payment.js", () => ({
  default: { findOne: mockPaymentFindOne },
}));

jest.unstable_mockModule("../app/models/paymentWebhookEvent.js", () => ({
  default: {
    create: mockWebhookEventCreate,
    updateOne: mockWebhookEventUpdateOne,
  },
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleOnlineOrderFinance: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  releaseReservedStockForOrder: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: mockCompensateOrderCancellation,
}));

// a gateway that reports the payment as FAILED when it is checked
jest.unstable_mockModule("../app/services/payment/providerRegistry.js", () => {
  const failingGateway = {
    providerName: "RAZORPAY",
    getPaymentStatus: jest.fn().mockResolvedValue({ state: "FAILED", transactionId: "pay_fail" }),
    mapStatusToInternal: () => "FAILED",
  };
  return {
    getActivePaymentProvider: () => failingGateway,
    getPaymentProviderByName: () => failingGateway,
  };
});

const { verifyPaymentStatus } = await import("../app/services/paymentService.js");

describe("payment FAILED wallet refund (audit C-NEW-3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSession.mockResolvedValue(mockSession);
    mockWebhookEventCreate.mockResolvedValue({});
  });

  it("calls compensateOrderCancellation for every order cancelled when the gateway reports FAILED", async () => {
    const orderDoc = {
      _id: "order-mongo-id",
      orderId: "ORD-FAIL-1",
      customer: "user-1",
      seller: "seller-1",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      items: [],
      paymentBreakdown: { grandTotal: 499, walletAmount: 40 },
      save: jest.fn().mockResolvedValue(true),
    };
    mockOrderFindById.mockResolvedValue(orderDoc);

    const paymentDoc = {
      _id: "payment-1",
      publicOrderId: "ORD-FAIL-1",
      order: "order-mongo-id",
      checkoutGroupId: null,
      gatewayOrderId: "gateway-order-fail-1",
      gatewayName: "RAZORPAY",
      status: "PENDING",
      statusHistory: [],
      save: jest.fn().mockResolvedValue(true),
    };
    mockPaymentFindOne.mockResolvedValue(paymentDoc);

    const result = await verifyPaymentStatus({ merchantOrderId: "gateway-order-fail-1" });

    expect(result.status).toBe("FAILED");
    expect(mockCompensateOrderCancellation).toHaveBeenCalledTimes(1);
    expect(mockCompensateOrderCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "order-mongo-id" }),
      "ORD-FAIL-1",
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it("does not compensate an order that was already cancelled before the failure was seen", async () => {
    const orderDoc = {
      _id: "order-already-cancelled",
      orderId: "ORD-FAIL-2",
      status: "cancelled",
      workflowStatus: "CANCELLED",
      paymentBreakdown: { grandTotal: 200, walletAmount: 0 },
      save: jest.fn().mockResolvedValue(true),
    };
    mockOrderFindById.mockResolvedValue(orderDoc);

    const paymentDoc = {
      _id: "payment-2",
      publicOrderId: "ORD-FAIL-2",
      order: "order-already-cancelled",
      checkoutGroupId: null,
      gatewayOrderId: "gateway-order-fail-2",
      gatewayName: "RAZORPAY",
      status: "PENDING",
      statusHistory: [],
      save: jest.fn().mockResolvedValue(true),
    };
    mockPaymentFindOne.mockResolvedValue(paymentDoc);

    await verifyPaymentStatus({ merchantOrderId: "gateway-order-fail-2" });

    // Order was already cancelled (status !== "pending" branch skipped),
    // so it was never added to cancelledOrderIds and must not be
    // compensated a second time.
    expect(mockCompensateOrderCancellation).not.toHaveBeenCalled();
  });
});
