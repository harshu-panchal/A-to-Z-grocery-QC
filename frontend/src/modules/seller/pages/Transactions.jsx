import React, { useState, useMemo } from "react";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import FilterBar from "@shared/components/ui/FilterBar";
import DataTable from "@shared/components/ui/DataTable";
import Pagination from "@shared/components/ui/Pagination";
import { SkeletonStatCard, SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  HiOutlineCreditCard,
  HiOutlineArrowDownTray,
  HiOutlineMagnifyingGlass,
  HiOutlineDocumentText,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineArrowUpRight,
  HiOutlineArrowDownLeft,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";

const Transactions = () => {
  const { earningsData: data, earningsLoading: loading } = useSellerEarnings();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const stats = [
    {
      label: "Settled Balance",
      value: `₹${(data?.balances?.settledBalance || 0).toLocaleString()}`,
      icon: HiOutlineBanknotes,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Pending Payouts",
      value: `₹${(data?.balances?.pendingPayouts || 0).toLocaleString()}`,
      icon: HiOutlineClock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Total Revenue",
      value: `₹${(data?.balances?.totalRevenue || 0).toLocaleString()}`,
      icon: HiOutlineCreditCard,
      color: "text-success",
      bg: "bg-success/10",
    },
  ];

  const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
  const filteredTransactions = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const result = ledger.filter((txn) => {
      if (!term && activeTab === "All") return true;
      const id = (txn.id ?? txn.ref ?? "").toString().toLowerCase();
      const customer = (txn.customer ?? "").toString().toLowerCase();
      const ref = (txn.ref ?? "").toString().toLowerCase();
      const status = (txn.status ?? "").toString().toLowerCase();
      const type = (txn.type ?? "").toString().toLowerCase();
      const amount = Math.abs(Number(txn.amount ?? 0)).toString();
      const matchesSearch =
        !term ||
        id.includes(term) ||
        customer.includes(term) ||
        ref.includes(term) ||
        status.includes(term) ||
        type.includes(term) ||
        amount.includes(term);
      const txnType = (txn.type ?? "").toString();
      const matchesType = activeTab === "All" || txnType === activeTab;
      return matchesSearch && matchesType;
    });
    const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
    if (page > totalPages) {
      setPage(1);
    }
    return result;
  }, [searchTerm, activeTab, ledger, page, pageSize]);

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredTransactions.slice(start, end);
  }, [filteredTransactions, page, pageSize]);

  const handleDownloadReceipt = (txn) => {
    try {
      const record = {
        id: txn.id ?? txn.ref ?? "",
        type: txn.type ?? "",
        amount: `₹${Math.abs(Number(txn.amount ?? 0)).toLocaleString()}`,
        status: txn.status ?? "",
        date:
          txn.date ??
          (txn.createdAt
            ? new Date(txn.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : ""),
        time:
          txn.time ??
          (txn.createdAt
            ? new Date(txn.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""),
        customer: txn.customer ?? "",
        ref: txn.ref ?? "",
      };
      exportToCSV([record], `Transaction_${record.id || "receipt"}`, {
        id: "Transaction ID",
        type: "Type",
        amount: "Amount",
        status: "Status",
        date: "Date",
        time: "Time",
        customer: "Customer/Recipient",
        ref: "Reference",
      });
      toast.success("Receipt downloaded");
    } catch (error) {
      console.error("Receipt download error:", error);
      toast.error("Failed to download receipt");
    }
  };

  const handleDownloadStatements = () => {
    setIsDownloading(true);
    try {
      const exportData = filteredTransactions.map((txn) => ({
        id: txn.id ?? txn.ref ?? "",
        type: txn.type ?? "",
        amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
        status: txn.status ?? "",
        date: txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ""),
        time: txn.time ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""),
        customer: txn.customer ?? "",
        ref: txn.ref ?? "",
      }));

      exportToCSV(exportData, "Seller_Transactions", {
        id: "Transaction ID",
        type: "Type",
        amount: "Amount",
        status: "Status",
        date: "Date",
        time: "Time",
        customer: "Customer",
        ref: "Reference"
      });
      toast.success("Statement downloaded successfully!");
    } catch (error) {
      console.error("Download Error:", error);
      toast.error("Failed to download statement");
    } finally {
      setIsDownloading(false);
    }
  };

  const txnColumns = [
    {
      header: "Transaction Details",
      key: "details",
      cell: (txn) => (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              txn.amount > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            )}
          >
            {txn.amount > 0 ? <HiOutlineArrowDownLeft className="h-4.5 w-4.5" /> : <HiOutlineArrowUpRight className="h-4.5 w-4.5" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{txn.id ?? txn.ref ?? "—"}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{txn.type ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Reference",
      key: "reference",
      cell: (txn) => (
        <div>
          <p className="text-xs font-bold text-slate-900">{txn.customer ?? "—"}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant="outline">{txn.ref ?? "—"}</Badge>
            <span className="text-[10px] font-medium text-slate-400">
              {txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "—")} • {txn.time ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—")}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Amount",
      key: "amount",
      cell: (txn) => (
        <div>
          <p className={cn("text-sm font-black tracking-tight", Number(txn.amount ?? 0) > 0 ? "text-success" : "text-danger")}>
            {Number(txn.amount ?? 0) > 0 ? "+" : ""}₹{Math.abs(Number(txn.amount ?? 0)).toLocaleString()}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            Settlement: {(txn.status ?? "") === "Settled" ? "Complete" : "T+2"}
          </p>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      cell: (txn) => (
        <Badge variant={txn.status === "Settled" ? "success" : txn.status === "Pending" || txn.status === "Processing" ? "warning" : "secondary"}>
          {txn.status === "Settled" ? <HiOutlineCheckCircle className="h-3 w-3" /> : <HiOutlineClock className="h-3 w-3" />}
          {txn.status}
        </Badge>
      ),
    },
    {
      header: "Actions",
      key: "actions",
      align: "right",
      cell: (txn) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownloadReceipt(txn);
          }}
          className="rounded-lg p-2 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary"
        >
          <HiOutlineArrowDownTray className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Transaction Ledger
            <Badge variant="primary">Audit Trail</Badge>
          </span>
        }
        description="Keep track of all financial movements, payouts, and settlements."
        actions={
          <Button onClick={handleDownloadStatements} isLoading={isDownloading} disabled={filteredTransactions.length === 0}>
            <HiOutlineDocumentText className="h-4 w-4" />
            {isDownloading ? "Downloading..." : "Download Statements"}
          </Button>
        }
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

          <FilterBar
            left={
              <div className="relative w-full sm:w-72">
                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by customer, reference, or amount..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            }
            pills={["All", "Order Payment", "Withdrawal", "Refund"].map((tab) => ({
              label: tab === "Order Payment" ? "Payments" : tab,
              active: activeTab === tab,
              onClick: () => setActiveTab(tab),
            }))}
          />

          <DataTable
            columns={txnColumns}
            data={paginatedTransactions}
            rowKey={(txn, idx) => txn.id || txn.ref || txn.reference || `txn-${idx}`}
            onRowClick={(txn) => {
              setSelectedTxn(txn);
              setIsDetailModalOpen(true);
            }}
            emptyState={
              <div className="py-12 text-center text-sm text-slate-400">
                {ledger.length === 0 ? "No transactions yet." : "No matches for your search or filter."}
              </div>
            }
          />

          {filteredTransactions.length > 0 && (
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(filteredTransactions.length / pageSize))}
              total={filteredTransactions.length}
              pageSize={pageSize}
              onPageChange={(newPage) => setPage(newPage)}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              loading={loading}
            />
          )}
        </>
      )}

      {/* Transaction Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title="Transaction Receipt">
        {selectedTxn && (
          <div className="space-y-5">
            <div className="text-center p-5 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Total Amount</p>
              <h2 className={cn("text-3xl font-black tracking-tight", Number(selectedTxn.amount ?? 0) > 0 ? "text-success" : "text-danger")}>
                {Number(selectedTxn.amount ?? 0) > 0 ? "+" : ""}₹{Math.abs(Number(selectedTxn.amount ?? 0)).toLocaleString()}
              </h2>
              <Badge variant={selectedTxn.status === "Settled" ? "success" : "warning"} className="mt-3">
                {selectedTxn.status ?? "—"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Transaction ID</span>
                <span className="font-bold text-slate-900">{selectedTxn.id ?? selectedTxn.ref ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Type</span>
                <span className="font-bold text-slate-900">{selectedTxn.type ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Customer/Recipient</span>
                <span className="font-bold text-slate-900">{selectedTxn.customer ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Reference</span>
                <span className="font-bold text-slate-900">{selectedTxn.ref ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Date & Time</span>
                <span className="font-bold text-slate-900">
                  {selectedTxn.date && selectedTxn.time
                    ? `${selectedTxn.date} at ${selectedTxn.time}`
                    : selectedTxn.createdAt
                      ? `${new Date(selectedTxn.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} at ${new Date(selectedTxn.createdAt).toLocaleTimeString()}`
                      : "—"}
                </span>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl bg-warning/10 border border-warning/20 p-3.5">
              <HiOutlineClock className="h-5 w-5 shrink-0 text-warning" />
              <p className="text-xs font-medium leading-relaxed text-slate-600">
                This transaction is scheduled for settlement in your bank account via T+2 rolling cycle. Settlements usually occur before 6:00 PM.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => window.print()}>
                Print Receipt
              </Button>
              <Button onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Transactions;
