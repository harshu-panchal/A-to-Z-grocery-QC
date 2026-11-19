import { jest } from "@jest/globals";

// Seller payouts must stay on hold until the return window closes, even when
// the admin clicks "Process all" or the payout batch job runs.

const session = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};
const mockPayoutFindById = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockGetOrCreateWallet = jest.fn();

jest.unstable_mockModule("mongoose", () => ({
  default: { startSession: jest.fn().mockResolvedValue(session) },
}));
jest.unstable_mockModule("../app/models/payout.js", () => ({
  default: { findById: mockPayoutFindById },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne, findById: mockOrderFindById },
}));
jest.unstable_mockModule("../app/models/financeAuditLog.js", () => ({
  default: { create: jest.fn().mockResolvedValue([]) },
}));
jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({
  getOrCreateWallet: mockGetOrCreateWallet,
}));
jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: jest.fn(),
}));

const { processPayout } = await import("../app/services/finance/payoutService.js");

function chain(value) {
  const q = {
    select: jest.fn(() => q),
    session: jest.fn(() => q),
    lean: jest.fn().mockResolvedValue(value),
  };
  return q;
}

function makePayout(payoutType) {
  return {
    _id: "payout-1",
    payoutType,
    beneficiaryId: "owner-1",
    amount: 100,
    status: "PENDING",
    relatedOrderIds: ["order-1"],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe("processPayout seller return-window hold", () => {
  let wallet;
  beforeEach(() => {
    jest.clearAllMocks();
    wallet = { pendingBalance: 100, availableBalance: 0, save: jest.fn() };
    mockGetOrCreateWallet.mockResolvedValue(wallet);
    mockOrderFindById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
  });

  test("refuses a seller payout while the return window is open", async () => {
    const payout = makePayout("SELLER");
    mockPayoutFindById.mockReturnValue({ session: jest.fn().mockResolvedValue(payout) });
    mockOrderFindOne.mockReturnValue(
      chain({ orderId: "ORD1", returnWindowExpiresAt: new Date(Date.now() + 3600_000) }),
    );

    await expect(processPayout("payout-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(wallet.save).not.toHaveBeenCalled();
    expect(payout.status).toBe("PENDING");
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  test("pays the seller once the window is over", async () => {
    const payout = makePayout("SELLER");
    mockPayoutFindById.mockReturnValue({ session: jest.fn().mockResolvedValue(payout) });
    mockOrderFindOne.mockReturnValue(chain(null));

    await processPayout("payout-1");
    expect(payout.status).toBe("COMPLETED");
    expect(wallet.availableBalance).toBe(100);
  });

  test("rider payouts are never held", async () => {
    const payout = makePayout("DELIVERY_PARTNER");
    mockPayoutFindById.mockReturnValue({ session: jest.fn().mockResolvedValue(payout) });

    await processPayout("payout-1");
    expect(mockOrderFindOne).not.toHaveBeenCalled();
    expect(payout.status).toBe("COMPLETED");
  });
});
