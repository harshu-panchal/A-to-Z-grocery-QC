import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import EmptyState from "@shared/components/ui/EmptyState";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineTruck,
  HiOutlinePhone,
  HiOutlineMapPin,
  HiOutlineCheckCircle,
  HiOutlineUser,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { sellerApi } from "../services/sellerApi";
import { useToast } from "@shared/components/ui/Toast";
import Pagination from "@shared/components/ui/Pagination";

const DeliveryTracking = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("Active");
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Perf audit Phase 8: migrated to React Query. This fetches every page
  // of the seller's orders up front (existing pre-migration behavior,
  // unchanged) and filters/paginates client-side.
  const { data: deliveries = [], isLoading: loading, isError } = useQuery({
    queryKey: ["seller", "deliveryTracking"],
    queryFn: async () => {
      const requestLimit = 100;
      const maxPages = 50;
      let requestedPage = 1;
      let totalPages = 1;
      const collectedOrders = [];

      while (requestedPage <= totalPages && requestedPage <= maxPages) {
        const response = await sellerApi.getOrders({
          page: requestedPage,
          limit: requestLimit,
        });
        const payload = response.data.result || {};
        const pageOrders = Array.isArray(payload.items)
          ? payload.items
          : (response.data.results || []);

        collectedOrders.push(...pageOrders);
        totalPages = Number(payload.totalPages || 1);

        if (!pageOrders.length || requestedPage >= totalPages) {
          break;
        }
        requestedPage += 1;
      }

      // Only show orders that are confirmed, packed, or out for delivery (Tracking flow)
      const formattedDeliveries = collectedOrders
        .filter(order => order.status !== 'pending' && order.status !== 'cancelled')
        .map(order => {
          let uiStatus = "Active";
          if (order.status === 'delivered') uiStatus = "Delivered";
          else if (order.status === 'out_for_delivery') uiStatus = "On the Way";
          else uiStatus = "Picked Up";

          return {
            id: order._id,
            orderId: order.orderId,
            status: uiStatus,
            deliveryBoy: order.deliveryBoy ? {
              name: order.deliveryBoy.name,
              phone: order.deliveryBoy.phone,
              avatar: order.deliveryBoy.name?.charAt(0) || "?",
              image: order.deliveryBoy.image || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop",
              rating: order.deliveryBoy.rating || 4.5,
            } : {
              name: "Not Assigned",
              phone: "N/A",
              avatar: "?",
              image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop",
              rating: 0,
            },
            location: order.status === 'delivered' && order.updatedAt
              ? `Delivered at ${new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : "In Progress",
            orderDate: order.createdAt
              ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : "",
            startTime: order.createdAt
              ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : "",
            estimatedDelivery: "20-30 mins",
            customerName: order.customer?.name || "Customer",
            address: order.address
              ? `${order.address.address || ""}, ${order.address.city || ""}`.trim()
              : "",
            addressCoords: order.address?.location || null,
          };
        });

      return formattedDeliveries;
    },
  });

  useEffect(() => {
    if (isError) {
      console.error("Tracking Error");
      showToast("Failed to fetch tracking data", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const tabs = ["Active", "Completed", "All"];

  const filteredDeliveries = useMemo(() => {
    const result = deliveries.filter((dlv) => {
      const matchesSearch =
        dlv.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dlv.deliveryBoy.name.toLowerCase().includes(searchTerm.toLowerCase());

      const isCompleted = dlv.status === "Delivered";
      if (activeTab === "Active") return matchesSearch && !isCompleted;
      if (activeTab === "Completed") return matchesSearch && isCompleted;
      return matchesSearch;
    });
    // Reset to first page if current page exceeds total pages
    const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
    if (page > totalPages) {
      setPage(1);
    }
    return result;
  }, [deliveries, searchTerm, activeTab, page, pageSize]);

  const paginatedDeliveries = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredDeliveries.slice(start, end);
  }, [filteredDeliveries, page, pageSize]);

  const stats = useMemo(
    () => [
      {
        label: "On the Way",
        value: deliveries.filter((d) => d.status === "On the Way").length,
        icon: HiOutlineTruck,
        color: "text-primary",
        bg: "bg-primary/10",
      },
      {
        label: "At Store",
        value: deliveries.filter((d) => d.status === "Picked Up").length,
        icon: HiOutlineMapPin,
        color: "text-warning",
        bg: "bg-warning/10",
      },
      {
        label: "Completed Today",
        value: deliveries.filter((d) => d.status === "Delivered").length,
        icon: HiOutlineCheckCircle,
        color: "text-success",
        bg: "bg-success/10",
      },
    ],
    [deliveries],
  );

  const getStatusVariant = (status) => {
    switch (status) {
      case "On the Way":
        return "info";
      case "Picked Up":
        return "warning";
      case "Delivered":
        return "success";
      default:
        return "primary";
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Delivery Tracking
            <Badge variant="primary">Live Fleet</Badge>
          </span>
        }
        description="Monitor active deliveries and assigned partners."
      />

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map((stat, i) => (
              <StatCard key={i} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
            ))}
          </div>

          <Card className="overflow-hidden p-0">
            {/* Tabs & Search */}
            <div className="border-b border-slate-100 bg-slate-50/30">
              <div className="flex flex-col justify-between px-3 md:flex-row md:items-center">
                <div className="flex items-center">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "relative px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all",
                        activeTab === tab
                          ? "text-primary"
                          : "text-slate-500 hover:text-slate-700",
                      )}>
                      {tab}
                      {activeTab === tab && (
                        <motion.div
                          layoutId="tab-underline-tracking"
                          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                        />
                      )}
                    </button>
                  ))}
                </div>
                <div className="w-full py-2 lg:w-64 lg:py-0">
                  <div className="relative">
                    <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search ID or Partner..."
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery List */}
            <div className="space-y-3 p-4">
              <AnimatePresence mode="popLayout">
                {paginatedDeliveries.map((dlv, idx) => (
                  <motion.div
                    key={dlv.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: idx * 0.03 }}
                    className="group relative min-w-0 rounded-xl border border-slate-100 bg-white p-1.5 transition-all hover:border-primary/20 hover:shadow-sm">
                    <div className="flex flex-col items-stretch gap-1 md:flex-row">
                      {/* Partner Info Section */}
                      <div className="min-w-0 rounded-lg border border-transparent bg-slate-50/50 p-2.5 md:w-48">
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <div className="h-10 w-10 overflow-hidden rounded-lg ring-2 ring-white">
                              <img
                                src={dlv.deliveryBoy.image}
                                alt={dlv.deliveryBoy.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-white bg-success text-[7px] font-black text-white">
                              {dlv.deliveryBoy.rating}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-primary">
                              Partner
                            </p>
                            <h3 className="truncate text-xs font-black leading-none text-slate-900">
                              {dlv.deliveryBoy.name}
                            </h3>
                            <a
                              href={`tel:${dlv.deliveryBoy.phone}`}
                              className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 transition-colors hover:text-primary"
                            >
                              <HiOutlinePhone className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{dlv.deliveryBoy.phone}</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Order Info Section */}
                      <div className="flex min-w-0 flex-1 flex-col justify-between p-2.5">
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-0.5 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-black tracking-tight text-slate-900">
                                #{dlv.orderId}
                              </span>
                              <Badge variant={getStatusVariant(dlv.status)}>
                                {dlv.status}
                              </Badge>
                            </div>
                            <h4 className="flex flex-wrap items-center gap-1 text-[10px] font-bold text-slate-500">
                              <HiOutlineUser className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="font-black capitalize text-slate-900">{dlv.customerName}</span>
                            </h4>
                          </div>
                          <div className="shrink-0 sm:text-right">
                            <p className="text-[8px] font-bold uppercase leading-none tracking-widest text-slate-400">
                              Timing
                            </p>
                            <p className="mt-0.5 text-[10px] font-black tracking-tight text-primary">
                              {dlv.startTime || "—"}
                            </p>
                          </div>
                        </div>

                        <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50/50 px-3 py-1.5">
                          <p className="truncate text-[10px] font-bold leading-tight text-slate-600">
                            <HiOutlineMapPin className="-mt-0.5 mr-1 inline h-2.5 w-2.5 text-primary" />
                            {dlv.address}
                          </p>
                        </div>
                      </div>

                      {/* Action Button Section */}
                      <div className="flex shrink-0 items-center justify-center p-2 md:w-14">
                        <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition-all group-hover:bg-primary lg:h-full lg:w-full">
                          <HiOutlineTruck className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredDeliveries.length === 0 && (
                <EmptyState
                  icon={<HiOutlineTruck className="h-6 w-6" />}
                  title="No active tracking found"
                  description="Adjust filters or search terms."
                />
              )}
            </div>

            {/* Pagination */}
            {filteredDeliveries.length > 0 && (
              <div className="px-4 pb-4">
                <Pagination
                  page={page}
                  totalPages={Math.max(1, Math.ceil(filteredDeliveries.length / pageSize))}
                  total={filteredDeliveries.length}
                  pageSize={pageSize}
                  onPageChange={(newPage) => setPage(newPage)}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                  loading={loading}
                />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default DeliveryTracking;
