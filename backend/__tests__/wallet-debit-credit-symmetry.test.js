import { jest } from "@jest/globals";

// Regression test for audit finding C-NEW-2: a wallet redemption taken at
// checkout (debitWallet) followed by a cancellation refund (creditWallet)
// for the same amount must leave Wallet.availableBalance and
// User.walletBalance exactly where they started — no inflation, no drift.

const walletStore = {
  availableBalance: 100,
  pendingBalance: 0,
  cashInHand: 0,
  totalCredited: 0,
  totalDebited: 0,
  status: "ACTIVE",
  save: () => Promise.resolve(walletStore),
};
const mockWalletFindOne = jest.fn(() => Promise.resolve(walletStore));
const mockWalletCreate = jest.fn();
const mockUserUpdateOne = jest.fn((_filter, update) => {
  const inc = update?.$inc?.walletBalance || 0;
  userStore.walletBalance = Math.round((userStore.walletBalance + inc) * 100) / 100;
  return Promise.resolve({ acknowledged: true });
});
const mockCreateLedgerEntry = jest.fn(() => Promise.resolve({ _id: "ledger-1" }));

const userStore = { walletBalance: 100 };

jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: {
    findOne: mockWalletFindOne,
    create: mockWalletCreate,
  },
}));

jest.unstable_mockModule("../app/models/payout.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { updateOne: mockUserUpdateOne },
}));
jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: mockCreateLedgerEntry,
}));

const { debitWallet, creditWallet } = await import(
  "../app/services/finance/walletService.js"
);

describe("wallet debit/credit symmetry (audit C-NEW-2)", () => {
  beforeEach(() => {
    walletStore.availableBalance = 100;
    userStore.walletBalance = 100;
    jest.clearAllMocks();
    mockWalletFindOne.mockImplementation(() => Promise.resolve(walletStore));
    mockUserUpdateOne.mockImplementation((_filter, update) => {
      const inc = update?.$inc?.walletBalance || 0;
      userStore.walletBalance = Math.round((userStore.walletBalance + inc) * 100) / 100;
      return Promise.resolve({ acknowledged: true });
    });
  });

  it("returns both balances to their starting value after a debit followed by an equal credit", async () => {
    await debitWallet({
      ownerType: "CUSTOMER",
      ownerId: "cust-1",
      amount: 40,
      ledgerType: "WALLET_PAYMENT",
      ledgerReference: "WLT-CHOUT-test",
      idempotencyKey: "WLT-CHOUT-test",
    });

    expect(walletStore.availableBalance).toBe(60);
    expect(userStore.walletBalance).toBe(60);

    // Order gets cancelled — the refund credits the same amount back.
    await creditWallet({
      ownerType: "CUSTOMER",
      ownerId: "cust-1",
      amount: 40,
      ledgerType: "CANCELLATION_REVERSAL",
      ledgerReference: "WLT-CANCEL-test",
      idempotencyKey: "WLT-CANCEL-test",
    });

    expect(walletStore.availableBalance).toBe(100);
    expect(userStore.walletBalance).toBe(100);
  });

  it("never lets Wallet.availableBalance exceed User.walletBalance across repeated redeem+cancel cycles", async () => {
    for (let i = 0; i < 5; i += 1) {
      await debitWallet({
        ownerType: "CUSTOMER",
        ownerId: "cust-1",
        amount: 25,
        ledgerType: "WALLET_PAYMENT",
        ledgerReference: `WLT-CHOUT-${i}`,
        idempotencyKey: `WLT-CHOUT-${i}`,
      });
      await creditWallet({
        ownerType: "CUSTOMER",
        ownerId: "cust-1",
        amount: 25,
        ledgerType: "CANCELLATION_REVERSAL",
        ledgerReference: `WLT-CANCEL-${i}`,
        idempotencyKey: `WLT-CANCEL-${i}`,
      });
      // The bug this test guards against: an asymmetric debit/credit pair
      // would inflate availableBalance by 25 on every iteration while
      // userStore.walletBalance stayed flat, so this assertion would fail
      // by iteration 2 if the regression came back.
      expect(walletStore.availableBalance).toBe(userStore.walletBalance);
    }
    expect(walletStore.availableBalance).toBe(100);
  });
});
