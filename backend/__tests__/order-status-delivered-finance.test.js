import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockCompensate = jest.fn();

const mockApplyDeliveredSettlement = jest.fn();
const mockOrderMatchQueryFromRouteParam = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
  },
}));
jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: mockCompensate,
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/product.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/stockHistory.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/notification.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: mockOrderMatchQueryFromRouteParam,
  orderMatchQueryFlexible: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/utils/pagination.js", () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule("../app/constants/orderWorkflow.js", () => ({
  WORKFLOW_STATUS: {},
  DEFAULT_SELLER_TIMEOUT_MS: () => 0,
  workflowFromLegacyStatus: jest.fn(),
  legacyStatusFromWorkflow: (w) => ({ SELLER_PENDING: "pending", SELLER_ACCEPTED: "confirmed", DELIVERY_ASSIGNED: "confirmed", PICKUP_READY: "packed", OUT_FOR_DELIVERY: "out_for_delivery", DELIVERED: "delivered", CANCELLED: "cancelled" })[w] || "pending",
  PENDING_ORDER_QUERY: { status: "pending" },
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
  sellerAcceptAtomic: jest.fn(),
  sellerRejectAtomic: jest.fn(),
  deliveryAcceptAtomic: jest.fn(),
  customerCancelV2: jest.fn(),
  resolveWorkflowStatus: jest.fn(),
  startReturnPickupBroadcast: jest.fn(),
  removeReturnPickupTimeoutJob: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn((order) => order),
  reverseOrderFinanceOnCancellation: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(),
}));

const { updateOrderStatus, updateReturnQcStatus } = await import("../app/controller/orderController.js");

