/**
 * DeliveryEarningsService
 *
 * Owns the read-side aggregations for the delivery partner's dashboard:
 *   - getDeliveryStats         ← getDeliveryStats handler
 *   - getDeliveryEarnings      ← getDeliveryEarnings handler
 *   - getDeliveryCodCashSummary ← getDeliveryCodCashSummary handler
 *
 * Framework-agnostic. Inputs are primitives; output shapes match the
 * existing HTTP response payloads byte-for-byte so frontend consumers see
 * no change.
 *
 * Throws errors with `err.statusCode` for the auth-failure cases the COD
 * summary handler used to handle inline.
 */

import mongoose from "mongoose";
import Order from "../../models/order.js";
import Transaction from "../../models/transaction.js";
import Wallet from "../../models/wallet.js";
import { roundCurrency } from "../../utils/money.js";
import { OWNER_TYPE } from "../../constants/finance.js";
import { getWithdrawableBalance } from "../finance/withdrawableBalance.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../cacheService.js";
import { applyDeliveredSettlement } from "../orderSettlement.js";
import logger from "../logger.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function svcErr(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toDeliveryBoyId(rawId) {
  if (rawId == null) {
    throw svcErr("Unauthorized", 401);
  }
  if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
    throw svcErr("Invalid user id", 401);
  }
  return new mongoose.Types.ObjectId(String(rawId));
}

/** Clear the rider's cached cash / stats / earnings after money moves. */
export async function invalidateRiderCashCaches(rawId) {
  const id = String(rawId);
  await Promise.all(
    ["codSummary", "stats", "earnings"].map((entity) =>
      invalidate(buildKey("delivery", entity, id)).catch(() => {}),
    ),
  );
}

const DELIVERED_QUERY = {
  $or: [{ status: "delivered" }, { orderStatus: "delivered" }, { workflowStatus: "DELIVERED" }],
};

/**
 * Delivered COD orders whose cash was never recorded. Delivery runs the
 * settlement after the order is already marked delivered and only logs a
 * failure, which left the order under "To collect" forever and the amount
 * to pay at 0. Re-run that same (idempotent) settlement for them.
 */
export async function recordMissedCodCollections(rawId) {
  const deliveryBoyId = toDeliveryBoyId(rawId);
  const missed = await Order.find({
    deliveryBoy: deliveryBoyId,
    paymentMode: "COD",
    orderStatus: { $ne: "cancelled" },
    "financeFlags.codMarkedCollected": { $ne: true },
    ...DELIVERED_QUERY,
  })
    .select("_id orderId")
    .limit(50)
    .lean();
  let fixed = 0;
  for (const order of missed) {
    try {
      await applyDeliveredSettlement(order, order.orderId);
      fixed += 1;
    } catch (error) {
      logger.error("Could not record COD cash for a delivered order", {
        scope: "recordMissedCodCollections",
        orderId: order.orderId,
        error: error.message,
      });
    }
  }
  if (fixed) await invalidateRiderCashCaches(deliveryBoyId);
  return fixed;
}

/**
 * Dashboard summary: total deliveries, today's earnings, incentives, cash in hand.
 * Cached for ~30s (`deliveryStats` TTL) to absorb dashboard polling.
 */
export async function getDeliveryStats(rawId) {
  const deliveryBoyId = toDeliveryBoyId(rawId);
  const cacheKey = buildKey("delivery", "stats", String(deliveryBoyId));
  return getOrSet(
    cacheKey,
    () => computeDeliveryStats(deliveryBoyId),
    getTTL("deliveryStats"),
  );
}

