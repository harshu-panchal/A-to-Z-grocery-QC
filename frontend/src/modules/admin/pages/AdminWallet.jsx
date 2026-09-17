import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import {
    TrendingUp,
    DollarSign,
    Building2,
    Clock,
    CreditCard,
    ArrowUpRight,
    ArrowDownLeft,
    Wallet,
    Download,
    Search,
    ChevronRight,
    ArrowRight,
    History,
    PieChart,
    BarChart3,
    ArrowDownCircle,
    ArrowUpCircle,
    RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";

const TABS = ['all', 'earnings', 'payouts', 'seller_requests'];

const AdminWallet = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [txnPage, setTxnPage] = useState(1);
    const [txnPageSize, setTxnPageSize] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // all, earnings, payouts, seller_requests
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingId, setLoadingId] = useState(null);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce
    // before a search change triggers a refetch (page-size change now
    // applies instantly instead of also waiting on the debounce timer,
    // which is a strict improvement, not a behavior change users would
    // notice). Summary + ledger + pending seller payouts were always
    // fetched together as one unit, so they stay one query.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setTxnPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setTxnPage(1);
    }, [txnPageSize]);

    const queryParams = useMemo(() => {
        const params = { page: txnPage, limit: txnPageSize };
        if (debouncedSearchTerm.trim()) params.search = debouncedSearchTerm.trim();
        return params;
    }, [txnPage, txnPageSize, debouncedSearchTerm]);

    const walletQueryKey = ['admin', 'walletFinance', queryParams];

    const {
        data: walletQueryData,
        isLoading: loading,
        isFetching: isRefetching,
        isError,
    } = useQuery({
        queryKey: walletQueryKey,
        queryFn: async () => {
            const [summaryRes, ledgerRes, requestsRes] = await Promise.all([
                adminApi.getFinanceSummary(),
                adminApi.getFinanceLedger(queryParams),
                adminApi.getFinancePayouts({ seller: true, status: "PENDING", page: 1, limit: 100 })
            ]);

            let walletData = { stats: {}, transactions: {} };
            if (summaryRes.data.success || ledgerRes.data.success) {
                const summary = summaryRes.data.result || {};
                const ledger = ledgerRes.data.result || {};
                const mappedTransactions = (ledger.items || []).map((entry) => ({
                    id: (entry.transactionId || entry.reference || entry._id || '').toString().substring(0, 10).toUpperCase(),
                    type: entry.type || "UNKNOWN",
                    amount: entry.direction === "DEBIT" ? -Math.abs(entry.amount || 0) : Math.abs(entry.amount || 0),
                    status: entry.status || "COMPLETED",
                    sender: entry.direction === "DEBIT" ? (entry.actorType || "SYSTEM") : "SYSTEM",
                    recipient: entry.direction === "CREDIT" ? (entry.actorType || "SYSTEM") : "PLATFORM_WALLET",
                    date: entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "-",
                    time: entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-",
                    notes: entry.description || entry.type,
                    method: entry.paymentMode || "N/A",
                }));

                walletData = {
                    stats: {
                        totalPlatformEarning: summary.totalPlatformEarning || 0,
                        totalAdminEarning: summary.totalAdminEarning || 0,
                        availableBalance: summary.availableBalance || 0,
                        systemFloat: summary.systemFloatCOD || 0,
                        sellerPendingPayouts: summary.sellerPendingPayouts || 0,
                        deliveryPendingPayouts: summary.deliveryPendingPayouts || 0,
                    },
                    transactions: {
                        items: mappedTransactions,
                        page: ledger.page || queryParams.page,
                        limit: ledger.limit || txnPageSize,
                        total: ledger.total || mappedTransactions.length,
                        totalPages: ledger.totalPages || 1,
                    },
                };
            }

            let sellerRequests = [];
            if (requestsRes.data.success) {
                const payload = requestsRes.data.result || {};
                sellerRequests = Array.isArray(payload.items) ? payload.items : (requestsRes.data.results || []);
            }

            return { walletData, sellerRequests };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) {
            console.error("Admin Wallet Fetch Error");
            toast.error("Failed to load finance data");
        }
    }, [isError]);

    const walletData = walletQueryData?.walletData ?? { stats: {}, transactions: {} };
    const sellerRequests = walletQueryData?.sellerRequests ?? [];

    useEffect(() => {
        const returnedPage = walletData.transactions?.page;
        if (typeof returnedPage === "number" && returnedPage !== txnPage) {
            setTxnPage(returnedPage);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletData.transactions?.page]);

    const fetchData = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'walletFinance'] });
    };

    const handleUpdateStatus = async (id, status, reason = "") => {
        try {
            if (status !== "COMPLETED") {
                toast.error("Only payout completion is supported in this view");
                return;
            }
            setLoadingId(id);
            const res = await adminApi.processFinancePayouts({
                payoutIds: [id],
                remarks: reason || "",
            });
            if (res.data.success) {
                toast.success(`Request processed successfully`);
                fetchData();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Action failed");
        } finally {
            setLoadingId(null);
        }
    };

    const stats = [
        {
            label: 'Total Platform Earning',
            value: `₹${(walletData.stats?.totalPlatformEarning || 0).toLocaleString()}`,
            description: 'Total money collected',
            icon: TrendingUp,
            color: 'text-primary',
            bg: 'bg-primary/10',
        },
        {
            label: 'Total Admin Earning',
            value: `₹${(walletData.stats?.totalAdminEarning || 0).toLocaleString()}`,
            description: 'Net profit for platform',
            icon: DollarSign,
            color: 'text-info',
            bg: 'bg-info/10',
        },
        {
            label: 'Available Balance',
            value: `₹${(walletData.stats?.availableBalance || 0).toLocaleString()}`,
            description: 'Available in business wallet',
            icon: Building2,
            color: 'text-success',
            bg: 'bg-success/10',
        },
        {
            label: 'System Float (COD)',
            value: `₹${(walletData.stats?.systemFloat || 0).toLocaleString()}`,
            description: 'Cash with delivery partners',
            icon: Clock,
            color: 'text-warning',
            bg: 'bg-warning/10',
        },
        {
            label: 'Seller Pending Payouts',
            value: `₹${(walletData.stats?.sellerPendingPayouts || 0).toLocaleString()}`,
            description: 'Owed to sellers',
            icon: CreditCard,
            color: 'text-primary',
            bg: 'bg-primary/10',
        },
        {
            label: 'Delivery Pending Payouts',
            value: `₹${(walletData.stats?.deliveryPendingPayouts || 0).toLocaleString()}`,
            description: 'Owed to delivery partners',
            icon: CreditCard,
            color: 'text-info',
            bg: 'bg-info/10',
        }
    ];

    const transactionsList = useMemo(() =>
        Array.isArray(walletData.transactions?.items) ? walletData.transactions.items : (Array.isArray(walletData.transactions) ? walletData.transactions : []),
        [walletData.transactions]);

    const txnTotal = useMemo(() =>
        typeof walletData.transactions?.total === 'number' ? walletData.transactions.total : transactionsList.length,
        [walletData.transactions, transactionsList]);

    const filteredTransactions = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        return transactionsList.filter(txn => {
            const matchesSearch =
                (txn.id || '').toLowerCase().includes(query) ||
                (txn.type || '').toLowerCase().includes(query) ||
                (txn.sender || '').toLowerCase().includes(query) ||
                (txn.recipient || '').toLowerCase().includes(query) ||
                (txn.notes || '').toLowerCase().includes(query) ||
                String(txn.amount || '').includes(query);

            const matchesTab = activeTab === 'all' ||
                (activeTab === 'earnings' && txn.amount > 0) ||
                (activeTab === 'payouts' && txn.amount < 0);

            return matchesSearch && matchesTab;
        });
    }, [transactionsList, searchTerm, activeTab]);

    const requestsList = useMemo(() => {
        const list = Array.isArray(sellerRequests) ? sellerRequests : [];
        if (!searchTerm) return list;

        const query = searchTerm.toLowerCase().trim();
        return list.filter(req => {
            const shopName = (req.beneficiary?.shopName || '').toLowerCase();
            const ownerName = (req.beneficiary?.name || '').toLowerCase();
            const phone = (req.beneficiary?.phone || '').toLowerCase();
            const type = (req.payoutType || '').toLowerCase();
            const id = (req.beneficiaryId || '').toLowerCase();
            const amount = String(req.amount || '');

            return shopName.includes(query) ||
                ownerName.includes(query) ||
                phone.includes(query) ||
                type.includes(query) ||
                amount.includes(query) ||
                id.includes(query);
        });
    }, [sellerRequests, searchTerm]);

    const pendingRequests = useMemo(() =>
        (Array.isArray(sellerRequests) ? sellerRequests : []).filter(req =>
            (req.status || '').toUpperCase() === 'PENDING' || (req.status || '').toUpperCase() === 'PROCESSING'
        ),
        [sellerRequests]);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const res = await adminApi.exportFinanceStatement();
            const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `finance_statement_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Statement exported successfully");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to export statement");
        } finally {
            setIsExporting(false);
        }
    };

    const handleProcessPayouts = async () => {
        try {
            setIsProcessing(true);
            const res = await adminApi.processFinancePayouts({
                limit: 100,
                remarks: "Bulk payout processing from admin panel",
            });
            if (res.data.success) {
                const result = res.data.result || {};
                toast.success(`Processed ${result.completed || 0} payouts`);
                fetchData();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to process payouts");
        } finally {
            setIsProcessing(false);
        }
    };

    const requestColumns = [
        {
            key: 'seller',
            header: 'Seller Detail',
            primary: true,
            cell: (req) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{req.beneficiary?.shopName || req.beneficiary?.name || req.beneficiaryId}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">{req.beneficiary?.phone || req.payoutType}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'amount',
            header: 'Amount',
            align: 'center',
            cell: (req) => <p className="text-sm font-black text-slate-900">₹{Math.abs(req.amount).toLocaleString()}</p>,
        },
        {
            key: 'status',
            header: 'Status',
            cell: (req) => (
                <Badge variant={req.status === 'COMPLETED' ? 'success' : (req.status === 'PENDING' || req.status === 'PROCESSING') ? 'warning' : 'danger'}>
                    {req.status.toUpperCase()}
                </Badge>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (req) => (req.status || '').toUpperCase() === 'PENDING' ? (
                <button
                    disabled={isProcessing || loadingId === req._id}
                    onClick={() => handleUpdateStatus(req._id, 'COMPLETED')}
                    className="flex min-w-[100px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-[10px] font-black uppercase text-white shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loadingId === req._id ? <RotateCw className="h-3 w-3 animate-spin" /> : 'Approve'}
                </button>
            ) : (
                <span className="text-[10px] font-bold italic text-slate-400">No Actions</span>
            ),
        },
    ];

    const transactionColumns = [
        {
            key: 'details',
            header: 'Transaction Details',
            primary: true,
            cell: (txn) => (
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        txn.amount > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                    )}>
                        {txn.amount > 0 ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{txn.type.replace('_', ' ').toUpperCase()}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">{txn.id} • {txn.date}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'entities',
            header: 'Entities',
            cell: (txn) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <ArrowDownLeft className="h-3 w-3 text-success" />
                        <span className="text-[11px] font-bold text-slate-600">{txn.recipient}</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-50">
                        <ArrowUpRight className="h-3 w-3 text-danger" />
                        <span className="text-[10px] font-semibold text-slate-400">{txn.sender}</span>
                    </div>
                </div>
            ),
        },
        {
            key: 'amount',
            header: 'Amount',
            align: 'center',
            cell: (txn) => (
                <p className={cn("text-sm font-black", txn.amount > 0 ? "text-success" : "text-danger")}>
                    {txn.amount > 0 ? '+' : ''}₹{Math.abs(txn.amount).toLocaleString()}
                </p>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            cell: (txn) => (
                <Badge variant={txn.status === 'COMPLETED' || txn.status === 'Settled' ? 'success' : 'warning'}>
                    {txn.status.toUpperCase()}
                </Badge>
            ),
        },
        {
            key: 'actions',
            header: '',
            hideOnMobile: true,
            align: 'right',
            cell: () => (
                <button className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary">
                    <ChevronRight className="h-4 w-4" />
                </button>
            ),
        },
    ];

    const isSellerRequestsTab = activeTab === 'seller_requests';

    return (
        <div className="space-y-5">
            <PageHeader
                title="Admin Wallet & Finance"
                description="Manage transactions, track earnings, and process withdrawals."
                actions={
                    <>
                        <Button variant="outline" onClick={handleExport} isLoading={isExporting}>
                            {!isExporting && <Download className="h-4 w-4" />}
                            {isExporting ? 'Exporting...' : 'Export Statement'}
                        </Button>
                        <Button onClick={handleProcessPayouts} isLoading={isProcessing}>
                            {!isProcessing && <ArrowUpRight className="h-4 w-4" />}
                            {isProcessing ? 'Processing...' : 'Process Payouts'}
                        </Button>
                    </>
                }
            />

            {loading && transactionsList.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {stats.map((stat, idx) => (
                            <StatCard
                                key={idx}
                                label={stat.label}
                                value={stat.value}
                                icon={stat.icon}
                                color={stat.color}
                                bg={stat.bg}
                                description={stat.description}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        {/* Transaction History */}
                        <div className="space-y-4 lg:col-span-2">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <History className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-black text-slate-900">Recent Transactions</h2>
                            </div>

                            <FilterBar
                                left={
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="Search details..."
                                            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                }
                                pills={TABS.map((tab) => ({
                                    label: tab === 'seller_requests' && pendingRequests.length > 0
                                        ? `${tab.replace('_', ' ')} (${pendingRequests.length})`
                                        : tab.replace('_', ' '),
                                    active: activeTab === tab,
                                    onClick: () => setActiveTab(tab),
                                }))}
                            />

                            {isSellerRequestsTab ? (
                                <DataTable
                                    columns={requestColumns}
                                    data={requestsList}
                                    rowKey={(req) => req._id}
                                    emptyState={
                                        <EmptyState
                                            icon={<Search className="h-6 w-6" />}
                                            title="No items found"
                                            description="No items found matching your criteria."
                                        />
                                    }
                                />
                            ) : (
                                <>
                                    <DataTable
                                        columns={transactionColumns}
                                        data={filteredTransactions}
                                        rowKey={(txn) => txn.id}
                                        onRowClick={(txn) => setSelectedTransaction(txn)}
                                        loading={isRefetching && transactionsList.length > 0}
                                        emptyState={
                                            <EmptyState
                                                icon={<Search className="h-6 w-6" />}
                                                title="No items found"
                                                description="No items found matching your criteria."
                                            />
                                        }
                                    />
                                    {txnTotal > 0 && (
                                        <Pagination
                                            page={txnPage}
                                            totalPages={Math.ceil(txnTotal / txnPageSize) || 1}
                                            total={txnTotal}
                                            pageSize={txnPageSize}
                                            onPageChange={(p) => setTxnPage(p)}
                                            onPageSizeChange={(newSize) => {
                                                setTxnPageSize(newSize);
                                                setTxnPage(1);
                                            }}
                                            loading={isRefetching}
                                        />
                                    )}
                                </>
                            )}
                        </div>

                        {/* Side Panels */}
                        <div className="space-y-5">
                            {/* Settlement Overview */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                        <PieChart className="h-5 w-5" />
                                    </div>
                                    <h2 className="text-lg font-black text-slate-900">Settlements</h2>
                                </div>
                                <Card className="relative overflow-hidden border-none bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
                                    <div className="relative z-10 space-y-5">
                                        <div>
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest leading-none text-slate-400">Ready for Settlement</p>
                                            <h3 className="text-3xl font-black">₹{((walletData.stats?.sellerPendingPayouts || 0) + (walletData.stats?.deliveryPendingPayouts || 0)).toLocaleString()}</h3>
                                        </div>
                                        <div className="space-y-2.5">
                                            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                                    <span className="text-xs font-bold text-slate-300">Sellers</span>
                                                </div>
                                                <span className="text-xs font-black">₹{(walletData.stats?.sellerPendingPayouts || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-info" />
                                                    <span className="text-xs font-bold text-slate-300">Riders</span>
                                                </div>
                                                <span className="text-xs font-black">₹{(walletData.stats?.deliveryPendingPayouts || 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleProcessPayouts}
                                            disabled={isProcessing}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[11px] font-black uppercase tracking-widest text-slate-900 shadow-sm transition-all hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
                                        >
                                            {isProcessing ? <RotateCw className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                                            {isProcessing ? 'Settling...' : 'Bulk Settlement'}
                                        </button>
                                    </div>
                                    <div className="absolute -bottom-8 -right-8 opacity-10">
                                        <Wallet className="h-40 w-40" />
                                    </div>
                                </Card>
                            </div>

                            {/* Quick Links */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                        <BarChart3 className="h-5 w-5" />
                                    </div>
                                    <h2 className="text-lg font-black text-slate-900">Analytics</h2>
                                </div>
                                <div className="space-y-2.5">
                                    {[
                                        { label: 'Platform Revenue Report', icon: TrendingUp, path: '/admin' },
                                        { label: 'Settlement History', icon: History, path: '/admin/delivery-funds' },
                                        { label: 'Tax Statements', icon: DollarSign, path: '#' },
                                    ].map((link, i) => (
                                        <button
                                            key={i}
                                            onClick={() => link.path !== '#' ? navigate(link.path) : alert('Tax Statements generation is coming soon!')}
                                            className="group flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5 transition-all hover:border-primary/20 hover:shadow-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="rounded-lg bg-slate-50 p-2 text-slate-400 transition-all group-hover:bg-primary/10 group-hover:text-primary">
                                                    <link.icon className="h-4 w-4" />
                                                </div>
                                                <span className="text-xs font-black text-slate-700">{link.label}</span>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Transaction Detail Modal */}
            <Modal
                isOpen={!!selectedTransaction}
                onClose={() => setSelectedTransaction(null)}
                title="Transaction Details"
                size="md"
            >
                {selectedTransaction && (
                    <div className="space-y-5">
                        <div className="border-b border-slate-100 pb-5 text-center">
                            <div className={cn(
                                "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl",
                                selectedTransaction.amount > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                            )}>
                                {selectedTransaction.amount > 0 ? <ArrowDownCircle className="h-7 w-7" /> : <ArrowUpCircle className="h-7 w-7" />}
                            </div>
                            <h4 className="text-2xl font-black text-slate-900">₹{Math.abs(selectedTransaction.amount)}</h4>
                            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">{selectedTransaction.status}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</p>
                                <p className="text-sm font-bold text-slate-900">{selectedTransaction.type.replace('_', ' ').toUpperCase()}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date & Time</p>
                                <p className="text-sm font-bold text-slate-900">{selectedTransaction.date}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">From</p>
                                <p className="text-sm font-bold text-slate-700">{selectedTransaction.sender}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">To</p>
                                <p className="text-sm font-bold text-slate-700">{selectedTransaction.recipient}</p>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Reference ID</p>
                                <p className="font-mono text-sm font-bold text-slate-900">{selectedTransaction.id}</p>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Method</p>
                                <p className="text-sm font-bold text-slate-700">{selectedTransaction.method}</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
                                <p className="text-xs font-medium italic text-slate-600">"{selectedTransaction.notes}"</p>
                            </div>
                        </div>

                        <Button variant="secondary" className="w-full" onClick={() => setSelectedTransaction(null)}>
                            Close
                        </Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AdminWallet;
