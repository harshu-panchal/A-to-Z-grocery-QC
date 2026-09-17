import React, { useState, useMemo, useEffect, useRef } from 'react';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineEye,
    HiOutlinePrinter,
    HiOutlineCheck,
    HiOutlineXMark,
    HiOutlineTruck,
    HiOutlineBanknotes,
    HiOutlineClock,
    HiOutlineArchiveBoxXMark,
    HiOutlineChartBar,
    HiOutlineChevronDown,
    HiOutlineInboxStack,
    HiOutlineMapPin,
    HiOutlinePhone,
    HiOutlineCalendarDays
} from 'react-icons/hi2';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Orders Page

import { sellerApi } from '../services/sellerApi';
import { useToast } from '@shared/components/ui/Toast';
import { getLegacyStatusFromOrder } from '@/shared/utils/orderStatus';
import { Loader2 } from 'lucide-react';
import Pagination from '@shared/components/ui/Pagination';
import { DatePicker } from "@/components/ui/date-picker";
import { getOrderStatusVariant } from '../components/orders';
import { useSellerOrders } from '../context/SellerOrdersContext';
import ConfirmDialog from '@shared/components/ui/ConfirmDialog';
import useConfirmDialog from '@shared/hooks/useConfirmDialog';

/** Semantic variant (from getOrderStatusVariant) -> select-control tint classes. Shared across the mobile list, desktop table, and details modal so all three read the same colors for the same status. */
const STATUS_SELECT_STYLES = {
    warning: 'bg-warning/10 text-warning focus:ring-warning/30',
    info: 'bg-info/10 text-info focus:ring-info/30',
    primary: 'bg-primary/10 text-primary focus:ring-primary/30',
    secondary: 'bg-slate-100 text-slate-600 focus:ring-slate-300',
    success: 'bg-success/10 text-success focus:ring-success/30',
    error: 'bg-danger/10 text-danger focus:ring-danger/30',
};

