import React, { useState, useMemo } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import Pagination from "@shared/components/ui/Pagination";
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import {
    Wallet,
    ArrowUpRight,
    Clock,
    CheckCircle2,
    XCircle,
    History,
    Download,
    Building2,
    Info,
    ArrowRight,
    Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import { useSellerEarnings } from "../context/SellerEarningsContext";

const Withdrawals = () => {
    const { earningsData: data, earningsLoading: loading, refreshEarnings } = useSellerEarnings();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
    const withdrawalHistory = ledger.filter((t) => (t.type || '').toString() === 'Withdrawal');

    const filteredHistory = useMemo(() => {
        const term = searchTerm.toLowerCase();
        const result = withdrawalHistory.filter((item) => {
            const id = (item.id ?? item.ref ?? '').toString().toLowerCase();
            const status = (item.status ?? '').toString().toLowerCase();
            const method = (item.method ?? item.customer ?? '').toString().toLowerCase();
            const amount = Math.abs(Number(item.amount ?? 0)).toString();
            return (
                !term ||
                id.includes(term) ||
                status.includes(term) ||
                method.includes(term) ||
                amount.includes(term)
            );
        });
        // Reset page if out of range
        const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
        if (page > totalPages) {
            setPage(1);
        }
        return result;
    }, [withdrawalHistory, searchTerm, page, pageSize]);

    const paginatedHistory = useMemo(() => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return filteredHistory.slice(start, end);
    }, [filteredHistory, page, pageSize]);

    const handleDownloadReceipt = (item) => {
        const id = item.id || item.ref || item.reference || 'withdrawal';
        const lines = [];
        lines.push('Withdrawal Receipt');
        lines.push(`ID,${id}`);
        lines.push(`Status,${item.status ?? ''}`);
        lines.push(`Date,${item.date ?? ''}`);
        lines.push(`Time,${item.time ?? ''}`);
        lines.push(`Amount,₹${Math.abs(item.amount ?? 0).toLocaleString()}`);
        lines.push(`Method,${item.customer ?? 'Bank Transfer'}`);
        if (item.reason) {
            lines.push(`Reason,${item.reason}`);
        }
        const csvContent = lines.join('\n');
        const blob = new Blob(["﻿" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `withdrawal-receipt-${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Receipt downloaded');
    };

    const handleSubmitRequest = async (e) => {
        e.preventDefault();
        const settled = Number(data?.balances?.settledBalance ?? 0);
        const pending = Math.abs(Number(data?.balances?.pendingPayouts ?? 0));
        const available = Math.max(0, settled - pending);

        if (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > available) {
            toast.error(`Please enter a valid amount within your available balance (₹${available}).`);
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await sellerApi.requestWithdrawal({ amount: parseFloat(amount) });
            if (response.data.success) {
                toast.success('Withdrawal request submitted successfully!');
                setIsModalOpen(false);
                setAmount('');
                refreshEarnings();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to submit request");
        } finally {
            setIsSubmitting(false);
        }
    };

    const balances = {
        available: Number(data?.balances?.availableBalance ?? 0),
        onHold: Number(data?.balances?.onHoldBalance ?? 0),
        pending: Math.abs(Number(data?.balances?.pendingPayouts ?? 0)),
        lastWithdrawal: Math.abs(withdrawalHistory[0]?.amount ?? 0),
    };

    const historyColumns = [
        {
            header: 'Request Details',
            key: 'details',
            cell: (item) => (
                <div>
                    <p className="text-sm font-bold text-slate-900">{item.id}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">{item.date} • {item.time}</p>
                </div>
            ),
        },
        {
            header: 'Amount',
            key: 'amount',
            cell: (item) => <span className="text-sm font-bold text-slate-900">₹{Math.abs(item.amount).toLocaleString()}</span>,
        },
        {
            header: 'Status',
            key: 'status',
            align: 'center',
            cell: (item) => (
                <div>
                    <Badge variant={item.status === 'Settled' ? 'success' : (item.status === 'Pending' || item.status === 'Processing') ? 'warning' : 'danger'}>
                        {item.status === 'Settled' ? <CheckCircle2 className="h-3 w-3" /> : (item.status === 'Pending' || item.status === 'Processing') ? <Clock className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {item.status}
                    </Badge>
                    {item.reason && <p className="mt-1 text-[10px] font-medium italic text-danger">{item.reason}</p>}
                </div>
            ),
        },
        {
            header: 'Method',
            key: 'method',
            align: 'right',
            cell: (item) => (
                <div>
                    <p className="text-xs font-semibold text-slate-500">{item.customer}</p>
                    <button
                        type="button"
                        onClick={() => handleDownloadReceipt(item)}
                        className="ml-auto mt-1 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:text-primary/80"
                    >
                        Receipt <Download className="h-3 w-3" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Money Requests
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <Wallet className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Request payouts and track the status of every withdrawal you've made."
                actions={
                    <Button onClick={() => setIsModalOpen(true)}>
                        <ArrowUpRight className="h-4 w-4" />
                        New Request
                    </Button>
                }
            />

            {loading ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: 'Available Balance', value: `₹${balances.available.toLocaleString()}`, icon: Wallet, color: 'text-success', bg: 'bg-success/10', sub: 'Ready to withdraw' },
                            { label: 'On Hold', value: `₹${balances.onHold.toLocaleString()}`, icon: Clock, color: 'text-info', bg: 'bg-info/10', sub: 'Return window open' },
                            { label: 'Withdrawal Pending', value: `₹${balances.pending.toLocaleString()}`, icon: History, color: 'text-warning', bg: 'bg-warning/10', sub: 'Awaiting approval' },
                            { label: 'Last Withdrawal', value: `₹${balances.lastWithdrawal.toLocaleString()}`, icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10', sub: 'Sent to bank' },
                        ].map((stat, i) => (
                            <StatCard key={i} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} description={stat.sub} />
                        ))}
                    </div>

                    <FilterBar
                        left={
                            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                <History className="h-4 w-4 text-primary" />
                                Withdrawal History
                            </h2>
                        }
                        right={
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search ID or status..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                    />

                    <DataTable
                        columns={historyColumns}
                        data={paginatedHistory}
                        rowKey={(item, idx) => item.id || item.ref || item.reference || `wd-${idx}`}
                        emptyState={
                            <div className="py-12 text-center text-sm text-slate-400">
                                {withdrawalHistory.length === 0 ? "No withdrawal requests yet." : "No matches for your search."}
                            </div>
                        }
                    />

                    {filteredHistory.length > 0 && (
                        <Pagination
                            page={page}
                            totalPages={Math.max(1, Math.ceil(filteredHistory.length / pageSize))}
                            total={filteredHistory.length}
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

            {/* Request Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => !isSubmitting && setIsModalOpen(false)}
                title="Request Withdrawal"
            >
                <form onSubmit={handleSubmitRequest} className="space-y-5">
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Available to Withdraw</p>
                            <h4 className="text-2xl font-black text-primary">₹{balances.available.toLocaleString()}</h4>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm">
                            <Info className="h-5 w-5 text-slate-300" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">Enter Amount</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">₹</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full rounded-md border border-slate-200 bg-white py-3 pl-10 pr-4 text-lg font-black outline-none transition-all placeholder:text-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div className="space-y-2.5 rounded-xl border border-primary/10 bg-primary/5 p-3.5">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">Transfer Destination</p>
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">
                                    <Building2 className="h-4.5 w-4.5 text-primary" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-900">HDFC Bank Limited</p>
                                    <p className="text-[10px] font-medium text-slate-500">Acct ending in **** 4589</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-300" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                        <Button type="submit" isLoading={isSubmitting} className="w-full">
                            Submit Request
                        </Button>
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            Nevermind, keep funds
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Withdrawals;
