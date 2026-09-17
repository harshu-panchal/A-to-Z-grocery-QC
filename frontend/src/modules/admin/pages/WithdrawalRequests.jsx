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
    Banknote,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    Building2,
    Truck,
    CreditCard,
    Download,
    Eye,
    CheckCircle,
    FileText,
    RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const WITHDRAWALS_QUERY_ROOT = ['admin', 'withdrawals'];

async function fetchWithdrawalPage(apiMethod, params, fallbackPage) {
    const res = await apiMethod(params).catch(() => ({ data: { success: false, result: {} } }));
    if (!res.data.success) {
        throw new Error('Failed to fetch requests');
    }
    const payload = res.data.result || {};
    const items = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
    return {
        items,
        total: typeof payload.total === 'number' ? payload.total : items.length,
        page: typeof payload.page === 'number' ? payload.page : fallbackPage,
    };
}

const WithdrawalRequests = () => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('sellers');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isMutating, setIsMutating] = useState(false);
    const [actionModal, setActionModal] = useState({ isOpen: false, type: null, request: null });

    const [sellerPage, setSellerPage] = useState(1);
    const [deliveryPage, setDeliveryPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce,
    // same "any filter/search change resets both tabs to page 1" behavior.
    // The two tabs are now independent queries instead of always being
    // re-fetched together on every page change (previously, paging the
    // seller tab also silently re-fetched the untouched delivery tab with
    // identical params) — same rendered result, one fewer redundant
    // request per page click.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setSellerPage(1);
            setDeliveryPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setSellerPage(1);
        setDeliveryPage(1);
    }, [filterStatus, pageSize]);

    const commonParams = useMemo(() => {
        const params = { limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (filterStatus !== 'all') params.status = filterStatus;
        return params;
    }, [pageSize, debouncedSearchTerm, filterStatus]);

    const sellerQuery = useQuery({
        queryKey: [...WITHDRAWALS_QUERY_ROOT, 'sellers', { ...commonParams, page: sellerPage }],
        queryFn: () => fetchWithdrawalPage(adminApi.getSellerWithdrawals, { ...commonParams, page: sellerPage }, sellerPage),
        placeholderData: keepPreviousData,
    });
    const deliveryQuery = useQuery({
        queryKey: [...WITHDRAWALS_QUERY_ROOT, 'delivery', { ...commonParams, page: deliveryPage }],
        queryFn: () => fetchWithdrawalPage(adminApi.getDeliveryWithdrawals, { ...commonParams, page: deliveryPage }, deliveryPage),
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (sellerQuery.isError || deliveryQuery.isError) {
            console.error("Fetch error:", sellerQuery.error || deliveryQuery.error);
            toast.error("Failed to fetch requests");
        }
    }, [sellerQuery.isError, deliveryQuery.isError, sellerQuery.error, deliveryQuery.error]);

    const sellerRequests = sellerQuery.data?.items ?? [];
    const deliveryRequests = deliveryQuery.data?.items ?? [];
    const sellerTotal = sellerQuery.data?.total ?? 0;
    const deliveryTotal = deliveryQuery.data?.total ?? 0;
    // Matches the original single `loading` flag exactly: true during the
    // initial load, every page/filter refetch, AND the approve/reject
    // mutation — that one flag drove the skeleton gate, the table's loading
    // state, the pagination spinner, and the confirm-action modal's
    // spinner/disabled state all at once, so it's kept as one combined flag
    // here rather than split, to avoid changing any of those behaviors.
    const loading = isMutating || sellerQuery.isFetching || deliveryQuery.isFetching;

    const refetchBoth = () => {
        sellerQuery.refetch();
        deliveryQuery.refetch();
    };

    const stats = useMemo(() => {
        const sData = Array.isArray(sellerRequests) ? sellerRequests : [];
        const dData = Array.isArray(deliveryRequests) ? deliveryRequests : [];

        return {
            sellers: {
                pending: sData.filter(r => r.status === 'Pending' || r.status === 'Processing').length,
                amount: Math.abs(sData.filter(r => r.status === 'Pending' || r.status === 'Processing').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
                processed: sData.filter(r => r.status === 'Settled').length
            },
            delivery: {
                pending: dData.filter(r => r.status === 'Pending' || r.status === 'Processing').length,
                amount: Math.abs(dData.filter(r => r.status === 'Pending' || r.status === 'Processing').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)),
                processed: dData.filter(r => r.status === 'Settled').length
            }
        };
    }, [sellerRequests, deliveryRequests]);

    const currentData = useMemo(() => {
        const data = activeTab === 'sellers' ? (sellerRequests || []) : (deliveryRequests || []);
        return data.filter(r => {
            const name = r.user?.shopName || r.user?.name || "";
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r._id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filterStatus === 'all' || r.status?.toLowerCase() === filterStatus.toLowerCase();
            return matchesSearch && matchesStatus;
        });
    }, [activeTab, sellerRequests, deliveryRequests, searchTerm, filterStatus]);

    const handleAction = (type, request) => {
        setActionModal({ isOpen: true, type, request });
    };

    const confirmAction = async () => {
        try {
            setIsMutating(true);
            const status = actionModal.type === 'approve' ? 'Settled' : 'Failed';
            const res = await adminApi.updateWithdrawalStatus(actionModal.request._id, { status });
            if (res.data.success) {
                toast.success(`Request ${status} successfully`);
                queryClient.invalidateQueries({ queryKey: WITHDRAWALS_QUERY_ROOT });
                setActionModal({ isOpen: false, type: null, request: null });
            }
        } catch (error) {
            toast.error("Action failed");
        } finally {
            setIsMutating(false);
        }
    };

    const handleExport = async () => {
        try {
            toast.loading(`Exporting ${activeTab} data...`, { id: "export" });
            const apiMethod = activeTab === 'sellers' ? adminApi.getSellerWithdrawals : adminApi.getDeliveryWithdrawals;

            const params = { page: 1, limit: 5000 };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;

            const res = await apiMethod(params).catch(() => ({ data: { success: false } }));

            if (!res.data.success) throw new Error("Failed to fetch data");

            const payload = res.data.result || {};
            const items = Array.isArray(payload.items) ? payload.items : (res.data.results || []);

            if (!items.length) {
                toast.error("No data to export", { id: "export" });
                return;
            }

            const csvRows = [];
            csvRows.push(['Date', 'Time', 'Requester Name', 'Requester Phone', 'Amount (INR)', 'Status', 'Reference ID'].join(','));

            items.forEach(req => {
                const dt = new Date(req.createdAt);
                const date = dt.toLocaleDateString();
                const time = dt.toLocaleTimeString();
                const name = `"${(req.user?.shopName || req.user?.name || 'Unknown').replace(/"/g, '""')}"`;
                const phone = req.user?.phone || 'N/A';
                const amount = Math.abs(req.amount || 0);
                const status = req.status || 'Unknown';
                const ref = req.reference || req._id || 'N/A';
                csvRows.push([date, time, name, phone, amount, status, ref].join(','));
            });

            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${activeTab}_withdrawals_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("Export successful", { id: "export" });
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Export failed", { id: "export" });
        }
    };

    const columns = [
        {
            header: 'Requester Details',
            key: 'requester',
            cell: (req) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {activeTab === 'sellers' ? <Building2 className="h-4.5 w-4.5" /> : <Truck className="h-4.5 w-4.5" />}
                    </div>
                    <div>
                        <p
                            className="cursor-pointer text-sm font-bold text-slate-900 transition-colors hover:text-primary"
                            onClick={() => setSelectedRequest(req)}
                        >
                            {req.user?.shopName || req.user?.name || 'Unknown'}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{req.user?.phone}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">
                                {new Date(req.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: 'Transaction ID',
            key: 'txn',
            cell: (req) => <span className="font-mono text-[10px] font-bold text-slate-500">{req.reference || req._id}</span>,
        },
        {
            header: 'Amount Requested',
            key: 'amount',
            align: 'center',
            cell: (req) => <p className="text-sm font-black text-slate-900">₹{Math.abs(req.amount).toLocaleString()}</p>,
        },
        {
            header: 'Gateway Status',
            key: 'status',
            cell: (req) => (
                <Badge variant={req.status === 'Pending' ? 'warning' : req.status === 'Settled' ? 'success' : req.status === 'Processing' ? 'primary' : 'danger'}>
                    {req.status}
                </Badge>
            ),
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (req) => (
                <div className="flex items-center justify-end gap-1.5">
                    {req.status === 'Pending' && (
                        <>
                            <button
                                onClick={() => handleAction('approve', req)}
                                className="rounded-lg p-2 text-success transition-all hover:bg-success hover:text-white"
                            >
                                <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => handleAction('reject', req)}
                                className="rounded-lg p-2 text-danger transition-all hover:bg-danger hover:text-white"
                            >
                                <XCircle className="h-4 w-4" />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => setSelectedRequest(req)}
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
                        Withdrawal Requests
                        <Badge variant="primary">Financial Hub</Badge>
                    </span>
                }
                description="Review and process fund disbursement requests from sellers and delivery partners."
                actions={
                    <>
                        <Button variant="outline" onClick={refetchBoth}>
                            <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        </Button>
                        <Button variant="outline" onClick={handleExport}>
                            <Download className="h-4 w-4" />
                            Export All
                        </Button>
                    </>
                }
            />

            {loading && sellerRequests.length === 0 && deliveryRequests.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <StatCard label="Total Pending" value={stats.sellers.pending + stats.delivery.pending} icon={Clock} color="text-warning" bg="bg-warning/10" />
                        <StatCard label="Pending Volume" value={`₹${(stats.sellers.amount + stats.delivery.amount).toLocaleString()}`} icon={Banknote} color="text-primary" bg="bg-primary/10" />
                        <StatCard label="Settled Today" value={stats.sellers.processed + stats.delivery.processed} icon={CheckCircle2} color="text-success" bg="bg-success/10" />
                    </div>

                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex w-fit rounded-xl bg-slate-100 p-1">
                            <button
                                onClick={() => setActiveTab('sellers')}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all',
                                    activeTab === 'sellers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                <Building2 className="h-4 w-4" />
                                Seller Requests
                                <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[10px]', activeTab === 'sellers' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600')}>
                                    {sellerRequests.length}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('delivery')}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all',
                                    activeTab === 'delivery' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                <Truck className="h-4 w-4" />
                                Delivery Partners
                                <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[10px]', activeTab === 'delivery' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600')}>
                                    {deliveryRequests.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-80">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by ID or Name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        pills={['all', 'pending', 'settled'].map((status) => ({
                            label: status,
                            active: filterStatus === status,
                            onClick: () => setFilterStatus(status),
                        }))}
                    />

                    <DataTable
                        columns={columns}
                        data={currentData}
                        rowKey={(r) => r._id}
                        loading={loading}
                        emptyState={
                            <EmptyState
                                icon={<FileText className="h-6 w-6" />}
                                title="No withdrawal requests found"
                                description="No requests match this category and filter combination."
                            />
                        }
                    />

                    <Pagination
                        page={activeTab === 'sellers' ? sellerPage : deliveryPage}
                        totalPages={Math.ceil((activeTab === 'sellers' ? sellerTotal : deliveryTotal) / pageSize) || 1}
                        total={activeTab === 'sellers' ? sellerTotal : deliveryTotal}
                        pageSize={pageSize}
                        onPageChange={activeTab === 'sellers' ? setSellerPage : setDeliveryPage}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setSellerPage(1);
                            setDeliveryPage(1);
                        }}
                        loading={loading}
                    />
                </>
            )}

            {/* Request Detail Modal */}
            <Modal isOpen={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Withdrawal Intel" size="md">
                {selectedRequest && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-900 text-white">
                                {activeTab === 'sellers' ? <Building2 className="h-8 w-8" /> : <Truck className="h-8 w-8" />}
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight text-slate-900">{selectedRequest.user?.shopName || selectedRequest.user?.name || 'Unknown'}</h3>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{selectedRequest._id}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <Badge variant={selectedRequest.status === 'Pending' ? 'warning' : 'success'}>{selectedRequest.status.toUpperCase()}</Badge>
                                    <span className="text-[10px] font-bold uppercase text-slate-400">Requested on {new Date(selectedRequest.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Request Amount</p>
                            <h4 className="mt-1 text-2xl font-black text-slate-900">₹{Math.abs(selectedRequest.amount).toLocaleString()}</h4>
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">Reference: {selectedRequest.reference}</p>
                        </div>

                        <div className="flex gap-3 pt-1">
                            {selectedRequest.status === 'Pending' ? (
                                <>
                                    <Button className="flex-1" onClick={() => { setSelectedRequest(null); handleAction('approve', selectedRequest); }}>
                                        Authorize Transfer
                                    </Button>
                                    <Button variant="outline" className="flex-1" onClick={() => { setSelectedRequest(null); handleAction('reject', selectedRequest); }}>
                                        Deny Request
                                    </Button>
                                </>
                            ) : (
                                <Button className="w-full" variant="outline" onClick={() => setSelectedRequest(null)}>
                                    Close Intelligence
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Action Confirmation Modal */}
            <Modal
                isOpen={actionModal.isOpen}
                onClose={() => !loading && setActionModal({ isOpen: false, type: null, request: null })}
                title="Confirm Financial Action"
                size="sm"
            >
                {actionModal.request && (
                    <div className="space-y-5 text-center">
                        <div className={cn(
                            'mx-auto flex h-14 w-14 items-center justify-center rounded-xl',
                            actionModal.type === 'approve' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                        )}>
                            {actionModal.type === 'approve' ? <CheckCircle className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">Are you sure?</h3>
                            <p className="mt-2 px-4 text-sm font-medium text-slate-500">
                                You are about to {actionModal.type === 'approve' ? 'approve' : 'reject'} the withdrawal request for{' '}
                                <b className="text-slate-900">₹{Math.abs(actionModal.request.amount).toLocaleString()}</b>.
                            </p>
                        </div>
                        <div className="space-y-2.5">
                            <Button
                                className="w-full"
                                variant={actionModal.type === 'approve' ? 'primary' : 'danger'}
                                onClick={confirmAction}
                                isLoading={loading}
                            >
                                {loading ? 'Processing...' : `Yes, ${actionModal.type?.toUpperCase()}`}
                            </Button>
                            <Button
                                className="w-full"
                                variant="ghost"
                                disabled={loading}
                                onClick={() => setActionModal({ isOpen: false, type: null, request: null })}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default WithdrawalRequests;
