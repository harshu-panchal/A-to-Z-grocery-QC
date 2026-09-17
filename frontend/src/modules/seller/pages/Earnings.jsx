import React from "react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import PageHeader from "@shared/components/ui/PageHeader";
import ChartCard from "@shared/components/ui/ChartCard";
import { SkeletonCard } from "@shared/components/ui/Skeleton";
import {
  TrendingUp,
  DollarSign,
  Download,
  Banknote,
  ArrowDownToLine,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading, refreshEarnings } = useSellerEarnings();
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
  const [isWithdrawing, setIsWithdrawing] = React.useState(false);

  React.useEffect(() => {
    if (data?.balances != null && withdrawAmount === "") {
      const settled = Number(data.balances?.settledBalance ?? 0);
      setWithdrawAmount(settled > 0 ? String(settled) : "");
    }
  }, [data?.balances]);

  const handleWithdraw = () => {
    const totalBalance = Number(data?.balances?.settledBalance ?? 0);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > totalBalance) {
      alert(
        "Please enter a valid amount between ₹0.01 and ₹" +
        totalBalance.toLocaleString(),
      );
      return;
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      alert(
        `Withdrawal request of ₹${amount.toLocaleString()} submitted successfully!`,
      );
    }, 1500);
  };

  const exportReport = () => {
    alert("Exporting monthly earnings report as PDF (Simulation)");
  };

  const monthlyChart = Array.isArray(data?.monthlyChart) ? data.monthlyChart : [];

  const handleDownloadLedger = () => {
    const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
    if (ledger.length === 0) {
      toast.info("No transactions to export.");
      return;
    }
    const exportData = ledger.map((txn) => ({
      id: txn.id ?? txn.ref ?? "",
      type: txn.type ?? "",
      amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
      status: txn.status ?? "",
      date: txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ""),
      customer: txn.customer ?? "",
      ref: txn.ref ?? "",
    }));
    exportToCSV(exportData, "Seller_Earnings_Report", {
      id: "Transaction ID",
      type: "Type",
      amount: "Amount",
      status: "Status",
      date: "Date",
      customer: "Customer",
      ref: "Reference",
    });
    toast.success("Earnings report downloaded successfully!");
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Earnings" description="Track your revenue, withdrawals, and available balance." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Earnings"
        description="Track your revenue, withdrawals, and how much balance is available to cash out."
        actions={
          <>
            <Button onClick={handleDownloadLedger} variant="outline">
              <Download className="h-4 w-4" />
              Download Report
            </Button>
            <Button onClick={() => navigate("/seller/withdrawals")} variant="primary">
              Withdraw Funds
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Single deliberate accent card for this page, per the design system's callout rule */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-4 text-white shadow-[0_4px_18px_rgba(15,23,42,0.18)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Total Revenue</p>
              <h3 className="mt-1.5 text-3xl font-black">₹{Number(data?.balances?.totalRevenue ?? 0).toLocaleString()}</h3>
            </div>
            <div className="rounded-lg bg-white/20 p-2.5">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="mt-5 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
            <TrendingUp className="h-3.5 w-3.5" />
            Real-time earnings data
          </div>
        </div>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Total Withdrawn</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                ₹{Number(data?.balances?.totalWithdrawn ?? 0).toLocaleString()}
              </h2>
            </div>
            <div className="rounded-lg bg-primary/10 p-2">
              <Banknote className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
              <ArrowDownToLine className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Available to Withdraw</p>
              <p className="text-sm font-black text-slate-900">
                ₹{Number(data?.balances?.settledBalance ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <ChartCard
        title="Monthly Revenue Performance"
        height={280}
        isEmpty={monthlyChart.length === 0}
        emptyMessage="No monthly revenue data yet."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `₹${value}`} />
            <Tooltip
              cursor={{ fill: "#f8fafc" }}
              contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontSize: "12px", fontWeight: "700" }}
              formatter={(value) => [`₹${value.toLocaleString()}`, "Revenue"]}
            />
            <Bar dataKey="revenue" fill="url(#colorRevenue)" radius={[6, 6, 0, 0]} barSize={36} />
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={1} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={1} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Banknote className="h-8 w-8 text-primary" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Withdraw Funds
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Available Balance:{" "}
                <span className="text-primary font-bold">
                  ₹{Number(data?.balances?.settledBalance ?? 0).toLocaleString()}
                </span>
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      className="w-full pl-8 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Select Bank Account
                  </label>
                  <div className="p-3.5 border border-slate-200 rounded-lg flex items-center gap-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group">
                    <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">
                        HDFC Bank **** 4589
                      </p>
                      <p className="text-xs text-slate-500 font-bold">
                        Primary Account
                      </p>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-slate-200 group-hover:border-primary group-hover:bg-primary transition-all"></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="py-2.5 rounded-lg font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    setIsWithdrawModalOpen(false);
                    alert("Withdrawal request submitted!");
                  }}
                  className="py-2.5 rounded-lg bg-primary text-white font-black shadow-sm shadow-primary/30 hover:bg-primary/90 transition-all">
                  CONFIRM
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Earnings;
