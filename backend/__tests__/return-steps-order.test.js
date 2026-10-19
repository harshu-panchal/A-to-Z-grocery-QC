import { jest } from "@jest/globals";

// Return legs must happen in order: arrive at customer -> photos -> customer
// OTP -> arrive at seller -> seller OTP. "Arrived" used to live only in the
// rider's browser, so the server let an OTP be generated at any time.

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockGenerateReturnDropOtp = jest.fn();

jest.unstable_mockModule("../app/services/deliveryOtpService.js", () => ({
  generateReturnPickupOtp: jest.fn(),
  validateReturnPickupOtp: jest.fn(),
  generateReturnDropOtp: mockGenerateReturnDropOtp,
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
  default: { findOne: mockOrderFindOne, findOneAndUpdate: mockOrderFindOneAndUpdate, updateOne: jest.fn() },
}));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: { findById: jest.fn() } }));
jest.unstable_mockModule("../app/services/smsIndiaHubService.js", () => ({ sendSmsIndiaHubOtp: jest.fn() }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({ emitToSeller: jest.fn() }));
jest.unstable_mockModule("../app/services/mapsRouteService.js", () => ({ getCachedRoute: jest.fn() }));
jest.unstable_mockModule("../app/services/mapsGeocodeService.js", () => ({ geocodeAddress: jest.fn() }));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: (orderId) => ({ orderId }),
}));
jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({ creditWallet: jest.fn() }));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: jest.fn() }));
jest.unstable_mockModule("../app/modules/notifications/notification.constants.js", () => ({ NOTIFICATION_EVENTS: {} }));

const { markReturnArrived, requestReturnDropOtp } = await import("../app/controller/orderWorkflowController.js");

const RIDER = { id: "rider-1", role: "delivery" };
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const body = (res) => res.json.mock.calls[0][0];

function orderIs(fields) {
  const doc = {
    _id: "m1",
    orderId: "ORD-1",
    returnDeliveryBoy: RIDER.id,
    address: { location: { lat: 25.45, lng: 78.57 } },
    seller: { _id: "s1", phone: "9000000000", location: { coordinates: [78.6, 25.46] } },
    ...fields,
  };
  const chain = { populate: () => chain, lean: async () => doc, select: () => chain };
  mockOrderFindOne.mockReturnValue(chain);
  mockOrderFindOneAndUpdate.mockImplementation((_f, update) => ({
    lean: async () => ({ returnStatus: doc.returnStatus, ...update.$set }),
  }));
  return doc;
}

const arrive = async (leg, extra = {}) => {
  const res = makeRes();
  await markReturnArrived({ params: { orderId: "ORD-1", leg }, user: RIDER, body: extra }, res);
  return res;
};

describe("rider return steps happen in order", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENFORCE_RIDER_PROXIMITY;
  });

  test("arrive at customer while pickup is assigned: saved on the order", async () => {
    orderIs({ returnStatus: "return_pickup_assigned" });
    const res = await arrive("customer");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).result.returnArrivedAtCustomerAt).toBeInstanceOf(Date);
  });

  test("cannot 'arrive at seller' before the customer pickup OTP", async () => {
    orderIs({ returnStatus: "return_pickup_assigned" });
    const res = await arrive("seller");
    expect(res.status).toHaveBeenCalledWith(409);
    expect(body(res).result.error.code).toBe("STEP_OUT_OF_ORDER");
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test("arrive at seller once the item is picked up", async () => {
    orderIs({ returnStatus: "return_in_transit" });
    const res = await arrive("seller");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).result.returnArrivedAtSellerAt).toBeInstanceOf(Date);
  });

  test("sliding again is harmless (refresh / double tap)", async () => {
    const at = new Date("2026-10-19T10:00:00Z");
    orderIs({ returnStatus: "return_pickup_assigned", returnArrivedAtCustomerAt: at });
    const res = await arrive("customer");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).result.returnArrivedAtCustomerAt).toEqual(at);
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test("another rider can't mark arrival", async () => {
    orderIs({ returnStatus: "return_pickup_assigned", returnDeliveryBoy: "rider-2" });
    expect((await arrive("customer")).status).toHaveBeenCalledWith(403);
  });

  test("unknown step name", async () => {
    orderIs({ returnStatus: "return_pickup_assigned" });
    expect((await arrive("warehouse")).status).toHaveBeenCalledWith(404);
  });

  test("with ENFORCE_RIDER_PROXIMITY=true, far away is refused and near is accepted", async () => {
    process.env.ENFORCE_RIDER_PROXIMITY = "true";
    orderIs({ returnStatus: "return_pickup_assigned" });
    const far = await arrive("customer", { lat: 25.5, lng: 78.57 }); // ~5.5 km north
    expect(far.status).toHaveBeenCalledWith(403);
    expect(body(far).result.error.code).toBe("PROXIMITY_OUT_OF_RANGE");
    const noGps = await arrive("customer", {});
    expect(body(noGps).result.error.code).toBe("LOCATION_REQUIRED");
    const near = await arrive("customer", { lat: 25.4505, lng: 78.5702 });
    expect(near.status).toHaveBeenCalledWith(200);
  });

  test("seller OTP is refused until the rider arrived at the seller", async () => {
    orderIs({ returnStatus: "return_in_transit" });
    const res = makeRes();
    await requestReturnDropOtp({ params: { orderId: "ORD-1" }, user: RIDER }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(body(res).result.error.code).toBe("ARRIVAL_REQUIRED");
    expect(mockGenerateReturnDropOtp).not.toHaveBeenCalled();
  });

  test("seller OTP is sent after arriving at the seller", async () => {
    orderIs({ returnStatus: "return_in_transit", returnArrivedAtSellerAt: new Date() });
    mockGenerateReturnDropOtp.mockResolvedValue({ success: true, otp: "1234", expiresAt: new Date() });
    const res = makeRes();
    await requestReturnDropOtp({ params: { orderId: "ORD-1" }, user: RIDER }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGenerateReturnDropOtp).toHaveBeenCalled();
  });
});
