import React, { useState, useMemo, useEffect } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard } from '@shared/components/ui/Skeleton';
import {
    Users,
    UserCheck,
    Activity,
    Trophy,
    Search,
    Plus,
    Phone,
    MapPin,
    Truck,
    User,
    Star,
    DollarSign,
    ShieldCheck,
    XCircle,
    Pencil,
    Trash2,
    Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const RIDER_AVATAR_FALLBACK = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const riderAvatar = (rider) =>
    rider.avatar && !rider.avatar.includes('emoji') && !rider.avatar.includes('avatar') ? rider.avatar : RIDER_AVATAR_FALLBACK;

const ACTIVE_DELIVERY_BOYS_QUERY_ROOT = ['admin', 'activeDeliveryBoys'];

const ActiveDeliveryBoys = () => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedRider, setSelectedRider] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
    const [viewingRider, setViewingRider] = useState(null);

    // Form states
    const [formState, setFormState] = useState({
        name: '', phone: '', email: '', vehicle: '', vehicleNum: '', location: ''
    });

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce,
    // same page-reset-on-filter-change behavior.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, statusFilter]);

    const queryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (statusFilter !== 'all') params.status = statusFilter;
        return params;
    }, [page, pageSize, debouncedSearchTerm, statusFilter]);

    const queryKey = [...ACTIVE_DELIVERY_BOYS_QUERY_ROOT, queryParams];

    const { data: queryData, isLoading, isFetching, isError } = useQuery({
        queryKey,
        queryFn: async () => {
            const response = await adminApi.getDeliveryPartners(queryParams);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || response.data.result || []);

            const mappedRiders = data.map(r => ({
                id: r._id,
                name: r.name,
                phone: r.phone,
                email: r.email,
                status: r.isOnline ? 'available' : 'offline',
                vehicle: r.vehicleType,
                vehicleNum: r.vehicleNumber || 'N/A',
                rating: 4.5, // Mock rating for now
                totalOrders: 0, // Mock total orders
                todayEarnings: 0, // Mock earnings
                location: r.currentArea || 'Unknown',
                lastSync: 'Now',
                joinDate: new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
            }));

            return {
                items: mappedRiders,
                total: typeof payload.total === 'number' ? payload.total : mappedRiders.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) {
            console.error('Fetch Riders Error');
            toast.error('Failed to fetch delivery partners');
        }
    }, [isError]);

    const riders = queryData?.items ?? [];
    const total = queryData?.total ?? 0;

    // Audit note (pre-existing, unrelated to this migration, left as-is):
    // onboard/edit/delete below only ever mutated local state — there was
    // no actual `adminApi.createDeliveryPartner`/`updateDeliveryPartner`/
    // `deleteDeliveryPartner` call anywhere in this file, so these actions
    // never persisted to the server. Preserved exactly: they still only
    // splice the current cached page's data via `setQueryData`, the same
    // way the old `setRiders(...)` only touched local state — no
    // invalidate/refetch is triggered, matching the original never
    // re-fetching after these actions either.
    const setLocalRiders = (updater) => {
        queryClient.setQueryData(queryKey, (old) => {
            if (!old) return old;
            const nextItems = typeof updater === 'function' ? updater(old.items) : updater;
            return { ...old, items: nextItems };
        });
    };

    // Filtering logic
    const filteredRiders = useMemo(() => {
        return riders.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.phone.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [riders, searchTerm, statusFilter]);

    const handleAction = (type, rider) => {
        if (type === 'view') {
            setViewingRider(rider);
        } else if (type === 'edit') {
            setFormState(rider);
            setSelectedRider(rider);
            setIsEditModalOpen(true);
        } else if (type === 'delete') {
            if (window.confirm(`Are you sure you want to deactivate ${rider.name}?`)) {
                setLocalRiders((prev) => prev.filter(r => r.id !== rider.id));
            }
        }
    };

    const validateForm = () => {
        if (!/^[a-zA-Z\s]+$/.test(formState.name.trim())) {
            toast.error("Name should contain only alphabets and spaces (no special characters or numbers).");
            return false;
        }
        if (!/^[6-9][0-9]{9}$/.test(formState.phone.trim())) {
            toast.error("Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9.");
            return false;
        }
        if (formState.vehicle !== 'Cycle' && !/^[A-Za-z]{2} [0-9]{2} [A-Za-z]{1,2} [0-9]{4}$/.test(formState.vehicleNum.trim())) {
            toast.error("Vehicle registration number must follow the format 'AA 00 AA 0000' with spaces (e.g., MH 12 AB 1234).");
            return false;
        }
        if (formState.location.trim().length < 3) {
            toast.error("Please enter a valid operational area (min 3 chars).");
            return false;
        }
        return true;
    };

    const handleOnboardSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const newRider = {
            ...formState,
            id: 'r' + (riders.length + 1),
            status: 'offline',
            rating: 5.0,
            totalOrders: 0,
            todayEarnings: 0,
            lastSync: 'Just now',
            joinDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        };
        setLocalRiders((prev) => [newRider, ...prev]);
        setIsOnboardModalOpen(false);
        setFormState({ name: '', phone: '', email: '', vehicle: '', vehicleNum: '', location: '' });
        toast.success("New rider added successfully");
    };

    const handleEditSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLocalRiders((prev) => prev.map(r => r.id === selectedRider.id ? { ...r, ...formState } : r));
        setIsEditModalOpen(false);
        setSelectedRider(null);
        toast.success("Rider details updated successfully");
    };

    const stats = [
        { label: 'Total Riders', value: riders.length, color: 'text-primary', bg: 'bg-primary/10', icon: Users },
        { label: 'Available', value: riders.filter(r => r.status === 'available').length, color: 'text-success', bg: 'bg-success/10', icon: UserCheck },
        { label: 'Busy (On Task)', value: riders.filter(r => r.status === 'busy').length, color: 'text-warning', bg: 'bg-warning/10', icon: Activity },
        { label: 'Top Earners', value: riders.filter(r => r.rating >= 4.5).length, color: 'text-danger', bg: 'bg-danger/10', icon: Trophy },
    ];

    const riderColumns = [
        {
            header: 'Rider',
            key: 'rider',
            cell: (rider) => (
                <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                        <img src={riderAvatar(rider)} alt="" className="h-11 w-11 rounded-full bg-slate-100 object-cover" />
                        <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                            rider.status === 'available' ? 'bg-success' : rider.status === 'busy' ? 'bg-warning' : 'bg-slate-300'
                        )} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{rider.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-slate-400">
                            <Phone className="h-3 w-3" />
                            <span className="text-[11px] font-medium">{rider.phone}</span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: 'Vehicle & Area',
            key: 'vehicle',
            cell: (rider) => (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="text-xs font-semibold">{rider.vehicle} <span className="text-slate-400">• {rider.vehicleNum}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[200px] truncate text-[11px] font-medium">{rider.location}</span>
                    </div>
                </div>
            ),
        },
        {
            header: 'Performance',
            key: 'performance',
            cell: (rider) => (
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        <span className="text-xs font-bold text-slate-900">{rider.rating}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-medium">₹{rider.todayEarnings} today</span>
                    </div>
                </div>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            cell: (rider) => (
                <Badge variant={rider.status === 'available' ? 'success' : rider.status === 'busy' ? 'warning' : 'secondary'}>
                    {rider.status}
                </Badge>
            ),
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (rider) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => handleAction('view', rider)} className="rounded-lg p-2 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary" title="View Profile">
                        <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleAction('edit', rider)} className="rounded-lg p-2 text-slate-500 transition-all hover:bg-primary/10 hover:text-primary" title="Edit">
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleAction('delete', rider)} className="rounded-lg p-2 text-slate-500 transition-all hover:bg-danger/10 hover:text-danger" title="Deactivate">
                        <Trash2 className="h-4 w-4" />
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
                        Delivery Boys
                        <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    </span>
                }
                description="Manage all your active delivery partners and their fleet status here."
                actions={
                    <Button onClick={() => setIsOnboardModalOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Add New Rider
                    </Button>
                }
            />

            {isLoading && riders.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {stats.map((stat, idx) => (
                        <StatCard key={idx} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} bg={stat.bg} />
                    ))}
                </div>
            )}

            <FilterBar
                left={
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name or phone number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                }
                pills={['all', 'available', 'busy', 'offline'].map((status) => ({
                    label: status,
                    active: statusFilter === status,
                    onClick: () => setStatusFilter(status),
                }))}
            />

            <DataTable
                columns={riderColumns}
                data={filteredRiders}
                rowKey={(r) => r.id}
                loading={isFetching && riders.length > 0}
                emptyState={
                    <EmptyState
                        icon={<User className="h-6 w-6" />}
                        title="No delivery partners found"
                        description="No riders match your current search or filter."
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

            {/* Profile Detail Modal */}
            <AnimatePresence>
                {viewingRider && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setViewingRider(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="w-full max-w-2xl relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex gap-5">
                                        <img
                                            src={riderAvatar(viewingRider)}
                                            alt=""
                                            className="h-20 w-20 rounded-xl bg-slate-100 object-cover shadow-sm"
                                        />
                                        <div>
                                            <h2 className="text-2xl font-black text-slate-900">{viewingRider.name}</h2>
                                            <div className="flex items-center gap-3 mt-2">
                                                <Badge variant={viewingRider.status === 'available' ? 'success' : viewingRider.status === 'busy' ? 'warning' : 'secondary'}>
                                                    {viewingRider.status}
                                                </Badge>
                                                <span className="text-xs font-bold text-slate-400">Rider ID: RD-00{viewingRider.id.slice(1)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setViewingRider(null)} className="rounded-xl bg-slate-50 p-2.5 transition-all hover:bg-slate-100">
                                        <XCircle className="h-5 w-5 text-slate-400" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.phone}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.email}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fleet Partner Since</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.joinDate}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle Assigned</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.vehicle}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registration No.</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.vehicleNum}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Synced Area</p>
                                        <p className="text-sm font-bold text-slate-900">{viewingRider.location}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl bg-slate-50 p-5">
                                    <div className="text-center">
                                        <p className="mb-1 text-[9px] font-black uppercase text-slate-400">Lifetime Rating</p>
                                        <div className="flex items-center justify-center gap-1">
                                            <Star className="h-4 w-4 fill-warning text-warning" />
                                            <span className="text-lg font-black text-slate-900">{viewingRider.rating}</span>
                                        </div>
                                    </div>
                                    <div className="border-l border-slate-200 text-center">
                                        <p className="mb-1 text-[9px] font-black uppercase text-slate-400">Fleet Rank</p>
                                        <span className="text-lg font-black text-slate-900">#42</span>
                                    </div>
                                    <div className="border-l border-slate-200 text-center">
                                        <p className="mb-1 text-[9px] font-black uppercase text-slate-400">Total Deliveries</p>
                                        <span className="text-lg font-black text-primary">{viewingRider.totalOrders}</span>
                                    </div>
                                    <div className="border-l border-slate-200 text-center">
                                        <p className="mb-1 text-[9px] font-black uppercase text-slate-400">Wallet Creds</p>
                                        <span className="text-lg font-black text-primary">₹4,250</span>
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <Button className="flex-1">Send Message</Button>
                                    <Button variant="danger">Deactivate</Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Onboard / Edit Modal */}
            <AnimatePresence>
                {(isOnboardModalOpen || isEditModalOpen) && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-lg"
                            onClick={() => {
                                setIsOnboardModalOpen(false);
                                setIsEditModalOpen(false);
                            }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            className="w-full max-w-lg relative z-[120] bg-white rounded-2xl p-6 shadow-2xl"
                        >
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditModalOpen ? 'Edit Rider' : 'Add New Rider'}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                                {isEditModalOpen ? 'Update rider details below.' : 'Enter details to register a new delivery partner.'}
                            </p>

                            <form onSubmit={isEditModalOpen ? handleEditSubmit : handleOnboardSubmit} className="mt-5 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Full Identity Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.name}
                                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                                        className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g. Rahul Sharma"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Secure Contact</label>
                                        <input
                                            required
                                            type="text"
                                            value={formState.phone}
                                            onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            placeholder="+91..."
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Work Vehicle</label>
                                        <select
                                            required
                                            value={formState.vehicle}
                                            onChange={(e) => setFormState({ ...formState, vehicle: e.target.value })}
                                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="">Select Vehicle</option>
                                            <option>Two Wheeler</option>
                                            <option>Electric Scooter</option>
                                            <option>Cycle</option>
                                            <option>Three Wheeler</option>
                                        </select>
                                    </div>
                                </div>
                                {formState.vehicle !== 'Cycle' && (
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Registration Vehicle No.</label>
                                        <input
                                            required
                                            type="text"
                                            value={formState.vehicleNum}
                                            onChange={(e) => setFormState({ ...formState, vehicleNum: e.target.value.toUpperCase() })}
                                            className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            placeholder="e.g. MH 12 AB 0000"
                                        />
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Assigned Operational Area</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.location}
                                        onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                                        className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g. Bandra West, Mumbai"
                                    />
                                </div>

                                <Button type="submit" className="w-full">
                                    {isEditModalOpen ? 'Save Changes' : 'Add Rider'}
                                </Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ActiveDeliveryBoys;
