import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import Pagination from '@shared/components/ui/Pagination';
import {
    Users,
    Search,
    Download,
    Eye,
    Phone,
    ShoppingBag,
    MoreVertical,
    UserPlus,
    RotateCw,
    Activity,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';

const CustomerManagement = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isExporting, setIsExporting] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Perf audit Phase 8: data fetching migrated to React Query (see
    // core/query/queryClient.js) — same 500ms debounce as before, but the
    // fetch itself is now cached/deduped/shared instead of a page-local
    // useState+useEffect+axios call. Debounce still updates a separate
    // `debouncedSearchTerm` before it reaches the query, so the input field
    // itself never lags.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, filterStatus]);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm.trim()) params.search = debouncedSearchTerm.trim();
        if (filterStatus !== 'all') params.status = filterStatus;
        return params;
    }, [page, pageSize, debouncedSearchTerm, filterStatus]);

    const {
        data: queryData,
        isLoading,
        isFetching,
        isError,
    } = useQuery({
        queryKey: ['admin', 'customers', queryParams],
        queryFn: async () => {
            const { data } = await adminApi.getUsers(queryParams);
            if (!data.success) {
                throw new Error(data.message || 'Failed to load customers');
            }
            const payload = data.result || {};
            const list = Array.isArray(payload.items) ? payload.items : (data.results || []);
            return {
                items: list,
                total: typeof payload.total === 'number' ? payload.total : list.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) toast.error('Failed to load customers');
    }, [isError]);

    const customers = queryData?.items ?? [];
    const total = queryData?.total ?? 0;
    // Full-page skeleton only on the very first load (no cached data at
    // all yet) — matches the old `loading && customers.length === 0`; a
    // background refetch (paging, filtering, window refocus) instead shows
    // the lighter in-table loading state below, same as before.
    const loading = isLoading;

    const stats = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return {
            total: total,
            active: safeCustomers.filter(c => c.status === 'active').length,
            newToday: safeCustomers.filter(c => {
                const today = new Date().toISOString().split('T')[0];
                const joined = new Date(c.joinedDate).toISOString().split('T')[0];
                return joined === today;
            }).length
        };
    }, [customers, total]);

    const filteredCustomers = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return safeCustomers.filter(c => {
            const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.phone || '').includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [customers, searchTerm, filterStatus]);

    const handleExport = () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
            toast.success('Customer database exported successfully!');
        }, 1500);
    };

    const getTimeAgo = (date) => {
        if (!date) return 'Never';
        const now = new Date();
        const past = new Date(date);
        const diffInMs = now - past;
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInHours < 1) return 'Recently';
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    };

    const columns = [
        {
            header: 'Customer',
            key: 'customer',
            cell: (cust) => (
                <div className="flex items-center gap-3">
                    <img
                        src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                        alt=""
                        loading="lazy"
                        width="40"
                        height="40"
                        className="h-10 w-10 rounded-lg border border-slate-100 bg-slate-50 object-cover"
                    />
                    <div>
                        <p
                            onClick={() => navigate(`/admin/customers/${cust.id}`)}
                            className="cursor-pointer text-sm font-bold text-slate-900 transition-colors hover:text-primary"
                        >
                            {cust.name}
                        </p>
                        <p className="text-xs text-slate-500">{cust.email || 'No email'}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-slate-300" />
                            <span className="text-[10px] text-slate-400">{cust.phone}</span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: 'Activity',
            key: 'activity',
            cell: (cust) => (
                <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                        {cust.totalOrders} Orders
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">Last: {getTimeAgo(cust.lastOrderDate)}</p>
                </div>
            ),
        },
        {
            header: 'Total Spend',
            key: 'spend',
            cell: (cust) => <span className="text-sm font-black text-slate-900">₹{(cust.totalSpent || 0).toLocaleString()}</span>,
        },
        {
            header: 'Status',
            key: 'status',
            cell: (cust) => <Badge variant={cust.status === 'active' ? 'success' : 'danger'}>{cust.status}</Badge>,
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (cust) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        onClick={() => navigate(`/admin/customers/${cust.id}`)}
                        className="rounded-lg bg-primary/10 p-2 text-primary transition-all hover:bg-primary hover:text-white"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg bg-slate-50 p-2 text-slate-400 transition-all hover:bg-slate-900 hover:text-white">
                        <MoreVertical className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Customers"
                description="Manage and track all customer accounts."
                badge={
                    <div className="rounded-lg bg-primary/10 p-1.5">
                        <Users className="h-4 w-4 text-primary" />
                    </div>
                }
                actions={
                    <>
                        <Button variant="outline" onClick={handleExport} isLoading={isExporting}>
                            {!isExporting && <Download className="h-4 w-4" />}
                            {isExporting ? 'Exporting...' : 'Export'}
                        </Button>
                        <Button>
                            <UserPlus className="h-4 w-4" />
                            New Customer
                        </Button>
                    </>
                }
            />

            {loading && customers.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <StatCard label="Total Customers" value={stats.total} icon={Users} color="text-primary" bg="bg-primary/10" />
                        <StatCard label="Active Users" value={stats.active} icon={Activity} color="text-success" bg="bg-success/10" />
                        <StatCard label="New Today" value={stats.newToday} icon={UserPlus} color="text-info" bg="bg-info/10" />
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-96">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name, email or phone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        pills={['all', 'active', 'inactive'].map((status) => ({
                            label: status,
                            active: filterStatus === status,
                            onClick: () => setFilterStatus(status),
                        }))}
                    />

                    <DataTable
                        columns={columns}
                        data={filteredCustomers}
                        rowKey={(c) => c.id}
                        loading={isFetching && customers.length > 0}
                        emptyState={
                            <EmptyState
                                icon={<Users className="h-6 w-6" />}
                                title="No customers found"
                                description="No customers match your current search criteria."
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
        </div>
    );
};

export default CustomerManagement;