async function computeDeliveryStats(deliveryBoyId) {
  const orders = await Order.find({
    deliveryBoy: deliveryBoyId,
    status: "delivered",
  })
    .select("_id")
    .lean();
  const totalDeliveries = orders.length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const allTransactions = await Transaction.find({
    user: deliveryBoyId,
    userModel: "Delivery",
    createdAt: { $gte: startOfToday },
  }).lean();

  const todayEarnings = allTransactions
    .filter(
      (t) =>
        t.status === "Settled" &&
        (t.type === "Delivery Earning" ||
          t.type === "Incentive" ||
          t.type === "Bonus"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const incentives = allTransactions
    .filter(
      (t) =>
        t.status === "Settled" &&
        (t.type === "Incentive" || t.type === "Bonus"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const wallet = await Wallet.findOne({
    ownerType: "DELIVERY_PARTNER",
    ownerId: deliveryBoyId,
  })
    .select("cashInHand")
    .lean();
  const cashCollected = roundCurrency(wallet?.cashInHand || 0);

  return {
    today: todayEarnings,
    deliveries: totalDeliveries,
    incentives,
    cashCollected,
  };
}

/**
 * What a rider can withdraw (see finance/withdrawableBalance.js).
 * Uncached: requestWithdrawal checks against it.
 */
export async function getDeliveryWithdrawableBalance(rawId) {
  // From the wallet: earnings the admin has settled, never the COD cash the
  // rider is carrying for the customer (that used to be counted here).
  const b = await getWithdrawableBalance(OWNER_TYPE.DELIVERY_PARTNER, toDeliveryBoyId(rawId));
  return { availableBalance: b.withdrawable, pendingWithdrawals: b.pendingWithdrawals };
}

/**
 * Earnings page payload: totals, 7-day chart, latest 20 transactions.
 * Cached for ~30s (`deliveryEarnings` TTL) to absorb dashboard polling.
 */
export async function getDeliveryEarnings(rawId) {
  const deliveryBoyId = toDeliveryBoyId(rawId);
  const cacheKey = buildKey("delivery", "earnings", String(deliveryBoyId));
  return getOrSet(
    cacheKey,
    () => computeDeliveryEarnings(deliveryBoyId),
    getTTL("deliveryEarnings"),
  );
}

async function computeDeliveryEarnings(deliveryBoyId) {
  const transactions = await Transaction.find({
    user: deliveryBoyId,
    userModel: "Delivery",
  })
    .sort({ createdAt: -1 })
    .limit(200)
    // Narrow projection on populated order keeps the response small and
    // avoids accidental N+1 over un-needed fields.
    .populate("order", "orderId pricing paymentBreakdown");

  const wallet = await Wallet.findOne({
    ownerType: "DELIVERY_PARTNER",
    ownerId: deliveryBoyId,
  })
    .select("cashInHand")
    .lean();

  const totalEarnings = transactions
    .filter(
      (t) =>
        t.status === "Settled" &&
        (t.type === "Delivery Earning" ||
          t.type === "Incentive" ||
          t.type === "Bonus"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const tipsReceived = transactions
    .filter((t) => t.type === "Delivery Earning" && t.status === "Settled")
    .reduce(
      (acc, t) =>
        acc +
        Number(
          t?.meta?.tipAmount ??
            t?.order?.paymentBreakdown?.riderTipAmount ??
            t?.order?.pricing?.tip ??
            0,
        ),
      0,
    );

  const onlinePay = transactions
    .filter((t) => t.type === "Delivery Earning" && t.status === "Settled")
    .reduce((acc, t) => acc + t.amount, 0);

  const incentives = transactions
    .filter(
      (t) =>
        (t.type === "Incentive" || t.type === "Bonus") && t.status === "Settled",
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const cashCollected = roundCurrency(wallet?.cashInHand || 0);
  const { availableBalance, pendingWithdrawals } =
    await getDeliveryWithdrawableBalance(deliveryBoyId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyAggregation = await Transaction.aggregate([
    {
      $match: {
        user: deliveryBoyId,
        userModel: "Delivery",
        status: "Settled",
        createdAt: { $gte: sevenDaysAgo },
        type: { $in: ["Delivery Earning", "Incentive", "Bonus"] },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const foundAt = dailyAggregation.find((a) => a._id === dateStr);
    chartData.push({
      name: DAY_NAMES[d.getDay()],
      earnings: foundAt ? foundAt.amount : 0,
      incentives: 0,
    });
  }

  return {
    totalEarnings,
    onlinePay,
    incentives,
    tipsReceived,
    cashCollected,
    availableBalance,
    pendingWithdrawals,
    chartData,
    transactions: transactions.slice(0, 20),
  };
}

/**
 * COD cash summary: system float, cash in hand, per-order toRemit/toCollect.
 * Cached for ~30s (`deliveryCodSummary` TTL).
 */
export async function getDeliveryCodCashSummary(rawId) {
  const deliveryBoyId = toDeliveryBoyId(rawId);
  const cacheKey = buildKey("delivery", "codSummary", String(deliveryBoyId));
  return getOrSet(
    cacheKey,
    () => computeDeliveryCodCashSummary(deliveryBoyId),
    getTTL("deliveryCodSummary"),
  );
}

const ACTIVE_COD_WORKFLOW = ["DELIVERY_ASSIGNED", "PICKUP_READY", "OUT_FOR_DELIVERY"];
const ACTIVE_COD_LEGACY = ["confirmed", "packed", "out_for_delivery"];

async function computeDeliveryCodCashSummary(deliveryBoyId) {
  await recordMissedCodCollections(deliveryBoyId);
  const wallet = await Wallet.findOne({
    ownerType: "DELIVERY_PARTNER",
    ownerId: deliveryBoyId,
  })
    .select("cashInHand")
    .lean();

  const orders = await Order.find({
    deliveryBoy: deliveryBoyId,
    paymentMode: "COD",
    status: { $ne: "cancelled" },
    orderStatus: { $ne: "cancelled" },
    workflowStatus: { $ne: "CANCELLED" },
  })
    .select(
      "orderId status orderStatus workflowStatus deliveredAt createdAt financeFlags paymentBreakdown pricing",
    )
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const normalized = orders.map((order) => {
    const codMarkedCollected = Boolean(
      order.financeFlags?.codMarkedCollected,
    );
    const delivered =
      order.status === "delivered" ||
      order.orderStatus === "delivered" ||
      order.workflowStatus === "DELIVERED";
    const gross = roundCurrency(
      order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0,
    );
    const riderCommission = roundCurrency(
      order.paymentBreakdown?.riderPayoutTotal ?? 0,
    );

    const estimatedNet = roundCurrency(Math.max(gross - riderCommission, 0));
    const pendingNet = roundCurrency(
      order.paymentBreakdown?.codPendingAmount ?? 0,
    );
    // Only cash actually collected is owed. Orders not delivered yet used to
    // add their expected amount here too, so a rider with assigned (or stuck)
    // orders saw a "cash to submit" far above what they really hold.
    const contribution = codMarkedCollected ? pendingNet : 0;
    // still to be collected: assigned to this rider and on the way
    const onTheWay =
      !delivered &&
      (ACTIVE_COD_WORKFLOW.includes(order.workflowStatus) ||
        (!order.workflowStatus && ACTIVE_COD_LEGACY.includes(order.status)));

    return {
      orderId: order.orderId,
      status: order.status,
      orderStatus: order.orderStatus,
      deliveredAt: order.deliveredAt || null,
      createdAt: order.createdAt || null,
      codMarkedCollected,
      delivered,
      onTheWay,
      amountGross: gross,
      riderCommission,
      amountNetExpected: estimatedNet,
      amountNetPending: pendingNet,
      systemFloatContribution: contribution,
    };
  });

  const systemFloatCOD = roundCurrency(
    normalized.reduce(
      (sum, row) => sum + Number(row.systemFloatContribution || 0),
      0,
    ),
  );

  const toRemit = normalized
    .filter(
      (row) => row.codMarkedCollected && Number(row.amountNetPending || 0) > 0,
    )
    .slice(0, 50);

  // only orders still on the way: a delivered order's cash is already taken,
  // and an order stuck in another state is not something to collect
  const toCollect = normalized
    .filter(
      (row) =>
        !row.codMarkedCollected && row.onTheWay && Number(row.amountNetExpected || 0) > 0,
    )
    .slice(0, 50);

  return {
    systemFloatCOD,
    cashInHand: roundCurrency(wallet?.cashInHand || 0),
    toRemit,
    toCollect,
  };
}

export default {
  getDeliveryStats,
  getDeliveryEarnings,
  getDeliveryWithdrawableBalance,
  getDeliveryCodCashSummary,
};
