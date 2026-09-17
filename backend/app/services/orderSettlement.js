import Transaction from "../models/transaction.js";
import {
  handleCodOrderFinance,
  settleDeliveredOrder,
} from "./finance/orderFinanceService.js";
import { roundCurrency } from "../utils/money.js";

/**
 * Financial side effects when order becomes delivered (mirrors orderController).
 */
export async function applyDeliveredSettlement(order, orderIdString) {
  const settled = await settleDeliveredOrder(order._id);

  const method = (order.payment?.method || "").toLowerCase();
  const isCod = settled.paymentMode === "COD" || method === "cash" || method === "cod";
  if (isCod && settled.deliveryBoy && !settled.financeFlags?.codMarkedCollected) {
    await handleCodOrderFinance(settled._id, {
      deliveryPartnerId: settled.deliveryBoy,
    });
  }

  // Legacy transaction compatibility for existing seller/rider dashboards.
  await Transaction.findOneAndUpdate(
    { reference: orderIdString, userModel: "Seller" },
    { status: "Settled" },
  );

  if (settled.deliveryBoy) {
    const deliveryEarning = Math.round(settled.paymentBreakdown?.riderPayoutTotal || 0);
    const deliveryMeta = {
      tipAmount: Math.round(settled.paymentBreakdown?.riderTipAmount || 0),
      payoutBase: Math.round(settled.paymentBreakdown?.riderPayoutBase || 0),
      payoutDistance: Math.round(settled.paymentBreakdown?.riderPayoutDistance || 0),
      payoutBonus: Math.round(settled.paymentBreakdown?.riderPayoutBonus || 0),
    };
    await Transaction.findOneAndUpdate(
      { reference: `DEL-ERN-${orderIdString}` },
      {
        $set: {
          amount: deliveryEarning,
          status: "Settled",
          meta: deliveryMeta,
        },
        $setOnInsert: {
          user: settled.deliveryBoy,
          userModel: "Delivery",
          order: settled._id,
          type: "Delivery Earning",
          reference: `DEL-ERN-${orderIdString}`,
        },
      },
      { upsert: true, new: true },
    );

    if (isCod) {
      // Audit fix H-CONFIRMED-1: this legacy Transaction row previously
      // recorded the GROSS order amount, while the canonical ledger
      // (handleCodOrderFinance -> Wallet.cashInHand / LedgerEntry) records
      // the NET amount (gross minus rider commission) that the rider
      // actually owes the platform. The two views permanently disagreed by
      // the rider-commission amount on every COD order, which is what the
      // admin "Rider Cash" dashboard reads from. Compute the same net
      // figure here so both views agree.
      const grossAmount = roundCurrency(
        settled.paymentBreakdown?.grandTotal || settled.pricing?.total || 0,
      );
      const riderCommission = roundCurrency(
        settled.paymentBreakdown?.riderPayoutTotal || 0,
      );
      const netAmount = Math.max(roundCurrency(grossAmount - riderCommission), 0);

      await Transaction.findOneAndUpdate(
        { reference: `CASH-COL-${orderIdString}` },
        {
          $setOnInsert: {
            user: settled.deliveryBoy,
            userModel: "Delivery",
            order: settled._id,
            type: "Cash Collection",
            amount: netAmount,
            status: "Settled",
            reference: `CASH-COL-${orderIdString}`,
          },
        },
        { upsert: true, new: true },
      );
    }
  }
}
