import React, { useEffect, useMemo, useState } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import EmptyState from '@shared/components/ui/EmptyState';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePlus,
    HiOutlineTag,
    HiOutlineSparkles,
    HiOutlineClock,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlineArrowUpCircle,
    HiOutlineArrowDownCircle,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { adminApi } from '../services/adminApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const STYLE_OPTIONS = [
    { id: 'blue', label: 'Blue', className: 'bg-primary' },
    { id: 'green', label: 'Green', className: 'bg-success' },
    { id: 'orange', label: 'Orange', className: 'bg-warning' },
];

const ICON_OPTIONS = [
    { id: 'sparkles', label: 'Sparkles', icon: HiOutlineSparkles },
    { id: 'clock', label: 'Timer', icon: HiOutlineClock },
    { id: 'tag', label: 'Tag', icon: HiOutlineTag },
];

const OFFERS_QUERY_KEY = ['admin', 'offersList'];

const OffersManagement = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOffer, setEditingOffer] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        code: '',
        style: 'blue',
        icon: 'sparkles',
        appliesOnOrderNumber: 1,
        order: 0,
        status: 'active',
        categoryIds: [],
        productIds: [],
    });

    // Perf audit Phase 8: migrated to React Query — `categories`/`products`
    // are master lookup lists loaded once, `offers` is the mutable list.
    const { data: categories = [], isError: isCategoriesError } = useQuery({
        queryKey: ['admin', 'level2CategoriesForOffers'],
        queryFn: async () => {
            const res = await adminApi.getCategories();
            const catList = res.data.results || res.data.result || [];
            return Array.isArray(catList) ? catList.filter(c => c.type === 'category') : [];
        },
    });

    const { data: products = [], isError: isProductsError } = useQuery({
        queryKey: ['admin', 'productsForOffers'],
        queryFn: async () => {
            const res = await adminApi.getProducts({ limit: 100 });
            const rawResult = res.data.result;
            return Array.isArray(res.data.results)
                ? res.data.results
                : Array.isArray(rawResult?.items)
                    ? rawResult.items
                    : Array.isArray(rawResult)
                        ? rawResult
                        : [];
        },
    });

    useEffect(() => {
        if (isCategoriesError || isProductsError) {
            showToast('Failed to load products or categories', 'error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCategoriesError, isProductsError]);

    const { data: offers = [], isLoading, isError: isOffersError } = useQuery({
        queryKey: OFFERS_QUERY_KEY,
        queryFn: async () => {
            const res = await adminApi.getOffers();
            const list = res.data.results || res.data.result || res.data;
            return Array.isArray(list) ? list : [];
        },
    });

    useEffect(() => {
        if (isOffersError) showToast('Failed to load offers', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOffersError]);

    const setOffers = (updater) => {
        queryClient.setQueryData(OFFERS_QUERY_KEY, (prev) => {
            const base = Array.isArray(prev) ? prev : [];
            return typeof updater === 'function' ? updater(base) : updater;
        });
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            code: '',
            style: 'blue',
            icon: 'sparkles',
            appliesOnOrderNumber: 1,
            order: offers.length,
            status: 'active',
            categoryIds: [],
            productIds: [],
        });
    };

    const openCreateModal = () => {
        setEditingOffer(null);
        resetForm();
        setIsModalOpen(true);
    };

    const openEditModal = (offer) => {
        setEditingOffer(offer);
        setFormData({
            title: offer.title || '',
            description: offer.description || '',
            code: offer.code || '',
            style: offer.style || 'blue',
            icon: offer.icon || 'sparkles',
            appliesOnOrderNumber: offer.appliesOnOrderNumber || 1,
            order: typeof offer.order === 'number' ? offer.order : 0,
            status: offer.status || 'active',
            categoryIds: offer.categoryIds || [],
            productIds: offer.productIds || [],
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.title.trim()) {
            showToast('Please enter offer title', 'warning');
            return;
        }

        const payload = {
            ...formData,
            appliesOnOrderNumber: Number(formData.appliesOnOrderNumber) || 1,
            order: Number(formData.order) || 0,
        };

        try {
            if (editingOffer) {
                const res = await adminApi.updateOffer(editingOffer._id, payload);
                const updated = res.data.result || res.data.results || res.data;
                setOffers(prev => prev.map(o => (o._id === editingOffer._id ? updated : o)));
                showToast('Offer updated', 'success');
            } else {
                const res = await adminApi.createOffer(payload);
                const created = res.data.result || res.data.results || res.data;
                setOffers(prev => [...prev, created]);
                showToast('Offer created', 'success');
            }
            setIsModalOpen(false);
        } catch (e) {
            console.error(e);
            showToast(e.response?.data?.message || 'Failed to save offer', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this offer?')) return;
        try {
            await adminApi.deleteOffer(id);
            setOffers(prev => prev.filter(o => o._id !== id));
            showToast('Offer deleted', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to delete offer', 'error');
        }
    };

    const handleReorder = async (direction, offer) => {
        const index = offers.findIndex(o => o._id === offer._id);
        if (index < 0) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= offers.length) return;

        const copy = [...offers];
        const [removed] = copy.splice(index, 1);
        copy.splice(newIndex, 0, removed);

        const items = copy.map((o, idx) => ({ id: o._id, order: idx }));

        try {
            await adminApi.reorderOffers(items);
            setOffers(copy.map((o, idx) => ({ ...o, order: idx })));
        } catch (e) {
            console.error(e);
            showToast('Failed to reorder offers', 'error');
        }
    };

    const categoryMap = useMemo(() => {
        const map = {};
        categories.forEach(c => {
            map[c._id] = c;
        });
        return map;
    }, [categories]);

    const productMap = useMemo(() => {
        const map = {};
        products.forEach(p => {
            map[p._id] = p;
        });
        return map;
    }, [products]);

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Offers Manager
                        <Badge variant="primary">Beta</Badge>
                    </span>
                }
                description="Create offer cards, attach products & categories, and control the order they appear."
                actions={
                    <Button onClick={openCreateModal}>
                        <HiOutlinePlus className="h-4 w-4" />
                        New Offer
                    </Button>
                }
            />

            <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Active Offers ({offers.length})
                    </h2>
                    {isLoading && (
                        <span className="text-[10px] font-bold text-slate-400">Loading...</span>
                    )}
                </div>

                <div className="divide-y divide-slate-50">
                    {offers.map((offer, idx) => {
                        const styleMeta = STYLE_OPTIONS.find(s => s.id === offer.style) || STYLE_OPTIONS[0];
                        const iconMeta = ICON_OPTIONS.find(i => i.id === offer.icon) || ICON_OPTIONS[0];
                        const IconComp = iconMeta.icon;

                        return (
                            <div
                                key={offer._id}
                                className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50/40 md:flex-row md:items-center"
                            >
                                <div className="flex items-center gap-3 md:w-[260px]">
                                    <div className={cn(
                                        "flex h-11 w-11 items-center justify-center rounded-xl text-white",
                                        styleMeta.className
                                    )}>
                                        <IconComp className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-slate-900">
                                            #{idx + 1} • {offer.title}
                                        </p>
                                        {offer.code && (
                                            <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">
                                                Code: {offer.code}
                                            </p>
                                        )}
                                        {offer.appliesOnOrderNumber && (
                                            <p className="mt-0.5 text-[10px] font-bold text-primary">
                                                On order #{offer.appliesOnOrderNumber}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid flex-1 grid-cols-1 gap-3 text-[11px] md:grid-cols-3">
                                    <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            Categories
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(offer.categoryIds || []).map(id => (
                                                <span
                                                    key={id}
                                                    className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700"
                                                >
                                                    {categoryMap[id]?.name || 'Unknown'}
                                                </span>
                                            ))}
                                            {(!offer.categoryIds || offer.categoryIds.length === 0) && (
                                                <span className="text-[10px] text-slate-400">None selected</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            Products
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(offer.productIds || []).slice(0, 3).map(id => (
                                                <span
                                                    key={id}
                                                    className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700"
                                                >
                                                    {productMap[id]?.name || 'Product'}
                                                </span>
                                            ))}
                                            {offer.productIds && offer.productIds.length > 3 && (
                                                <span className="text-[10px] text-slate-500">
                                                    +{offer.productIds.length - 3} more
                                                </span>
                                            )}
                                            {(!offer.productIds || offer.productIds.length === 0) && (
                                                <span className="text-[10px] text-slate-400">None selected</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            Meta
                                        </p>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-slate-500">
                                                Order: {offer.order ?? idx}
                                            </span>
                                            <Badge variant={offer.status === 'active' ? 'success' : 'secondary'}>
                                                {offer.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-start md:flex-col md:justify-between md:self-stretch">
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={idx === 0}
                                            onClick={() => handleReorder('up', offer)}
                                            className={cn(
                                                "rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700",
                                                idx === 0 && "cursor-not-allowed opacity-30"
                                            )}
                                        >
                                            <HiOutlineArrowUpCircle className="h-4 w-4" />
                                        </button>
                                        <button
                                            disabled={idx === offers.length - 1}
                                            onClick={() => handleReorder('down', offer)}
                                            className={cn(
                                                "rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700",
                                                idx === offers.length - 1 && "cursor-not-allowed opacity-30"
                                            )}
                                        >
                                            <HiOutlineArrowDownCircle className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEditModal(offer)}
                                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                                        >
                                            <HiOutlinePencilSquare className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(offer._id)}
                                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                                        >
                                            <HiOutlineTrash className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {offers.length === 0 && !isLoading && (
                        <div className="p-4">
                            <EmptyState
                                icon={<HiOutlineSparkles className="h-6 w-6" />}
                                title="No offers configured yet"
                                description={'Click "New Offer" to create your first offer card.'}
                            />
                        </div>
                    )}
                </div>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingOffer ? "Edit Offer" : "Create Offer"}
            >
                <form onSubmit={handleSave} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Offer Title
                        </label>
                        <input
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="E.g. 60% OFF on first order"
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Description
                        </label>
                        <textarea
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Short copy to explain this offer"
                            className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Offer Code
                            </label>
                            <input
                                value={formData.code}
                                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                placeholder="WELCOME60"
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-mono font-black uppercase tracking-widest outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Applies on order #
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={formData.appliesOnOrderNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, appliesOnOrderNumber: e.target.value }))}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Style
                            </label>
                            <div className="flex gap-2">
                                {STYLE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, style: opt.id }))}
                                        className={cn(
                                            "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-[11px] font-bold",
                                            formData.style === opt.id
                                                ? "border-primary bg-primary text-white"
                                                : "border-slate-200 bg-slate-50 text-slate-600"
                                        )}
                                    >
                                        <span className={cn("h-3 w-3 rounded-full", opt.className)} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Icon
                            </label>
                            <div className="flex gap-2">
                                {ICON_OPTIONS.map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, icon: opt.id }))}
                                            className={cn(
                                                "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-[11px] font-bold",
                                                formData.icon === opt.id
                                                    ? "border-primary bg-primary text-white"
                                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Attach Categories (optional)
                            </label>
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                {categories.map(c => {
                                    const isSelected = formData.categoryIds.includes(c._id);
                                    return (
                                        <button
                                            key={c._id}
                                            type="button"
                                            onClick={() =>
                                                setFormData(prev => ({
                                                    ...prev,
                                                    categoryIds: isSelected
                                                        ? prev.categoryIds.filter(id => id !== c._id)
                                                        : [...prev.categoryIds, c._id],
                                                }))
                                            }
                                            className={cn(
                                                "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                                                isSelected
                                                    ? "border-primary bg-primary text-white"
                                                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                            )}
                                        >
                                            {c.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Attach Products (optional)
                            </label>
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                {products.map(p => {
                                    const isSelected = formData.productIds.includes(p._id);
                                    return (
                                        <button
                                            key={p._id}
                                            type="button"
                                            onClick={() =>
                                                setFormData(prev => ({
                                                    ...prev,
                                                    productIds: isSelected
                                                        ? prev.productIds.filter(id => id !== p._id)
                                                        : [...prev.productIds, p._id],
                                                }))
                                            }
                                            className={cn(
                                                "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                                                isSelected
                                                    ? "border-primary bg-primary text-white"
                                                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                            )}
                                        >
                                            {p.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Display Order
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={formData.order}
                                onChange={(e) => setFormData(prev => ({ ...prev, order: e.target.value }))}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Status
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                            {editingOffer ? 'Save Changes' : 'Create Offer'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default OffersManagement;
