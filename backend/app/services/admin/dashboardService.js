import User from "../../models/customer.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Product from "../../models/product.js";
import {
  getPosSalesSummary,
  getPosTopProducts,
  getRecentPosBills,
  percentChange,
} from "../pos/posStatsService.js";

const DASHBOARD_CATEGORY_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"];

export async function getAdminDashboardStats() {
  const [totalCustomers, totalSellers, totalRiders, totalOrders] =
    await Promise.all([
      User.countDocuments({ role: "user" }),
      Seller.countDocuments(),
      Delivery.countDocuments(),
      Order.countDocuments(),
    ]);

  const totalUsers = totalCustomers;
  const activeSellers = await Seller.countDocuments({ isVerified: true });

  // last 30 days vs the 30 before, for the KPI trend badges
  const DAY = 24 * 60 * 60 * 1000;
  const since30 = new Date(Date.now() - 30 * DAY);
  const since60 = new Date(Date.now() - 60 * DAY);
  const windowCount = (Model, filter = {}) =>
    Promise.all([
      Model.countDocuments({ ...filter, createdAt: { $gte: since30 } }),
      Model.countDocuments({ ...filter, createdAt: { $gte: since60, $lt: since30 } }),
    ]);
  const windowRevenue = async (from, to) =>
    (await Order.aggregate([
      { $match: { status: "delivered", createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: "$pricing.total" } } },
    ]))[0]?.total || 0;
  const [[newUsers, prevUsers], [newSellers, prevSellers], [orders30, ordersPrev30], revenue30, revenuePrev30, pos] =
    await Promise.all([
      windowCount(User, { role: "user" }),
      windowCount(Seller),
      windowCount(Order),
      windowRevenue(since30, new Date()),
      windowRevenue(since60, since30),
      getPosSalesSummary(undefined, { periodDays: 30, trendSince: new Date(Date.now() - 31 * DAY) }),
    ]);

  const revenueData = await Order.aggregate([
    { $match: { status: "delivered" } },
    { $group: { _id: null, total: { $sum: "$pricing.total" } } },
  ]);
  const totalRevenue = revenueData[0]?.total || 0;
  const round2 = (n) => Math.round(n * 100) / 100;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historyAggregation = await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo }, status: "delivered" } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        revenue: { $sum: "$pricing.total" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Create a map of existing revenue data
  const revenueMap = new Map(historyAggregation.map(item => [item._id, item.revenue]));
  
  // Fill in the last 30 days with 0 where no data exists
  const revenueHistory = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const online = revenueMap.get(dateStr) || 0;
    const counter = pos.trend.get(dateStr)?.sales || 0;
    revenueHistory.push({
      name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      revenue: online,
      pos: counter,
      total: round2(online + counter),
      fullDate: dateStr
    });
  }

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("customer", "name");

  const categoryData = await Product.aggregate([
    { $group: { _id: "$headerId", count: { $sum: 1 } } },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    { $project: { name: "$category.name", value: "$count" } },
    { $limit: 4 },
  ]);

  const onlineTop = await Order.aggregate([
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        sales: { $sum: "$items.quantity" },
        revenue: {
          $sum: { $multiply: ["$items.quantity", "$items.price"] },
        },
      },
    },
    { $sort: { sales: -1 } },
    { $limit: 20 },
  ]);
  const counterTop = await getPosTopProducts(undefined, { limit: 20 });
  const merged = new Map();
  for (const row of onlineTop) {
    if (!row._id) continue;
    merged.set(String(row._id), { id: row._id, online: row.sales, counter: 0, rev: row.revenue || 0 });
  }
  for (const row of counterTop) {
    const cur = merged.get(row.productId) || { id: row.productId, online: 0, counter: 0, rev: 0 };
    cur.counter += row.quantity;
    cur.rev += row.revenue;
    merged.set(row.productId, cur);
  }
  const topRows = [...merged.values()]
    .map((r) => ({ ...r, sales: r.online + r.counter }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);
  const topDocs = await Product.find({ _id: { $in: topRows.map((r) => r.id) } })
    .select("name mainImage")
    .lean();
  const docMap = new Map(topDocs.map((p) => [String(p._id), p]));
  const topProducts = topRows
    .filter((r) => docMap.has(String(r.id)))
    .map((r) => ({
      name: docMap.get(String(r.id)).name,
      image: docMap.get(String(r.id)).mainImage,
      sales: r.sales,
      online: r.online,
      counter: r.counter,
      rev: r.rev,
    }));

  const [recentPosBills, totalProducts] = await Promise.all([
    getRecentPosBills(undefined, 5),
    Product.countDocuments(),
  ]);

  return {
    overview: {
      totalUsers,
      activeSellers,
      totalOrders,
      totalRevenue,
      // online (delivered orders) + counter (POS bills)
      onlineRevenue: totalRevenue,
      posRevenue: pos.total.sales,
      posBills: pos.total.bills,
      combinedRevenue: round2(totalRevenue + pos.total.sales),
      totalProducts,
      trends: {
        users: percentChange(newUsers, prevUsers),
        sellers: percentChange(newSellers, prevSellers),
        orders: percentChange(orders30 + pos.period.bills, ordersPrev30 + pos.prevPeriod.bills),
        revenue: percentChange(revenue30 + pos.period.sales, revenuePrev30 + pos.prevPeriod.sales),
      },
      newUsers30: newUsers,
      orders30,
    },
    pos: {
      totalSales: pos.total.sales,
      totalBills: pos.total.bills,
      todaySales: pos.today.sales,
      todayBills: pos.today.bills,
      last30Sales: pos.period.sales,
      last30Bills: pos.period.bills,
      trend: percentChange(pos.period.sales, pos.prevPeriod.sales),
      recentBills: recentPosBills,
    },
    revenueHistory,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderId,
      customer: order.customer?.name || "Guest",
      statusText: order.status,
      status:
        order.status === "delivered"
          ? "success"
          : order.status === "cancelled"
            ? "error"
            : "warning",
      amount: `\u20B9${order.pricing.total}`,
      time: order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : "Recently",
    })),
    categoryData: categoryData.map((category, index) => ({
      ...category,
      color: DASHBOARD_CATEGORY_COLORS[index % DASHBOARD_CATEGORY_COLORS.length],
    })),
    topProducts: topProducts.map((product) => ({
      name: product.name,
      sales: product.sales,
      online: product.online,
      counter: product.counter,
      rev: `\u20B9${product.rev.toFixed(2)}`,
      cat: product.counter && product.online
        ? `Online ${product.online} · Counter ${product.counter}`
        : product.counter ? `Counter ${product.counter}` : `Online ${product.online}`,
      image: product.image,
      icon: "\u{1F4E6}", // Fallback package icon
      color: "bg-blue-50 text-blue-600",
    })),
  };
}
