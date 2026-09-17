import mongoose from "mongoose";
import User from "../../models/customer.js";
import Order from "../../models/order.js";
import { buildKey, getOrSet, getTTL } from "../cacheService.js";

// Perf audit BE-D2: the customer-management list sorts by a *computed*
// field (totalOrders, derived from each customer's full order history), so
// — unlike a plain field sort — the join genuinely cannot be limited to
// just the current page's customers first; every matching customer's order
// history has to be joined and scored before the ranking (and therefore the
// page boundary) is known. What WAS avoidable: the `$lookup` below used to
// pull every field of every matching order (items, full pricing breakdown,
// addresses, everything) into `userOrders` for every customer, when only
// `pricing.total` and `createdAt` are ever read from it. Restricting the
// lookup to a sub-pipeline that projects just those two fields cuts the
// data MongoDB has to read/transfer/hold for this aggregation substantially
// without changing the result. On top of that, this list is now
// short-TTL-cached (60s, matching the same pattern already used for
// sellerStats/dashboardSummary in this codebase) — there is no admin action
// anywhere in this codebase that mutates `isActive`/order history and
// expects this specific list to reflect it instantly, so a 60s cache
// removes the "every page view re-runs the full join" cost with the same
// staleness tolerance already accepted elsewhere.
const ORDER_LOOKUP_SUBPIPELINE = [
  { $project: { pricing: { total: 1 }, createdAt: 1 } },
];

export async function getUsersData({ page, limit, skip }) {
  const cacheKey = buildKey("admin", "customerList", `p${page}:l${limit}`);
  return getOrSet(cacheKey, () => fetchUsersData({ page, limit, skip }), getTTL("dashboard"));
}

async function fetchUsersData({ page, limit, skip }) {
  const pipeline = [
    { $match: { role: "user" } },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        pipeline: ORDER_LOOKUP_SUBPIPELINE,
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: { $size: "$userOrders" },
        totalSpent: { $sum: "$userOrders.pricing.total" },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
      },
    },
    { $sort: { totalOrders: -1 } },
  ];

  const [result] = await User.aggregate([
    ...pipeline,
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ]);

  const total = result?.totalCount?.[0]?.count ?? 0;
  const items = result?.items ?? [];

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getUserByIdData(id) {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
        role: "user",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        pipeline: ORDER_LOOKUP_SUBPIPELINE,
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: { $size: "$userOrders" },
        totalSpent: { $sum: "$userOrders.pricing.total" },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
        addresses: { $ifNull: ["$addresses", []] },
      },
    },
  ]);

  if (!user || user.length === 0) {
    return null;
  }

  // Perf audit BE-D2: `.lean()` added — this result is only ever mapped to
  // plain JSON below, never `.save()`d, so there's no need to pay for
  // Mongoose document hydration (getters/virtuals/change-tracking).
  const recentOrders = await Order.find({ customer: id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("items.product", "name mainImage")
    .lean();

  const selectedUser = user[0];
  const addresses = Array.isArray(selectedUser.addresses)
    ? selectedUser.addresses
    : [];

  return {
    ...selectedUser,
    addresses,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderId,
      _id: order._id,
      itemsCount: order.items.length,
      amount: order.pricing.total,
      date: order.createdAt,
      status: order.status,
    })),
  };
}
