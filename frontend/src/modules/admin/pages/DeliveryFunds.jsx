import React, { useState, useMemo, useEffect } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import Pagination from '@shared/components/ui/Pagination';
import {
    Search,
    Wallet,
    Banknote,
    ArrowUpRight,
    Clock,
    CheckCircle,
    XCircle,
    RotateCw,
    CreditCard,
    Landmark,
    FileText,
    ShieldCheck,
    MessageSquare,
    Users,
    Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const DELIVERY_FUNDS_QUERY_KEY = ['admin', 'deliveryFunds'];

function mapDeliveryTransfer(tx) {
    return {
        id: tx.reference?.length > 16 ? tx.reference.slice(0, 8) + '...' + tx.reference.slice(-5) : (tx.reference || 'N/A'),
        _id: tx._id,
        riderName: tx.user?.name || 'Unknown',
        riderId: tx.user?._id?.slice(-6).toUpperCase() || 'N/A',
        amount: Math.abs(tx.amount),
        status: tx.status?.toLowerCase() || 'pending',
        paymentMethod: 'Bank Transfer',
        accountInfo: tx.user?.documents?.bankDetails || 'No details',
        dateTime: new Date(tx.createdAt || tx.date).toLocaleString(),
        referenceId: tx.reference,
        type: tx.type
    };
}

const DeliveryFunds = () => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewingTxn, setViewingTxn] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce and
    // page-reset-on-filter-change behavior as before.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, filterStatus]);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (filterStatus !== 'all') params.status = filterStatus;
        return params;
    }, [page, pageSize, debouncedSearchTerm, filterStatus]);

    const { data: queryData, isLoading, isFetching, isError } = useQuery({
        queryKey: [...DELIVERY_FUNDS_QUERY_KEY, queryParams],
        queryFn: async () => {
            const response = await adminApi.getDeliveryTransactions(queryParams);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
            const mapped = data.map(mapDeliveryTransfer);
            return {
                items: mapped,
                total: typeof payload.total === 'number' ? payload.total : mapped.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) {
            console.error("Fetch Transactions Error");
            toast.error("Failed to load transactions");
        }
    }, [isError]);

    const transfers = queryData?.items ?? [];
    const total = queryData?.total ?? 0;

    const handleBulkSettle = async () => {
        if (!window.confirm("Are you sure you want to settle all pending transactions?")) return;
        setIsProcessing(true);
        try {
            await adminApi.bulkSettleDelivery();
            toast.success("Bulk settlement processed");
            queryClient.invalidateQueries({ queryKey: DELIVERY_FUNDS_QUERY_KEY });
        } catch (error) {
            toast.error("Bulk settlement failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSettleSingle = async (id) => {
        try {
            await adminApi.settleTransaction(id);
            toast.success("Transaction settled");
            queryClient.invalidateQueries({ queryKey: DELIVERY_FUNDS_QUERY_KEY });
        } catch (error) {
            toast.error("Settlement failed");
        }
    };

    const filteredTransfers = useMemo(() => {
        return transfers.filter(tx => {
            const matchesSearch = tx.riderName.toLowerCase().includes(searchTerm.toLowerCase()) || tx.referenceId.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filterStatus === 'all' || tx.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [transfers, searchTerm, filterStatus]);

    const stats = useMemo(() => {
        const settled = transfers.filter(tx => tx.status === 'settled').reduce((acc, tx) => acc + tx.amount, 0);
        const pending = transfers.filter(tx => tx.status === 'pending').reduce((acc, tx) => acc + tx.amount, 0);
        const float = transfers.reduce((acc, tx) => acc + tx.amount, 0);

        return [
            { label: 'Total Settled', value: `₹${settled.toLocaleString()}`, icon: Banknote, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Pending Payouts', value: `₹${pending.toLocaleString()}`, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
            { label: 'System Float', value: `₹${float.toLocaleString()}`, icon: Wallet, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Riders Involved', value: [...new Set(transfers.map(tx => tx.riderId))].length, icon: Users, color: 'text-info', bg: 'bg-info/10' },
        ];
    }, [transfers]);

    const columns = [
        {
            header: 'Transaction Node',
            key: 'txn',
            cell: (tx) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <ArrowUpRight className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <p className="text-xs font-black tracking-tight text-slate-900">{tx.id}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{tx.type}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Rider Entity',
            key: 'rider',
            cell: (tx) => (
                <div>
                    <p className="text-sm font-black text-slate-900">{tx.riderName}</p>
                    <span className="text-[10px] font-bold text-slate-400">{tx.riderId}</span>
                </div>
            ),
        },
        {
            header: 'Amount',
            key: 'amount',
            align: 'center',
            cell: (tx) => (
                <div className="flex flex-col items-center">
                    <p className="text-sm font-black text-slate-900">₹{tx.amount.toLocaleString()}</p>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{tx.paymentMethod}</span>
                </div>
            ),
        },
        {
            header: 'Gateway Status',
            key: 'status',
            cell: (tx) => (
                <div className="flex items-center gap-2">
                    {tx.status === 'settled' ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                    ) : tx.status === 'pending' ? (
                        <Clock className="h-4 w-4 shrink-0 text-warning" />
                    ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-danger" />
                    )}
                    <Badge variant={tx.status === 'settled' ? 'success' : tx.status === 'pending' ? 'warning' : 'danger'}>
                        {tx.status}
                    </Badge>
                </div>
            ),
        },
        {
            header: 'Ledger Details',
            key: 'actions',
            align: 'right',
            cell: (tx) => (
                <div className="flex items-center justify-end gap-1.5">
                    {tx.status === 'pending' && (
                        <button
                            onClick={() => handleSettleSingle(tx._id)}
                            title="Settle Transaction"
                            className="rounded-lg p-2 text-success transition-all hover:bg-success hover:text-white"
                        >
                            <CheckCircle className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        onClick={() => setViewingTxn(tx)}
                        className="rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-900 hover:text-white"
                    >
                        <Eye className="h-4 w-4" />
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
                        Funds Settlement
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Audit and execute secure fund transfers to your fleet partners."
                actions={
                    <Button onClick={handleBulkSettle} isLoading={isProcessing}>
                        {!isProcessing && <Banknote className="h-4 w-4" />}
                        {isProcessing ? 'Processing...' : 'Bulk Settle All'}
                    </Button>
                }
            />

            {isLoading && transfers.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {stats.map((stat, idx) => (
                            <StatCard key={idx} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
                        ))}
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-96">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Find transaction by ID or rider name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        pills={['all', 'completed', 'pending', 'failed'].map((status) => ({
                            label: status,
                            active: filterStatus === status,
                            onClick: () => setFilterStatus(status),
                        }))}
                    />

                    <DataTable
                        columns={columns}
                        data={filteredTransfers}
                        rowKey={(tx) => tx._id}
                        loading={isFetching && transfers.length > 0}
                        emptyState={
                            <EmptyState
                                icon={<FileText className="h-6 w-6" />}
                                title="No transactions found"
                                description="No transactions found for this period."
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
                </>
            )}

            {/* Detailed Transaction Modal (Receipt Style) */}
            <Modal isOpen={!!viewingTxn} onClose={() => setViewingTxn(null)} title="Ledger Entry" size="md">
                {viewingTxn && (
                    <div className="space-y-6">
                        {viewingTxn.status === 'pending' && (
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        handleSettleSingle(viewingTxn._id);
                                        setViewingTxn(null);
                                    }}
                                >
                                    Settle Now
                                </Button>
                            </div>
                        )}

                        <div className="text-center">
                            <div className={cn(
                                'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl',
                                viewingTxn.status === 'settled' ? 'bg-success/10 text-success' :
                                    viewingTxn.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                            )}>
                                <Banknote className="h-8 w-8" />
                            </div>
                            <h4 className="text-2xl font-black tracking-tight text-slate-900">₹{viewingTxn.amount.toLocaleString()}</h4>
                            <div className="mt-2 flex items-center justify-center gap-2">
                                <Badge variant={viewingTxn.status === 'settled' ? 'success' : viewingTxn.status === 'pending' ? 'warning' : 'danger'}>
                                    {viewingTxn.status}
                                </Badge>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{viewingTxn.id}</span>
                            </div>
                        </div>

                        <div className="space-y-5 border-t border-dashed border-slate-200 pt-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fleet Partner</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingTxn.riderName}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{viewingTxn.riderId}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Entry Date</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingTxn.dateTime}</p>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-xl bg-slate-50 p-5">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Method</p>
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4 text-slate-400" />
                                        <span className="text-xs font-bold text-slate-900">{viewingTxn.paymentMethod}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Destination</p>
                                    <div className="flex items-center gap-2">
                                        <Landmark className="h-4 w-4 text-slate-400" />
                                        <span className="text-xs font-bold text-slate-900">{viewingTxn.accountInfo}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ref. ID</p>
                                    <span className="font-mono text-xs font-black tracking-tight text-slate-900">{viewingTxn.referenceId}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button className="flex-1">
                                Download Receipt
                            </Button>
                            <button className="flex items-center justify-center rounded-xl bg-slate-100 p-3.5 text-slate-600 transition-all hover:bg-slate-200">
                                <MessageSquare className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DeliveryFunds;
