import React, { useState, useMemo, useEffect } from 'react';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import { SkeletonStatCard } from '@shared/components/ui/Skeleton';
import {
    CircleDollarSign,
    Search,
    Truck,
    Clock,
    CheckCircle2,
    AlertTriangle,
    History,
    Download,
    Eye,
    Wallet,
    Bell,
    ArrowDownLeft,
    FileText,
    Percent,
    RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const RIDER_FALLBACK_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const riderAvatar = (rider) =>
    rider?.avatar && !rider.avatar.includes('emoji') && !rider.avatar.includes('avatar') && !rider.avatar.includes('dicebear')
        ? rider.avatar
        : RIDER_FALLBACK_AVATAR;

const CASH_QUERY_ROOT = ['admin', 'cashCollection'];

const CashCollection = () => {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('live_balances'); // live_balances or history
    const [selectedRider, setSelectedRider] = useState(null);
    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
    const [settlementData, setSettlementData] = useState({ rider: null, amount: 0 });
    const [isProcessing, setIsProcessing] = useState(false);

    const [ridersPage, setRidersPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce,
    // same two-parallel-lists shape, now as two independent cached queries
    // instead of one hand-rolled Promise.all re-run on every page change of
    // either tab.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setRidersPage(1);
            setHistoryPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setRidersPage(1);
        setHistoryPage(1);
    }, [pageSize]);

    const commonParams = useMemo(() => {
        const params = { limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        return params;
    }, [pageSize, debouncedSearchTerm]);

    const ridersQuery = useQuery({
        queryKey: [...CASH_QUERY_ROOT, 'balances', { ...commonParams, page: ridersPage }],
        queryFn: async () => {
            const res = await adminApi.getDeliveryCashBalances({ ...commonParams, page: ridersPage });
            if (!res.data.success) throw new Error('Failed to sync with backend');
            const payload = res.data.result || {};
            const riders = Array.isArray(payload.items) ? payload.items : (payload.riders || []);
            return {
                items: riders,
                total: typeof payload.total === 'number' ? payload.total : riders.length,
            };
        },
        placeholderData: keepPreviousData,
    });

    const historyQuery = useQuery({
        queryKey: [...CASH_QUERY_ROOT, 'history', { ...commonParams, page: historyPage }],
        queryFn: async () => {
            const res = await adminApi.getCashSettlementHistory({ ...commonParams, page: historyPage });
            if (!res.data.success) throw new Error('Failed to sync with backend');
            const payload = res.data.result || {};
            const history = Array.isArray(payload.items) ? payload.items : (res.data.results || res.data.result || []);
            const items = Array.isArray(history) ? history : [];
            return {
                items,
                total: typeof payload.total === 'number' ? payload.total : items.length,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (ridersQuery.isError || historyQuery.isError) {
            console.error("Failed to fetch cash collection data:", ridersQuery.error || historyQuery.error);
            toast.error("Failed to sync with backend");
        }
    }, [ridersQuery.isError, historyQuery.isError, ridersQuery.error, historyQuery.error]);

    const ridersCashData = ridersQuery.data?.items ?? [];
    const historyData = historyQuery.data?.items ?? [];
    const ridersTotal = ridersQuery.data?.total ?? 0;
    const historyTotal = historyQuery.data?.total ?? 0;
    const loading = ridersQuery.isFetching || historyQuery.isFetching;

    const refetchBoth = () => {
        ridersQuery.refetch();
        historyQuery.refetch();
    };

    // Fetch deep dive details when a rider is selected
    const riderDetailsQuery = useQuery({
        queryKey: [...CASH_QUERY_ROOT, 'riderDetails', selectedRider?.id],
        queryFn: async () => {
            const res = await adminApi.getRiderCashDetails(selectedRider.id);
            if (!res.data.success) return [];
            const data = res.data.results ?? res.data.result;
            return Array.isArray(data) ? data : [];
        },
        enabled: !!selectedRider,
    });
    const riderDetails = riderDetailsQuery.data ?? [];
    const detailsLoading = riderDetailsQuery.isLoading;

    const stats = {
        totalInHand: (ridersCashData || []).reduce((acc, r) => acc + (r.currentCash || 0), 0),
        overLimitCount: (ridersCashData || []).filter(r => (r.currentCash || 0) >= (r.limit || 5000)).length,
        todaySettled: (historyData || []).filter(h => {
            const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) === today;
        }).reduce((acc, h) => acc + (h.amount || 0), 0),
        avgBalance: (ridersCashData || []).length ? (ridersCashData || []).reduce((acc, r) => acc + (r.currentCash || 0), 0) / ridersCashData.length : 0
    };

    const filteredRiders = (ridersCashData || []).filter(r =>
        (r.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.id || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredHistory = (historyData || []).filter(h =>
        (h.rider || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.id || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSettlement = (rider) => {
        setSettlementData({ rider, amount: rider.currentCash });
        setIsSettleModalOpen(true);
    };

    const confirmSettlement = async () => {
        if (Number(settlementData.amount) <= 0) {
            toast.error("Settlement amount must be greater than zero");
            return;
        }
        if (Number(settlementData.amount) > settlementData.rider.currentCash) {
            toast.error(`Cannot settle more than the pending balance (₹${settlementData.rider.currentCash})`);
            return;
        }
        try {
            setIsProcessing(true);
            const response = await adminApi.settleRiderCash({
                riderId: settlementData.rider.id,
                amount: Number(settlementData.amount),
                method: 'Cash submission'
            });

            if (response.data.success) {
                toast.success(`Settlement of ₹${settlementData.amount} for ${settlementData.rider.name} processed successfully.`);
                queryClient.invalidateQueries({ queryKey: CASH_QUERY_ROOT });
                setIsSettleModalOpen(false);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Settlement failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const riderColumns = [
        {
            header: 'Delivery Partner',
            key: 'partner',
            cell: (rider) => (
                <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                        <img src={riderAvatar(rider)} alt="" loading="lazy" width="44" height="44" className="h-11 w-11 rounded-full bg-slate-100 object-cover" />
                        <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                            rider.status === 'safe' ? "bg-success" : rider.status === 'warning' ? "bg-warning" : "bg-danger"
                        )} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{rider.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                            {rider.id} • {rider.totalOrders || 0} delivered • {rider.pendingOrders || 0} pending
                        </p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Cash Statistics',
            key: 'cash',
            cell: (rider) => (
                <div className="max-w-[180px] space-y-1.5">
                    <div className="flex items-end justify-between">
                        <span className="text-base font-black text-slate-900">₹{rider.currentCash.toLocaleString()}</span>
                        <span className="text-[10px] font-medium text-slate-400">Limit: ₹{rider.limit}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((rider.currentCash / rider.limit) * 100, 100)}%` }}
                            className={cn("h-full rounded-full", rider.status === 'safe' ? "bg-success" : rider.status === 'warning' ? "bg-warning" : "bg-danger")}
                        />
                    </div>
                </div>
            ),
        },
        {
            header: 'Safety Status',
            key: 'status',
            align: 'center',
            cell: (rider) => (
                <Badge variant={rider.status === 'safe' ? 'success' : rider.status === 'warning' ? 'warning' : 'danger'}>
                    {rider.status.replace('_', ' ')}
                </Badge>
            ),
        },
        {
            header: 'Last Settle Date',
            key: 'lastSettle',
            cell: (rider) => (
                <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium">
                        {rider.lastSettlement !== 'Never'
                            ? new Date(rider.lastSettlement).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : 'No history'}
                    </span>
                </div>
            ),
        },
        {
            header: 'Management',
            key: 'actions',
            align: 'right',
            cell: (rider) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => handleSettlement(rider)} className="rounded-lg bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary transition-all hover:bg-primary hover:text-white">
                        Settle
                    </button>
                    <button className="rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-100">
                        <Bell className="h-4 w-4" />
                    </button>
                    <button onClick={() => setSelectedRider(rider)} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-900 hover:text-white">
                        <Eye className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ];

    const historyColumns = [
        { header: 'Settlement ID', key: 'id', cell: (log) => <span className="text-[11px] font-bold uppercase tracking-tight text-slate-400">{log.id}</span> },
        { header: 'Partner Name', key: 'rider', cell: (log) => <span className="text-sm font-bold text-slate-900">{log.rider}</span> },
        { header: 'Amount Settled', key: 'amount', align: 'center', cell: (log) => <span className="text-sm font-black text-success">₹{log.amount.toLocaleString()}</span> },
        { header: 'Method', key: 'method', cell: (log) => <Badge variant="secondary">{log.method}</Badge> },
        { header: 'Date', key: 'date', align: 'right', cell: (log) => <span className="text-xs font-semibold text-slate-500">{new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span> },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Cash Collection Hub
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <CircleDollarSign className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Manage physical cash collected by delivery partners and track settlements."
                actions={
                    <>
                        <Button variant="outline">
                            <Download className="h-4 w-4" />
                            Export Ledger
                        </Button>
                        <Button>
                            <CheckCircle2 className="h-4 w-4" />
                            Bulk Settle All
                        </Button>
                    </>
                }
            />

            {loading && ridersCashData.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[
                        { label: 'Total Cash in Hand', value: `₹${stats.totalInHand.toLocaleString()}`, icon: Wallet, color: 'text-primary', bg: 'bg-primary/10' },
                        { label: 'Critical Over-Limit', value: stats.overLimitCount, icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10' },
                        { label: 'Collected Today', value: `₹${stats.todaySettled.toLocaleString()}`, icon: ArrowDownLeft, color: 'text-success', bg: 'bg-success/10' },
                        { label: 'Avg. Rider Load', value: `₹${stats.avgBalance.toFixed(0)}`, icon: Percent, color: 'text-warning', bg: 'bg-warning/10' },
                    ].map((stat, i) => (
                        <StatCard key={i} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex w-fit rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                        onClick={() => setActiveTab('live_balances')}
                        className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-bold transition-all", activeTab === 'live_balances' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <Truck className="h-3.5 w-3.5" />
                        Live Rider Balances
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-bold transition-all", activeTab === 'history' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <History className="h-3.5 w-3.5" />
                        Settlement Logs
                    </button>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Find rider or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                </div>
            </div>

            {activeTab === 'live_balances' ? (
                <DataTable columns={riderColumns} data={filteredRiders} rowKey={(r) => r.id} loading={loading} />
            ) : (
                <DataTable columns={historyColumns} data={filteredHistory} rowKey={(h) => h.id} loading={loading} />
            )}

            <Pagination
                page={activeTab === 'live_balances' ? ridersPage : historyPage}
                totalPages={Math.ceil((activeTab === 'live_balances' ? ridersTotal : historyTotal) / pageSize) || 1}
                total={activeTab === 'live_balances' ? ridersTotal : historyTotal}
                pageSize={pageSize}
                onPageChange={activeTab === 'live_balances' ? setRidersPage : setHistoryPage}
                onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setRidersPage(1);
                    setHistoryPage(1);
                }}
                loading={loading}
            />

            {/* Rider Deep Dive Modal */}
            <Modal isOpen={!!selectedRider} onClose={() => setSelectedRider(null)} title="Rider Collection Intelligence" size="md">
                {selectedRider && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                            <img src={riderAvatar(selectedRider)} alt="" className="h-16 w-16 rounded-xl object-cover bg-slate-100 shadow-sm" />
                            <div>
                                <h3 className="text-xl font-black text-slate-900">{selectedRider.name}</h3>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <Badge variant={selectedRider.status === 'safe' ? 'success' : 'warning'}>{selectedRider.status}</Badge>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{selectedRider.id}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative overflow-hidden rounded-xl bg-slate-900 p-5 text-white shadow-sm">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest opacity-60">Primary Wallet</p>
                                <h4 className="text-2xl font-black">₹{selectedRider.currentCash.toLocaleString()}</h4>
                                <div className="mt-3 flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full bg-primary" style={{ width: `${Math.min((selectedRider.currentCash / selectedRider.limit) * 100, 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold opacity-60">{Math.min(Math.round((selectedRider.currentCash / selectedRider.limit) * 100), 100)}%</span>
                                </div>
                                <CircleDollarSign className="absolute -bottom-3 -right-3 h-16 w-16 opacity-10" />
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 shadow-sm">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Pending COD Orders</p>
                                <h4 className="text-2xl font-black text-slate-900">{selectedRider.pendingOrders}</h4>
                                <p className="mt-3 text-[10px] font-medium uppercase text-slate-400">Requires immediate sync</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-900">
                                <FileText className="h-4 w-4 text-primary" />
                                Collection Ledger
                            </h4>
                            <div className="max-h-[250px] space-y-2.5 overflow-y-auto pr-2 custom-scrollbar">
                                {detailsLoading ? (
                                    <div className="py-8 text-center">
                                        <RotateCw className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fetching ledger...</p>
                                    </div>
                                ) : (Array.isArray(riderDetails) ? riderDetails : []).length > 0 ? (
                                    (Array.isArray(riderDetails) ? riderDetails : []).map((item, i) => (
                                        <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-2 w-2 rounded-full bg-primary" />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900">{item.reference || item.id}</p>
                                                    <p className="text-[10px] font-medium text-slate-400">
                                                        {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">₹{item.amount.toLocaleString()}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                                        <CircleDollarSign className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No recent collections</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button className="flex-1" onClick={() => { setSelectedRider(null); handleSettlement(selectedRider); }}>
                                Trigger Settlement
                            </Button>
                            <button className="rounded-xl bg-slate-100 p-3.5 text-slate-500 transition-all hover:bg-slate-200">
                                <Bell className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Settlement Processor Modal */}
            <Modal isOpen={isSettleModalOpen} onClose={() => !isProcessing && setIsSettleModalOpen(false)} title="Financial Settlement Processor" size="sm">
                {settlementData.rider && (
                    <div className="space-y-5 py-2">
                        <div className="space-y-3 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                                <CircleDollarSign className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Record Cash Receive</h3>
                                <p className="mx-auto mt-1 max-w-[240px] text-sm text-slate-500">
                                    Finalizing cash submission for <span className="font-bold text-slate-900">{settlementData.rider.name}</span>.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                            <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Amount to Settle</p>
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-lg font-black text-slate-900">₹</span>
                                <input
                                    type="number"
                                    min="0"
                                    max={settlementData.rider.currentCash}
                                    value={settlementData.amount}
                                    onChange={(e) => {
                                        let val = parseFloat(e.target.value) || 0;
                                        if (val < 0) val = 0;
                                        if (val > settlementData.rider.currentCash) val = settlementData.rider.currentCash;
                                        setSettlementData({ ...settlementData, amount: val });
                                    }}
                                    className="w-32 bg-transparent text-center text-2xl font-black text-slate-900 outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-1">
                            <Button className="w-full" onClick={confirmSettlement} isLoading={isProcessing}>
                                {isProcessing ? 'Synchronizing...' : 'Confirm & Deposit'}
                            </Button>
                            <Button variant="outline" className="w-full" onClick={() => setIsSettleModalOpen(false)} disabled={isProcessing}>
                                Abort Session
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default CashCollection;
