import React, { useState, useEffect, useMemo } from "react";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import EmptyState from "@shared/components/ui/EmptyState";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowRight,
  HiOutlineXMark,
  HiOutlinePhone,
  HiOutlineIdentification,
  HiOutlineStar,
  HiOutlineCalendarDays,
  HiOutlineTruck,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import Pagination from "@shared/components/ui/Pagination";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

const formatTimeDistance = (date) => {
  if (!date) return "N/A";
  const diff = Math.floor((new Date() - new Date(date)) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const FleetTrackingTable = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBoy, setSelectedBoy] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const queryParams = useMemo(() => ({ page, limit: pageSize }), [page, pageSize]);

  // Perf audit Phase 8: migrated to React Query — same 30s poll interval,
  // preserved exactly as-is (not gated on tab visibility here, matching
  // the original; that's a separate, not-yet-done Phase 9 item).
  const { data: queryData, isLoading, isFetching, isError } = useQuery({
    queryKey: ["admin", "activeFleet", queryParams],
    queryFn: async () => {
      const response = await adminApi.getActiveFleet(queryParams);
      const payload = response.data.result || {};
      const data = Array.isArray(payload.items) ? payload.items : response.data.results || [];
      return {
        items: data,
        total: typeof payload.total === "number" ? payload.total : data.length,
        page: typeof payload.page === "number" ? payload.page : queryParams.page,
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (isError) {
      console.error("Fetch Fleet Error");
      toast.error("Failed to fetch live fleet data");
    }
  }, [isError]);

  const fleet = queryData?.items ?? [];
  const total = queryData?.total ?? 0;

  const filteredFleet = fleet.filter(
    (item) =>
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.deliveryBoy.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const columns = [
    {
      header: 'Order ID',
      key: 'id',
      cell: (item) => <span className="text-sm font-bold leading-none text-slate-900">{item.id}</span>,
    },
    {
      header: 'Delivery Boy',
      key: 'deliveryBoy',
      cell: (item) => (
        <button
          onClick={() => setSelectedBoy(item.deliveryBoy)}
          className="text-left transition-colors hover:text-primary focus:outline-none"
        >
          <p className="text-sm font-bold text-slate-900 underline decoration-slate-300 decoration-dotted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary">
            {item.deliveryBoy.name}
          </p>
          <p className="text-xs font-medium text-primary">{item.deliveryBoy.phone}</p>
        </button>
      ),
    },
    {
      header: 'Route',
      key: 'route',
      align: 'center',
      cell: (item) => (
        <div className="flex items-center justify-center gap-3 text-slate-600">
          <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {item.seller.name}
          </span>
          <HiOutlineArrowRight className="text-slate-300" />
          <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {item.customer.name}
          </span>
        </div>
      ),
    },
    {
      header: 'Customer',
      key: 'customer',
      cell: (item) => (
        <div>
          <p className="text-sm font-bold text-slate-900">{item.customer.name}</p>
          <p className="text-xs font-medium text-slate-500">{item.customer.phone}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      cell: (item) => (
        <Badge variant={item.status === "On the Way" ? "info" : item.status === "At Pickup" ? "warning" : "primary"}>
          {item.status}
        </Badge>
      ),
    },
    {
      header: 'Last Update',
      key: 'lastUpdate',
      align: 'right',
      cell: (item) => (
        <span className="whitespace-nowrap text-xs font-medium text-slate-500">
          {formatTimeDistance(item.lastUpdate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fleet Tracking"
        description="Monitor all active delivery assignments in real-time."
      />

      <FilterBar
        left={
          <div className="relative w-full sm:w-80">
            <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Order or Partner..."
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filteredFleet}
        rowKey={(item) => item.id}
        loading={isFetching}
        emptyState={
          <EmptyState
            icon={<HiOutlineTruck className="h-6 w-6" />}
            title="No active missions"
            description="No active missions matching your search."
          />
        }
      />

      <Pagination
        page={queryData?.page ?? page}
        totalPages={Math.ceil(total / pageSize) || 1}
        total={total}
        pageSize={pageSize}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        loading={isFetching}
      />

      {/* Delivery Boy Detail Modal */}
      <AnimatePresence>
        {selectedBoy && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBoy(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            >
              <div className="relative h-28 bg-slate-900">
                <div className="absolute right-4 top-4 z-10">
                  <button
                    onClick={() => setSelectedBoy(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20"
                  >
                    <HiOutlineXMark className="h-5 w-5" />
                  </button>
                </div>
                <div className="absolute -bottom-12 left-6">
                  <div className="h-24 w-24 overflow-hidden rounded-xl border-4 border-white shadow-lg">
                    <img
                      src={selectedBoy.image}
                      alt={selectedBoy.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-4 pb-6 pt-16">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedBoy.name}</h2>
                  <div className="mt-1 flex items-center gap-2 text-sm font-bold text-primary">
                    <HiOutlineIdentification className="h-4 w-4" />
                    ID: {selectedBoy.id}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Rating</p>
                    <div className="flex items-center gap-1.5 font-bold text-warning">
                      <HiOutlineStar className="h-4 w-4 fill-warning" />
                      {selectedBoy.rating}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Joined</p>
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      <HiOutlineCalendarDays className="h-4 w-4 text-slate-400" />
                      {selectedBoy.joined}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <HiOutlinePhone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest leading-none text-slate-400">Mobile Number</p>
                      <p className="font-bold text-slate-900">{selectedBoy.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <HiOutlineTruck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest leading-none text-slate-400">Vehicle Details</p>
                      <p className="font-bold text-slate-900">{selectedBoy.vehicle}</p>
                    </div>
                  </div>
                </div>

                <Button className="w-full">
                  View Full Profile
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FleetTrackingTable;
