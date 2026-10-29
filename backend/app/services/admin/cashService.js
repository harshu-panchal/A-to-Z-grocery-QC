import mongoose from "mongoose";
import { getDefaultCodCashLimit, riderCodLimit } from "../delivery/codLimit.js";
import Delivery from "../../models/delivery.js";
import Transaction from "../../models/transaction.js";
import Notification from "../../models/notification.js";
import Order from "../../models/order.js";
import { reconcileCodCash } from "../finance/orderFinanceService.js";
import { updateCashInHand } from "../finance/walletService.js";
import { roundCurrency } from "../../utils/money.js";
import { invalidate, buildKey } from "../cacheService.js";
import { emitToDelivery } from "../orderSocketEmitter.js";
import { withLock } from "../../utils/distributedLock.js";

export async function getDeliveryCashBalancesData({ page, limit, skip }) {
  const ridersPipeline = [
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "user",
        as: "allTransactions",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "deliveryBoy",
        as: "allOrders",
      },
    },
    {
      $project: {
        name: 1,
        phone: 1,
        avatar: 1,
        limit: 1,
        documents: 1,
        currentCash: {
          $reduce: {
            input: {
              $filter: {
                input: "$allTransactions",
                as: "transaction",
                cond: {
                  $in: [
                    "$$transaction.type",
                    ["Cash Collection", "Cash Settlement"],
                  ],
                },
              },
            },
            initialValue: 0,
            in: {
              $cond: [
                { $eq: ["$$this.type", "Cash Collection"] },
                { $add: ["$$value", "$$this.amount"] },
                {
                  $subtract: ["$$value", { $abs: "$$this.amount" }],
                },
              ],
            },
          },
        },
        pendingOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: {
                $and: [
                  {
                    $in: [
                      "$$order.status",
                      ["confirmed", "packed", "picked_up", "out_for_delivery"],
                    ],
                  },
                  { $in: ["$$order.payment.method", ["cash", "cod"]] },
                ],
              },
            },
          },
        },
        totalOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: { $eq: ["$$order.status", "delivered"] },
            },
          },
        },
        lastSettlementTxn: {
          $arrayElemAt: [
            {
              $sortArray: {
                input: {
                  $filter: {
                    input: "$allTransactions",
                    as: "transaction",
                    cond: {
                      $eq: ["$$transaction.type", "Cash Settlement"],
                    },
                  },
                },
                sortBy: { createdAt: -1 },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        id: "$_id",
        name: 1,
        phone: 1,
        avatar: {
          $cond: [
            { $ifNull: ["$documents.profileImage", false] },
            "$documents.profileImage",
            {
              $concat: [
                "https://api.dicebear.com/7.x/avataaars/svg?seed=",
                "$name",
              ],
            },
          ],
        },
        currentCash: 1,
        limit: 1,
        status: {
          $cond: [
            { $gt: ["$currentCash", 4500] },
            "critical",
            {
              $cond: [
                { $gt: ["$currentCash", 3000] },
                "warning",
                "safe",
              ],
            },
          ],
        },
        pendingOrders: 1,
        totalOrders: 1,
        lastSettlement: {
          $ifNull: ["$lastSettlementTxn.createdAt", "Never"],
        },
      },
    },
    {
      $facet: {
        meta: [{ $count: "total" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const [aggregateResult] = await Delivery.aggregate(ridersPipeline);
  const meta = aggregateResult?.meta?.[0];
  // each rider's own COD limit, else the default from Fees & Charges
  const defaultLimit = await getDefaultCodCashLimit();
  const riders = (aggregateResult?.items ?? []).map((rider) => ({
    ...rider,
    limit: riderCodLimit(rider, defaultLimit),
  }));
  const total = meta?.total ?? 0;

  const totalInHand = riders.reduce(
    (accumulator, rider) => accumulator + (rider.currentCash || 0),
    0,
  );
  const overLimitCount = riders.filter(
    (rider) => (rider.currentCash || 0) >= rider.limit,
  ).length;

  return {
    items: riders,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalInHand,
      overLimitCount,
      avgBalance: riders.length ? totalInHand / riders.length : 0,
    },
  };
}

export async function settleRiderCashEntry({ riderId, amount, method }) {
  const settleAmount = Number(amount);
  // "abc" used to pass `amount <= 0` (NaN) and record a NaN settlement
  if (!riderId || !Number.isFinite(settleAmount) || settleAmount <= 0) {
    throw new Error("Missing riderId or invalid amount");
  }
  if (Math.round(settleAmount * 100) !== settleAmount * 100) {
    const err = new Error("Amount can have at most 2 decimal places");
    err.statusCode = 400;
    throw err;
  }
  if (!mongoose.isValidObjectId(riderId)) {
    return null;
  }

  const rider = await Delivery.findById(riderId);
  if (!rider) {
    return null;
  }

  // One settlement per rider at a time: a double click used to settle twice.
  return withLock(`cash-settle:${riderId}`, 10_000, async () => {
    const currentCash = await computeRiderCurrentCash(riderId);
    if (settleAmount > currentCash + 0.01) {
      const err = new Error(
        `Cannot settle more than pending cash balance (\u20B9${currentCash})`,
      );
      err.statusCode = 400;
      throw err;
    }

    const riderOid = new mongoose.Types.ObjectId(String(riderId));
    let remainingToSettle = settleAmount;
    const settledOrderIds = [];

    const isDbConnected = mongoose.connection?.readyState === 1;

    // 1. Reconcile rider's collected COD orders FIFO
    if (isDbConnected && typeof Order?.find === "function") {
      try {
        const pendingOrders = await Order.find({
          deliveryBoy: riderOid,
          paymentMode: "COD",
          status: { $ne: "cancelled" },
          orderStatus: { $ne: "cancelled" },
          "financeFlags.codMarkedCollected": true,
          "paymentBreakdown.codPendingAmount": { $gt: 0 },
        }).sort({ createdAt: 1 });

        if (Array.isArray(pendingOrders)) {
          for (const order of pendingOrders) {
            if (remainingToSettle <= 0) break;
            const orderPending = roundCurrency(
              order?.paymentBreakdown?.codPendingAmount || 0,
            );
            if (orderPending <= 0) continue;
            const thisOrderSettle = roundCurrency(
              Math.min(orderPending, remainingToSettle),
            );

            try {
              if (typeof reconcileCodCash === "function") {
                await reconcileCodCash(order._id, thisOrderSettle, riderOid, {
                  actorId: null,
                  metadata: {
                    source: "admin_cash_collection_page",
                    initiatedBy: "admin",
                    method: method || "Cash submission",
                  },
                });
              }
              remainingToSettle = roundCurrency(
                remainingToSettle - thisOrderSettle,
              );
              settledOrderIds.push(order.orderId);
            } catch (e) {
              console.warn(
                `[settleRiderCashEntry] Failed to reconcile order ${order.orderId}:`,
                e.message,
              );
            }
          }
        }
      } catch (err) {
        console.warn("[settleRiderCashEntry] Order lookup error:", err.message);
      }
    }

    // 2. Deduct any remaining settle amount (or full amount if no orders) from rider's Wallet.cashInHand
    if (isDbConnected && remainingToSettle > 0 && typeof updateCashInHand === "function") {
      try {
        await updateCashInHand({
          ownerType: "DELIVERY_PARTNER",
          ownerId: riderOid,
          deltaAmount: -remainingToSettle,
        });
      } catch (err) {
        console.warn("[settleRiderCashEntry] updateCashInHand error:", err.message);
      }
    }

    const settlement = await Transaction.create({
      user: riderId,
      userModel: "Delivery",
      type: "Cash Settlement",
      amount: -Math.abs(settleAmount),
      status: "Settled",
      reference: `CSH-SET-${Date.now()}`,
      notes: `Method: ${method || "Cash"}`,
      meta: {
        source: "admin_cash_collection_page",
        orders: settledOrderIds,
      },
    });

    // Invalidate delivery caches so delivery app reflects updated balance immediately
    try {
      if (typeof invalidate === "function" && typeof buildKey === "function") {
        await invalidate(buildKey("delivery", "codSummary", String(riderId)));
        await invalidate(buildKey("delivery", "stats", String(riderId)));
        await invalidate(buildKey("delivery", "earnings", String(riderId)));
      }
    } catch (e) {
      console.warn("[settleRiderCashEntry] Cache invalidate skipped:", e.message);
    }

    // Emit live socket event to delivery app
    try {
      if (typeof emitToDelivery === "function") {
        emitToDelivery(riderId, {
          event: "delivery:cash:settled",
          payload: {
            settleAmount,
            transactionId: settlement._id,
          },
        });
      }
    } catch {
      /* socket emission optional */
    }

    await Notification.create({
      recipient: riderId,
      recipientModel: "Delivery",
      title: "Cash Settled",
      message: `Admin has collected \u20B9${settleAmount} cash from you. Your balance is updated.`,
      type: "payment",
      data: { transactionId: settlement._id },
    });

    return settlement;
  });
}

async function computeRiderCurrentCash(riderId) {
  const oid =
    riderId instanceof mongoose.Types.ObjectId
      ? riderId
      : new mongoose.Types.ObjectId(String(riderId));
  const rows = await Transaction.aggregate([
    {
      $match: {
        user: oid,
        userModel: "Delivery",
        type: { $in: ["Cash Collection", "Cash Settlement"] },
      },
    },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [
              { $eq: ["$type", "Cash Collection"] },
              "$amount",
              { $multiply: [{ $abs: "$amount" }, -1] },
            ],
          },
        },
      },
    },
  ]);
  const balance = Number(rows?.[0]?.balance || 0);
  return Number.isFinite(balance) ? Math.max(0, Number(balance.toFixed(2))) : 0;
}

export async function getRiderCashDetailsData(riderId) {
  const transactions = await Transaction.find({
    user: riderId,
    userModel: "Delivery",
    type: "Cash Collection",
  })
    .populate("order", "orderId pricing createdAt")
    .sort({ createdAt: -1 })
    .limit(20);

  return transactions.map((transaction) => ({
    id: transaction.order?.orderId || transaction.reference || "N/A",
    amount: transaction.amount,
    time: new Date(transaction.createdAt).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: transaction.createdAt,
  }));
}

export async function getCashSettlementHistoryData({ page, limit, skip }) {
  const query = { userModel: "Delivery", type: "Cash Settlement" };

  const [history, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const items = history.map((entry) => ({
    id: (entry.reference || entry._id).toString(),
    rider: entry.user?.name || "Unknown Rider",
    amount: Math.abs(entry.amount),
    date: entry.createdAt,
    method: entry.notes?.replace("Method: ", "") || "Cash Submission",
    status: "completed",
  }));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