const Orders = () => {
    const { orders: ordersFromContext } = useSellerOrders();
    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({
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
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isQuickViewModalOpen, setIsQuickViewModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const { showToast } = useToast();
    const statusConfirm = useConfirmDialog();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const hasMountedRef = useRef(false);

    // Initial load: show full-page loader once
    useEffect(() => {
        fetchOrders(page, true).finally(() => {
            hasMountedRef.current = true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Subsequent changes (page, date filters): update data without full page "refresh"
    useEffect(() => {
        if (!hasMountedRef.current) return;
        fetchOrders(page, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, startDate, endDate]);

    // Real-time updates: when global context detects new orders, refresh current page silently
    useEffect(() => {
        if (!hasMountedRef.current) return;
        fetchOrders(page, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersFromContext?.length, ordersFromContext?.[0]?.orderId]);

    const fetchOrders = async (requestedPage = 1, showPageLoader = false) => {
        try {
            if (showPageLoader) {
                setLoading(true);
            }
            const params = { page: requestedPage };
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const response = await sellerApi.getOrders(params);

            // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
            const payload = response.data.result || {};
            const rawOrders = Array.isArray(payload.items)
                ? payload.items
                : (response.data.results || []);

            const formattedOrders = (rawOrders || []).map(order => ({
                id: order.orderId,
                _id: order._id,
                customer: {
                    name: order.customer?.name || 'Unknown',
                    phone: order.customer?.phone || '',
                    avatar: (order.customer?.name || 'U').charAt(0)
                },
                items: (order.items || []).map(item => ({
                    name: item.name,
                    price: item.price,
                    qty: item.quantity,
                    image: item.image
                })),
                total: order.pricing?.total || 0,
                subtotal: order.pricing?.subtotal ?? order.paymentBreakdown?.productSubtotal ?? 0,
                deliveryFee: order.pricing?.deliveryFee ?? order.paymentBreakdown?.deliveryFeeCharged ?? 0,
                status: getLegacyStatusFromOrder(order),
                workflowStatus: order.workflowStatus,
                workflowVersion: order.workflowVersion,
                date: order.createdAt
                    ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '',
                time: order.createdAt
                    ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                    : '',
                address: order.address
                    ? `${order.address.address || ''}, ${order.address.city || ''}`.trim()
                    : '',
                location: order.address?.location || null,
                payment: order.payment?.method === 'cash' || order.payment?.method === 'cod'
                    ? 'Cash on Delivery'
                    : 'Online Paid'
            }));

            setOrders(formattedOrders);
            setSummary({
                totalOrders: Number(payload.summary?.totalOrders || payload.total || formattedOrders.length || 0),
                totalAmount: Number(payload.summary?.totalAmount || 0),
                pending: Number(payload.summary?.pending || 0),
                confirmed: Number(payload.summary?.confirmed || 0),
                packed: Number(payload.summary?.packed || 0),
                outForDelivery: Number(payload.summary?.outForDelivery || 0),
                delivered: Number(payload.summary?.delivered || 0),
                cancelled: Number(payload.summary?.cancelled || 0),
                returned: Number(payload.summary?.returned || 0),
                activeOrders: Number(payload.summary?.activeOrders || 0),
            });
            if (typeof payload.total === 'number') {
                setTotal(payload.total);
            } else {
                setTotal(formattedOrders.length);
            }
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            showToast("Failed to fetch orders", "error");
        } finally {
            if (showPageLoader) {
                setLoading(false);
            }
        }
    };

    const tabs = ['All', 'Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const todayStr = new Date().toISOString().split('T')[0];

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        return safeOrders.filter(order => {
            const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
            const statusToMatch = activeTab === 'Out for Delivery' ? 'out_for_delivery' : activeTab.toLowerCase();
            const matchesTab = activeTab === 'All' || order.status.toLowerCase() === statusToMatch;
            return matchesSearch && matchesTab;
        });
    }, [safeOrders, searchTerm, activeTab]);

    const stats = useMemo(() => [
        {
            label: 'Total Orders',
            value: summary.totalOrders,
            icon: HiOutlineArchiveBoxXMark,
            color: 'text-primary',
            bg: 'bg-primary/10'
        },
        {
            label: 'Pending',
            value: summary.pending,
            icon: HiOutlineClock,
            color: 'text-warning',
            bg: 'bg-warning/10'
        },
        {
            label: 'Confirmed',
            value: summary.confirmed,
            icon: HiOutlineCheck,
            color: 'text-info',
            bg: 'bg-info/10'
        },
        {
            label: 'Delivered',
            value: summary.delivered,
            icon: HiOutlineCheck,
            color: 'text-success',
            bg: 'bg-success/10'
        }
    ], [summary]);

    const getStatusColor = getOrderStatusVariant;

    const handleViewDetails = (order) => {
        setSelectedOrder(order);
        setIsDetailsModalOpen(true);
    };

    const applyStatusUpdate = async (orderId, newStatus) => {
        try {
            await sellerApi.updateOrderStatus(orderId, { status: newStatus.toLowerCase() });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchOrders(page, false); // Refresh orders without resetting page
            if (selectedOrder && selectedOrder.id === orderId) {
                setSelectedOrder({ ...selectedOrder, status: newStatus });
            }
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    // Audit fix: the status dropdown called this directly on `onChange` with
    // no confirmation step — a misclick on "Cancelled" instantly cancelled a
    // live customer order with no confirm dialog and no undo. Gate the
    // destructive transition behind the shared confirm dialog; every other
    // (forward-progress) status change stays a single click since those are
    // expected, frequent actions.
    const handleStatusUpdate = (orderId, newStatus) => {
        if (String(newStatus).toLowerCase() === 'cancelled') {
            statusConfirm.open({
                title: 'Cancel this order?',
                message: 'This will cancel the order for the customer. This cannot be undone from here.',
                confirmLabel: 'Cancel Order',
                cancelLabel: 'Keep Order',
                onConfirm: () => applyStatusUpdate(orderId, newStatus),
            });
            return;
        }
        applyStatusUpdate(orderId, newStatus);
    };

    const exportOrders = () => {
        const data = filteredOrders;
        if (!data.length) {
            showToast("No orders to export", "warning");
            return;
        }
        const escapeCsv = (v) => {
            const s = String(v ?? "").replace(/"/g, '""');
            return /[",\n\r]/.test(s) ? `"${s}"` : s;
        };
        const headers = ["Order ID", "Customer", "Phone", "Date", "Time", "Total (₹)", "Status", "Address", "Payment"];
        const rows = data.map((o) => [
            o.id,
            o.customer?.name ?? "",
            o.customer?.phone ?? "",
            o.date,
            o.time,
            o.total,
            o.status,
            o.address ?? "",
            o.payment ?? "",
        ]);
        const csvContent = [
            headers.map(escapeCsv).join(","),
            ...rows.map((row) => row.map(escapeCsv).join(",")),
        ].join("\n");
        const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${data.length} order(s) as CSV`, "success");
    };

    const StatusSelect = ({ order, className }) => (
        <div className={cn("relative inline-block", className)}>
            <select
                value={order.status}
                onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "w-full text-[10px] pl-2.5 pr-7 py-1.5 rounded-full font-black uppercase tracking-widest cursor-pointer appearance-none focus:ring-2 focus:ring-offset-1 transition-all border-none outline-none shadow-sm",
                    STATUS_SELECT_STYLES[getStatusColor(order.status)] || STATUS_SELECT_STYLES.secondary
                )}
            >
                <option value="pending" disabled={['confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.status)}>Pending</option>
                <option value="confirmed" disabled={['packed', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.status)}>Confirmed</option>
                <option value="packed" disabled={['out_for_delivery', 'delivered', 'cancelled'].includes(order.status)}>Packed</option>
                <option value="out_for_delivery" disabled={['delivered', 'cancelled'].includes(order.status)}>Out for Delivery</option>
                <option value="delivered" disabled={order.status === 'cancelled'}>Delivered</option>
                <option value="cancelled">Cancelled</option>
            </select>
            <HiOutlineChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-60" />
        </div>
    );

    const orderColumns = [
        {
            header: 'Order Details',
            key: 'order',
            cell: (order) => (
                <div>
                    <span className="text-xs font-bold text-slate-900 hover:text-primary transition-colors cursor-pointer" onClick={() => handleViewDetails(order)}>
                        #{order.id}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mt-1">
                        <HiOutlineCalendarDays className="h-3 w-3" />
                        {order.date} • {order.time}
                    </div>
                </div>
            ),
        },
        {
            header: 'Customer',
            key: 'customer',
            cell: (order) => (
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                        {order.customer.avatar}
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-900">{order.customer.name}</p>
                        <p className="text-[11px] font-medium text-slate-400">{order.customer.phone}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Total',
            key: 'total',
            cell: (order) => (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900">₹{order.total.toLocaleString()}</span>
                    <span className="text-[11px] font-medium text-slate-400">{order.items.length} items</span>
                </div>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            cell: (order) => <StatusSelect order={order} className="w-36" />,
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (order) => (
                <button
                    onClick={() => handleViewDetails(order)}
                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-lg transition-all text-slate-500"
                >
                    <HiOutlineEye className="h-4 w-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Order Management
                        <Badge variant="primary">Real-time</Badge>
                    </span>
                }
                description="Process and track your customer orders, from confirmation through delivery."
                actions={
                    <>
                        <Button onClick={exportOrders} variant="outline">
                            <HiOutlinePrinter className="h-4 w-4" />
                            Export All
                        </Button>
                        <Button onClick={() => setIsQuickViewModalOpen(true)} variant="primary">
                            <HiOutlineEye className="h-4 w-4" />
                            Quick View
                        </Button>
                    </>
                }
            />

            {/* Quick Stats */}
            {loading ? (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {stats.map((stat, i) => (
                            <StatCard key={i} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm scrollbar-hide">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "relative shrink-0 whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-colors",
                                    activeTab === tab ? "text-primary" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                {tab}
                                {activeTab === tab && (
                                    <motion.div layoutId="tab-underline" className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Toolbox */}
                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-72">
                                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by Order ID or Customer Name..."
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        right={
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="w-32">
                                    <DatePicker
                                        value={startDate}
                                        max={todayStr}
                                        align="left"
                                        onChange={(value) => {
                                            if (!value) {
                                                setStartDate("");
                                                setPage(1);
                                                return;
                                            }
                                            const today = new Date().toISOString().split("T")[0];
                                            if (value > today) {
                                                showToast("Start date cannot be in the future", "error");
                                                return;
                                            }
                                            if (endDate && value > endDate) {
                                                showToast("Start date cannot be after end date", "error");
                                                return;
                                            }
                                            setPage(1);
                                            setStartDate(value);
                                        }}
                                        placeholder="From date"
                                    />
                                </div>
                                <span className="hidden text-xs font-medium text-slate-400 sm:inline">to</span>
                                <div className="w-32">
                                    <DatePicker
                                        value={endDate}
                                        max={todayStr}
                                        min={startDate || undefined}
                                        align="right"
                                        popupClassName="mt-4"
                                        disabled={!startDate}
                                        onChange={(value) => {
                                            if (!value) {
                                                setEndDate("");
                                                setPage(1);
                                                return;
                                            }
                                            const today = new Date().toISOString().split("T")[0];
                                            if (value > today) {
                                                showToast("End date cannot be in the future", "error");
                                                return;
                                            }
                                            if (startDate && value < startDate) {
                                                showToast("End date cannot be before start date", "error");
                                                return;
                                            }
                                            setPage(1);
                                            setEndDate(value);
                                        }}
                                        placeholder="To date"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                                >
                                    Clear dates
                                </button>
                            </div>
                        }
                    />

                    {/* Mobile: Card list */}
                    <div className="md:hidden space-y-3">
                        {filteredOrders.length === 0 ? (
                            <EmptyState
                                icon={<HiOutlineInboxStack className="h-6 w-6" />}
                                title="No orders found"
                                description="Adjust your filters or search to see more orders."
                                action={<Button variant="outline" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>Clear Filters</Button>}
                            />
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {filteredOrders.map((order) => (
                                    <motion.div
                                        key={order.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1" onClick={() => handleViewDetails(order)}>
                                                <p className="text-xs font-black text-slate-900 truncate">#{order.id}</p>
                                                <p className="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                                                    <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
                                                    {order.date} • {order.time}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="h-7 w-7 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                                                        {order.customer.avatar}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 truncate">{order.customer.name}</p>
                                                </div>
                                                <p className="text-sm font-black text-slate-900 mt-2">₹{order.total.toLocaleString()}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                                                <StatusSelect order={order} className="min-w-[110px]" />
                                                <button onClick={() => handleViewDetails(order)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                                    <HiOutlineEye className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>

                    {/* Desktop: Table */}
                    <div className="hidden md:block">
                        <DataTable
                            columns={orderColumns}
                            data={filteredOrders}
                            rowKey={(o) => o.id}
                            emptyState={
                                <EmptyState
                                    icon={<HiOutlineInboxStack className="h-6 w-6" />}
                                    title="No orders found"
                                    description="We couldn't find any orders matching your current filters. Try adjusting your search."
                                    action={<Button variant="outline" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>Clear All Filters</Button>}
                                />
                            }
                        />
                    </div>

                    <Pagination
                        page={page}
                        totalPages={Math.ceil((total || filteredOrders.length) / pageSize) || 1}
                        total={total || filteredOrders.length}
                        pageSize={pageSize}
                        onPageChange={(p) => setPage(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                            fetchOrders(1, false);
                        }}
                        loading={loading}
                    />

                    {/* Quick View Summary Modal */}
                    <AnimatePresence>
                        {isQuickViewModalOpen && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                                    onClick={() => setIsQuickViewModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                                >
                                    <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-sm shadow-primary/30 shrink-0">
                                                <HiOutlineChartBar className="h-4 w-4 sm:h-5 sm:w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">Quick Snapshot</h3>
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Today's Performance</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsQuickViewModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 shrink-0">
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/10">
                                                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest mb-1">Total Revenue</p>
                                                <p className="text-lg sm:text-xl font-black text-primary truncate">₹{summary.totalAmount.toLocaleString('en-IN')}</p>
                                            </div>
                                            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/10">
                                                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest mb-1">Avg. Order Value</p>
                                                <p className="text-lg sm:text-xl font-black text-primary">₹{summary.totalOrders ? (summary.totalAmount / summary.totalOrders).toFixed(0) : '0'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
                                        <Button
                                            onClick={() => {
                                                setIsQuickViewModalOpen(false);
                                                setActiveTab('Pending');
                                            }}
                                            className="w-full"
                                        >
                                            View All Pending Orders
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                    <AnimatePresence>
                        {isDetailsModalOpen && selectedOrder && (
                            <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-3 sm:p-6 lg:p-12">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                                    onClick={() => setIsDetailsModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                                >
                                    {/* Modal Header */}
                                    <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100">
                                        <div className="flex items-center space-x-3">
                                            <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                                                <HiOutlineTruck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-slate-900">Order Details</h3>
                                                <div className="flex items-center space-x-2 mt-0.5">
                                                    <Badge variant={getStatusColor(selectedOrder.status)}>{selectedOrder.status}</Badge>
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">#{selectedOrder.id}</span>
                                                </div>
                                                {(selectedOrder.date || selectedOrder.time) && (
                                                    <p className="text-[11px] font-bold text-slate-400 mt-1.5 flex items-center gap-1.5">
                                                        <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                                        {selectedOrder.date}
                                                        {selectedOrder.time && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <HiOutlineClock className="h-3.5 w-3.5" />
                                                                {selectedOrder.time}
                                                            </>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto scrollbar-hide flex-1">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                                            <div className="space-y-3 sm:space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                            <HiOutlineMapPin className="h-3 w-3 text-primary" /> Delivery Address
                                                        </h4>
                                                        {selectedOrder.location &&
                                                            typeof selectedOrder.location.lat === "number" &&
                                                            typeof selectedOrder.location.lng === "number" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const { lat, lng } = selectedOrder.location;
                                                                        window.open(
                                                                            `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                                            "_blank",
                                                                        );
                                                                    }}
                                                                    className="text-[10px] font-bold text-primary hover:underline"
                                                                >
                                                                    View on map
                                                                </button>
                                                            )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        {selectedOrder.address}
                                                    </p>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <HiOutlinePhone className="h-3 w-3 text-success" /> Contact Info
                                                    </h4>
                                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        <p className="text-xs font-bold text-slate-800">{selectedOrder.customer.name}</p>
                                                        <p className="text-xs font-semibold text-slate-500 mt-0.5">{selectedOrder.customer.phone}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-3 sm:space-y-4">
                                                <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                                                    <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-3">Order Summary</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="font-bold text-slate-500">Subtotal</span>
                                                            <span className="font-black text-slate-900">₹{Number(selectedOrder.subtotal ?? selectedOrder.total ?? 0).toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="font-bold text-slate-500">Delivery Fee</span>
                                                            <span className="font-black text-success">₹{Number(selectedOrder.deliveryFee ?? 0).toFixed(2)}</span>
                                                        </div>
                                                        <div className="h-px bg-primary/10 my-2" />
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-black text-slate-900">Total</span>
                                                            <span className="font-black text-primary">₹{Number(selectedOrder.total ?? 0).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-slate-900/10">
                                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Status</h4>
                                                    <div className="flex items-center gap-2">
                                                        <HiOutlineBanknotes className="h-5 w-5 text-success" />
                                                        <span className="text-xs font-bold tracking-tight">{selectedOrder.payment}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 sm:mb-4">Items Ordered ({selectedOrder.items.length})</h4>
                                        <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                            {selectedOrder.items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                                                            <img src={item.image} alt={item.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900">{item.name}</p>
                                                            <p className="text-xs font-semibold text-slate-500 mt-0.5">₹{item.price.toFixed(2)} × {item.qty}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-slate-900">₹{(item.price * item.qty).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center justify-end">
                                        <div className="flex gap-2 items-center">
                                            <button onClick={() => setIsDetailsModalOpen(false)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all">Close</button>
                                            <StatusSelect order={{ ...selectedOrder, status: selectedOrder.status.toLowerCase() }} className="w-40" />
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </>
            )}
            {loading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 shadow-sm">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-slate-500 font-semibold mt-3 text-xs uppercase tracking-widest">Fetching orders...</p>
                </div>
            )}
            <ConfirmDialog
                isOpen={statusConfirm.isOpen}
                title={statusConfirm.title}
                message={statusConfirm.message}
                confirmLabel={statusConfirm.confirmLabel}
                cancelLabel={statusConfirm.cancelLabel}
                onConfirm={statusConfirm.handleConfirm}
                onCancel={statusConfirm.close}
                loading={statusConfirm.loading}
                variant="danger"
            />
        </div>
    );
};

export default Orders;
