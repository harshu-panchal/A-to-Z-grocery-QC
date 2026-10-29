import mongoose from "mongoose";
import Wallet from "../../models/wallet.js";
import Transaction from "../../models/transaction.js";
import { OWNER_TYPE } from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";

const USER_MODEL = {
  [OWNER_TYPE.SELLER]: "Seller",
  [OWNER_TYPE.DELIVERY_PARTNER]: "Delivery",
};

/**
 * What a seller or rider can take out right now.
 *
 * The wallet is the source of truth for money that is really theirs:
 * `availableBalance` only grows when the admin settles a payout (after the
 * return window) or a return commission is paid, and shrinks when a return
 * refund is recovered. It never includes the customer's COD cash or money
 * still on hold. Withdrawal requests do not touch the wallet, so every
 * request that is not failed (pending, processing or paid) is taken off here.
 *
 * Returns { withdrawable, available, onHold, pendingWithdrawals, paidWithdrawals }.
 */
export async function getWithdrawableBalance(ownerType, ownerId, { session } = {}) {
  const userModel = USER_MODEL[ownerType];
  if (!userModel) throw new Error(`No withdrawals for ${ownerType}`);
  const id = new mongoose.Types.ObjectId(String(ownerId));

  const [wallet, [agg]] = await Promise.all([
    Wallet.findOne({ ownerType, ownerId: id }).session(session || null).lean(),
    Transaction.aggregate([
      { $match: { user: id, userModel, type: "Withdrawal", status: { $ne: "Failed" } } },
      {
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $in: ["$status", ["Pending", "Processing"]] }, { $abs: "$amount" }, 0] } },
          paid: { $sum: { $cond: [{ $eq: ["$status", "Settled"] }, { $abs: "$amount" }, 0] } },
        },
      },
    ]).session(session || null),
  ]);

  const available = roundCurrency(wallet?.availableBalance || 0);
  const pendingWithdrawals = roundCurrency(agg?.pending || 0);
  const paidWithdrawals = roundCurrency(agg?.paid || 0);
  return {
    withdrawable: roundCurrency(Math.max(0, available - pendingWithdrawals - paidWithdrawals)),
    available,
    onHold: roundCurrency(wallet?.pendingBalance || 0),
    pendingWithdrawals,
    paidWithdrawals,
  };
}
