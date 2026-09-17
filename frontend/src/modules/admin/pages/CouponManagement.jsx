import React, { useState, useMemo, useEffect } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import ConfirmDialog from '@shared/components/ui/ConfirmDialog';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePlus,
    HiOutlineTicket,
    HiOutlineMagnifyingGlass,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlineCalendarDays,
    HiOutlineUsers,
    HiOutlineClock,
    HiOutlineCheckCircle,
} from 'react-icons/hi2';
import { adminApi } from '../services/adminApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const COUPONS_QUERY_ROOT = ['admin', 'coupons'];

const CouponManagement = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const today = new Date().toISOString().split('T')[0];
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const [formData, setFormData] = useState({
        code: '',
        title: '',
        couponType: 'generic',
        discountType: 'percentage',
        discountValue: '',
        minOrderValue: '',
        maxDiscount: '',
        usageLimit: '',
        perUserLimit: '1',
        validFrom: '',
        validTill: '',
        description: '',
    });

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const couponsQueryParams = useMemo(() => ({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearchTerm || undefined,
    }), [statusFilter, debouncedSearchTerm]);
    const couponsQueryKey = [...COUPONS_QUERY_ROOT, couponsQueryParams];

    const { data: coupons = [], isLoading, isFetching, isError } = useQuery({
        queryKey: couponsQueryKey,
        queryFn: async () => {
            const res = await adminApi.getCoupons(couponsQueryParams);
            if (!res.data.success) throw new Error('Failed to load coupons');
            return res.data.result || res.data.results || [];
        },
    });

    useEffect(() => {
        if (isError) showToast('Failed to load coupons', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const stats = useMemo(() => {
        const now = new Date();
        const active = coupons.filter(c => {
            const from = c.validFrom ? new Date(c.validFrom) : null;
            const till = c.validTill ? new Date(c.validTill) : null;
            return c.isActive && (!from || from <= now) && (!till || till >= now);
        });
        const expiringSoon = coupons.filter(c => {
            if (!c.validTill) return false;
            const till = new Date(c.validTill);
            const diffDays = (till - now) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 7;
        });
        return {
            total: coupons.length,
            active: active.length,
            totalRedeemed: coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0),
            expiringSoon: expiringSoon.length,
        };
    }, [coupons]);

    const filteredCoupons = coupons;

    const handleOpenModal = (coupon = null) => {
        if (coupon) {
            setEditingCoupon(coupon);
            setFormData({
                code: coupon.code || '',
                title: coupon.title || '',
                couponType: coupon.couponType || 'generic',
                discountType: coupon.discountType || 'percentage',
                discountValue: coupon.discountValue ?? '',
                minOrderValue: coupon.minOrderValue ?? '',
                maxDiscount: coupon.maxDiscount ?? '',
                usageLimit: coupon.usageLimit ?? '',
                perUserLimit: coupon.perUserLimit ?? '1',
                validFrom: coupon.validFrom ? coupon.validFrom.substring(0, 10) : '',
                validTill: coupon.validTill ? coupon.validTill.substring(0, 10) : '',
                description: coupon.description || '',
            });
        } else {
            setEditingCoupon(null);
            setFormData({
                code: '',
                title: '',
                couponType: 'generic',
                discountType: 'percentage',
                discountValue: '',
                minOrderValue: '',
                maxDiscount: '',
                usageLimit: '',
                perUserLimit: '1',
                validFrom: '',
                validTill: '',
                description: '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                discountValue: Number(formData.discountValue),
                minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
                maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : null,
                usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
                perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : null,
                validFrom: formData.validFrom,
                validTill: formData.validTill,
            };

            if (editingCoupon?._id) {
                await adminApi.updateCoupon(editingCoupon._id, payload);
                showToast('Coupon updated successfully', 'success');
            } else {
                await adminApi.createCoupon(payload);
                showToast('New coupon launched!', 'success');
            }
            setIsModalOpen(false);
            setEditingCoupon(null);
            // Perf audit Phase 8: matches the original exactly — it always
            // re-fetched the full, unfiltered coupon list after a
            // create/update (not a re-fetch with the currently active
            // status/search filters), then rendered it straight into the
            // still-filtered-looking UI. Replicated by writing that
            // unfiltered result directly into the *currently active* query
            // cache entry, same as the original writing it into the same
            // page-local `coupons` state regardless of what filters were
            // selected.
            const res = await adminApi.getCoupons();
            if (res.data.success) {
                const list = res.data.result || res.data.results || [];
                queryClient.setQueryData(couponsQueryKey, list);
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save coupon', 'error');
        }
    };

    const handleDelete = async (id) => {
        try {
            setIsDeleting(true);
            await adminApi.deleteCoupon(id);
            queryClient.setQueryData(couponsQueryKey, (old) =>
                Array.isArray(old) ? old.filter((c) => c._id !== id) : old,
            );
            setDeleteTarget(null);
            showToast('Coupon removed', 'warning');
        } catch (error) {
            showToast('Failed to delete coupon', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const getCouponStatus = (c) => {
        const now = new Date();
        const till = c.validTill ? new Date(c.validTill) : null;
        const from = c.validFrom ? new Date(c.validFrom) : null;

        if (!c.isActive) return { label: 'inactive', variant: 'secondary' };
        if (till && till < now) return { label: 'expired', variant: 'danger' };
        if (from && from > now) return { label: 'scheduled', variant: 'warning' };
        if (c.usageLimit && (c.usedCount || 0) >= c.usageLimit) return { label: 'exhausted', variant: 'secondary' };
        return { label: 'active', variant: 'success' };
    };

    const columns = [
        {
            header: 'Coupon Code',
            key: 'code',
            cell: (c) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <HiOutlineTicket className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <span className="rounded-md border border-dashed border-slate-300 bg-slate-100 px-2 py-1 text-xs font-black tracking-wider text-slate-900">{c.code}</span>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">{c.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] font-medium text-slate-400">{c.description}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Offerings',
            key: 'offerings',
            cell: (c) => (
                <div className="space-y-1">
                    <p className="text-xs font-black text-slate-900">
                        {c.discountType === 'percentage' ? `${c.discountValue}% Off` : c.discountType === 'free_delivery' ? 'Free Delivery' : `₹${c.discountValue} Off`}
                    </p>
                    {c.minOrderValue > 0 && (
                        <p className="text-[10px] font-bold text-slate-400">Min. Order: ₹{c.minOrderValue}</p>
                    )}
                    <p className="text-[10px] font-bold capitalize text-slate-400">Type: {c.couponType?.replace(/_/g, ' ') || 'generic'}</p>
                </div>
            ),
        },
        {
            header: 'Performance',
            key: 'performance',
            cell: (c) => (
                <div className="space-y-1.5">
                    <div className="flex items-end justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Redeemed</span>
                        <span className="text-xs font-black text-slate-900">{c.usedCount || 0}{c.usageLimit ? `/${c.usageLimit}` : ''}</span>
                    </div>
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: c.usageLimit ? `${((c.usedCount || 0) / c.usageLimit) * 100}%` : '0%' }}
                        />
                    </div>
                </div>
            ),
        },
        {
            header: 'Validity',
            key: 'validity',
            cell: (c) => (
                <div className="flex items-center gap-1.5 text-slate-500">
                    <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">
                        {c.validFrom ? new Date(c.validFrom).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'} - {c.validTill ? new Date(c.validTill).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                    </span>
                </div>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            align: 'center',
            cell: (c) => {
                const status = getCouponStatus(c);
                return <Badge variant={status.variant}>{status.label}</Badge>;
            },
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (c) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        onClick={() => handleOpenModal(c)}
                        className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                    >
                        <HiOutlinePencilSquare className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setDeleteTarget(c)}
                        className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                    >
                        <HiOutlineTrash className="h-4 w-4" />
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
                        Promo Engine
                        <Badge variant="primary">v4.2</Badge>
                    </span>
                }
                description="Design, deploy, and track high-conversion discount campaigns."
                actions={
                    <Button onClick={() => handleOpenModal()}>
                        <HiOutlinePlus className="h-4 w-4" />
                        Create New Promo
                    </Button>
                }
            />

            {isLoading && coupons.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard label="Total Coupons" value={stats.total} icon={HiOutlineTicket} color="text-primary" bg="bg-primary/10" />
                        <StatCard label="Active Codes" value={stats.active} icon={HiOutlineCheckCircle} color="text-success" bg="bg-success/10" />
                        <StatCard label="Redemptions" value={stats.totalRedeemed.toLocaleString()} icon={HiOutlineUsers} color="text-warning" bg="bg-warning/10" />
                        <StatCard label="Expiring Soon" value={stats.expiringSoon} icon={HiOutlineClock} color="text-danger" bg="bg-danger/10" />
                    </div>

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-96">
                                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by code or description..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        pills={['all', 'active', 'expired'].map((filter) => ({
                            label: filter,
                            active: statusFilter === filter,
                            onClick: () => setStatusFilter(filter),
                        }))}
                    />

                    <DataTable
                        columns={columns}
                        data={filteredCoupons}
                        rowKey={(c) => c._id}
                        loading={isFetching && coupons.length > 0}
                        emptyState={
                            <EmptyState
                                icon={<HiOutlineTicket className="h-6 w-6" />}
                                title="No codes found"
                                description="Try adjusting your filters or create a new promotion."
                            />
                        }
                    />
                </>
            )}

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => handleDelete(deleteTarget._id)}
                title="Delete coupon?"
                message={deleteTarget ? `Are you sure you want to remove ${deleteTarget.code}? This action cannot be undone.` : ''}
                confirmLabel="Delete"
                variant="danger"
                loading={isDeleting}
            />

            {/* Modal for Create/Edit */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingCoupon ? "Modify Promotion" : "New Promotion Protocol"}
            >
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Promo Code</label>
                            <input
                                required
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                placeholder="E.G. SUMMER50"
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-black uppercase tracking-widest outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Discount Kind</label>
                            <select
                                value={formData.discountType}
                                onChange={(e) => {
                                    const newType = e.target.value;
                                    let currentVal = formData.discountValue;
                                    if (newType === 'percentage' && Number(currentVal) > 100) {
                                        currentVal = '100';
                                    }
                                    setFormData({ ...formData, discountType: newType, discountValue: currentVal });
                                }}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount (₹)</option>
                                <option value="free_delivery">Free Delivery</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Coupon Strategy</label>
                        <select
                            value={formData.couponType}
                            onChange={(e) => setFormData({ ...formData, couponType: e.target.value })}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="generic">Generic Discount</option>
                            <option value="bulk_order">Bulk Order Discount</option>
                            <option value="min_order_value">Minimum Order Value Coupon</option>
                            <option value="free_delivery">Free Delivery Coupon</option>
                            <option value="category_based">Category-Based Coupon</option>
                            <option value="monthly_volume">Monthly Volume Coupon</option>
                        </select>
                        <p className="text-[10px] text-slate-400">
                            Choose the logic: bulk order, MOV, free delivery, specific categories, or monthly volume buyers.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Discount Value</label>
                            <input
                                required
                                type="number"
                                min={0}
                                max={formData.discountType === 'percentage' ? 100 : undefined}
                                onWheel={(e) => e.target.blur()}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault(); }}
                                value={formData.discountValue}
                                onChange={(e) => {
                                    let val = e.target.value;
                                    if (formData.discountType === 'percentage' && Number(val) > 100) {
                                        val = '100';
                                    }
                                    setFormData({ ...formData, discountValue: val });
                                }}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Min Order Requirement</label>
                            <input
                                required
                                type="number"
                                min={0}
                                onWheel={(e) => e.target.blur()}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault(); }}
                                value={formData.minOrderValue}
                                onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Max Discount (optional)</label>
                            <input
                                type="number"
                                min={0}
                                onWheel={(e) => e.target.blur()}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault(); }}
                                value={formData.maxDiscount}
                                onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Uses (optional)</label>
                            <input
                                type="number"
                                min={0}
                                onWheel={(e) => e.target.blur()}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault(); }}
                                value={formData.usageLimit}
                                onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Per User Limit</label>
                            <input
                                type="number"
                                min={1}
                                onWheel={(e) => e.target.blur()}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault(); }}
                                value={formData.perUserLimit}
                                onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Date</label>
                            <input
                                required
                                type="date"
                                min={today}
                                value={formData.validFrom}
                                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End Date</label>
                            <input
                                required
                                type="date"
                                min={formData.validFrom || today}
                                value={formData.validTill}
                                onChange={(e) => setFormData({ ...formData, validTill: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Campaign Description</label>
                        <textarea
                            required
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Briefly describe the campaign..."
                            className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                            {editingCoupon ? 'Save Changes' : 'Launch Campaign'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CouponManagement;
