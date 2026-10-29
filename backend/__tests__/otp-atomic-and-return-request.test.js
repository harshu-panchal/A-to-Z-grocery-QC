import { jest } from "@jest/globals";
import crypto from "crypto";

// ---------------------------------------------------------------- fakes
// A tiny in-memory OrderOtp collection whose findOneAndUpdate applies the
// filter and the update in one step, like MongoDB does. That lets the tests
// fire requests in parallel and check the attempt limit / single use hold.
const hash = (c) => crypto.createHash("sha256").update(String(c)).digest("hex");
let otpDocs = [];
const matches = (doc, filter) =>
  Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("$lt" in v) return doc[k] < v.$lt;
      if ("$gt" in v) return doc[k] > v.$gt;
    }
    if (k === "_id") return doc._id === v;
    return doc[k] === v;
  });

jest.unstable_mockModule("../app/models/orderOtp.js", () => ({
  default: {
    hashCode: hash,
    findOne: (filter) => ({
      sort: async () => {
        const found = otpDocs.filter((d) => matches(d, filter));
        return found.length ? { ...found[found.length - 1] } : null; // a snapshot, like a read
      },
    }),
    findOneAndUpdate: async (filter, update) => {
      await new Promise((r) => setImmediate(r)); // let parallel requests interleave
      const doc = otpDocs.find((d) => matches(d, filter));
      if (!doc) return null;
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$inc) for (const [k, n] of Object.entries(update.$inc)) doc[k] += n;
      return { ...doc };
    },
    updateMany: jest.fn(),
    create: jest.fn(),
  },
}));

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne, findOneAndUpdate: mockOrderFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/services/proximityService.js", () => ({ checkProximity: jest.fn() }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitToCustomer: jest.fn(),
  emitOrderStatusUpdate: jest.fn(),
  emitReturnBroadcastForCustomer: jest.fn(),
  emitToSeller: jest.fn(),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: jest.fn() }));

const { verifyOtpAtomic } = await import("../app/services/deliveryOtpService.js");
const { OrderReturnService, computeReturnRefund } = await import("../app/services/order/orderReturnService.js");

const freshOtp = (code, extra = {}) => {
  otpDocs = [{
    _id: "otp-1", orderId: "ORD-1", type: "return_pickup", codeHash: hash(code), code,
    attempts: 0, maxAttempts: 3, consumedAt: null,
    expiresAt: new Date(Date.now() + 600000), lastGeneratedAt: new Date(), ...extra,
  }];
};

// ---------------------------------------------------------------- OTP
describe("verifyOtpAtomic", () => {
  test("accepts the right code once; a second use is refused", async () => {
    freshOtp("4821");
    expect((await verifyOtpAtomic("ORD-1", "return_pickup", "4821")).valid).toBe(true);
    const again = await verifyOtpAtomic("ORD-1", "return_pickup", "4821");
    expect(again).toMatchObject({ valid: false, error: "OTP_CONSUMED" });
  });

  test("two parallel submissions of the right code: exactly one succeeds", async () => {
    freshOtp("4821");
    const results = await Promise.all([1, 2, 3].map(() => verifyOtpAtomic("ORD-1", "return_pickup", "4821")));
    expect(results.filter((r) => r.valid)).toHaveLength(1);
  });

  test("a burst of parallel wrong guesses cannot get past 3 attempts", async () => {
    freshOtp("4821");
    const guesses = Array.from({ length: 50 }, (_, i) => String(i).padStart(4, "0"));
    const results = await Promise.all(guesses.map((g) => verifyOtpAtomic("ORD-1", "return_pickup", g)));
    expect(otpDocs[0].attempts).toBe(3);
    expect(results.filter((r) => r.error === "OTP_MISMATCH")).toHaveLength(3);
    // locked now, even for the right code
    expect((await verifyOtpAtomic("ORD-1", "return_pickup", "4821")).error).toBe("MAX_ATTEMPTS_EXCEEDED");
  });

  test("wrong code reports attempts left", async () => {
    freshOtp("4821");
    expect(await verifyOtpAtomic("ORD-1", "return_pickup", "0000")).toMatchObject({ error: "OTP_MISMATCH", attemptsRemaining: 2 });
  });

  test.each([["12"], ["12345"], ["12a4"], [""], [null], [{ $ne: "x" }]])("rejects badly formed code %p", async (code) => {
    freshOtp("4821");
    expect(await verifyOtpAtomic("ORD-1", "return_pickup", code)).toMatchObject({ valid: false, error: "OTP_INVALID_FORMAT" });
    expect(otpDocs[0].attempts).toBe(0);
  });

  test("trims spaces around a pasted code", async () => {
    freshOtp("4821");
    expect((await verifyOtpAtomic("ORD-1", "return_pickup", " 4821 ")).valid).toBe(true);
  });

  test("expired and missing codes", async () => {
    freshOtp("4821", { expiresAt: new Date(Date.now() - 1000) });
    expect((await verifyOtpAtomic("ORD-1", "return_pickup", "4821")).error).toBe("OTP_EXPIRED");
    otpDocs = [];
    expect((await verifyOtpAtomic("ORD-1", "return_pickup", "4821")).error).toBe("OTP_NOT_FOUND");
  });
});

