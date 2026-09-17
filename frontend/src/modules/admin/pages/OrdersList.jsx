// Comprehensive Order Management System
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard } from '@shared/components/ui/Skeleton';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import {
    Search,
    Filter,
    Truck,
    Eye,
    Download,
    Calendar,
    Package,
    IndianRupee,
    ChevronDown,
    ShoppingBag,
    Clock,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getLegacyStatusFromOrder,
    adminRouteMatchesOrder,
} from '@/shared/utils/orderStatus';

const STATUS_SELECT_STYLES = {
    pending: 'bg-warning/10 text-warning',
    confirmed: 'bg-info/10 text-info',
    packed: 'bg-primary/10 text-primary',
    out_for_delivery: 'bg-violet-100 text-violet-700',
    delivered: 'bg-success/10 text-success',
    cancelled: 'bg-danger/10 text-danger',
    returned: 'bg-slate-100 text-slate-600',
};

const DEFAULT_SUMMARY = {
    totalOrders: 0,
    totalAmount: 0,
    pending: 0,
    confirmed: 0,
    packed: 0,
    outForDelivery: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
    activeOrders: 0,
};

function formatOrdersResponse(payload, fallbackResults, requestedPage) {
    const dbOrders = Array.isArray(payload.items) ? payload.items : (fallbackResults || []);
    const formatted = dbOrders.map(o => ({
        id: o.orderId || 'UNSET',
        _id: o._id,
        customer: o.customer?.name || 'Unknown',
        seller: o.seller?.shopName || 'Unknown',
        items: o.items?.length || 0,
        amount: o.pricing?.total || 0,
        status: getLegacyStatusFromOrder(o),
        workflowStatus: o.workflowStatus,
        workflowVersion: o.workflowVersion,
        returnStatus: o.returnStatus,
        date: new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        payment: o.payment?.method === 'cod' ? 'COD' : 'Digital',
    }));
    return {
        orders: formatted,
        summary: {
            totalOrders: Number(payload.summary?.totalOrders || payload.total || formatted.length || 0),
            totalAmount: Number(payload.summary?.totalAmount || 0),
            pending: Number(payload.summary?.pending || 0),
            confirmed: Number(payload.summary?.confirmed || 0),
            packed: Number(payload.summary?.packed || 0),
            outForDelivery: Number(payload.summary?.outForDelivery || 0),
            delivered: Number(payload.summary?.delivered || 0),
            cancelled: Number(payload.summary?.cancelled || 0),
            returned: Number(payload.summary?.returned || 0),
            activeOrders: Number(payload.summary?.activeOrders || 0),
        },
        total: typeof payload.total === 'number' ? payload.total : formatted.length,
        page: typeof payload.page === 'number' ? payload.page : requestedPage,
    };
}

