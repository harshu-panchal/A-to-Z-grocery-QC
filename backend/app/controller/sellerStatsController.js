import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { getWithdrawableBalance } from "../services/finance/withdrawableBalance.js";
import { OWNER_TYPE } from "../constants/finance.js";
import { roundCurrency } from "../utils/money.js";
import { getSellerStats as getSellerStatsFromService } from "../services/seller/sellerStatsService.js";
import { buildKey, getOrSet, getTTL } from "../services/cacheService.js";

/* ===============================
   GET SELLER DASHBOARD STATS
   Delegates to SellerStatsService (P6.2 — cache-fronted) so the heavy
   $facet aggregation + category pipeline are absorbed for ~60s.
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const result = await getSellerStatsFromService(req.user.id, {
            range: req.query?.range,
        });
        return handleResponse(res, 200, "Stats fetched successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        // Perf audit BE-D4: this endpoint used to run fully uncached on
        // every request — unlike its sibling getSellerStats (which already
        // delegates to a 60s-cached service). Wrapped in the same
        // short-TTL, no-explicit-invalidation cache pattern already used
        // for seller/delivery stats throughout this codebase (see
        // cacheService.js's "P6.2 hot read paths" TTLs) — same staleness
        // tolerance as the dashboard stats view right next to it.
        const cacheKey = buildKey("seller", "earnings", sellerId);
        const result = await getOrSet(cacheKey, () => fetchSellerEarnings(sellerId), getTTL("sellerStats"));
        return handleResponse(res, 200, "Earnings fetched successfully", result);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

async function fetchSellerEarnings(sellerId) {
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        // Perf audit BE-D4: `.lean()` added — every field read below
        // (`.status`, `.amount`, `.type`, `.createdAt`, `.order`, `.reference`)
        // is a plain property access, never a Mongoose-only method, so lean
        // documents work identically here while skipping hydration cost for
        // what can be a seller's entire transaction history.
        const transactions = await Transaction.find({ user: sellerId, userModel: 'Seller' })
            .sort({ createdAt: -1 })
            .populate("order", "orderId")
            .lean();

        // Balances come from the wallet (see finance/withdrawableBalance.js):
        // availableBalance = what can be withdrawn now; onHoldBalance = not yet
        // settled (return window / admin settlement). settledBalance is kept as
        // available + requested-but-unpaid, which is how the screens use it.
        const wb = await getWithdrawableBalance(OWNER_TYPE.SELLER, sellerId);
        const pendingPayouts = wb.pendingWithdrawals;
        const liveAvailableBalance = wb.withdrawable;
        const settledBalance = roundCurrency(wb.withdrawable + wb.pendingWithdrawals);
        const onHoldBalance = wb.onHold;

        // Keep "Total Revenue" aligned with Dashboard definition:
        // sum of non-cancelled seller orders from Order collection.
        const [orderRevenueAgg] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                },
            },
            {
                $group: {
                    _id: null,
                    // the seller's share, not the delivery fee / tip the customer paid
                    totalRevenue: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", { $ifNull: ["$pricing.subtotal", 0] }] } },
                },
            },
        ]);
        const totalRevenue = Number(orderRevenueAgg?.totalRevenue || 0);

        const totalWithdrawn = transactions
            .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: 'Order Payment',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        return {
            balances: {
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance, // New field
                availableBalance: liveAvailableBalance, // New field for clarity
                totalRevenue: totalRevenue,
                totalWithdrawn: totalWithdrawn
            },
            monthlyChart: chartData,
            ledger: transactions.map(t => ({
                id: (t.reference || t._id).toString(),
                type: t.type,
                amount: t.amount,
                status: t.status,
                date: t.createdAt.toISOString().split('T')[0],
                time: t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                customer: t.type === 'Withdrawal' ? 'Bank Transfer' : 'Customer',
                ref: t.order ? `#${t.order.orderId}` : t.reference || t._id
            }))
        };
}
