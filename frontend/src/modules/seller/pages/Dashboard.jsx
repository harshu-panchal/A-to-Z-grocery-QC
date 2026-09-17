import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import ChartCard from "@shared/components/ui/ChartCard";
import DataTable from "@shared/components/ui/DataTable";
import Badge from "@shared/components/ui/Badge";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  DollarSign,
  Truck,
  Package,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  Plus,
  Eye,
} from "lucide-react";
import {
  HiOutlineTruck,
  HiOutlineXMark,
  HiOutlineMapPin,
  HiOutlinePhone,
  HiOutlineBanknotes,
  HiOutlineChevronDown,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import { useSellerOrders } from "../context/SellerOrdersContext";

const STATUS_SELECT_STYLES = {
  warning: "bg-warning/10 text-warning focus:ring-warning/30",
  info: "bg-info/10 text-info focus:ring-info/30",
  primary: "bg-primary/10 text-primary focus:ring-primary/30",
  secondary: "bg-slate-100 text-slate-600 focus:ring-slate-300",
  success: "bg-success/10 text-success focus:ring-success/30",
  error: "bg-danger/10 text-danger focus:ring-danger/30",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { orders: ordersFromContext, ordersLoading, refreshOrders } =
    useSellerOrders();
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        setLoading(true);
        const statsRes = await sellerApi.getStats();
        if (cancelled) return;
        if (statsRes.data.success) setStatsData(statsRes.data.result);
      } catch (error) {
        if (!cancelled) {
          console.error("Dashboard Fetch Error:", error);
          toast.error("Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const safeOrders = Array.isArray(ordersFromContext) ? ordersFromContext : [];
  const loadingOrStats = loading || ordersLoading;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const revenueChartData = React.useMemo(() => {
    const raw = statsData?.salesTrend ?? statsData?.chartData ?? [];
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length > 0) {
      return arr.map((d) => ({
        name: d.name ?? d.date ?? "—",
        sales: Number(d.sales ?? d.revenue ?? d.total ?? 0) || 0,
      }));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { name: dayNames[d.getDay()], sales: 0 };
    });
  }, [statsData?.salesTrend, statsData?.chartData]);
  const revenueMax = Math.max(1, ...revenueChartData.map((d) => d.sales));
  const categoryMix = statsData?.categoryMix || [];

  const stats = [
    {
      label: "Total Revenue",
      value: statsData?.overview?.totalSales || "₹0",
      trend: "+12.5%",
      trendDirection: "up",
      icon: DollarSign,
      bg: "bg-primary/10",
      color: "text-primary",
      description: "vs last month",
      path: "/seller/earnings",
    },
    {
      label: "Total Orders",
      value: statsData?.overview?.totalOrders || "0",
      trend: "+8.2%",
      trendDirection: "up",
      icon: ShoppingBag,
      bg: "bg-success/10",
      color: "text-success",
      description: "vs last month",
      path: "/seller/orders",
    },
    {
      label: "Avg Order Value",
      value: statsData?.overview?.avgOrderValue || "₹0",
      trend: "+2",
      trendDirection: "up",
      icon: Package,
      bg: "bg-info/10",
      color: "text-info",
      description: "per order",
      path: "/seller/analytics",
    },
    {
      label: "Pending Orders",
      value: safeOrders.filter(o => o.status === 'pending').length.toString(),
      trend: "-3",
      trendDirection: "down",
      icon: Clock,
      bg: "bg-warning/10",
      color: "text-warning",
      description: "need attention",
      path: "/seller/orders",
    },
  ];

  const quickActions = [
    {
      title: "Add New Product",
      description: "List a new item in your store",
      icon: Plus,
      path: "/seller/products/add",
      variant: "primary",
    },
    {
      title: "Process Orders",
      description: "View and manage pending orders",
      icon: Truck,
      path: "/seller/orders",
      variant: "outline",
    },
    {
      title: "View Earnings",
      description: "Check your revenue and payouts",
      icon: DollarSign,
      path: "/seller/earnings",
      variant: "outline-success",
    },
  ];

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "pending":
        return "warning";
      case "processing":
      case "confirmed":
        return "info";
      case "packed":
        return "primary";
      case "shipped":
      case "out_for_delivery":
        return "secondary";
      case "delivered":
        return "success";
      case "cancelled":
        return "error";
      default:
        return "secondary";
    }
  };

  const normalizeOrderForModal = (order) => {
    if (!order) return null;
    const addr = order.address;
    const addressStr = [
      addr?.line1,
      addr?.line2,
      addr?.city,
      addr?.state,
      addr?.pincode,
    ]
      .filter(Boolean)
      .join(", ");
    const items = (order.items || []).map((item) => ({
      name: item.name || item.productName || "Item",
      price:
        item.price ??
        (item.quantity
          ? Number(item.totalPrice ?? 0) / Number(item.quantity)
          : 0),
      qty: item.quantity ?? 1,
      image: item.image || "",
    }));
    return {
      id: order.orderId,
      customer: {
        name: order.customer?.name || "Customer",
        phone: order.customer?.phone || "",
      },
      address: addressStr || "—",
      items,
      total: Number(order.pricing?.total ?? 0),
      subtotal: Number(
        order.pricing?.subtotal ??
          order.paymentBreakdown?.productSubtotal ??
          0,
      ),
      deliveryFee: Number(
        order.pricing?.deliveryFee ??
          order.paymentBreakdown?.deliveryFeeCharged ??
          0,
      ),
      status: order.status || "pending",
      payment:
        order.payment?.method === "cash" || order.payment?.method === "cod"
          ? "Cash on Delivery"
          : "Online Paid",
    };
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await sellerApi.updateOrderStatus(orderId, {
        status: newStatus.toLowerCase(),
      });
      toast.success(`Order status updated to ${newStatus}`);
      setSelectedOrder((prev) =>
        prev && prev.id === orderId ? { ...prev, status: newStatus } : prev
      );
      if (typeof refreshOrders === "function") refreshOrders();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status");
    }
  };

  const orderColumns = [
    {
      header: "Order ID",
      key: "orderId",
      cell: (order) => <span className="font-semibold text-slate-900">{order.orderId}</span>,
    },
    {
      header: "Customer",
      key: "customer",
      cell: (order) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
            {order.customer?.name?.split(" ").map(n => n[0]).join("") || "C"}
          </div>
          <span className="font-medium text-slate-700">{order.customer?.name || "Customer"}</span>
        </div>
      ),
    },
    {
      header: "Date",
      key: "date",
      cell: (order) => (
        <span className="text-xs text-slate-400">
          {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      ),
    },
    {
      header: "Amount",
      key: "amount",
      cell: (order) => <span className="font-bold text-slate-900">₹{order.pricing?.total || 0}</span>,
    },
    {
      header: "Status",
      key: "status",
      cell: (order) => <Badge variant={getStatusColor(order.status)} className="capitalize">{order.status}</Badge>,
    },
    {
      header: "Action",
      key: "action",
      align: "center",
      cell: (order) => (
        <button
          onClick={() => {
            setSelectedOrder(normalizeOrderForModal(order));
            setIsOrderModalOpen(true);
          }}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5 relative">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's what's happening with your store today."
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingOrStats
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              trend={stat.trend}
              trendDirection={stat.trendDirection}
              description={stat.description}
              color={stat.color}
              bg={stat.bg}
              onClick={() => stat.path && navigate(stat.path)}
            />
          ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {quickActions.map((action) => {
          const isPrimary = action.variant === "primary";
          const isSuccess = action.variant === "outline-success";
          return (
            <button
              key={action.title}
              onClick={() => navigate(action.path)}
              className={cn(
                "rounded-xl border-2 p-4 text-left shadow-sm transition-all duration-200 hover:shadow-md",
                isPrimary && "border-primary bg-primary text-white shadow-primary/20 hover:bg-primary/90",
                action.variant === "outline" && "border-slate-200 bg-white text-slate-900 hover:border-primary hover:bg-primary/5",
                isSuccess && "border-slate-200 bg-white text-slate-900 hover:border-success hover:bg-success/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "rounded-lg p-2",
                  isPrimary ? "bg-white/20" : isSuccess ? "bg-success/10" : "bg-slate-100"
                )}>
                  <action.icon className={cn(
                    "h-5 w-5",
                    isPrimary ? "text-white" : isSuccess ? "text-success" : "text-slate-700"
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={cn("text-sm font-semibold", isPrimary ? "text-white" : "text-slate-900")}>
                    {action.title}
                  </h3>
                  <p className={cn("mt-0.5 text-xs", isPrimary ? "text-white/90" : "text-slate-500")}>
                    {action.description}
                  </p>
                </div>
                <ArrowUpRight className={cn("h-4 w-4 shrink-0", isPrimary ? "text-white/70" : "text-slate-400")} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loadingOrStats ? (
            <SkeletonCard lines={4} />
          ) : (
            <ChartCard title="Revenue Overview" subtitle="Last 7 days performance" height={260} isEmpty={revenueMax <= 1 && revenueChartData.every(d => d.sales === 0)} emptyMessage="No sales recorded in the last 7 days.">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(value) => `₹${Number(value).toLocaleString()}`}
                    domain={[0, revenueMax]}
                    allowDataOverflow
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", color: "#334155" }}
                    formatter={(value) => [`₹${Number(value).toLocaleString()}`, "Revenue"]}
                    labelFormatter={(label) => `Day: ${label}`}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2.5} fill="url(#revenueGradient)" isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>

        <div className="lg:col-span-1">
          {loadingOrStats ? (
            <SkeletonCard lines={4} />
          ) : (
            <ChartCard title="Top Categories" subtitle="Sales by category" height={260} isEmpty={categoryMix.length === 0} emptyMessage="No category sales yet.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryMix} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11 }} />
                  <YAxis type="category" dataKey="subject" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11 }} width={72} />
                  <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", color: "#334155" }} />
                  <Bar dataKey="A" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      {loadingOrStats ? (
        <SkeletonCard lines={5} />
      ) : (
        <Card
          title="Recent Orders"
          subtitle="Latest transactions from your store"
          headerAction={
            <button
              onClick={() => navigate("/seller/orders")}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
            >
              View All
              <ArrowUpRight className="h-4 w-4" />
            </button>
          }
        >
          <DataTable
            columns={orderColumns}
            data={safeOrders.slice(0, 5)}
            rowKey={(o) => o.orderId}
            className="border-none shadow-none rounded-none"
            emptyState={<div className="py-10 text-center text-sm text-slate-400">No orders yet — they'll show up here as soon as customers start ordering.</div>}
          />
        </Card>
      )}

      <AnimatePresence>
        {isOrderModalOpen && selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-3 sm:p-6 lg:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsOrderModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header - same as Orders */}
              <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                    <HiOutlineTruck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Order Details
                    </h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Badge
                        variant={getStatusColor(selectedOrder.status)}
                        className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0"
                      >
                        {selectedOrder.status}
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                        #{selectedOrder.id}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsOrderModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto scrollbar-hide flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <HiOutlineMapPin className="h-3 w-3 text-primary" />{" "}
                        Delivery Address
                      </h4>
                      <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                        {selectedOrder.address}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <HiOutlinePhone className="h-3 w-3 text-success" />{" "}
                        Contact Info
                      </h4>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-xs font-bold text-slate-800">
                          {selectedOrder.customer.name}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                          {selectedOrder.customer.phone}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                      <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-3">
                        Order Summary
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-slate-600">
                            Subtotal
                          </span>
                          <span className="font-black text-slate-900">
                            ₹{Number(selectedOrder.subtotal ?? selectedOrder.total ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-slate-600">
                            Delivery Fee
                          </span>
                          <span className="font-black text-success">
                            ₹{Number(selectedOrder.deliveryFee ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="h-px bg-primary/10 my-2" />
                        <div className="flex justify-between text-sm">
                          <span className="font-black text-slate-900">
                            Total
                          </span>
                          <span className="font-black text-primary">
                            ₹{Number(selectedOrder.total ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-slate-900/10">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                        Payment Status
                      </h4>
                      <div className="flex items-center gap-2">
                        <HiOutlineBanknotes className="h-5 w-5 text-success" />
                        <span className="text-xs font-bold tracking-tight">
                          {selectedOrder.payment}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3 sm:mb-4">
                  Items Ordered ({selectedOrder.items.length})
                </h4>
                <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-600 text-xs font-bold">
                              —
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-600 mt-0.5">
                            ₹{Number(item.price).toFixed(2)} × {item.qty}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900">
                          ₹{(item.price * item.qty).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer - same as Orders */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center justify-end">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setIsOrderModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    CLOSE
                  </button>
                  <div className="relative inline-block w-40">
                    <select
                      value={selectedOrder.status.toLowerCase()}
                      onChange={(e) =>
                        handleStatusUpdate(selectedOrder.id, e.target.value)
                      }
                      className={cn(
                        "w-full text-[10px] pl-3 pr-8 py-2 rounded-xl font-black uppercase tracking-wider border-none appearance-none cursor-pointer focus:ring-2 focus:ring-offset-1 transition-all outline-none shadow-sm",
                        STATUS_SELECT_STYLES[getStatusColor(selectedOrder.status)] || STATUS_SELECT_STYLES.secondary
                      )}
                    >
                      <option value="pending" disabled={['confirmed','packed','out_for_delivery','delivered','cancelled'].includes(selectedOrder.status.toLowerCase())}>Pending</option>
                      <option value="confirmed" disabled={['packed','out_for_delivery','delivered','cancelled'].includes(selectedOrder.status.toLowerCase())}>Confirmed</option>
                      <option value="packed" disabled={['out_for_delivery','delivered','cancelled'].includes(selectedOrder.status.toLowerCase())}>Packed</option>
                      <option value="out_for_delivery" disabled={['delivered','cancelled'].includes(selectedOrder.status.toLowerCase())}>Out for Delivery</option>
                      <option value="delivered" disabled={selectedOrder.status.toLowerCase() === 'cancelled'}>Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <HiOutlineChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none opacity-60" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
