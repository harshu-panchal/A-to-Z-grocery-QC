import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import DataTable from '@shared/components/ui/DataTable';
import StatCard from '@shared/components/ui/StatCard';
import {
    ChevronLeft,
    Building2,
    User,
    Mail,
    Phone,
    MapPin,
    Star,
    Wallet,
    TrendingUp,
    ShoppingBag,
    History,
    Banknote,
    Clock,
    Edit3,
    CheckCircle2,
    XCircle,
    RotateCw,
    Search,
    Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion } from 'framer-motion';

const SellerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('orders');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Mock Data for Seller
    const [seller] = useState({
        id: id || 'SEL-001',
        shopName: 'Fresh Mart Superstore',
        ownerName: 'Rahul Sharma',
        email: 'rahul@freshmart.com',
        phone: '+91 98765 43210',
        category: 'Grocery',
        rating: 4.8,
        status: 'active',
        joinedDate: '12 Jan 2024',
        location: 'Mumbai, Maharashtra',
        image: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&q=80&w=200',
        walletBalance: 24500,
        totalOrders: 1450,
        totalRevenue: 540000,
        commissionRate: '10%',
        coords: { lat: 19.0760, lng: 72.8777 },
        serviceRadius: 5,
        bankInfo: {
            bankName: 'HDFC Bank',
            accountNo: 'XXXX XXXX 1234',
            ifsc: 'HDFC0001234'
        }
    });

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
            showToast('Seller data synchronized', 'success');
        }, 800);
    };

    return (
        <div className="space-y-5">
            {/* Header / Action Bar */}
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/sellers/active')}
                        className="group rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all hover:bg-slate-50"
                    >
                        <ChevronLeft className="h-5 w-5 text-slate-500 transition-transform group-hover:-translate-x-0.5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-900">{seller.shopName}</h1>
                            <Badge variant="success">{seller.status}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-slate-500">Owned by {seller.ownerName} • {seller.category}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleRefresh}>
                        <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        Sync Data
                    </Button>
                    <Button>
                        <Edit3 className="h-4 w-4" />
                        Edit Shop
                    </Button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Wallet Balance" value={`₹${seller.walletBalance.toLocaleString()}`} icon={Wallet} color="text-success" bg="bg-success/10" description="Available for Payout" />
                <StatCard label="Total Revenue" value={`₹${(seller.totalRevenue / 1000).toFixed(1)}k`} icon={TrendingUp} color="text-primary" bg="bg-primary/10" description="Gross Sales" />
                <StatCard label="Orders Handled" value={seller.totalOrders} icon={ShoppingBag} color="text-info" bg="bg-info/10" description="Lifetime Orders" />
                <StatCard label="Store Rating" value={`${seller.rating} / 5.0`} icon={Star} color="text-warning" bg="bg-warning/10" description="Based on 450+ reviews" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Main Content Area */}
                <div className="space-y-5 lg:col-span-2">
                    {/* Tabs Navigation */}
                    <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                        {[
                            { id: 'orders', label: 'Order History', icon: History },
                            { id: 'transactions', label: 'Transactions', icon: Banknote },
                            { id: 'delivery', label: 'Delivery', icon: MapPin },
                            { id: 'payouts', label: 'Withdrawals', icon: Wallet },
                            { id: 'info', label: 'Store Info', icon: Building2 },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all",
                                    activeTab === tab.id
                                        ? "bg-white text-primary shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <Card className="min-h-[500px] overflow-hidden p-0">
                        {activeTab === 'orders' && (
                            <div>
                                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900">Recent Orders</h4>
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Order ID..."
                                                className="h-9 w-36 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <button className="rounded-lg bg-slate-50 p-2 text-slate-400 transition-colors hover:text-primary">
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <DataTable
                                    columns={[
                                        {
                                            key: 'id',
                                            header: 'Order ID',
                                            primary: true,
                                            cell: (order) => (
                                                <div>
                                                    <span className="text-xs font-black text-slate-900">{order.id}</span>
                                                    <p className="text-[10px] font-bold text-slate-400">{order.date}</p>
                                                </div>
                                            ),
                                        },
                                        {
                                            key: 'customer',
                                            header: 'Customer',
                                            cell: (order) => <span className="text-xs font-bold text-slate-700">{order.customer}</span>,
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
                                            cell: (order) => <span className="font-black text-slate-900">₹{order.amount.toLocaleString()}</span>,
                                        },
                                    ]}
                                    data={[
                                        { id: '#ORD-9912', customer: 'Aarav Patel', status: 'delivered', amount: 850, date: 'Today, 11:30 AM' },
                                        { id: '#ORD-9884', customer: 'Ishani Roy', status: 'processing', amount: 1240, date: 'Today, 09:15 AM' },
                                        { id: '#ORD-9821', customer: 'Kabir Singh', status: 'delivered', amount: 450, date: 'Yesterday' },
                                        { id: '#ORD-9750', customer: 'Priya Verma', status: 'cancelled', amount: 2100, date: 'Yesterday' },
                                        { id: '#ORD-9690', customer: 'Rohan Mehra', status: 'delivered', amount: 150, date: '14 Feb' },
                                    ]}
                                    rowKey={(order, i) => i}
                                    className="rounded-none border-none shadow-none"
                                />
                            </div>
                        )}

                        {activeTab === 'transactions' && (
                            <div className="p-4">
                                <div className="mb-6 flex items-center justify-between">
                                    <h4 className="text-sm font-black text-slate-900">Financial Ledger</h4>
                                    <Badge variant="info">Last 30 Days</Badge>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { id: 'TXN-8821', type: 'credit', desc: 'Order #ORD-9912 Settlement', amount: 765, date: 'Today, 14:20' },
                                        { id: 'TXN-8810', type: 'debit', desc: 'Withdrawal to Bank', amount: 15000, date: 'Yesterday' },
                                        { id: 'TXN-8792', type: 'credit', desc: 'Order #ORD-9821 Settlement', amount: 405, date: 'Yesterday' },
                                        { id: 'TXN-8750', type: 'credit', desc: 'Order #ORD-9690 Settlement', amount: 135, date: '14 Feb' },
                                    ].map((txn, i) => (
                                        <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 transition-all hover:bg-white hover:shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg",
                                                    txn.type === 'credit' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                                                )}>
                                                    {txn.type === 'credit' ? <TrendingUp className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900">{txn.desc}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{txn.id} • {txn.date}</p>
                                                </div>
                                            </div>
                                            <p className={cn("text-sm font-black", txn.type === 'credit' ? "text-success" : "text-danger")}>
                                                {txn.type === 'credit' ? '+' : '-'} ₹{txn.amount.toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'delivery' && (
                            <div className="group relative h-[500px] overflow-hidden">
                                {/* Map Background Overlay */}
                                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000')] opacity-40 contrast-[1.1] grayscale-[0.3]" />
                                <div className="absolute inset-0 bg-gradient-to-tr from-slate-200/50 via-transparent to-primary/5" />

                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="relative">
                                        {/* Service Area Radar */}
                                        <motion.div
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className="animate-pulse rounded-full border-2 border-primary/40 bg-primary/20 shadow-[0_0_50px_rgba(37,99,235,0.3)]"
                                            style={{
                                                width: `${seller.serviceRadius * 40}px`,
                                                height: `${seller.serviceRadius * 40}px`
                                            }}
                                        />
                                        {/* Store Marker */}
                                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                                            <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-2xl ring-4 ring-white">
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="absolute inset-0 animate-ping rounded-xl bg-primary opacity-20" />
                                        </div>
                                    </div>
                                </div>

                                {/* Floating Legend */}
                                <div className="absolute left-6 top-6 flex flex-col gap-2">
                                    <div className="rounded-xl border border-white/50 bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Coverage View</p>
                                        <h5 className="text-sm font-black text-slate-900">{seller.serviceRadius}km Delivery Area</h5>
                                    </div>
                                </div>
                                <div className="absolute bottom-6 right-6 max-w-[200px] rounded-xl border border-white/10 bg-slate-900/90 p-4 text-white shadow-2xl backdrop-blur">
                                    <p className="mb-1 text-[9px] font-bold uppercase opacity-60">Live Telemetry</p>
                                    <p className="text-[10px] font-bold leading-relaxed">System monitoring active traffic within the {seller.serviceRadius}km designated boundary.</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'payouts' && (
                            <div className="p-4 py-16 text-center">
                                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                                    <Clock className="h-8 w-8 text-slate-200" />
                                </div>
                                <h4 className="text-base font-black text-slate-900">Withdrawal Tracking</h4>
                                <p className="mx-auto mt-2 max-w-xs text-sm font-medium text-slate-400">View withdrawal history and pending requests here.</p>
                                <Button className="mt-6">
                                    Start Manual Payout
                                </Button>
                            </div>
                        )}

                        {activeTab === 'info' && (
                            <div className="p-5">
                                <div className="grid grid-cols-1 gap-5 text-left md:grid-cols-2">
                                    <div className="space-y-5">
                                        <div>
                                            <h5 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Store Identity</h5>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                                                        <Building2 className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-slate-900">{seller.shopName}</p>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{seller.id}</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                                                        <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Commission</p>
                                                        <p className="text-xs font-black text-slate-900">{seller.commissionRate}</p>
                                                    </div>
                                                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                                                        <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Joined</p>
                                                        <p className="text-xs font-black text-slate-900">{seller.joinedDate}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h5 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Bank Verification</h5>
                                            <div className="space-y-3 rounded-xl border border-success/20 bg-success/5 p-5">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-slate-600">Account Verified</p>
                                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                                </div>
                                                <div>
                                                    <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-success/70">Settlement Account</p>
                                                    <p className="text-sm font-black text-slate-900">{seller.bankInfo.bankName}</p>
                                                    <p className="mt-0.5 font-mono text-xs font-bold text-slate-500">{seller.bankInfo.accountNo}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div>
                                            <h5 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Operational Status</h5>
                                            <div className="rounded-xl bg-slate-900 p-5 text-white">
                                                <div className="mb-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 animate-pulse rounded-full bg-success"></div>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">Live Now</span>
                                                    </div>
                                                    <button className="text-[10px] font-bold uppercase text-danger hover:underline">Force Close</button>
                                                </div>
                                                <div className="space-y-3 opacity-70">
                                                    <div className="flex items-center justify-between border-b border-white/10 py-2">
                                                        <span className="text-xs font-bold">Visibility</span>
                                                        <span className="text-xs font-bold uppercase tracking-widest">Global</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-xs font-bold">Delivery Partner</span>
                                                        <span className="text-xs font-bold uppercase tracking-widest text-primary">Integrated</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-danger/20 bg-danger/5 p-5">
                                            <h5 className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-danger">
                                                <XCircle className="h-4 w-4" />
                                                Safety Controls
                                            </h5>
                                            <p className="text-[10px] font-bold leading-relaxed text-slate-500">Suspend this store immediately from the consumer app in case of policy violations.</p>
                                            <Button variant="danger" className="mt-4 w-full">
                                                Suspend Store
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar Context */}
                <div className="space-y-5">
                    {/* Owner Card */}
                    <Card className="p-5 text-left">
                        <div className="mb-6 flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                                <User className="h-7 w-7 text-slate-300" />
                            </div>
                            <div>
                                <h4 className="text-base font-black text-slate-900">{seller.ownerName}</h4>
                                <Badge variant="primary">Partner</Badge>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex cursor-pointer items-center gap-3 text-slate-500 transition-colors hover:text-primary">
                                <div className="rounded-lg bg-slate-50 p-2">
                                    <Mail className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold">{seller.email}</span>
                            </div>
                            <div className="flex cursor-pointer items-center gap-3 text-slate-500 transition-colors hover:text-primary">
                                <div className="rounded-lg bg-slate-50 p-2">
                                    <Phone className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold">{seller.phone}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500">
                                <div className="rounded-lg bg-slate-50 p-2">
                                    <MapPin className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold leading-relaxed">{seller.location}</span>
                            </div>
                        </div>

                        <Button variant="secondary" className="mt-6 w-full">
                            Message Owner
                        </Button>
                    </Card>

                    {/* Quick Notifications */}
                    <Card className="border-none bg-slate-900 p-5 text-white">
                        <h4 className="mb-5 text-[10px] font-bold uppercase tracking-widest opacity-40">Strategic Comms</h4>
                        <div className="space-y-3">
                            <p className="text-xs font-medium italic leading-relaxed text-slate-400">Send a high-priority push to the shop manager app.</p>
                            <textarea
                                placeholder="Message to store..."
                                className="min-h-[100px] w-full rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs font-bold outline-none transition-all focus:ring-2 focus:ring-primary/20"
                            />
                            <Button className="w-full">
                                Send Alert
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default SellerDetail;
