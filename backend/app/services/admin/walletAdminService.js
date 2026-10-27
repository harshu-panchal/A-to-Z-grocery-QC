import Transaction from "../../models/transaction.js";
import Notification from "../../models/notification.js";
import { getAdminFinanceSummary } from "../finance/walletService.js";
import { getLedgerEntries } from "../finance/ledgerService.js";
import { buildKey, invalidate } from "../cacheService.js";

export async function getAdminWalletOverview({ page, limit }) {
  const stats = await getAdminFinanceSummary();
  const ledger = await getLedgerEntries({ page, limit });
  const transactionItems = ledger.items.map((entry) => ({
    id: entry.transactionId || entry.reference || String(entry._id),
    type: entry.type,
    amount:
      entry.direction === "DEBIT"
        ? -Math.abs(entry.amount || 0)
        : Math.abs(entry.amount || 0),
    status: entry.status,
    sender: entry.direction === "DEBIT" ? entry.actorType : "System/Order",
    recipient: entry.direction === "CREDIT" ? entry.actorType : "Platform Wallet",
    date: new Date(entry.createdAt).toLocaleDateString(),
    time: new Date(entry.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    notes: entry.description || entry.type,
    method: entry.paymentMode || "N/A",
  }));

  return {
    stats: {
      totalPlatformEarning: stats.totalPlatformEarning,
      totalAdminEarning: stats.totalAdminEarning,
      availableBalance: stats.availableBalance,
      sellerPendingPayouts: stats.sellerPendingPayouts,
      deliveryPendingPayouts: stats.deliveryPendingPayouts,
      systemFloat: stats.systemFloatCOD,
    },
    transactions: {
      items: transactionItems,
      page: ledger.page,
      limit: ledger.limit,
      total: ledger.total,
      totalPages: ledger.totalPages,
    },
  };
}

export async function getDeliveryTransactionsData({ page, limit, skip }) {
  const query = { userModel: "Delivery" };
  const transactions = await Transaction.find(query)
    .populate("user", "name phone documents")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Transaction.countDocuments(query);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getSellerWithdrawalsData({ page, limit, skip }) {
  const query = { userModel: "Seller", type: "Withdrawal" };

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name shopName phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getSellerTransactionsData({ page, limit, skip }) {
  const query = { userModel: "Seller" };
  const transactions = await Transaction.find(query)
    .populate("user", "name shopName phone bankDetails")
    .populate({
      path: "order",
      select: "orderId pricing",
      populate: {
        path: "items.product",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Transaction.countDocuments(query);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getDeliveryWithdrawalsData({ page, limit, skip }) {
  const query = { userModel: "Delivery", type: "Withdrawal" };

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  return {
    items: transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

// Withdrawal lifecycle. Settled (paid) and Failed are final: a paid
// withdrawal flipped to "Failed" returned the money to the available balance,
// so the same amount could be withdrawn and paid a second time.
const WITHDRAWAL_TRANSITIONS = {
  Processing: ["Pending"],
  Settled: ["Pending", "Processing"],
  Failed: ["Pending", "Processing"],
};

export async function updateWithdrawalStatusById({ id, status, reason }) {
  if (!["Settled", "Failed", "Processing"].includes(status)) {
    throw new Error("Invalid status");
  }
  if (!/^[a-f\d]{24}$/i.test(String(id || ""))) {
    return null;
  }

  // Atomic: only a withdrawal, only from an allowed state. A double click or
  // two admins can't apply it twice.
  const set = { status };
  if (reason) set.notes = String(reason).trim().slice(0, 500);
  const transaction = await Transaction.findOneAndUpdate(
    { _id: id, type: "Withdrawal", status: { $in: WITHDRAWAL_TRANSITIONS[status] } },
    { $set: set },
    { new: true },
  ).populate("user", "name");
  if (transaction) {
    if (transaction.userModel === "Delivery") {
      const riderId = transaction.user?._id || transaction.user;
      await invalidate(buildKey("delivery", "earnings", String(riderId)));
    }
    return transaction;
  }

  const existing = await Transaction.findById(id).select("type status").lean();
  if (!existing) return null;
  const err = new Error(
    existing.type !== "Withdrawal"
      ? "This transaction is not a withdrawal request."
      : `This withdrawal is already ${String(existing.status).toLowerCase()} and can't be changed to ${status.toLowerCase()}.`,
  );
  err.statusCode = 409;
  throw err;
}

// Rider earnings waiting to be settled. Withdrawal requests are excluded:
// "settle" here means "earning confirmed", not "money sent", and withdrawals
// are paid through the withdrawal screen (bulk-settle used to mark every
// pending rider withdrawal as paid).
const SETTLEABLE_DELIVERY_FILTER = {
  userModel: "Delivery",
  status: "Pending",
  type: { $nin: ["Withdrawal"] },
};

export async function settleDeliveryTransactionById(id) {
  if (!/^[a-f\d]{24}$/i.test(String(id || ""))) {
    return null;
  }
  const transaction = await Transaction.findOneAndUpdate(
    { _id: id, ...SETTLEABLE_DELIVERY_FILTER },
    { $set: { status: "Settled" } },
    { new: true },
  ).populate("user", "name");

  if (!transaction) {
    const existing = await Transaction.findById(id).select("type status userModel").lean();
    if (!existing) return null;
    const err = new Error(
      existing.type === "Withdrawal"
        ? "Withdrawal requests are paid from the Withdrawals screen."
        : existing.userModel !== "Delivery"
          ? "This is not a delivery partner transaction."
          : `This transaction is already ${String(existing.status).toLowerCase()}.`,
    );
    err.statusCode = 409;
    throw err;
  }

  if (!transaction.user?._id) return transaction;
  await Notification.create({
    recipient: transaction.user._id,
    recipientModel: "Delivery",
    title: "Payment Settled",
    message: `Your payment of \u20B9${transaction.amount} has been settled.`,
    type: "payment",
    data: { transactionId: transaction._id },
  });

  return transaction;
}

export async function bulkSettleDeliveryTransactions() {
  return Transaction.updateMany(SETTLEABLE_DELIVERY_FILTER, { $set: { status: "Settled" } });
}