describe("updateOrderStatus delivered finance ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderMatchQueryFromRouteParam.mockImplementation((id) => ({ orderId: id }));
    mockHandleResponse.mockImplementation((_res, status, message, data) => ({
      status,
      message,
      data,
    }));
  });

  it("persists delivered + deliveryBoy before settlement", async () => {
    const callOrder = [];
    const orderDoc = {
      _id: "mongo-1",
      orderId: "ORD1",
      status: "out_for_delivery",
      orderStatus: "out_for_delivery",
      workflowVersion: 1,
      deliveryBoy: "rider-old",
      seller: "seller-1",
      save: jest.fn().mockImplementation(async () => {
        callOrder.push("save");
      }),
    };

    mockOrderFindOne.mockResolvedValue(orderDoc);
    mockOrderFindById.mockResolvedValue({ ...orderDoc, paymentMode: "COD" });

    mockApplyDeliveredSettlement.mockImplementation(async () => {
      callOrder.push("settlement");
    });

    const req = {
      params: { orderId: "ORD1" },
      body: { status: "delivered", deliveryBoyId: "rider-1" },
      user: { id: "admin-1", role: "admin" },
    };
    const res = {};

    const result = await updateOrderStatus(req, res);

    expect(result.status).toBe(200);
    expect(orderDoc.deliveryBoy).toBe("rider-1");
    expect(orderDoc.status).toBe("delivered");
    expect(orderDoc.orderStatus).toBe("delivered");
    expect(orderDoc.save).toHaveBeenCalledTimes(1);

    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(orderDoc, "ORD1");
    expect(callOrder).toEqual(["save", "settlement"]);
  });

  it.each([["delivered"], ["out_for_delivery"]])(
    "a seller cannot set %s (the rider does, with pickup confirm / customer OTP)",
    async (status) => {
      const orderDoc = {
        _id: "mongo-2", orderId: "ORD2", status: "packed", workflowVersion: 2,
        workflowStatus: "OUT_FOR_DELIVERY", deliveryBoy: "rider-1", seller: "seller-1",
        save: jest.fn(),
      };
      mockOrderFindOne.mockResolvedValue(orderDoc);

      const result = await updateOrderStatus(
        { params: { orderId: "ORD2" }, body: { status }, user: { id: "seller-1", role: "seller" } },
        {},
      );

      expect(result.status).toBe(403);
      expect(orderDoc.save).not.toHaveBeenCalled();
      expect(orderDoc.workflowStatus).toBe("OUT_FOR_DELIVERY");
      expect(mockApplyDeliveredSettlement).not.toHaveBeenCalled();
    },
  );

  const sellerSets = async (orderFields, status) => {
    const orderDoc = {
      _id: "mongo-3", orderId: "ORD3", workflowVersion: 1, seller: "seller-1",
      items: [], save: jest.fn(), ...orderFields,
    };
    mockOrderFindOne.mockResolvedValue(orderDoc);
    const result = await updateOrderStatus(
      { params: { orderId: "ORD3" }, body: { status, reason: "out of stock" }, user: { id: "seller-1", role: "seller" } },
      {},
    );
    return { result, orderDoc };
  };

  it.each([
    ["delivered", "cancelled"],
    ["out_for_delivery", "cancelled"],
    ["confirmed", "pending"],
    ["packed", "confirmed"],
    ["pending", "packed"],
  ])("a seller cannot move an order from %s to %s", async (from, to) => {
    const { result, orderDoc } = await sellerSets({ status: from }, to);
    expect(result.status).toBe(409);
    expect(orderDoc.save).not.toHaveBeenCalled();
    expect(orderDoc.status).toBe(from);
  });

  it("a seller can pack a confirmed order", async () => {
    const { result, orderDoc } = await sellerSets({ status: "confirmed" }, "packed");
    expect(result.status).toBe(200);
    expect(orderDoc.status).toBe("packed");
    expect(orderDoc.save).toHaveBeenCalled();
  });

  it("v2: a seller cannot reset an accepted order to pending (it used to reset the workflow)", async () => {
    const { result, orderDoc } = await sellerSets(
      { workflowVersion: 2, workflowStatus: "DELIVERY_ASSIGNED", status: "confirmed" },
      "pending",
    );
    expect(result.status).toBe(409);
    expect(orderDoc.workflowStatus).toBe("DELIVERY_ASSIGNED");
  });

  it("an unknown status is a 400, not a crash", async () => {
    const { result } = await sellerSets({ status: "pending" }, "shipped-by-pigeon");
    expect(result.status).toBe(400);
  });

  const adminSets = async (orderFields, status) => {
    const orderDoc = { _id: "mongo-4", orderId: "ORD4", workflowVersion: 1, seller: "seller-1", items: [], save: jest.fn(), ...orderFields };
    mockOrderFindOne.mockResolvedValue(orderDoc);
    const result = await updateOrderStatus(
      { params: { orderId: "ORD4" }, body: { status }, user: { id: "admin-1", role: "admin" } },
      {},
    );
    return { result, orderDoc };
  };

  it.each([
    ["delivered", "cancelled"],
    ["cancelled", "delivered"],
    ["cancelled", "confirmed"],
    ["confirmed", "pending"],
  ])("admin cannot move an order from %s to %s", async (from, to) => {
    const { result, orderDoc } = await adminSets({ status: from }, to);
    expect(result.status).toBe(409);
    expect(orderDoc.save).not.toHaveBeenCalled();
    expect(mockApplyDeliveredSettlement).not.toHaveBeenCalled();
  });

  it("admin cancel runs the shared compensation (stock per pack size + wallet refund)", async () => {
    const { result, orderDoc } = await adminSets({ status: "packed" }, "cancelled");
    expect(result.status).toBe(200);
    expect(orderDoc.status).toBe("cancelled");
    expect(orderDoc.save).toHaveBeenCalled();
    expect(mockCompensate).toHaveBeenCalledWith(orderDoc, "ORD4", expect.objectContaining({ actorId: "admin-1" }));
  });

  it("return QC runs once: a second click is refused instead of refunding again", async () => {
    mockOrderFindOne.mockResolvedValue({ _id: "mongo-5", orderId: "ORD5", returnStatus: "returned" });
    mockOrderFindOneAndUpdate.mockResolvedValue(null); // the first click already moved it on
    const result = await updateReturnQcStatus(
      { params: { orderId: "ORD5" }, body: { qcStatus: "qc_passed" }, user: { id: "admin-1", role: "admin" } },
      {},
    );
    expect(result.status).toBe(409);
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "mongo-5", returnStatus: "returned" },
      expect.anything(),
      expect.anything(),
    );
  });
});
