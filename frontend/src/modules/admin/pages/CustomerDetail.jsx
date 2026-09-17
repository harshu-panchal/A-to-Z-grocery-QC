import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../services/adminApi';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import DataTable from '@shared/components/ui/DataTable';
import {
    MapPin,
    ShoppingBag,
    TrendingUp,
    MessageSquare,
    ChevronLeft,
    History,
    RotateCw,
    Edit3,
    Map as MapIcon,
    ChevronRight,
    Ban,
    Search,
    Bell,
    Package,
    IndianRupee,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Modal from '@shared/components/ui/Modal';
import { useToast } from '@shared/components/ui/Toast';

const CustomerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [orderSearch, setOrderSearch] = useState('');
    const [visibleOrders, setVisibleOrders] = useState(3);

    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
    const [isRestrictModalOpen, setIsRestrictModalOpen] = useState(false);

    // Form states
    const [notifMessage, setNotifMessage] = useState('');
    const [notes, setNotes] = useState('Prefer morning deliveries. Use the building entrance on the north side.');

    const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });

    // Perf audit Phase 8: migrated to React Query. `customer`/`orders` are
    // mutated locally (block/unblock, edit-profile) without a real API
    // round-trip — this predates the migration (flagged pre-existing mock
    // behavior) and is preserved exactly via queryClient.setQueryData
    // instead of setState.
    const customerQueryKey = ['admin', 'customerDetail', id];
    const { data: customerQueryData, isLoading: loading, isError } = useQuery({
        queryKey: customerQueryKey,
        queryFn: async () => {
            const { data } = await adminApi.getUserById(id);
            if (data.success) {
                const customerData = data.result;
                setEditForm({
                    name: customerData.name,
                    email: customerData.email,
                    phone: customerData.phone
                });
                return { customer: customerData, orders: customerData.recentOrders || [] };
            }
            return { customer: null, orders: [] };
        },
        enabled: !!id,
    });

    useEffect(() => {
        if (isError) showToast("Failed to load customer profile", "error");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const customer = customerQueryData?.customer ?? null;
    const orders = customerQueryData?.orders ?? [];

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
            showToast('Customer data synchronized with main server', 'success');
        }, 1000);
    };

    const handleUpdateProfile = (e) => {
        e.preventDefault();
        queryClient.setQueryData(customerQueryKey, (prev) => ({
            ...(prev || { orders: [] }),
            customer: { ...editForm },
        }));
        setIsEditModalOpen(false);
        showToast('Profile updated successfully', 'success');
    };

    const handleSendNotif = () => {
        if (!notifMessage.trim()) return;
        setIsNotifModalOpen(false);
        setNotifMessage('');
        showToast('Notification sent to user', 'success');
    };

    const handleRestrictAccount = () => {
        const newStatus = customer.status === 'active' ? 'restricted' : 'active';
        queryClient.setQueryData(customerQueryKey, (prev) => ({
            ...(prev || { orders: [] }),
            customer: { ...prev?.customer, status: newStatus },
        }));
        setIsRestrictModalOpen(false);
        showToast(`Account successfully ${newStatus === 'restricted' ? 'restricted' : 'activated'}`, newStatus === 'restricted' ? 'warning' : 'success');
    };

    const handleSaveNotes = () => {
        showToast('Internal CRM notes updated', 'info');
    };

    const handleExportCSV = () => {
        showToast('Archive export initiated. CSV will be ready shortly.', 'info');
    };


    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        return safeOrders.filter(o =>
            (o.id || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
            (o.status || '').toLowerCase().includes(orderSearch.toLowerCase())
        ).slice(0, visibleOrders);
    }, [safeOrders, orderSearch, visibleOrders]);

    if (loading) {
        return (
            <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
                <RotateCw className="h-9 w-9 animate-spin text-primary" />
                <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Profile...</p>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
                <p className="text-lg font-bold text-slate-400">Customer not found</p>
                <button onClick={() => navigate('/admin/customers')} className="font-bold text-primary">Back to Customers</button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Action Bar */}
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/customers')}
                        className="group rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all hover:bg-slate-50"
                    >
                        <ChevronLeft className="h-5 w-5 text-slate-500 transition-transform group-hover:-translate-x-0.5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-900">Customer Profile</h1>
                            <Badge variant="outline">{customer.id}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">Full profile and shopping history for this customer.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleRefresh}>
                        <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button
                        onClick={() => {
                            setEditForm({ ...customer });
                            setIsEditModalOpen(true);
                        }}
                    >
                        <Edit3 className="h-4 w-4" />
                        Edit Profile
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Main Profile Info */}
                <Card className="p-5 lg:col-span-2">
                    <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
                        <div className="relative shrink-0">
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=BaseUser&backgroundColor=f1f5f9`}
                                alt=""
                                className="h-28 w-28 rounded-xl border border-slate-100 bg-slate-100 shadow-sm"
                            />
                            <div className={cn(
                                "absolute -bottom-1 -right-1 h-5 w-5 rounded-full shadow-sm ring-4 ring-white",
                                customer.status === 'active' ? "bg-success" : "bg-danger"
                            )}></div>
                        </div>
                        <div className="flex-1 space-y-5 text-center md:text-left">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">{customer.name}</h3>
                                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                                    Customer since {new Date(customer.joinedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                {[
                                    { label: 'Total Spend', value: `₹${(customer.totalSpent || 0).toLocaleString()}`, trend: 'Lifetime', icon: IndianRupee, color: 'text-success', bg: 'bg-success/10' },
                                    { label: 'Orders Placed', value: customer.totalOrders || 0, trend: 'Lifetime', icon: ShoppingBag, color: 'text-primary', bg: 'bg-primary/10' },
                                    { label: 'Average Spend', value: `₹${customer.totalOrders > 0 ? Math.round(customer.totalSpent / customer.totalOrders).toLocaleString() : 0}`, trend: 'Per Order', icon: TrendingUp, color: 'text-info', bg: 'bg-info/10' },
                                    { label: 'Account Status', value: (customer.status || '').toUpperCase(), trend: 'Current', icon: CheckCircle2, color: 'text-warning', bg: 'bg-warning/10' },
                                ].map((stat, i) => (
                                    <div key={i} className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-center">
                                        <div className={cn("mb-2 rounded-full p-2", stat.bg, stat.color)}>
                                            <stat.icon className="h-4 w-4" />
                                        </div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</p>
                                        <h5 className="mt-1 text-lg font-black text-slate-900">{stat.value}</h5>
                                        <p className="mt-0.5 text-xs font-bold text-slate-500">{stat.trend}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Quick Stats */}
                <div className="space-y-4">
                    <Card className="relative overflow-hidden border-none bg-primary p-5 text-white">
                        <div className="relative z-10">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest opacity-90">Lifetime Value</p>
                            <h4 className="text-2xl font-black text-white">₹{(customer.totalSpent || 0).toLocaleString()}</h4>
                            <div className="mt-3 flex items-center gap-2">
                                <div className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-white">
                                    {customer.totalOrders} Orders
                                </div>
                                <TrendingUp className="h-4 w-4 text-white/90" />
                            </div>
                        </div>
                        <ShoppingBag className="absolute -bottom-4 -right-4 h-24 w-24 text-white/10" />
                    </Card>

                    <Card className="p-5">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Activity</p>
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-warning/10 p-2 text-warning">
                                <RotateCw className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-700">Last Order placed</p>
                                <p className="text-[10px] font-semibold text-slate-400">
                                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Delivery & Order History */}
                <div className="space-y-5 lg:col-span-2">
                    {/* Delivery addresses */}
                    <Card className="p-5">
                        <h4 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-900">
                            <MapIcon className="h-4 w-4 text-primary" />
                            Saved Addresses
                        </h4>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {(Array.isArray(customer.addresses) ? customer.addresses : []).length > 0 ? (
                                (Array.isArray(customer.addresses) ? customer.addresses : []).map((addr, idx) => {
                                    const type = (addr.label || addr.type || 'other').toUpperCase();
                                    const parts = [addr.fullAddress || addr.address, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean);
                                    const fullAddress = parts.length > 0 ? parts.join(', ') : 'No address';
                                    const isDefault = addr.isDefault ?? (idx === 0);
                                    return (
                                        <div key={addr._id || addr.id || idx} className={cn(
                                            "p-4 rounded-xl border transition-all",
                                            isDefault ? "bg-slate-50 border-slate-200" : "bg-white border-slate-100 hover:border-primary/20"
                                        )}>
                                            <div className="mb-2 flex items-center justify-between">
                                                <Badge variant={isDefault ? 'primary' : 'secondary'}>{type}</Badge>
                                                <MapPin className="h-3.5 w-3.5 text-slate-300" />
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-xs font-bold leading-relaxed text-slate-600">{fullAddress}</p>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                                    <MapPin className="mx-auto mb-3 h-8 w-8 text-slate-200" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No saved addresses</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Order history */}
                    <Card className="overflow-hidden p-0">
                        <div className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
                            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-900">
                                <History className="h-4 w-4 text-primary" />
                                Recent Orders
                            </h4>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search Orders..."
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        className="h-8 w-36 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-[10px] font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <button
                                    onClick={handleExportCSV}
                                    className="text-[10px] font-bold uppercase text-primary hover:underline"
                                >
                                    Export CSV
                                </button>
                            </div>
                        </div>
                        <DataTable
                            columns={[
                                {
                                    key: 'order',
                                    header: 'Order',
                                    primary: true,
                                    cell: (order) => (
                                        <div className="flex items-center gap-3">
                                            <div className="rounded-lg bg-slate-50 p-2 text-slate-400">
                                                <Package className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{order.id}</p>
                                                <p className="text-[10px] font-bold text-slate-400">{order.itemsCount} Items</p>
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'date',
                                    header: 'Date',
                                    cell: (order) => (
                                        <p className="text-[10px] font-bold uppercase text-slate-400">
                                            {new Date(order.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </p>
                                    ),
                                },
                                {
                                    key: 'status',
                                    header: 'Status',
                                    align: 'center',
                                    cell: (order) => (
                                        <Badge variant={order.status === 'delivered' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}>
                                            {order.status}
                                        </Badge>
                                    ),
                                },
                                {
                                    key: 'amount',
                                    header: 'Amount',
                                    align: 'right',
                                    cell: (order) => (
                                        <span className="font-black text-slate-900">₹{(order.amount || 0).toLocaleString()}</span>
                                    ),
                                },
                            ]}
                            data={filteredOrders}
                            rowKey={(order, i) => i}
                            onRowClick={(order) => navigate(`/admin/orders/view/${order.id.replace('#', '')}`)}
                            emptyState={
                                <p className="px-4 py-5 text-center text-xs font-bold text-slate-400">
                                    No orders found matching your search.
                                </p>
                            }
                            className="rounded-none border-none shadow-none"
                        />
                        {visibleOrders < safeOrders.length && (
                            <div className="flex justify-center border-t border-slate-50 bg-slate-50/50 p-3">
                                <button
                                    onClick={() => setVisibleOrders(safeOrders.length)}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase text-primary hover:underline"
                                >
                                    Show All Orders
                                    <ChevronRight className="h-3 w-3" />
                                </button>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar Notes */}
                <div className="space-y-5">
                    <Card className="p-5">
                        <h4 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-900">
                            <MessageSquare className="h-4 w-4 text-primary" />
                            Internal Notes
                        </h4>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="min-h-[140px] w-full rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium italic leading-relaxed text-slate-600 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary/20"
                        />
                        <Button variant="secondary" className="mt-4 w-full" onClick={handleSaveNotes}>
                            Update Notes
                        </Button>
                    </Card>

                    <Card className="border-none bg-slate-900 p-5 text-white">
                        <h4 className="mb-5 text-xs font-bold uppercase tracking-widest opacity-40">Account Control</h4>
                        <div className="space-y-3">
                            <Button className="w-full" onClick={() => setIsNotifModalOpen(true)}>
                                <MessageSquare className="h-4 w-4" />
                                Send Notification
                            </Button>
                            <button
                                onClick={() => setIsRestrictModalOpen(true)}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/10 py-3 text-[11px] font-bold uppercase tracking-widest text-danger transition-all hover:bg-danger hover:text-white"
                            >
                                <Ban className="h-4 w-4" />
                                {customer.status === 'active' ? 'Block Account' : 'Unblock Account'}
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Profile Details">
                <form onSubmit={handleUpdateProfile} className="space-y-5">
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Name</label>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone Number</label>
                            <input
                                type="text"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>
                    <Button type="submit" className="w-full">
                        Save Changes
                    </Button>
                </form>
            </Modal>

            <Modal isOpen={isNotifModalOpen} onClose={() => setIsNotifModalOpen(false)} title="Send Notification">
                <div className="space-y-5">
                    <div className="flex items-start gap-3 rounded-xl bg-primary/10 p-4">
                        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <p className="text-xs font-bold leading-relaxed text-primary">
                            We will send notifications via app and SMS immediately.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Message</label>
                        <textarea
                            value={notifMessage}
                            onChange={(e) => setNotifMessage(e.target.value)}
                            placeholder="Type your message here..."
                            className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <Button
                        className="w-full"
                        onClick={handleSendNotif}
                        disabled={!notifMessage.trim()}
                    >
                        Send Message
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={isRestrictModalOpen} onClose={() => setIsRestrictModalOpen(false)} title="Confirm Action">
                <div className="space-y-5">
                    <div className="flex flex-col items-center gap-4 rounded-xl border border-danger/20 bg-danger/5 p-6 text-center">
                        <div className="rounded-full bg-danger p-3 text-white">
                            <Ban className="h-6 w-6" />
                        </div>
                        <h5 className="text-lg font-black text-slate-900">
                            Confirm Account {customer.status === 'active' ? 'Block' : 'Unblock'}?
                        </h5>
                        <p className="text-sm font-medium leading-relaxed text-slate-500">
                            {customer.status === 'active'
                                ? 'This will block the customer from placing orders or logging in.'
                                : 'This will allow the customer to use all platform features again.'
                            }
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setIsRestrictModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" className="flex-1" onClick={handleRestrictAccount}>
                            Confirm
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CustomerDetail;
