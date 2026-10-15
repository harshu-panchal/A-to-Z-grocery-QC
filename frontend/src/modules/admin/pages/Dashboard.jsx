import { useEffect } from 'react';
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
    Receipt,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
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
    const pos = statsData?.pos || {};
    const trends = overview.trends || {};
    const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
    const dir = (t) => (t && t.startsWith('-') ? 'down' : 'up');
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
            trend: trends.users,
            trendDirection: dir(trends.users),
            description: `${overview.newUsers30 ?? 0} joined in last 30 days`,
            onClick: () => navigate('/admin/customers')
        },
        {
            label: 'Active Sellers',
            value: overview.activeSellers?.toLocaleString() || '0',
            icon: Store,
            color: 'text-info',
            bg: 'bg-info/10',
            trend: trends.sellers,
            trendDirection: dir(trends.sellers),
            description: 'Verified stores',
            onClick: () => navigate('/admin/sellers/active')
        },
        {
            label: 'Total Orders',
            value: ((overview.totalOrders || 0) + (overview.posBills || 0)).toLocaleString(),
            icon: Truck,
            color: 'text-warning',
            bg: 'bg-warning/10',
            trend: trends.orders,
            trendDirection: dir(trends.orders),
            description: `Online ${overview.totalOrders || 0} · Counter bills ${overview.posBills || 0}`,
            onClick: () => navigate('/admin/orders/all')
        },
        {
            label: 'Total Sales',
            value: rupee(overview.combinedRevenue ?? overview.totalRevenue),
            icon: BarChart3,
            color: 'text-success',
            bg: 'bg-success/10',
            trend: trends.revenue,
            trendDirection: dir(trends.revenue),
            description: `Online ${rupee(overview.onlineRevenue ?? overview.totalRevenue)} · Counter ${rupee(overview.posRevenue)}`,
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
                            trendDirection={stat.trendDirection}
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
                        <ChartCard title="Sales" subtitle="Online orders + counter (POS) bills, last 30 days" height={260} isEmpty={chartData.length === 0} emptyMessage="No revenue recorded yet for this period.">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.18} />
                                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `₹${value}`} />
                                    <Tooltip
                                        formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
                                        contentStyle={{ borderRadius: '10px', border: '1px solid #000', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '11px' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                    <Area type="monotone" dataKey="revenue" name="Online" stackId="sales" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                                    <Area type="monotone" dataKey="pos" name="Counter (POS)" stackId="sales" stroke="#16a34a" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPos)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>

                <div className="lg:col-span-1">
                    {loading ? (
                        <SkeletonCard lines={3} />
                    ) : (
                        <ChartCard title="Top Categories" subtitle="Products by category" height={190} isEmpty={categoryData.length === 0} emptyMessage="No category sales yet.">
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
                                    <span className="text-xl font-black text-slate-900">{(overview.totalProducts || 0).toLocaleString()}</span>
                                    <span className="text-[9px] font-bold uppercase text-slate-400">Products</span>
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
                        <Card title="Top Products" subtitle="Most units sold, online + counter">
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
                                            <p className="text-[10px] font-bold text-slate-400">{product.sales} sold</p>
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

            {!loading && (
                <Card title="Counter (POS) Sales" subtitle="Bills made at shop counters by sellers and admin">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                            ['Today', rupee(pos.todaySales), `${pos.todayBills || 0} bills`],
                            ['Last 30 days', rupee(pos.last30Sales), `${pos.last30Bills || 0} bills`],
                            ['All time', rupee(pos.totalSales), `${pos.totalBills || 0} bills`],
                            ['Avg bill', rupee(pos.totalBills ? Math.round(pos.totalSales / pos.totalBills) : 0), 'per bill'],
                        ].map(([label, value, sub]) => (
                            <div key={label} className="rounded-lg bg-slate-50 p-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                                <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
                                <p className="text-[11px] text-slate-400">{sub}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 divide-y divide-slate-100">
                        {(pos.recentBills || []).length ? pos.recentBills.map((b) => (
                            <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                                        <Receipt className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-slate-900">{b.invoiceNumber} · {b.shop}</p>
                                        <p className="truncate text-[11px] text-slate-400">
                                            {b.customer} · {b.items} item{b.items === 1 ? '' : 's'} · {b.paymentMethod}{b.paymentStatus !== 'Paid' ? ` (${b.paymentStatus})` : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-bold text-slate-900">{rupee(b.amount)}</p>
                                    <p className="text-[10px] text-slate-400">{new Date(b.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="py-6 text-center text-sm text-slate-400">No counter bills yet.</p>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AdminDashboard;