// ---------------------------------------------------------------- returns
const deliveredOrder = (extra = {}) => ({
  _id: "mongo-1",
  orderId: "ORD-1",
  status: "delivered",
  returnStatus: "none",
  customer: "cust-1",
  seller: "seller-1",
  items: [
    { product: "p1", name: "Atta", quantity: 2, price: 100 },
    { product: "p2", name: "Oil", quantity: 1, price: 200 },
  ],
  pricing: { subtotal: 400, discount: 0, total: 400 },
  ...extra,
});
const request = (payload) =>
  OrderReturnService.createReturnRequest("cust-1", "ORD-1", { reason: "Damaged", images: ["https://cdn.example.com/a.jpg"], conditionAssurance: true, ...payload });

describe("createReturnRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderFindOne.mockResolvedValue(deliveredOrder());
    mockOrderFindOneAndUpdate.mockImplementation(async (_f, update) => ({ ...deliveredOrder(), ...update.$set }));
  });

  test("a photo and the condition confirmation are required (the app asks for both)", async () => {
    await expect(request({ items: [{ itemIndex: 1 }], images: [] })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("photo") });
    await expect(request({ items: [{ itemIndex: 1 }], conditionAssurance: false })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("condition") });
  });


  test("the same item twice is refused (it doubled the refund)", async () => {
    await expect(request({ items: [{ itemIndex: 0, quantity: 2 }, { itemIndex: 0, quantity: 2 }] }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("more than once") });
  });

  test.each([[0], [-1], [3], [1.5], ["abc"]])("quantity %p is refused", async (quantity) => {
    await expect(request({ items: [{ itemIndex: 0, quantity }] })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("missing quantity means the whole line", async () => {
    await request({ items: [{ itemIndex: 0 }] });
    const set = mockOrderFindOneAndUpdate.mock.calls[0][1].$set;
    expect(set.returnItems[0].quantity).toBe(2);
  });

  test("a second request (or a quick double submit) is refused", async () => {
    mockOrderFindOneAndUpdate.mockResolvedValue(null); // the atomic guard found a return already
    await expect(request({ items: [{ itemIndex: 1 }] })).rejects.toMatchObject({ message: expect.stringContaining("already exists") });
  });

  test("only uploaded image URLs are kept; base64 photos are refused", async () => {
    await expect(request({ items: [{ itemIndex: 1 }], images: ["data:image/png;base64,AAAA"] }))
      .rejects.toMatchObject({ statusCode: 400 });
    await request({ items: [{ itemIndex: 1 }], images: ["https://cdn.example.com/a.jpg", "/uploads/b.webp", "javascript:alert(1)"] });
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set.returnImages).toEqual(["https://cdn.example.com/a.jpg", "/uploads/b.webp"]);
  });

  test("a non-text reason detail no longer crashes", async () => {
    await request({ items: [{ itemIndex: 1 }], reasonDetail: 42 });
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set.returnReasonDetail).toBe("42");
  });

  test("orders that are not delivered can't be returned", async () => {
    mockOrderFindOne.mockResolvedValue(deliveredOrder({ status: "out_for_delivery" }));
    await expect(request({ items: [{ itemIndex: 0 }] })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("computeReturnRefund", () => {
  test("no coupon: price x quantity", () => {
    expect(computeReturnRefund(deliveredOrder(), [{ price: 100, quantity: 2 }])).toBe(200);
  });

  test("coupon is shared across items, so the refund never exceeds what was paid", () => {
    const order = deliveredOrder({ pricing: { subtotal: 400, discount: 100, total: 300 } });
    expect(computeReturnRefund(order, [{ price: 100, quantity: 2 }])).toBe(150); // half the order -> half the coupon
    expect(computeReturnRefund(order, order.items)).toBe(300); // everything -> exactly what was paid
  });
});

describe("getReturnDetails pickup OTP", () => {
  const orderDoc = {
    orderId: "ORD-1",
    returnStatus: "return_pickup_assigned",
    customer: { _id: { toString: () => "cust-1" } },
    seller: { _id: { toString: () => "seller-1" } },
    returnDeliveryBoy: { _id: { toString: () => "rider-1" } },
    returnDeliveryCommission: 30,
  };
  beforeEach(() => {
    freshOtp("4821");
    const chain = { populate: () => chain, then: (r, j) => Promise.resolve(orderDoc).then(r, j) };
    mockOrderFindOne.mockReturnValue(chain);
  });

  test("the customer sees their pickup OTP", async () => {
    const res = await OrderReturnService.getReturnDetails("ORD-1", "cust-1", "customer");
    expect(res.returnPickupOtp).toBe("4821");
  });

  test("the assigned rider does not (they must get it from the customer)", async () => {
    const res = await OrderReturnService.getReturnDetails("ORD-1", "rider-1", "delivery");
    expect(res.returnPickupOtp).toBeNull();
  });
});
