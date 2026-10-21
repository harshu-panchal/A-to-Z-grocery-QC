import { jest } from "@jest/globals";

// Admin panel: withdrawals, rider settlements, cash collection, settings and
// rider deactivation edge cases.

const mockTxFindOneAndUpdate = jest.fn();
const mockTxFindById = jest.fn();
const mockTxUpdateMany = jest.fn();
const mockTxCreate = jest.fn();
const mockTxAggregate = jest.fn();
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: {
    findOneAndUpdate: mockTxFindOneAndUpdate,
    findById: mockTxFindById,
    updateMany: mockTxUpdateMany,
    create: mockTxCreate,
    aggregate: mockTxAggregate,
  },
}));
jest.unstable_mockModule("../app/models/notification.js", () => ({ default: { create: jest.fn() } }));

const mockDeliveryFindById = jest.fn();
const mockDeliveryUpdate = jest.fn();
jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: { findById: mockDeliveryFindById, findByIdAndUpdate: mockDeliveryUpdate },
}));
const mockOrderCount = jest.fn();
jest.unstable_mockModule("../app/models/order.js", () => ({ default: { countDocuments: mockOrderCount } }));

const mockSettingFindOne = jest.fn();
const mockSettingFindOneAndUpdate = jest.fn();
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: mockSettingFindOne, findOneAndUpdate: mockSettingFindOneAndUpdate },
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({ getRedisClient: () => null, isRedisEnabled: () => false }));
jest.unstable_mockModule("../app/services/emailService.js", () => ({ sendApplicationRejectionEmail: jest.fn(async () => {}) }));

const { updateWithdrawalStatusById, settleDeliveryTransactionById, bulkSettleDeliveryTransactions } =
  await import("../app/services/admin/walletAdminService.js");
const { settleRiderCashEntry } = await import("../app/services/admin/cashService.js");
const { updatePlatformSettings } = await import("../app/controller/admin/settingsController.js");
const { deactivateDeliveryPartner } = await import("../app/controller/admin/deliveryController.js");

const ID = "64b000000000000000000001";
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const populated = (doc) => ({ populate: async () => doc });
const leanDoc = (doc) => ({ select: () => ({ lean: async () => doc }) });

beforeEach(() => jest.clearAllMocks());

describe("withdrawal status", () => {
  test("only a pending/processing withdrawal can be paid or failed", async () => {
    mockTxFindOneAndUpdate.mockReturnValue(populated({ _id: ID, status: "Settled" }));
    await updateWithdrawalStatusById({ id: ID, status: "Settled" });
    expect(mockTxFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: ID, type: "Withdrawal", status: { $in: ["Pending", "Processing"] } },
      expect.anything(),
      expect.anything(),
    );
  });

  test("a paid withdrawal can't be flipped to Failed (money would be withdrawable again)", async () => {
    mockTxFindOneAndUpdate.mockReturnValue(populated(null));
    mockTxFindById.mockReturnValue(leanDoc({ type: "Withdrawal", status: "Settled" }));
    await expect(updateWithdrawalStatusById({ id: ID, status: "Failed" })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("already settled"),
    });
  });

  test("a non-withdrawal transaction is refused", async () => {
    mockTxFindOneAndUpdate.mockReturnValue(populated(null));
    mockTxFindById.mockReturnValue(leanDoc({ type: "Order Payment", status: "Pending" }));
    await expect(updateWithdrawalStatusById({ id: ID, status: "Settled" })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("bad id is 'not found', bad status is refused", async () => {
    expect(await updateWithdrawalStatusById({ id: "nope", status: "Settled" })).toBeNull();
    await expect(updateWithdrawalStatusById({ id: ID, status: "Paid" })).rejects.toThrow("Invalid status");
  });
});

describe("rider settlements", () => {
  test("bulk settle never marks withdrawal requests as paid", async () => {
    mockTxUpdateMany.mockResolvedValue({ modifiedCount: 3 });
    await bulkSettleDeliveryTransactions();
    expect(mockTxUpdateMany.mock.calls[0][0]).toEqual({
      userModel: "Delivery",
      status: "Pending",
      type: { $nin: ["Withdrawal"] },
    });
  });

  test("settling a withdrawal from the settlement screen is refused", async () => {
    mockTxFindOneAndUpdate.mockReturnValue(populated(null));
    mockTxFindById.mockReturnValue(leanDoc({ type: "Withdrawal", status: "Pending", userModel: "Delivery" }));
    await expect(settleDeliveryTransactionById(ID)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("rider cash collection", () => {
  beforeEach(() => {
    mockDeliveryFindById.mockResolvedValue({ _id: ID });
    mockTxAggregate.mockResolvedValue([{ balance: 500 }]);
    mockTxCreate.mockImplementation(async (doc) => ({ _id: "t1", ...doc }));
  });

  test.each([["abc"], [0], [-5], [10.555]])("amount %p is refused", async (amount) => {
    await expect(settleRiderCashEntry({ riderId: ID, amount })).rejects.toThrow();
    expect(mockTxCreate).not.toHaveBeenCalled();
  });

  test("can't settle more than the rider holds", async () => {
    await expect(settleRiderCashEntry({ riderId: ID, amount: 600 })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("double click: only one settlement of the full balance goes through", async () => {
    let balance = 500;
    mockTxAggregate.mockImplementation(async () => {
      await new Promise((r) => setImmediate(r));
      return [{ balance }];
    });
    mockTxCreate.mockImplementation(async (doc) => {
      balance += doc.amount; // settlement rows are negative
      return doc;
    });
    const results = await Promise.allSettled([
      settleRiderCashEntry({ riderId: ID, amount: 500 }),
      settleRiderCashEntry({ riderId: ID, amount: 500 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(mockTxCreate).toHaveBeenCalledTimes(1);
  });
});

describe("platform settings", () => {
  test("validators run and system fields are ignored", async () => {
    mockSettingFindOneAndUpdate.mockResolvedValue({ toObject: () => ({}) });
    const res = makeRes();
    await updatePlatformSettings({ body: { _id: "x", __v: 3, appName: "AtoZ" } }, res);
    const [, update, options] = mockSettingFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({ appName: "AtoZ" });
    expect(options.runValidators).toBe(true);
  });

  test("a schema rule violation is a 400, not a 500", async () => {
    const err = Object.assign(new Error("bad"), { name: "ValidationError", errors: { fee: { message: "fee must be >= 0" } } });
    mockSettingFindOneAndUpdate.mockRejectedValue(err);
    const res = makeRes();
    await updatePlatformSettings({ body: { customerBaseDeliveryFee: -10 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("rider deactivation", () => {
  test("refused while the rider has orders in progress", async () => {
    mockOrderCount.mockResolvedValue(2);
    const res = makeRes();
    await deactivateDeliveryPartner({ params: { id: ID }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
  });

  test("allowed when the rider is free", async () => {
    mockOrderCount.mockResolvedValue(0);
    mockDeliveryUpdate.mockResolvedValue({ _id: ID });
    const res = makeRes();
    await deactivateDeliveryPartner({ params: { id: ID }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
