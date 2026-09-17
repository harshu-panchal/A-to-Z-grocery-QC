import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import EmptyState from "@shared/components/ui/EmptyState";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineEnvelope,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineArrowTrendingUp,
  HiOutlineMapPin,
  HiOutlineXMark,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlineTrash,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Shop name A-Z" },
  { value: "name_desc", label: "Shop name Z-A" },
  { value: "revenue_desc", label: "Highest revenue" },
  { value: "orders_desc", label: "Most orders" },
  { value: "products_desc", label: "Most products" },
];

const currency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statTokens = {
  blue: { color: "text-primary", bg: "bg-primary/10" },
  emerald: { color: "text-success", bg: "bg-success/10" },
  amber: { color: "text-warning", bg: "bg-warning/10" },
  rose: { color: "text-danger", bg: "bg-danger/10" },
};

const emptyStats = {
  totalActiveSellers: 0,
  totalOrders: 0,
  totalRevenue: 0,
  newThisMonth: 0,
  highVolume: 0,
  averageRevenuePerSeller: 0,
  averageOrdersPerSeller: 0,
};

const normalizeSeller = (seller) => {
  const joinedAt = seller.joinedAt || seller.createdAt || null;

  return {
    ...seller,
    totalOrders: safeNumber(seller.totalOrders),
    deliveredOrders: safeNumber(seller.deliveredOrders),
    pendingOrders: safeNumber(seller.pendingOrders),
    totalRevenue: safeNumber(seller.totalRevenue),
    productCount: safeNumber(seller.productCount),
    avgOrderValue: safeNumber(seller.avgOrderValue),
    fulfillmentRate: safeNumber(seller.fulfillmentRate),
    serviceRadius: safeNumber(seller.serviceRadius) || 5,
    joinedDate: joinedAt
      ? new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "N/A",
    lastOrderLabel: seller.lastOrderAt
      ? new Date(seller.lastOrderAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "No orders yet",
    location: seller.location || "Location not set",
    avatar:
      seller.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        seller.shopName || seller.ownerName || seller.email || "seller",
      )}`,
  };
};

const ACTIVE_SELLERS_QUERY_ROOT = ["admin", "activeSellers"];

const ActiveSellers = () => {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, sortBy, pageSize]);

  const queryParams = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      sort: sortBy,
      page,
      limit: pageSize,
    }),
    [debouncedSearch, categoryFilter, sortBy, page, pageSize],
  );

  // Perf audit Phase 8: migrated to React Query — the manual `requestSeq`
  // ref used to guard against out-of-order responses is no longer needed,
  // React Query already only ever applies the most recent query for a given
  // key. `lastSyncAt` is derived from `dataUpdatedAt` (the timestamp of the
  // last successful fetch) instead of being set by hand.
  const {
    data: queryData,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: [...ACTIVE_SELLERS_QUERY_ROOT, queryParams],
    queryFn: async () => {
      const response = await adminApi.getActiveSellers(queryParams);
      const payload = response.data?.result || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      return {
        sellers: items.map(normalizeSeller),
        stats: { ...emptyStats, ...payload.stats },
        categories: Array.isArray(payload.filters?.categories) ? payload.filters.categories : [],
        total: safeNumber(payload.total) || items.length,
        totalPages: safeNumber(payload.totalPages) || 1,
      };
    },
    placeholderData: keepPreviousData,
  });

  const sellers = queryData?.sellers ?? [];
  const stats = queryData?.stats ?? emptyStats;
  const categories = queryData?.categories ?? [];
  const total = queryData?.total ?? 0;
  const totalPages = queryData?.totalPages ?? 1;
  const loading = isLoading;
  const lastSyncAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const error = isError
    ? (queryError?.response?.data?.message || queryError?.message || "Failed to load active sellers")
    : "";

  useEffect(() => {
    if (isError) {
      console.error("Failed to load active sellers", queryError);
      toast.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  // Same clamp-back-to-last-valid-page behavior as before, for when a
  // filter change leaves `page` pointing past the new result set.
  useEffect(() => {
    if (queryData && queryData.totalPages > 0 && page > queryData.totalPages) {
      setPage(queryData.totalPages);
    }
  }, [queryData, page]);

  const handleDeleteSeller = async (sellerId) => {
    if (!window.confirm("Are you sure you want to delete this store? This action cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await adminApi.rejectSeller(sellerId, { reason: "Deleted by Admin" });
      toast.success("Store deleted successfully");
      setSelectedSeller(null);
      queryClient.invalidateQueries({ queryKey: ACTIVE_SELLERS_QUERY_ROOT });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete store");
    } finally {
      setIsDeleting(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Active Sellers",
        value: stats.totalActiveSellers.toLocaleString("en-IN"),
        icon: HiOutlineBuildingOffice2,
        color: "blue",
        note: "Verified and live",
      },
      {
        label: "Gross Revenue",
        value: currency(stats.totalRevenue),
        icon: HiOutlineArrowTrendingUp,
        color: "emerald",
        note: "Delivered order value",
      },
      {
        label: "Total Orders",
        value: stats.totalOrders.toLocaleString("en-IN"),
        icon: HiOutlineDocumentText,
        color: "amber",
        note: "Lifetime order volume",
      },
      {
        label: "New This Month",
        value: stats.newThisMonth.toLocaleString("en-IN"),
        icon: HiOutlineCalendarDays,
        color: "rose",
        note: "Recently approved",
      },
    ],
    [stats],
  );

  const sellerColumns = [
    {
      header: "Store Entity",
      key: "store",
      cell: (seller) => (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-100">
            <img
              src={seller.avatar}
              alt={seller.shopName}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{seller.shopName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400">{seller.ownerName}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{seller.category || "General"}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Performance",
      key: "performance",
      cell: (seller) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-900">{(seller.totalOrders || 0).toLocaleString("en-IN")} Orders</span>
            <span className="text-[11px] font-bold text-success">{currency(seller.totalRevenue)}</span>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, seller.fulfillmentRate || 0)}%` }} />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{(seller.fulfillmentRate || 0)}% fulfillment</p>
        </div>
      ),
    },
    {
      header: "Business Intel",
      key: "intel",
      cell: (seller) => (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-600">
            <HiOutlineDocumentText className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold">{(seller.productCount || 0).toLocaleString("en-IN")} products</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <HiOutlineMapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="max-w-[220px] truncate text-[11px] font-semibold">{seller.location || "Location not set"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <HiOutlineCalendarDays className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">Joined {seller.joinedDate || "N/A"}</span>
          </div>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      cell: (seller) => (
        <div className="flex flex-col items-start gap-1.5">
          <Badge variant="success">Active</Badge>
          <span className="text-[10px] font-medium text-slate-400">Last order: {seller.lastOrderLabel || "No orders yet"}</span>
        </div>
      ),
    },
    {
      header: "Actions",
      key: "actions",
      align: "right",
      cell: (seller) => (
        <button
          onClick={() => setSelectedSeller(seller)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[11px] font-bold text-white transition-all hover:bg-slate-800"
        >
          <HiOutlineEye className="h-3.5 w-3.5" />
          View Profile
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Active Sellers
            <Badge variant="success">Live</Badge>
          </span>
        }
        description="Review every verified seller, their performance, and current store health."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <HiOutlineClock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {lastSyncAt
                  ? `Synced ${lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Sync pending"}
              </span>
            </div>
            <Button onClick={() => refetch()}>
              <HiOutlineArrowPath className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      {loading && sellers.length === 0 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const tokens = statTokens[card.color] || statTokens.blue;
              return (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  color={tokens.color}
                  bg={tokens.bg}
                  description={card.note}
                />
              );
            })}
          </div>

          <FilterBar
            left={
              <div className="relative w-full sm:w-96">
                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by store name, owner, email, phone or location..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            }
          />

          {error ? (
            <EmptyState
              icon={<HiOutlineXMark className="h-6 w-6" />}
              title={error}
              action={<Button onClick={() => refetch()}>Retry</Button>}
            />
          ) : (
            <DataTable
              columns={sellerColumns}
              data={sellers}
              rowKey={(s) => s.id}
              loading={isFetching && sellers.length > 0}
              emptyState={
                <EmptyState
                  icon={<HiOutlineBuildingOffice2 className="h-6 w-6" />}
                  title="No active sellers found"
                  description="Try a different search or filter."
                />
              }
            />
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            loading={isFetching}
          />
        </>
      )}

      <AnimatePresence>
        {selectedSeller && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
              onClick={() => setSelectedSeller(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 24 }}
              className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 ring-4 ring-white shadow-lg">
                    <img
                      src={selectedSeller.avatar}
                      alt={selectedSeller.shopName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">
                      {selectedSeller.shopName}
                    </h3>
                    <p className="text-sm font-semibold text-slate-500">
                      Owned by {selectedSeller.ownerName}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="success">Active</Badge>
                      <Badge variant="primary">{selectedSeller.category || "General"}</Badge>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedSeller(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <HiOutlineXMark className="h-6 w-6 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-4 bg-slate-50 p-5 border-r border-slate-100">
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Contact
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineEnvelope className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold break-all">
                            {selectedSeller.email || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlinePhone className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold">
                            {selectedSeller.phone || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineMapPin className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold leading-relaxed">
                            {selectedSeller.location || "Location not set"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Store Health
                      </p>
                      <div className="p-4 bg-white rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                          <span>Verification</span>
                          <span className="text-success">Verified</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Joined</span>
                          <span>{selectedSeller.joinedDate || "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Service radius</span>
                          <span>{selectedSeller.serviceRadius || 5} km</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Last order</span>
                          <span>{selectedSeller.lastOrderLabel || "No orders yet"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 p-5 bg-white">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    {[
                      { label: "Orders", value: (selectedSeller.totalOrders || 0).toLocaleString("en-IN") },
                      { label: "Revenue", value: currency(selectedSeller.totalRevenue) },
                      { label: "Products", value: (selectedSeller.productCount || 0).toLocaleString("en-IN") },
                      { label: "Delivered", value: (selectedSeller.deliveredOrders || 0).toLocaleString("en-IN") },
                      { label: "Pending", value: (selectedSeller.pendingOrders || 0).toLocaleString("en-IN") },
                      { label: "Fulfillment", value: `${selectedSeller.fulfillmentRate || 0}%` },
                    ].map((item) => (
                      <div key={item.label} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-lg font-black text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Performance</p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {(selectedSeller.fulfillmentRate || 0)}% of the orders for this seller have been completed successfully.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Average order value</p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {currency(selectedSeller.avgOrderValue)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <Button
                      variant="danger"
                      onClick={() => handleDeleteSeller(selectedSeller.id)}
                      isLoading={isDeleting}
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                      Delete Store
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedSeller(null)}>
                      Close
                    </Button>
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

export default ActiveSellers;
