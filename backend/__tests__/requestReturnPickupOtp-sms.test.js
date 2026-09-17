import { jest } from "@jest/globals";

// Regression test for audit finding: requestReturnPickupOtp referenced an
// undefined `order` variable, throwing a ReferenceError that was swallowed
// by the inner try/catch — so the SMS dispatch never ran despite the
// endpoint responding 200 "OTP sent to customer".

const mockGenerateReturnPickupOtp = jest.fn();
const mockOrderFindOne = jest.fn();
const mockCustomerFindById = jest.fn();
const mockSendSmsIndiaHubOtp = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../app/services/deliveryOtpService.js", () => ({
  generateReturnPickupOtp: mockGenerateReturnPickupOtp,
  validateReturnPickupOtp: jest.fn(),
  generateReturnDropOtp: jest.fn(),
  validateReturnDropOtp: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  confirmPickupAtomic: jest.fn(),
  markArrivedAtStoreAtomic: jest.fn(),
  advanceDeliveryRiderUiAtomic: jest.fn(),
  requestHandoffOtpAtomic: jest.fn(),
  verifyHandoffOtpAndDeliver: jest.fn(),
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findById: mockCustomerFindById },
}));

jest.unstable_mockModule("../app/services/smsIndiaHubService.js", () => ({
  sendSmsIndiaHubOtp: mockSendSmsIndiaHubOtp,
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitToSeller: jest.fn(),
}));

jest.unstable_mockModule("../app/services/mapsRouteService.js", () => ({
  getCachedRoute: jest.fn(),
}));

jest.unstable_mockModule("../app/services/mapsGeocodeService.js", () => ({
  geocodeAddress: jest.fn(),
}));

jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({
  creditWallet: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.constants.js", () => ({
  NOTIFICATION_EVENTS: {},
}));

const { requestReturnPickupOtp } = await import(
  "../app/controller/orderWorkflowController.js"
);

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Give background setImmediate SMS dispatch a tick to run.
function flushSetImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("requestReturnPickupOtp SMS dispatch (audit ReferenceError fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends the SMS to the customer's phone instead of silently failing", async () => {
    mockGenerateReturnPickupOtp.mockResolvedValue({
      success: true,
      otp: "1234",
      expiresAt: new Date(Date.now() + 600000),
    });
    mockOrderFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ customer: "cust-1", address: { phone: "9999999999" } }),
      }),
    });
    mockCustomerFindById.mockReturnValue({
      lean: () => Promise.resolve({ phone: "8888888888" }),
    });

    const req = { params: { orderId: "ORD-1" } };
    const res = makeRes();

    await requestReturnPickupOtp(req, res);
    await flushSetImmediate();
    await flushSetImmediate();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSendSmsIndiaHubOtp).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "8888888888", otp: "1234" }),
    );
  });

  it("falls back to the order address phone when the customer record has none", async () => {
    mockGenerateReturnPickupOtp.mockResolvedValue({
      success: true,
      otp: "5678",
      expiresAt: new Date(Date.now() + 600000),
    });
    mockOrderFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ customer: "cust-1", address: { phone: "7777777777" } }),
      }),
    });
    mockCustomerFindById.mockReturnValue({
      lean: () => Promise.resolve({ phone: null }),
    });

    const req = { params: { orderId: "ORD-2" } };
    const res = makeRes();

    await requestReturnPickupOtp(req, res);
    await flushSetImmediate();
    await flushSetImmediate();

    expect(mockSendSmsIndiaHubOtp).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "7777777777", otp: "5678" }),
    );
  });
});