const OrdersList = () => {
    const { status = 'all' } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('All Time');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
    const [paymentFilter, setPaymentFilter] = useState('All');

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce
    // before a filter/search change triggers a refetch, same "any filter
    // change resets to page 1" behavior, now backed by the shared cache
    // instead of a page-local fetch.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, status, dateRange]);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (status !== 'all') params.status = status;
        if (debouncedSearchTerm.trim()) params.search = debouncedSearchTerm.trim();
        if (dateRange !== 'All Time') {
            params.dateFilter = dateRange.toLowerCase().replace(/ /g, '_');
        }
        return params;
    }, [page, pageSize, status, debouncedSearchTerm, dateRange]);

    const queryKey = ['admin', 'orders', queryParams];

    const { data: queryData, isLoading, isFetching, isError } = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await adminApi.getOrders(queryParams);
            if (!response.data.success) {
                throw new Error(response.data.message || 'Failed to load orders');
            }
            const payload = response.data.result || {};
            return formatOrdersResponse(payload, response.data.results, queryParams.page);
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) showToast('Failed to load orders', 'error');
    }, [isError, showToast]);

    const orders = queryData?.orders ?? [];
    const summary = queryData?.summary ?? DEFAULT_SUMMARY;
    const total = queryData?.total ?? 0;

    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            // Matches the previous behavior of this handler exactly: any
            // status update jumps the list back to page 1 (fetchOrders()
            // used to default its page argument to 1). Changing `page`
            // here changes the query key, which triggers the refetch.
            setPage(1);
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders]
    );

    const stats = useMemo(() => {
        const totalEarnings = summary.totalAmount;
        const activeOrders = summary.activeOrders;

        return [
            { label: 'Total Earnings', value: `₹${totalEarnings.toLocaleString('en-IN')}`, trend: '+12.5%', icon: IndianRupee, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Active Orders', value: activeOrders, trend: '+5', icon: ShoppingBag, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Average Prep Time', value: '18m', trend: '-2m', icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
            { label: 'Delivery Rate', value: '98.2%', trend: '+0.4%', icon: CheckCircle2, color: 'text-info', bg: 'bg-info/10' },
        ];
    }, [summary]);

    const filteredOrders = useMemo(() => {
        return safeOrders.filter(order => {
            const safeLower = (value) => String(value || '').toLowerCase();
            const query = safeLower(searchTerm);
            const matchesSearch =
                safeLower(order.id).includes(query) ||
                safeLower(order.customer).includes(query) ||
                safeLower(order.seller).includes(query);

            const matchesStatus = adminRouteMatchesOrder(status, order);
            const matchesPayment = paymentFilter === 'All' || order.payment === paymentFilter;

            return matchesSearch && matchesStatus && matchesPayment;
        });
    }, [safeOrders, searchTerm, status, paymentFilter]);

    const handleExport = () => {
        if (safeOrders.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }

        const headers = ['Order ID', 'Date', 'Customer', 'Seller', 'Items', 'Amount', 'Status', 'Payment'];
        const csvContent = [
            headers.join(','),
            ...safeOrders.map(o => [
                String(o.id || ''),
                String(o.date || '').replace(/,/g, ''),
                String(o.customer || '').replace(/,/g, ''),
                String(o.seller || '').replace(/,/g, ''),
                o.items,
                o.amount,
                o.status,
                o.payment
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `noyo-orders-${status}-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Order ledger exported successfully', 'success');
    };

    const pageTitle = status === 'all' ? 'All Orders' : status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    const orderColumns = [
        {
            header: 'Order Details',
            key: 'order',
            cell: (order) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Package className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-900">#{order.id}</h4>
                        <div className="mt-0.5 flex items-center gap-2">
                            <Badge variant="outline">{order.items} {order.items === 1 ? 'Item' : 'Items'}</Badge>
                            <span className="text-[11px] font-medium text-slate-400">{order.date}</span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: 'Customer',
            key: 'customer',
            cell: (order) => <span className="text-xs font-bold text-slate-700">{order.customer}</span>,
        },
        {
            header: 'Seller',
            key: 'seller',
            cell: (order) => <span className="text-xs font-bold text-slate-700">{order.seller}</span>,
        },
        {
            header: 'Status',
            key: 'status',
            cell: (order) => (
                <div className="relative inline-block w-36" onClick={(e) => e.stopPropagation()}>
                    <select
                        value={order.status}
                        onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                        className={cn(
                            "w-full text-[10px] pl-3 pr-7 py-1.5 rounded-full font-bold uppercase tracking-wider border-none appearance-none cursor-pointer outline-none",
                            STATUS_SELECT_STYLES[order.status] || 'bg-slate-100 text-slate-600'
                        )}
                    >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="packed">Packed</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                </div>
            ),
        },
        {
            header: 'Amount',
            key: 'amount',
            align: 'right',
            cell: (order) => (
                <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-slate-900">₹{order.amount.toLocaleString()}</span>
                    <span className="mt-0.5 text-[11px] font-medium text-slate-400">{order.payment}</span>
                </div>
            ),
        },
        {
            header: 'Action',
            key: 'action',
            align: 'right',
            cell: (order) => (
                <div className="flex items-center justify-end gap-2">
                    {status === 'processed' && order.status === 'confirmed' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order._id, 'packed'); }}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white transition-all hover:bg-primary/90"
                        >
                            <Package className="h-3.5 w-3.5" />
                            Packed
                        </button>
                    )}
                    {status === 'processed' && order.status === 'packed' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order._id, 'out_for_delivery'); }}
                            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white transition-all hover:bg-violet-700"
                        >
                            <Truck className="h-3.5 w-3.5" />
                            Dispatch
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/view/${order.id}`); }}
                        className="rounded-lg p-2 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary"
                        title="View Details"
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
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        {pageTitle}
                    </span>
                }
                description="View and manage every order placed on the platform."
                actions={
                    <>
                        <Button onClick={handleExport} variant="outline">
                            <Download className="h-4 w-4" />
                            Export
                        </Button>
                        <div className="relative">
                            <Button variant="outline" onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}>
                                <Calendar className="h-4 w-4" />
                                {dateRange}
                            </Button>
                            <AnimatePresence>
                                {isDateMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsDateMenuOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-20"
                                        >
                                            {['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'This Month'].map((range) => (
                                                <button
                                                    key={range}
                                                    onClick={() => { setDateRange(range); setIsDateMenuOpen(false); }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                                                        dateRange === range ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {range}
                                                </button>
                                            ))}
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                }
            />

            {isLoading && safeOrders.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {stats.map((stat, i) => (
                        <StatCard key={i} label={stat.label} value={stat.value} trend={stat.trend} icon={stat.icon} color={stat.color} bg={stat.bg} />
                    ))}
                </div>
            )}

            <FilterBar
                left={
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by Order ID, Customer, or Shop..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                }
                right={
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            <Filter className="h-4 w-4" />
                            {paymentFilter === 'All' ? 'Payment' : paymentFilter}
                        </button>
                        <AnimatePresence>
                            {isFilterMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsFilterMenuOpen(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-20"
                                    >
                                        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Method</p>
                                        {['All', 'COD', 'Digital'].map((method) => (
                                            <button
                                                key={method}
                                                onClick={() => { setPaymentFilter(method); setIsFilterMenuOpen(false); }}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                                                    paymentFilter === method ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"
                                                )}
                                            >
                                                {method}
                                            </button>
                                        ))}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                }
            />

            <DataTable
                columns={orderColumns}
                data={filteredOrders}
                rowKey={(o) => o.id}
                loading={isFetching}
                onRowClick={(order) => navigate(`/admin/orders/view/${order.id}`)}
                emptyState={
                    <EmptyState
                        icon={<Search className="h-6 w-6" />}
                        title="No orders found"
                        description="We couldn't find any orders matching your search."
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
        </div>
    );
};

export default OrdersList;
