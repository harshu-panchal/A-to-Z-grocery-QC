/**
 * Counter (POS) sales figures for the admin and seller dashboards.
 *
 * POS bills live in their own collection (PosOrder) and never become online
 * `Order`s, so dashboards read them separately and show them next to online
 * sales. Only completed bills count; cancelled and unpaid online bills don't.
 */
import mongoose from "mongoose";
import { PosOrder } from "../../models/pos.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * owner: a seller id (that shop's counter), null (admin's own counter) or
 * undefined (every counter on the platform).
 */
function baseMatch(owner) {
  const match = { status: "completed" };
  if (owner === null) match.owner = null;
  else if (owner !== undefined) match.owner = new mongoose.Types.ObjectId(String(owner));
  return match;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Totals, today, last-7/prev-7 days and a per-bucket trend.
 * trendFormat/trendSince follow the caller's chart (same $dateToString keys).
 */
export async function getPosSalesSummary(owner, { trendFormat = "%Y-%m-%d", trendSince = new Date(Date.now() - 30 * DAY_MS), periodDays = 7 } = {}) {
  const now = Date.now();
  const periodStart = new Date(now - periodDays * DAY_MS);
  const prevStart = new Date(now - 2 * periodDays * DAY_MS);
  const sum = { $sum: { $ifNull: ["$total", 0] } };

  const [res] = await PosOrder.aggregate([
    { $match: baseMatch(owner) },
    {
      $facet: {
        all: [{ $group: { _id: null, sales: sum, bills: { $sum: 1 } } }],
        today: [{ $match: { createdAt: { $gte: startOfToday() } } }, { $group: { _id: null, sales: sum, bills: { $sum: 1 } } }],
        period: [{ $match: { createdAt: { $gte: periodStart } } }, { $group: { _id: null, sales: sum, bills: { $sum: 1 } } }],
        prevPeriod: [{ $match: { createdAt: { $gte: prevStart, $lt: periodStart } } }, { $group: { _id: null, sales: sum, bills: { $sum: 1 } } }],
        trend: [
          { $match: { createdAt: { $gte: trendSince } } },
          { $group: { _id: { $dateToString: { format: trendFormat, date: "$createdAt" } }, sales: sum, bills: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const pick = (rows) => ({ sales: round2(rows?.[0]?.sales || 0), bills: rows?.[0]?.bills || 0 });
  return {
    total: pick(res?.all),
    today: pick(res?.today),
    period: pick(res?.period),
    prevPeriod: pick(res?.prevPeriod),
    trend: new Map((res?.trend || []).map((r) => [r._id, { sales: round2(r.sales), bills: r.bills }])),
  };
}

/** Best sellers at the counter: product id -> { name, quantity, revenue }. */
export async function getPosTopProducts(owner, { since = null, limit = 20 } = {}) {
  const match = baseMatch(owner);
  if (since) match.createdAt = { $gte: since };
  const rows = await PosOrder.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: null } } },
    {
      $group: {
        _id: "$items.product",
        name: { $first: "$items.name" },
        quantity: { $sum: "$items.quantity" },
        revenue: { $sum: { $ifNull: ["$items.total", 0] } },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ productId: String(r._id), name: r.name, quantity: r.quantity, revenue: round2(r.revenue) }));
}

/** Latest completed bills, newest first, with the shop name for the admin view. */
export async function getRecentPosBills(owner, limit = 5) {
  const rows = await PosOrder.find(baseMatch(owner))
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("invoiceNumber owner channel customerSnapshot total paymentMethod paymentStatus createdAt itemCount")
    .populate("owner", "shopName name")
    .lean();
  return rows.map((b) => ({
    id: String(b._id),
    invoiceNumber: b.invoiceNumber,
    shop: b.owner ? b.owner.shopName || b.owner.name || "Seller" : "Admin counter",
    customer: b.customerSnapshot?.name || "Walk-in Customer",
    amount: round2(b.total || 0),
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    items: b.itemCount || 0,
    createdAt: b.createdAt,
  }));
}

/** Percent change as a signed string, e.g. "+12.5%"; null when there's nothing to compare. */
export function percentChange(current, previous) {
  if (!previous) return current > 0 ? "+100%" : null;
  const p = ((current - previous) / previous) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
