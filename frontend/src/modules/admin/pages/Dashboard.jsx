import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import ChartCard from '@shared/components/ui/ChartCard';
import DataTable from '@shared/components/ui/DataTable';
import Badge from '@shared/components/ui/Badge';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import { adminApi } from '../services/adminApi';
import {
    Users,
    Store,
    Truck,
    BarChart3,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const AdminDashboard = () => {
    const navigate = useNavigate();

    // Perf audit Phase 8: migrated to React Query.
    const { data: statsData, isLoading: loading, isError, dataUpdatedAt } = useQuery({
        queryKey: ['admin', 'dashboardStats'],
        queryFn: async () => {
            const res = await adminApi.getStats();
            return res.data.success ? res.data.result : null;
        },
    });
    const lastUpdatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

    useEffect(() => {
        if (isError) {
            console.error("Dashboard Stats Error");
            toast.error("Failed to fetch dashboard data");
        }
    }, [isError]);

    const overview = statsData?.overview || {};
    const formatLastUpdated = (value) => {
        if (!value) return 'Last Update: --';
        const now = new Date();
        const updated = new Date(value);
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const updatedDate = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate());
        const dayDiff = Math.round((nowDate - updatedDate) / (1000 * 60 * 60 * 24));

        let dayLabel = updated.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (dayDiff === 0) dayLabel = 'Today';
        if (dayDiff === 1) dayLabel = 'Yesterday';

        const timeLabel = updated.toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
        return `Last Update: ${dayLabel}, ${timeLabel}`;
    };

    const stats = [
        {
            label: 'Total Users',
            value: overview.totalUsers?.toLocaleString() || '0',
            icon: Users,
            color: 'text-primary',
            bg: 'bg-primary/10',
            trend: '+12.5%',
            description: 'Active this month',
            onClick: () => navigate('/admin/customers')
        },
        {
            label: 'Active Sellers',
            value: overview.activeSellers?.toLocaleString() || '0',
            icon: Store,
            color: 'text-info',
            bg: 'bg-info/10',
            trend: '+5.2%',
            description: 'Verified stores',
            onClick: () => navigate('/admin/sellers/active')
        },
        {
            label: 'Total Orders',
            value: overview.totalOrders?.toLocaleString() || '0',
            icon: Truck,
            color: 'text-warning',
            bg: 'bg-warning/10',
            trend: '+18.4%',
            description: 'Last 30 days',
            onClick: () => navigate('/admin/orders/all')
        },
        {
            label: 'Revenue',
            value: `₹${overview.totalRevenue?.toLocaleString() || '0'}`,
            icon: BarChart3,
            color: 'text-success',
            bg: 'bg-success/10',
            trend: '+8.2%',
            description: 'Net earnings',
            onClick: () => navigate('/admin/wallet')
        },
    ];

    const chartData = statsData?.revenueHistory || [];
    const categoryData = statsData?.categoryData || [];
    const recentOrders = statsData?.recentOrders || [];
    const topProducts = statsData?.topProducts || [];

    const orderColumns = [
        {
            header: 'Order ID',
            key: 'id',
            cell: (order) => (
                <span className="font-semibold text-primary">#{order.id?.slice(-8).toUpperCase()}</span>
            ),
        },
        {
            header: 'Customer',
            key: 'customer',
            cell: (order) => (
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">
                        {order.customer?.[0] || '?'}
                    </div>
                    <span className="font-medium text-slate-700">{order.customer}</span>
                </div>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            cell: (order) => <Badge variant={order.status}>{order.statusText}</Badge>,
        },
        {
            header: 'Amount',
            key: 'amount',
            cell: (order) => <span className="font-bold text-slate-900">{order.amount}</span>,
        },
        {
            header: 'Time',
            key: 'time',
            cell: (order) => <span className="text-xs text-slate-400">{order.time}</span>,
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Dashboard"
                description="A real-time overview of platform activity — users, sellers, orders, and revenue."
                actions={<Badge variant="outline">{formatLastUpdated(lastUpdatedAt)}</Badge>}
            />

            {/* KPI row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
                    : stats.map((stat) => (
                        <StatCard
                            key={stat.label}
                            label={stat.label}
                            value={stat.value}
                            icon={stat.icon}
                            trend={stat.trend}
                            description={stat.description}
                            color={stat.color}
                            bg={stat.bg}
                            onClick={stat.onClick}
                        />
                    ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    {loading ? (
                        <SkeletonCard lines={4} />
                    ) : (
                        <ChartCard title="Earnings" subtitle="Monthly revenue trends" height={260} isEmpty={chartData.length === 0} emptyMessage="No revenue recorded yet for this period.">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `₹${value}`} />
                                    <Tooltip
                                        formatter={(value) => [`₹${value}`, 'Revenue']}
                                        contentStyle={{ borderRadius: '10px', border: '1px solid #000', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '11px' }}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>

                <div className="lg:col-span-1">
                    {loading ? (
                        <SkeletonCard lines={3} />
                    ) : (
                        <ChartCard title="Top Categories" subtitle="Sales breakdown by category" height={190} isEmpty={categoryData.length === 0} emptyMessage="No category sales yet.">
                            <>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={categoryData} cx="50%" cy="50%" innerRadius={54} outerRadius={72} paddingAngle={8} dataKey="value">
                                            {categoryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-black text-slate-900">72%</span>
                                    <span className="text-[9px] font-bold uppercase text-slate-400">Growth</span>
                                </div>
                            </>
                        </ChartCard>
                    )}
                    {!loading && categoryData.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {categoryData.map((cat) => (
                                <div key={cat.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                        <span className="text-xs font-semibold text-slate-600">{cat.name}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-900">{cat.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    {loading ? (
                        <SkeletonCard lines={5} />
                    ) : (
                        <Card title="Recent Orders" subtitle="Track the latest customer orders">
                            <DataTable
                                columns={orderColumns}
                                data={recentOrders}
                                rowKey={(o) => o.id}
                                className="border-none shadow-none rounded-none"
                                emptyState={
                                    <div className="py-10 text-center text-sm text-slate-400">No orders placed yet.</div>
                                }
                            />
                            <button
                                onClick={() => navigate('/admin/orders/all')}
                                className="mt-4 w-full rounded-lg bg-slate-50 py-2.5 text-xs font-bold text-slate-500 transition-all hover:bg-primary hover:text-white"
                            >
                                VIEW ALL ORDERS
                            </button>
                        </Card>
                    )}
                </div>

                <div className="lg:col-span-1">
                    {loading ? (
                        <SkeletonCard lines={3} />
                    ) : (
                        <Card title="Top Products" subtitle="Best selling items this week">
                            <div className="space-y-3">
                                {topProducts.length > 0 ? topProducts.map((product, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-lg p-2 transition-all hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg", !product.image ? (product.color + " text-xl") : "bg-slate-50")}>
                                                {product.image ? (
                                                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <span>{product.icon}</span>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold leading-none text-slate-900">{product.name}</p>
                                                <p className="mt-1 text-[10px] font-semibold uppercase text-slate-400">{product.cat}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-900">{product.rev}</p>
                                            <p className="text-[10px] font-bold text-success">{product.trend}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-10 text-center text-sm text-slate-400">No sales data yet</div>
                                )}
                            </div>
                            <button
                                onClick={() => navigate('/admin/products')}
                                className="mt-4 w-full rounded-lg border-2 border-dashed border-slate-200 py-2.5 text-xs font-bold text-slate-400 transition-all hover:border-primary hover:text-primary"
                            >
                                VIEW ALL PRODUCTS
                            </button>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
