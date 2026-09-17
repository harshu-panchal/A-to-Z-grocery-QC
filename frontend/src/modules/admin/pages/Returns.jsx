import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import EmptyState from "@shared/components/ui/EmptyState";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import { adminApi } from "../services/adminApi";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlineArrowPath,
  HiOutlineInboxStack,
  HiOutlineEye,
  HiOutlineCalendarDays,
  HiOutlineTruck,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
} from "react-icons/hi2";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";

const Returns = () => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("All");
  const [activeQcTab, setActiveQcTab] = useState("QC Requested");
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, mode: null });
  const [actionNote, setActionNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [assigningPickup, setAssigningPickup] = useState(false);

  const tabs = [
    "All",
    "Requested",
    "Approved",
    "Rejected",
    "Pickup Assigned",
    "In Transit",
    "Quality Check",
    "Completed",
  ];

  const qcTabs = ["QC Requested", "QC Passed", "QC Failed"];

  const mapReturnStatusLabel = (status) => {
    switch (status) {
      case "return_requested":
        return "Requested";
      case "return_approved":
        return "Approved";
      case "return_rejected":
        return "Rejected";
      case "return_pickup_assigned":
        return "Pickup Assigned";
      case "return_in_transit":
      case "return_drop_pending":
        return "In Transit";
      case "returned":
        return "QC Requested";
      case "qc_passed":
        return "QC Passed";
      case "qc_failed":
        return "QC Failed";
      case "refund_completed":
        return "Completed";
      default:
        return status || "Unknown";
    }
  };

  const getStatusVariant = (status) => {
    switch (status) {
      case "return_requested":
        return "warning";
      case "return_approved":
        return "info";
      case "return_rejected":
        return "danger";
      case "return_pickup_assigned":
      case "return_in_transit":
      case "return_drop_pending":
        return "secondary";
      case "returned":
      case "qc_passed":
        return "success";
      case "qc_failed":
        return "danger";
      case "refund_completed":
        return "success";
      default:
        return "secondary";
    }
  };

  const returnsQueryKey = ["admin", "returns"];
  const { data: returns = [], isLoading: loading, isError } = useQuery({
    queryKey: returnsQueryKey,
    queryFn: async () => {
      const res = await adminApi.getReturns();
      const payload = res.data.result || {};
      const items = Array.isArray(payload.items)
        ? payload.items
        : res.data.results || [];
      return items || [];
    },
  });

  useEffect(() => {
    if (isError) showToast("Failed to fetch return requests", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const fetchReturns = () => {
    queryClient.invalidateQueries({ queryKey: returnsQueryKey });
  };

  useEffect(() => {
    if (isDetailsOpen || actionModal.open) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    };
  }, [isDetailsOpen, actionModal.open]);

  const filteredReturns = useMemo(() => {
    if (activeTab === "All") return returns;
    return returns.filter((r) => {
      const label = mapReturnStatusLabel(r.returnStatus);
      if (activeTab === "Quality Check") {
        return label === activeQcTab;
      }
      return label === activeTab;
    });
  }, [returns, activeTab, activeQcTab]);

  const openDetails = (ret) => {
    setSelectedReturn(ret);
    setIsDetailsOpen(true);
  };

  const handleApprove = async (orderId) => {
    try {
      await adminApi.approveReturn(orderId, {});
      showToast("Return approved", "success");
      await fetchReturns();
    } catch (error) {
      console.error("Failed to approve return", error);
      showToast(
        error.response?.data?.message || "Failed to approve return",
        "error",
      );
    }
  };

  const handleReject = async () => {
    if (!actionNote.trim() || !selectedReturn) return;
    try {
      setSubmittingAction(true);
      await adminApi.rejectReturn(selectedReturn.orderId, { reason: actionNote });
      showToast("Return rejected", "success");
      setActionModal({ open: false, mode: null });
      setActionNote("");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to reject return", error);
      showToast(
        error.response?.data?.message || "Failed to reject return",
        "error",
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAssignPickup = async (orderId) => {
    try {
      setAssigningPickup(true);
      await adminApi.assignReturnDelivery(orderId, {});
      showToast("Riders notified for return pickup", "success");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to assign pickup", error);
      showToast(
        error.response?.data?.message || "No nearby riders found or assignment failed",
        "error",
      );
    } finally {
      setAssigningPickup(false);
    }
  };

  const handleQcPass = async (orderId) => {
    try {
      await adminApi.updateReturnQc(orderId, { qcStatus: "qc_passed" });
      showToast("QC passed. Refund processed.", "success");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to complete QC", error);
      showToast(
        error.response?.data?.message || "Failed to complete QC",
        "error",
      );
    }
  };

  const handleQcFail = async () => {
    if (!actionNote.trim() || !selectedReturn) return;
    try {
      setSubmittingAction(true);
      await adminApi.updateReturnQc(selectedReturn.orderId, {
        qcStatus: "qc_failed",
        note: actionNote,
      });
      showToast("QC failed recorded", "success");
      setActionModal({ open: false, mode: null });
      setActionNote("");
      setIsDetailsOpen(false);
      await fetchReturns();
    } catch (error) {
      console.error("Failed to record QC fail", error);
      showToast(
        error.response?.data?.message || "Failed to record QC fail",
        "error",
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Return Requests
            <Badge variant="secondary">Admin</Badge>
          </span>
        }
        description="Review, approve, and quality-check customer returns."
        actions={
          <Button onClick={fetchReturns} variant="outline">
            <HiOutlineArrowPath className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Requested", icon: HiOutlineClock, color: "text-warning", bg: "bg-warning/10" },
              { label: "Approved", icon: HiOutlineCheckCircle, color: "text-info", bg: "bg-info/10" },
              { label: "QC Requested", icon: HiOutlineInboxStack, color: "text-primary", bg: "bg-primary/10" },
              { label: "Completed", icon: HiOutlineXCircle, color: "text-success", bg: "bg-success/10" },
            ].map((stat) => {
              const count = returns.filter(
                (r) => mapReturnStatusLabel(r.returnStatus) === stat.label,
              ).length;
              return (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={count}
                  icon={stat.icon}
                  color={stat.color}
                  bg={stat.bg}
                />
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]">
            <div className="scrollbar-hide overflow-x-auto border-b border-slate-100 bg-slate-50/30">
              <div className="flex min-w-max items-center px-3 sm:px-6">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative whitespace-nowrap px-3 py-3 text-xs font-bold transition-all sm:px-4 sm:py-3.5 sm:text-sm",
                      activeTab === tab
                        ? "text-primary"
                        : "text-slate-600 hover:text-slate-700",
                    )}
                  >
                    {tab}
                    {activeTab === tab && (
                      <motion.div
                        layoutId="returns-admin-tab-underline"
                        className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "Quality Check" && (
              <div className="scrollbar-hide overflow-x-auto border-b border-slate-100 bg-slate-50/10">
                <div className="flex min-w-max items-center px-3 sm:px-6">
                  {qcTabs.map((tab) => (
                    <button
                      key={`qc-${tab}`}
                      onClick={() => setActiveQcTab(tab)}
                      className={cn(
                        "relative whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-3",
                        activeQcTab === tab
                          ? "bg-primary/5 text-primary"
                          : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-700"
                      )}
                    >
                      {tab}
                      {activeQcTab === tab && (
                        <motion.div
                          layoutId="returns-qc-tab-underline"
                          className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 sm:p-4">
              {filteredReturns.length === 0 ? (
                <EmptyState
                  icon={<HiOutlineInboxStack className="h-6 w-6" />}
                  title="No return requests found"
                  description="You will see customer return requests here."
                />
              ) : (
                <div className="space-y-3">
                  {filteredReturns.map((ret) => (
                    <div
                      key={ret._id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50/40"
                    >
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => openDetails(ret)}
                      >
                        <p className="truncate text-xs font-black text-slate-900">
                          #{ret.orderId}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                          <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
                          {ret.returnRequestedAt
                            ? new Date(ret.returnRequestedAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            : "N/A"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-800">
                          {ret.customer?.name || "Customer"}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {ret.returnReason || "No reason provided"}
                        </p>
                        {(ret.returnStatus === "return_in_transit" || ret.returnStatus === "return_drop_pending" || ret.returnStatus === "return_pickup_assigned") && ret.returnDeliveryBoy && (
                          <div className="mt-2 flex w-fit items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1">
                            <HiOutlineTruck className="h-3 w-3 text-primary" />
                            <span className="text-[10px] font-bold text-primary">Rider: {ret.returnDeliveryBoy.name}</span>
                          </div>
                        )}
                        {(ret.returnStatus === "qc_passed" || ret.returnStatus === "qc_failed") && ret.returnQcNote && (
                          <div className="mt-2 flex w-fit max-w-[200px] items-start gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                            <HiOutlineInboxStack className="mt-0.5 h-3 w-3 text-slate-500" />
                            <span className="line-clamp-2 text-[10px] font-medium italic text-slate-600">QC: {ret.returnQcNote}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge variant={getStatusVariant(ret.returnStatus)}>
                          {mapReturnStatusLabel(ret.returnStatus)}
                        </Badge>
                        <p className="text-xs font-black text-slate-900">
                          {"₹"}{ret.returnRefundAmount || ret.pricing?.subtotal || 0}
                        </p>
                        <button
                          onClick={() => openDetails(ret)}
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                        >
                          <HiOutlineEye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {isDetailsOpen && selectedReturn && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-none p-4 pointer-events-auto sm:p-6 lg:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsDetailsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 2rem)' }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Return for Order #{selectedReturn.orderId}
                  </h3>
                  <div className="mt-0.5 flex items-center space-x-2">
                    <Badge variant={getStatusVariant(selectedReturn.returnStatus)}>
                      {mapReturnStatusLabel(selectedReturn.returnStatus)}
                    </Badge>
                  </div>
                </div>
                <button
                  onClick={() => setIsDetailsOpen(false)}
                  className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Customer
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedReturn.customer?.name || "Customer"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedReturn.customer?.phone || ""}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Return Details
                  </p>
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-800">
                      Reason: <span className="font-medium text-slate-600">{selectedReturn.returnReason || "N/A"}</span>
                    </p>
                    {selectedReturn.returnReasonDetail && (
                      <p className="border-l-2 border-slate-300 pl-2 text-sm italic text-slate-700">
                        {selectedReturn.returnReasonDetail}
                      </p>
                    )}
                    {selectedReturn.returnConditionAssurance !== undefined && (
                      <div className="flex items-start gap-1.5 pt-1">
                        <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", selectedReturn.returnConditionAssurance ? 'bg-success' : 'bg-slate-300')} />
                        <p className="text-xs font-semibold text-slate-600">
                          {selectedReturn.returnConditionAssurance ? "Customer confirmed proper accessories & good condition." : "Customer did NOT confirm condition."}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedReturn.returnImages?.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                        Customer Photos ({selectedReturn.returnImages.length})
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {selectedReturn.returnImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-square w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 hover:border-slate-400" onClick={() => window.open(img, '_blank')}>
                            <img src={img} alt={`Return ${idx}`} className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedReturn.returnRejectedReason && (
                    <p className="text-xs font-semibold text-danger">
                      Rejection reason: {selectedReturn.returnRejectedReason}
                    </p>
                  )}
                  {selectedReturn.returnQcNote && (
                    <p className="text-xs font-semibold text-slate-600">
                      QC note: {selectedReturn.returnQcNote}
                    </p>
                  )}
                </div>

                {/* Tracking Info Section */}
                {(selectedReturn.returnStatus === "return_pickup_assigned" ||
                  selectedReturn.returnStatus === "return_in_transit" ||
                  selectedReturn.returnStatus === "return_drop_pending") && selectedReturn.returnDeliveryBoy && (
                    <div className="space-y-2 rounded-xl border border-primary/10 bg-primary/5 p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                          <HiOutlineTruck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-black uppercase tracking-widest leading-none text-primary">Rider Assigned</p>
                          <p className="text-sm font-bold leading-none text-slate-900">{selectedReturn.returnDeliveryBoy.name}</p>
                        </div>
                      </div>
                      {selectedReturn.returnDeliveryBoy.phone && (
                        <a
                          href={`tel:${selectedReturn.returnDeliveryBoy.phone}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-[11px] font-bold text-primary shadow-sm transition-colors hover:bg-primary/10"
                        >
                          📞 {selectedReturn.returnDeliveryBoy.phone}
                        </a>
                      )}
                      {selectedReturn.returnStatus === "return_drop_pending" && (
                        <p className="mt-1 rounded-lg bg-white/50 p-2 text-[10px] font-bold italic text-primary">
                          Rider is at the seller location. Sharing the OTP will confirm the drop.
                        </p>
                      )}
                    </div>
                  )}

                {/* QC Info Section */}
                {(selectedReturn.returnStatus === "qc_passed" || selectedReturn.returnStatus === "qc_failed") && (
                  <div className={cn("space-y-2 rounded-xl border p-4", selectedReturn.returnStatus === "qc_passed" ? "border-success/20 bg-success/10" : "border-danger/20 bg-danger/10")}>
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", selectedReturn.returnStatus === "qc_passed" ? "bg-success" : "bg-danger")}>
                        <HiOutlineInboxStack className="h-5 w-5" />
                      </div>
                      <div>
                        <p className={cn("mb-1 text-[10px] font-black uppercase tracking-widest leading-none", selectedReturn.returnStatus === "qc_passed" ? "text-success" : "text-danger")}>Quality Check Results</p>
                        <p className="text-sm font-bold leading-none text-slate-900">
                          {selectedReturn.returnStatus === "qc_passed" ? "QC Passed" : "QC Failed"}
                        </p>
                      </div>
                    </div>
                    {selectedReturn.returnQcNote && (
                      <div className="rounded-lg border border-black/5 bg-white/60 p-3">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">QC Decision Note:</p>
                        <p className="text-sm italic leading-relaxed text-slate-800">
                          "{selectedReturn.returnQcNote}"
                        </p>
                      </div>
                    )}
                    {selectedReturn.returnQcAt && (
                      <p className="text-[10px] font-medium text-slate-500">
                        Reviewed on: {new Date(selectedReturn.returnQcAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Quality Check Comparison (2-Way) */}
                <div className="space-y-3 pt-2">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Product Comparison (QC)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex h-full flex-col space-y-1.5">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img
                          src={selectedReturn.items?.[0]?.image || "https://placehold.co/400x400/f8fafc/64748b?text=Original"}
                          alt="Original"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/60 to-transparent p-2">
                          <p className="text-[9px] font-black uppercase leading-none text-white">Listing</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex h-full flex-col space-y-1.5">
                      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {selectedReturn.returnPickupImages?.[0] ? (
                          <img
                            src={selectedReturn.returnPickupImages[0]}
                            alt="Return Pickup"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 px-3 text-center text-slate-400">
                            <HiOutlineInboxStack className="h-5 w-5" />
                            <p className="text-[8px] font-bold uppercase leading-tight">Not Picked Yet</p>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-success/80 to-transparent p-2">
                          <p className="text-[9px] font-black uppercase leading-none text-white">Return</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {selectedReturn.returnPickupCondition && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className={cn("h-2 w-2 rounded-full", selectedReturn.returnPickupCondition === 'good' ? 'bg-success' : selectedReturn.returnPickupCondition === 'damaged' ? 'bg-danger' : 'bg-warning')} />
                      <p className="text-[11px] font-bold text-slate-600">
                        Rider Condition Report: <span className="uppercase text-slate-900">{selectedReturn.returnPickupCondition}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Items
                  </p>
                  <div className="space-y-2">
                    {(selectedReturn.returnItems || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-xs font-black text-slate-900">
                          {"₹"}{item.price * item.quantity}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Payment Breakdown
                  </p>
                  <p className="text-xs text-slate-700">
                    Product refund:{" "}
                    <span className="font-black">
                      {"₹"}{selectedReturn.returnRefundAmount || selectedReturn.pricing?.subtotal || 0}
                    </span>
                  </p>
                  <p className="text-xs text-slate-700">
                    Return delivery commission:{" "}
                    <span className="font-black">
                      {"₹"}{selectedReturn.returnDeliveryCommission || 0}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col justify-end gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsDetailsOpen(false)}
                    className="rounded-xl px-6 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100"
                  >
                    Close
                  </button>

                  {selectedReturn.returnStatus === "return_requested" && (
                    <>
                      <Button
                        variant="danger"
                        onClick={() => setActionModal({ open: true, mode: "reject" })}
                      >
                        Reject Request
                      </Button>
                      <Button
                        onClick={() => handleApprove(selectedReturn.orderId)}
                      >
                        Approve Return
                      </Button>
                    </>
                  )}

                  {selectedReturn.returnStatus === "return_approved" && (
                    <Button
                      disabled={assigningPickup}
                      isLoading={assigningPickup}
                      onClick={() => handleAssignPickup(selectedReturn.orderId)}
                    >
                      {!assigningPickup && <HiOutlineInboxStack className="h-4 w-4" />}
                      Assign Pickup
                    </Button>
                  )}

                  {selectedReturn.returnStatus === "returned" && (
                    <>
                      <Button
                        variant="danger"
                        onClick={() => setActionModal({ open: true, mode: "qc_fail" })}
                      >
                        QC Failed
                      </Button>
                      <Button
                        variant="primary"
                        className="bg-success hover:bg-success/90"
                        onClick={() => handleQcPass(selectedReturn.orderId)}
                      >
                        QC Passed
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionModal.open && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => !submittingAction && setActionModal({ open: false, mode: null })}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative z-10 w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            >
              <h3 className="text-xl font-black text-slate-900">
                {actionModal.mode === "qc_fail" ? "QC Failed" : "Reject Return"}
              </h3>
              <p className="text-sm font-medium text-slate-600">
                {actionModal.mode === "qc_fail"
                  ? "Add a note for QC failure. This will be visible to the customer."
                  : "Please provide a reason for rejecting this return request."}
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Note
                </label>
                <textarea
                  className="w-full resize-none rounded-xl border border-slate-200 p-3.5 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  rows={4}
                  placeholder="e.g. Item damaged or mismatch with return request..."
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setActionModal({ open: false, mode: null })}
                  disabled={submittingAction}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={actionModal.mode === "qc_fail" ? handleQcFail : handleReject}
                  isLoading={submittingAction}
                  disabled={!actionNote.trim() || submittingAction}
                >
                  Submit
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Returns;
