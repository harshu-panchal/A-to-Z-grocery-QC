import { jest } from "@jest/globals";

// Regression test for audit finding H-CONFIRMED-1: the legacy
// Transaction("Cash Collection") row recorded the GROSS order amount while
// the canonical ledger (Wallet.cashInHand / LedgerEntry via
// handleCodOrderFinance) records the NET amount (gross minus rider
// commission). The two views disagreed by the rider-commission amount on
// every COD order — the admin "Rider Cash" dashboard reads the legacy
// Transaction collection, so it showed the wrong figure.

const mockTransactionFindOneAndUpdate = jest.fn().mockResolvedValue({});
const mockHandleCodOrderFinance = jest.fn().mockResolvedValue({});
const mockSettleDeliveredOrder = jest.fn();

jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { findOneAndUpdate: mockTransactionFindOneAndUpdate },
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleCodOrderFinance: mockHandleCodOrderFinance,
  settleDeliveredOrder: mockSettleDeliveredOrder,
}));

const { applyDeliveredSettlement } = await import("../app/services/orderSettlement.js");

describe("COD cash-collection ledger amount (audit H-CONFIRMED-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionFindOneAndUpdate.mockResolvedValue({});
    mockHandleCodOrderFinance.mockResolvedValue({});
  });

  it("records the NET amount (gross minus rider commission), matching the canonical ledger", async () => {
    mockSettleDeliveredOrder.mockResolvedValue({
      _id: "order-mongo-id",
      orderId: "ORD-COD-1",
      paymentMode: "COD",
      deliveryBoy: "rider-1",
      payment: { method: "cash" },
      financeFlags: {},
      paymentBreakdown: {
        grandTotal: 500,
        riderPayoutTotal: 50,
        riderTipAmount: 0,
        riderPayoutBase: 40,
        riderPayoutDistance: 10,
        riderPayoutBonus: 0,
      },
    });

    await applyDeliveredSettlement({ _id: "order-mongo-id" }, "ORD-COD-1");

    const cashCollectionCall = mockTransactionFindOneAndUpdate.mock.calls.find(
      ([query]) => query?.reference === "CASH-COL-ORD-COD-1",
    );
    expect(cashCollectionCall).toBeDefined();
    const [, update] = cashCollectionCall;
    expect(update.$setOnInsert.amount).toBe(450); // 500 - 50, not 500
  });

  it("never records a negative amount when rider commission exceeds the order total", async () => {
    mockSettleDeliveredOrder.mockResolvedValue({
      _id: "order-mongo-id-2",
      orderId: "ORD-COD-2",
      paymentMode: "COD",
      deliveryBoy: "rider-2",
      payment: { method: "cash" },
      financeFlags: {},
      paymentBreakdown: {
        grandTotal: 30,
        riderPayoutTotal: 50,
      },
    });

    await applyDeliveredSettlement({ _id: "order-mongo-id-2" }, "ORD-COD-2");

    const cashCollectionCall = mockTransactionFindOneAndUpdate.mock.calls.find(
      ([query]) => query?.reference === "CASH-COL-ORD-COD-2",
    );
    const [, update] = cashCollectionCall;
    expect(update.$setOnInsert.amount).toBe(0);
  });
});
