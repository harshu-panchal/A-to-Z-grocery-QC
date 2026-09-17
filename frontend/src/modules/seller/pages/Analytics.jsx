import React, { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import ChartCard from "@shared/components/ui/ChartCard";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  HiOutlineChartBar,
  HiOutlineArrowTrendingUp,
  HiOutlineUsers,
  HiOutlineShoppingBag,
  HiOutlineArrowUpRight,
  HiOutlineArrowDownRight,
  HiOutlineArrowDownTray,
  HiOutlineMapPin,
  HiOutlineClock,
  HiOutlineDevicePhoneMobile,
} from "react-icons/hi2";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { cn } from "@/lib/utils";
import Modal from "@shared/components/ui/Modal";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";


const Analytics = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [chartRange, setChartRange] = useState("Daily");

  const DEFAULT_STATS_SHAPE = {
    overview: {},
    salesTrend: [],
    categoryMix: [],
    topProducts: [],
    trafficSources: [],
    insights: {},
  };

  // Perf audit Phase 8: migrated to React Query. `placeholderData:
  // keepPreviousData` matches the original's "only show the loading state
  // on the very first fetch, keep the old chart data visible while
  // switching ranges" behavior — `loading` below is `isLoading` (true only
  // when there's no data yet at all), not `isFetching`.
  const { data: statsData, isLoading: loading, isError } = useQuery({
    queryKey: ["seller", "analyticsStats", chartRange],
    queryFn: async () => {
      const response = await sellerApi.getStats(chartRange.toLowerCase());
      const raw = response?.data?.result ?? response?.data?.data ?? null;
      if (response?.data?.success && raw && typeof raw === "object") {
        return {
          overview: raw.overview ?? {},
          salesTrend: Array.isArray(raw.salesTrend) ? raw.salesTrend : [],
          categoryMix: Array.isArray(raw.categoryMix) ? raw.categoryMix : [],
          topProducts: Array.isArray(raw.topProducts) ? raw.topProducts : [],
          trafficSources: Array.isArray(raw.trafficSources) ? raw.trafficSources : [],
          insights: raw.insights ?? {},
        };
      } else if (response?.data?.success && raw) {
        return raw;
      }
      return DEFAULT_STATS_SHAPE;
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isError) {
      console.error("Analytics Fetch Error");
      toast.error("Failed to load analytics data");
    }
  }, [isError]);

  const stats = [
    {
      label: "Total Sales",
      value: statsData?.overview?.totalSales || "₹0",
      trend: statsData?.overview?.salesTrend || "0%",
      icon: HiOutlineArrowTrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Orders",
      value: statsData?.overview?.totalOrders || "0",
      trend: statsData?.overview?.ordersTrend || "0%",
      icon: HiOutlineShoppingBag,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Avg Order Value",
      value: statsData?.overview?.avgOrderValue || "₹0",
      trend: "0%",
      icon: HiOutlineUsers,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Conversion Rate",
      value: statsData?.overview?.conversionRate || "0%",
      trend: "0%",
      icon: HiOutlineChartBar,
      color: "text-info",
      bg: "bg-info/10",
    },
  ];

  const salesTrendArr = statsData?.salesTrend ?? [];
  const hasNoData = !Number(statsData?.overview?.totalOrders) && (!salesTrendArr.length || salesTrendArr.every((d) => !d.sales));

  const handleDownloadReport = () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const escapeCsv = (v) => {
        const s = String(v ?? "").replace(/"/g, '""');
        return /[",\n\r]/.test(s) ? `"${s}"` : s;
      };
      const lines = [];
      lines.push("Analytics Report");
      lines.push(`Generated,${new Date().toISOString()}`);
      lines.push("");

      const ov = statsData?.overview ?? {};
      lines.push("Overview");
      lines.push("Metric,Value");
      ["Total Sales", "Total Orders", "Avg Order Value", "Conversion Rate"].forEach((label, i) => {
        const key = ["totalSales", "totalOrders", "avgOrderValue", "conversionRate"][i];
        lines.push(`${escapeCsv(label)},${escapeCsv(ov[key] ?? "—")}`);
      });
      lines.push("");

      const trend = statsData?.salesTrend ?? [];
      if (trend.length) {
        lines.push("Sales Trend");
        lines.push("Period,Sales,Traffic");
        trend.forEach((d) => {
          lines.push(`${escapeCsv(d.name)},${escapeCsv(d.sales)},${escapeCsv(d.traffic)}`);
        });
        lines.push("");
      }

      const top = statsData?.topProducts ?? [];
      if (top.length) {
        lines.push("Top Products");
        lines.push("Product,Sales,Revenue,Trend %");
        top.forEach((p) => {
          lines.push(`${escapeCsv(p.name)},${escapeCsv(p.sales)},${escapeCsv(p.revenue)},${escapeCsv(p.trend)}`);
        });
        lines.push("");
      }

      const cat = statsData?.categoryMix ?? [];
      if (cat.length) {
        lines.push("Category Mix");
        lines.push("Category,Volume");
        cat.forEach((c) => {
          lines.push(`${escapeCsv(c.subject)},${escapeCsv(c.A)}`);
        });
        lines.push("");
      }

      const traffic = statsData?.trafficSources ?? [];
      if (traffic.length) {
        lines.push("Traffic Sources");
        lines.push("Source,Value");
        traffic.forEach((t) => {
          lines.push(`${escapeCsv(t.name)},${escapeCsv(t.value)}`);
        });
      }

      const csvContent = lines.join("\n");
      const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to download report");
    } finally {
      setIsExporting(false);
    }
  };

  const visibleStats = stats.filter((_, i) => {
    if (activeTab === "Customers") return i === 0 || i === 1;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Advanced Analytics
            <Badge variant="success">Real-time Insights</Badge>
          </span>
        }
        description="Detailed breakdown of your business performance and customer behavior."
        actions={
          <Button onClick={handleDownloadReport} isLoading={isExporting} variant="primary">
            <HiOutlineArrowDownTray className="h-4 w-4" />
            {isExporting ? "Downloading..." : "Download Report"}
          </Button>
        }
      />

      <div className="flex w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit">
        {["Overview", "Sales", "Customers"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-bold transition-all",
              activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : visibleStats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              trend={stat.trend}
              trendDirection={stat.trend.startsWith("-") ? "down" : "up"}
              color={stat.color}
              bg={stat.bg}
            />
          ))}
      </div>

      {!loading && hasNoData && (activeTab === "Overview" || activeTab === "Sales") && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-3.5">
          <HiOutlineChartBar className="h-5 w-5 shrink-0 text-slate-400" />
          <p className="text-sm font-medium text-slate-500">
            Sales report is connected — data will appear here once you have orders.
          </p>
        </div>
      )}

      {(activeTab === "Overview" || activeTab === "Sales") && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {loading ? <SkeletonCard lines={5} /> : (
              <ChartCard
                title="Revenue & Trends"
                subtitle="Performance insights over the selected period"
                height={300}
                isEmpty={hasNoData}
                emptyMessage="No sales activity recorded for this range yet."
                actions={
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {["Daily", "Weekly", "Monthly"].map((range) => (
                      <button
                        key={range}
                        onClick={() => setChartRange(range)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-bold transition-all",
                          chartRange === range ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={statsData?.salesTrend || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `₹${value}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                      itemStyle={{ fontSize: "11px", fontWeight: 700 }}
                      cursor={{ stroke: "#2563eb", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="traffic" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorTraffic)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          <div className="lg:col-span-1">
            {loading ? <SkeletonCard lines={4} /> : (
              <>
                <ChartCard title="Category Mix" subtitle="Inventory distribution" height={220} isEmpty={!(statsData?.categoryMix || []).length} emptyMessage="No category data yet.">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={statsData?.categoryMix || []}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                      <Radar name="Volume" dataKey="A" stroke="#16a34a" strokeWidth={2} fill="#16a34a" fillOpacity={0.15} />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartCard>
                {(statsData?.categoryMix || []).length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(statsData?.categoryMix || []).slice(0, 3).map((cat, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                        <p className="text-[10px] font-black text-slate-900">{cat.A}</p>
                        <p className="mt-0.5 text-[9px] font-bold uppercase text-slate-500">{cat.subject}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(activeTab === "Overview" || activeTab === "Sales") && (
          loading ? <SkeletonCard lines={5} /> : (
            <Card title="Top Performing Products" subtitle="Bestsellers by sales volume and revenue generation." contentClassName="p-0">
              <div className="divide-y divide-slate-100">
                {(statsData?.topProducts || []).length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No product sales yet.</div>
                ) : (statsData?.topProducts || []).map((product, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedProduct(product);
                      setIsProductModalOpen(true);
                    }}
                    className="group flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500 transition-all group-hover:bg-primary group-hover:text-white">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-slate-900">{product.name}</h4>
                        <p className="text-xs font-medium text-slate-500">{product.sales} units sold</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-900">{product.revenue}</p>
                      <div className={cn("mt-0.5 flex items-center justify-end text-[10px] font-bold", product.trend > 0 ? "text-success" : "text-danger")}>
                        {product.trend > 0 ? <HiOutlineArrowUpRight className="mr-0.5 h-3 w-3" /> : <HiOutlineArrowDownRight className="mr-0.5 h-3 w-3" />}
                        {Math.abs(product.trend)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 bg-slate-50 p-3 text-center">
                <button onClick={() => navigate("/seller/products")} className="text-xs font-bold uppercase tracking-widest text-primary hover:underline">
                  View All Products Analytics
                </button>
              </div>
            </Card>
          )
        )}

        {(activeTab === "Overview" || activeTab === "Customers") && (
          loading ? <SkeletonCard lines={5} /> : (
            <Card title="New Customers" subtitle="Traffic origin analysis">
              <div className="flex flex-col items-center gap-6 md:flex-row">
                <div className="h-[190px] w-full md:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statsData?.trafficSources || []} cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={8} dataKey="value">
                        {(statsData?.trafficSources || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} itemStyle={{ fontSize: "10px", fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2.5 md:w-1/2">
                  {(statsData?.trafficSources || []).map((source, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                        <span className="text-xs font-semibold text-slate-600">{source.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        {((source.value / (statsData?.trafficSources?.reduce((a, b) => a + b.value, 0) || 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <HiOutlineMapPin className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-[10px] font-black text-slate-900">{statsData?.insights?.topCity || "N/A"}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Top City</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <HiOutlineClock className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-[10px] font-black text-slate-900">{statsData?.insights?.peakTime || "N/A"}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Peak Time</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
                    <HiOutlineDevicePhoneMobile className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-[10px] font-black text-slate-900">{statsData?.insights?.topDevice || "N/A"}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Top Device</p>
                </div>
              </div>
            </Card>
          )
        )}
      </div>

      {/* Product Detail Modal */}
      <Modal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} title="Product Insights">
        {selectedProduct && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                <HiOutlineShoppingBag className="h-7 w-7" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{selectedProduct.name}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Product ID: {selectedProduct._id || "N/A"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary/5 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">Revenue</p>
                <p className="text-lg font-black text-slate-900">{selectedProduct.revenue}</p>
              </div>
              <div className="rounded-xl bg-primary/5 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">Units Sold</p>
                <p className="text-lg font-black text-slate-900">{selectedProduct.sales}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="pl-0.5 text-xs font-bold uppercase tracking-wider text-slate-500">Sales velocity</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-primary" style={{ width: '75%' }} />
              </div>
              <p className="pt-1 text-right text-[10px] font-semibold text-slate-500">
                +{selectedProduct.trend}% faster than last week
              </p>
            </div>

            <Button onClick={() => setIsProductModalOpen(false)} className="w-full">
              Close Details
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Analytics;
