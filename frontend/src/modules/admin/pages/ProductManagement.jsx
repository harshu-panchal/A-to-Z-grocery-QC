import React, { useState, useMemo, useEffect } from 'react';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import EmptyState from '@shared/components/ui/EmptyState';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import {
    HiOutlinePlus,
    HiOutlineCube,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlinePhoto,
    HiOutlineArchiveBox,
    HiOutlineTag,
    HiOutlineArrowPath,
    HiOutlineXMark,
    HiOutlineChevronRight,
    HiOutlineCheckCircle,
    HiOutlineExclamationCircle,
    HiOutlineFolderOpen,
    HiOutlineSwatch,
} from 'react-icons/hi2';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const DEFAULT_MODERATION_COUNTS = {
    all: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    active: 0,
    lowStock: 0,
    outOfStock: 0,
};

// Perf audit FE-R3: these were previously defined *inside* the
// ProductManagement component body, so every render created new function
// identities for them. Because they're rendered as JSX components
// (`<StatusBadge .../>`) inside DataTable's cell renderers, React treated
// them as a different component type on every re-render and fully
// unmounted/remounted every badge cell in the table — including while
// simply typing in the edit-product modal's form fields, since that state
// lives in this same component. Neither component closes over any local
// state (they're pure functions of their props), so hoisting them to
// module scope is a pure perf fix with identical visual output.
const StatusBadge = ({ status, stock }) => {
    if (stock === 0) return <Badge variant="danger">Out of Stock</Badge>;
    if (stock <= 10) return <Badge variant="warning">Low Stock</Badge>;
    if (status === 'active') return <Badge variant="success">Active</Badge>;
    return <Badge variant="secondary">Draft</Badge>;
};

const ApprovalBadge = ({ approvalStatus }) => {
    const normalized = String(approvalStatus || 'approved').toLowerCase();
    if (normalized === 'pending') {
        return <Badge variant="warning">Pending</Badge>;
    }
    if (normalized === 'rejected') {
        return <Badge variant="danger">Rejected</Badge>;
    }
    return <Badge variant="success">Approved</Badge>;
};

const ADMIN_PRODUCTS_QUERY_KEY = ['admin', 'productModeration'];

const ProductManagement = () => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [isSaving, setIsSaving] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all'); // Added filterStatus
    const [filterApprovalStatus, setFilterApprovalStatus] = useState('all');
    const [filterStockStatus, setFilterStockStatus] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [moderatingActionId, setModeratingActionId] = useState('');

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [itemToReject, setItemToReject] = useState(null);
    const [rejectionNote, setRejectionNote] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [modalTab, setModalTab] = useState('general');

    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        sku: '',
        description: '',
        price: '',
        salePrice: '',
        stock: '',
        lowStockAlert: 5,
        unit: 'packet',
        header: '',
        categoryId: '',
        subcategoryId: '',
        status: 'active',
        isFeatured: false,
        tags: '',
        weight: '',
        brand: '',
        mainImage: null,
        galleryImages: [],
        variants: [
            { id: Date.now(), name: 'Default', price: '', salePrice: '', stock: '', sku: '' }
        ]
    });

    const [viewingVariants, setViewingVariants] = useState(null);
    const [isVariantsViewModalOpen, setIsVariantsViewModalOpen] = useState(false);

    // Perf audit Phase 8: migrated to React Query — same 500ms debounce,
    // same page-reset-on-filter-change behavior as before.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [filterCategory, filterStatus, filterApprovalStatus, filterStockStatus, sortBy, pageSize]);

    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'categoryTree'],
        queryFn: async () => {
            const response = await adminApi.getCategoryTree();
            if (!response.data.success) return [];
            return response.data.results || response.data.result || [];
        },
    });

    const productsQueryParams = useMemo(() => {
        const params = { page, limit: pageSize };
        if (debouncedSearchTerm) params.search = debouncedSearchTerm;
        if (filterCategory !== 'all') params.category = filterCategory;
        if (filterStatus !== 'all') params.status = filterStatus;
        if (filterApprovalStatus !== 'all') params.approvalStatus = filterApprovalStatus;
        if (filterStockStatus !== 'all') params.stockStatus = filterStockStatus;
        if (sortBy) params.sort = sortBy;
        return params;
    }, [page, pageSize, debouncedSearchTerm, filterCategory, filterStatus, filterApprovalStatus, filterStockStatus, sortBy]);

    const {
        data: productsQueryData,
        isLoading,
        isFetching,
        isError: isProductsError,
    } = useQuery({
        queryKey: [...ADMIN_PRODUCTS_QUERY_KEY, productsQueryParams],
        queryFn: async () => {
            const response = await adminApi.getProductModerationList(productsQueryParams);
            if (!response.data.success) throw new Error('Failed to fetch products');
            const payload = response.data.result || {};
            const list = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
            return {
                items: list,
                total: typeof payload.total === 'number' ? payload.total : list.length,
                page: typeof payload.page === 'number' ? payload.page : productsQueryParams.page,
                counts: {
                    all: Number(payload?.counts?.all || 0),
                    pending: Number(payload?.counts?.pending || 0),
                    approved: Number(payload?.counts?.approved || 0),
                    rejected: Number(payload?.counts?.rejected || 0),
                    active: Number(payload?.counts?.active || 0),
                    lowStock: Number(payload?.counts?.lowStock || 0),
                    outOfStock: Number(payload?.counts?.outOfStock || 0),
                },
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isProductsError) toast.error('Failed to fetch products');
    }, [isProductsError]);

    const products = productsQueryData?.items ?? [];
    const total = productsQueryData?.total ?? 0;
    const moderationCounts = productsQueryData?.counts ?? DEFAULT_MODERATION_COUNTS;
    const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_QUERY_KEY });

    const handleSave = async () => {
        if (!editingItem) {
            return toast.error('Only product editing is allowed for admins');
        }

        if (!formData.name || !formData.price || !formData.stock || !formData.header || !formData.categoryId || !formData.subcategoryId) {
            return toast.error('Please fill all required fields, including categories');
        }

        setIsSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('slug', formData.slug);
            data.append('sku', formData.sku);
            data.append('description', formData.description);
            data.append('price', Number(formData.price));
            data.append('salePrice', Number(formData.salePrice) || 0);
            data.append('stock', Number(formData.stock));
            data.append('lowStockAlert', Number(formData.lowStockAlert) || 5);
            data.append('unit', formData.unit);
            data.append('headerId', formData.header);
            data.append('categoryId', formData.categoryId);
            data.append('subcategoryId', formData.subcategoryId);
            data.append('status', formData.status);
            data.append('isFeatured', formData.isFeatured);
            data.append('brand', formData.brand);
            data.append('weight', formData.weight);
            data.append('tags', formData.tags);
            data.append('variants', JSON.stringify(formData.variants));

            if (formData.mainImageFile) {
                data.append('mainImage', formData.mainImageFile);
            }
            if (formData.galleryFiles && formData.galleryFiles.length > 0) {
                formData.galleryFiles.forEach((file) => data.append('galleryImages', file));
            }

            await adminApi.updateProduct(editingItem._id, data);
            toast.success('Product updated successfully');
            setIsProductModalOpen(false);
            invalidateProducts();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save product');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        try {
            await adminApi.deleteProduct(itemToDelete._id);
            toast.success('Product deleted');
            setIsDeleteModalOpen(false);
            invalidateProducts();
        } catch (error) {
            toast.error('Failed to delete product');
        }
    };

    const submitModerationAction = async (product, action, approvalNote = '') => {
        if (!product?._id) return;

        const actionKey = `${action}:${product._id}`;
        setModeratingActionId(actionKey);
        try {
            if (action === 'approve') {
                const res = await adminApi.approveProductModeration(product._id, { approvalNote });
                toast.success(res?.data?.message || 'Product approved successfully');
            } else {
                const res = await adminApi.rejectProductModeration(product._id, { approvalNote });
                toast.success(res?.data?.message || 'Product rejected successfully');
            }
            invalidateProducts();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update product approval status');
        } finally {
            setModeratingActionId('');
        }
    };

    const handleModerationAction = async (product, action) => {
        if (!product?._id) return;

        if (action === 'reject') {
            setItemToReject(product);
            setRejectionNote(product.approvalNote || '');
            setIsRejectModalOpen(true);
            return;
        }

        // Audit fix: approving is what puts a product live for customers to
        // buy — reject already gates behind a modal requiring a note,
        // approve had no gate at all.
        if (!window.confirm(`Approve "${product.name || 'this product'}"? It will become visible to customers immediately.`)) {
            return;
        }

        submitModerationAction(product, action);
    };

    const confirmReject = async () => {
        const note = rejectionNote.trim();
        if (!note) {
            toast.error('Please enter a rejection reason');
            return;
        }

        await submitModerationAction(itemToReject, 'reject', note);
        setIsRejectModalOpen(false);
        setItemToReject(null);
        setRejectionNote('');
    };

    const handleImageUpload = (e, type) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) {
            return;
        }

        if (type === 'main') {
            const file = files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, mainImage: reader.result, mainImageFile: file });
            };
            reader.readAsDataURL(file);
            return;
        }

        const remainingSlots = Math.max(0, 5 - (formData.galleryImages?.length || 0));
        const galleryFiles = files.slice(0, remainingSlots);
        if (galleryFiles.length === 0) {
            toast.error('Max 5 gallery images allowed');
            return;
        }

        Promise.all(
            galleryFiles.map((file) => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({ file, url: reader.result });
                reader.readAsDataURL(file);
            }))
        ).then((results) => {
            setFormData({
                ...formData,
                galleryImages: [...(formData.galleryImages || []), ...results.map((item) => item.url)],
                galleryFiles: [...(formData.galleryFiles || []), ...results.map((item) => item.file)]
            });
        });
    };

    const openModal = (item = null) => {
        if (item) {
            setFormData({
                name: item.name || '',
                slug: item.slug || '',
                sku: item.sku || '',
                description: item.description || '',
                price: item.price || '',
                salePrice: item.salePrice || item.discountPrice || '',
                stock: item.stock || '',
                lowStockAlert: item.lowStockAlert || 5,
                unit: item.unit || 'packet',
                header: item.headerId?._id || item.headerId || '',
                categoryId: item.categoryId?._id || item.categoryId || '',
                subcategoryId: item.subcategoryId?._id || item.subcategoryId || '',
                status: item.status || 'active',
                isFeatured: item.isFeatured || false,
                tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags || '',
                weight: item.weight || '',
                brand: item.brand || '',
                mainImage: item.mainImage || null,
                galleryImages: item.galleryImages || item.images || [],
                variants: (item.variants && item.variants.length > 0) ? item.variants.map(v => ({ ...v, id: v._id || Date.now() })) : [
                    {
                        id: Date.now(),
                        name: 'Default',
                        price: item.price || '',
                        salePrice: item.salePrice || item.discountPrice || '',
                        stock: item.stock || '',
                        sku: item.sku || ''
                    }
                ]
            });
            setEditingItem(item);
        } else {
            setFormData({
                name: '', slug: '', sku: '', description: '', price: '',
                salePrice: '', stock: '', lowStockAlert: 5, unit: 'packet',
                header: '', categoryId: '', subcategoryId: '', status: 'active',
                isFeatured: false, tags: '', weight: '', brand: '',
                mainImage: null, galleryImages: [],
                variants: [
                    { id: Date.now(), name: 'Default', price: '', salePrice: '', stock: '', sku: '' }
                ]
            });
            setEditingItem(null);
        }
        setModalTab('general');
        setIsProductModalOpen(true);
    };

    const productsList = Array.isArray(products) ? products : [];
    const getEffectiveStock = (p) => {
        if (p.variants && p.variants.length > 0) {
            return p.variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
        }
        return Number(p.stock) || 0;
    };

    const stats = useMemo(() => {
        return {
            total: moderationCounts.all || total,
            lowStock: moderationCounts.lowStock || 0,
            outOfStock: moderationCounts.outOfStock || 0,
            active: moderationCounts.active || 0
        };
    }, [moderationCounts, total]);

    const columns = [
        {
            header: 'Product',
            key: 'product',
            cell: (p) => (
                <div className="flex min-w-0 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        <img src={p.mainImage || p.images?.[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-slate-900" title={p.name}>{p.name}</p>
                        <p className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-400" title={p.unit}>{p.unit}</p>
                        {p.approvalStatus === 'rejected' && p.approvalNote ? (
                            <p className="truncate text-[10px] font-medium text-danger" title={p.approvalNote}>
                                Note: {p.approvalNote}
                            </p>
                        ) : null}
                    </div>
                </div>
            ),
        },
        {
            header: 'Seller',
            key: 'seller',
            cell: (p) => (
                <div className="flex min-w-0 items-center gap-2">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span className="truncate text-[13px] font-medium text-slate-700" title={p.sellerId?.shopName || 'Admin'}>
                        {p.sellerId?.shopName || 'Admin'}
                    </span>
                </div>
            ),
        },
        {
            header: 'Variant',
            key: 'variant',
            cell: (p) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setViewingVariants(p);
                        setIsVariantsViewModalOpen(true);
                    }}
                    className="text-left"
                >
                    {p.variants && p.variants.length > 0 ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-2.5 py-1 text-info transition-transform hover:-translate-y-0.5">
                            <HiOutlineSwatch className="h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-nowrap text-[12px] font-medium">
                                {p.variants.length} Variant{p.variants.length > 1 ? 's' : ''}
                            </span>
                        </div>
                    ) : (
                        <span className="text-[12px] font-medium text-slate-400">No variants</span>
                    )}
                </button>
            ),
        },
        {
            header: 'Category',
            key: 'category',
            cell: (p) => (
                <span className="inline-block max-w-full truncate rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700" title={p.categoryId?.name || 'N/A'}>
                    {p.categoryId?.name || 'N/A'}
                </span>
            ),
        },
        {
            header: 'Subcategory',
            key: 'subcategory',
            cell: (p) => (
                <span className="inline-block max-w-full truncate rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-600" title={p.subcategoryId?.name || 'N/A'}>
                    {p.subcategoryId?.name || 'N/A'}
                </span>
            ),
        },
        {
            header: 'Status',
            key: 'status',
            align: 'center',
            cell: (p) => (
                <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={p.status} stock={getEffectiveStock(p)} />
                    <ApprovalBadge approvalStatus={p.approvalStatus} />
                </div>
            ),
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'center',
            cell: (p) => (
                <div className="flex items-center justify-center gap-1.5">
                    {String(p.approvalStatus || '').toLowerCase() !== 'approved' && (
                        <button
                            onClick={() => handleModerationAction(p, 'approve')}
                            disabled={moderatingActionId === `approve:${p._id}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 text-slate-400 shadow-sm transition-all hover:bg-success/10 hover:text-success disabled:opacity-60"
                            title="Approve product"
                        >
                            <HiOutlineCheckCircle className="h-4 w-4" />
                        </button>
                    )}
                    {String(p.approvalStatus || '').toLowerCase() !== 'rejected' && (
                        <button
                            onClick={() => handleModerationAction(p, 'reject')}
                            disabled={moderatingActionId === `reject:${p._id}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 text-slate-400 shadow-sm transition-all hover:bg-warning/10 hover:text-warning disabled:opacity-60"
                            title="Reject product"
                        >
                            <HiOutlineXMark className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        onClick={() => openModal(p)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 text-slate-400 shadow-sm transition-all hover:bg-primary/10 hover:text-primary"
                    >
                        <HiOutlinePencilSquare className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => (setItemToDelete(p), setIsDeleteModalOpen(true))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 text-slate-400 shadow-sm transition-all hover:bg-danger/10 hover:text-danger"
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
                        Product List
                        <Badge variant="primary">Live</Badge>
                    </span>
                }
                description="Track your items, prices, and how many are left in stock."
            />

            {isLoading && productsList.length === 0 ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <SkeletonCard lines={6} />
                </div>
            ) : (
                <>
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <StatCard label="All Items" value={stats.total} icon={HiOutlineCube} color="text-primary" bg="bg-primary/10" />
                        <StatCard label="Active Items" value={stats.active} icon={HiOutlineCheckCircle} color="text-success" bg="bg-success/10" />
                        <StatCard
                            label="Low Stock"
                            value={stats.lowStock}
                            icon={HiOutlineExclamationCircle}
                            color="text-warning"
                            bg="bg-warning/10"
                            onClick={() => setFilterStockStatus(prev => prev === 'low' ? 'all' : 'low')}
                            className={filterStockStatus === 'low' ? 'ring-2 ring-warning/40' : ''}
                        />
                        <StatCard
                            label="Out of Stock"
                            value={stats.outOfStock}
                            icon={HiOutlineArchiveBox}
                            color="text-danger"
                            bg="bg-danger/10"
                            onClick={() => setFilterStockStatus(prev => prev === 'out' ? 'all' : 'out')}
                            className={filterStockStatus === 'out' ? 'ring-2 ring-danger/40' : ''}
                        />
                    </div>

                    <FilterBar
                        pills={[
                            { label: `All (${moderationCounts.all})`, active: filterApprovalStatus === 'all', onClick: () => setFilterApprovalStatus('all') },
                            { label: `Approved (${moderationCounts.approved})`, active: filterApprovalStatus === 'approved', onClick: () => setFilterApprovalStatus('approved') },
                            { label: `Pending Approval (${moderationCounts.pending})`, active: filterApprovalStatus === 'pending', onClick: () => setFilterApprovalStatus('pending') },
                            { label: `Rejected (${moderationCounts.rejected})`, active: filterApprovalStatus === 'rejected', onClick: () => setFilterApprovalStatus('rejected') },
                        ]}
                    />

                    <FilterBar
                        left={
                            <div className="relative w-full sm:w-80">
                                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by name, SKU or slug..."
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        }
                        right={
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="all">All Categories</option>
                                    {categories.map(h => (
                                        <optgroup key={h._id} label={h.name}>
                                            <option value={h._id}>All {h.name}</option>
                                            {(h.children || []).map(c => (
                                                <option key={c._id} value={c._id}>{c.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        const nextStatus = filterStatus === 'all' ? 'active' : filterStatus === 'active' ? 'inactive' : 'all';
                                        setFilterStatus(nextStatus);
                                    }}
                                    className={cn(
                                        "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-bold transition-all",
                                        filterStatus === 'active' ? "bg-success text-white" :
                                            filterStatus === 'inactive' ? "bg-warning text-white" :
                                                "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <HiOutlineFunnel className="h-3.5 w-3.5" />
                                    <span>
                                        {filterStatus === 'active' ? 'Only Live' :
                                            filterStatus === 'inactive' ? 'Only Draft' :
                                                'Show All'}
                                    </span>
                                </button>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                    <option value="name-asc">Name A-Z</option>
                                    <option value="name-desc">Name Z-A</option>
                                    <option value="price-asc">Price Low-High</option>
                                    <option value="price-desc">Price High-Low</option>
                                    <option value="stock-asc">Stock Low-High</option>
                                    <option value="stock-desc">Stock High-Low</option>
                                </select>
                            </div>
                        }
                    />

                    <DataTable
                        columns={columns}
                        data={productsList}
                        rowKey={(p) => p._id}
                        loading={isFetching && productsList.length > 0}
                        emptyState={
                            <EmptyState
                                icon={<HiOutlineCube className="h-6 w-6" />}
                                title="No products found"
                                description="No products match your current search criteria."
                            />
                        }
                    />

                    <Pagination
                        page={productsQueryData?.page ?? page}
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

            {/* Super Detailed Modal */}
            <AnimatePresence>
                {isProductModalOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex touch-pan-y items-center justify-center overflow-hidden overscroll-contain p-4 lg:p-12"
                        onWheelCapture={(e) => e.stopPropagation()}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setIsProductModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative z-10 flex w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-slate-100 p-5">
                                <div className="flex items-center space-x-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                                        <HiOutlineCube className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900">
                                            Edit Product
                                        </h3>
                                        <div className="mt-0.5 flex items-center space-x-2">
                                            <Badge variant="primary">System</Badge>
                                            <HiOutlineChevronRight className="h-2.5 w-2.5 text-slate-300" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{formData.sku || 'PENDING SKU'}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setIsProductModalOpen(false)} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100">
                                    <HiOutlineXMark className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="flex min-h-0 min-h-[400px] max-h-[calc(100vh-200px)] flex-1 flex-col overflow-hidden md:flex-row">
                                {/* Modal Sidebar Tabs */}
                                <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain border-r border-slate-100 bg-slate-50/50 p-4 scrollbar-hide md:w-1/4">
                                    {[
                                        { id: 'general', label: 'General Info', icon: HiOutlineTag },
                                        { id: 'variants', label: 'Item Variants', icon: HiOutlineSwatch },
                                        { id: 'category', label: 'Groups', icon: HiOutlineFolderOpen },
                                        { id: 'media', label: 'Photos', icon: HiOutlinePhoto }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setModalTab(tab.id)}
                                            className={cn(
                                                "flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-xs font-bold transition-all",
                                                modalTab === tab.id
                                                    ? "border border-slate-100 bg-white text-primary shadow-sm"
                                                    : "text-slate-500 hover:bg-slate-100"
                                            )}
                                        >
                                            <tab.icon className="h-4 w-4" />
                                            <span>{tab.label}</span>
                                        </button>
                                    ))}

                                    <div className="px-4 pt-8">
                                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                                            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-primary">Status</p>
                                            <select
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                className="w-full cursor-pointer border-none bg-transparent p-0 text-xs font-bold text-primary outline-none"
                                            >
                                                <option value="active">Published</option>
                                                <option value="inactive">Draft</option>
                                            </select>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4">
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-primary">Featured</p>
                                            <input
                                                type="checkbox"
                                                checked={formData.isFeatured}
                                                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                                className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Content Area */}
                                <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
                                    {modalTab === 'general' && (
                                        <div className="space-y-5">
                                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Product Title</label>
                                                    <input
                                                        value={formData.name}
                                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                        placeholder="e.g. Premium Basmati Rice"
                                                    />
                                                </div>
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Web Address</label>
                                                    <div className="flex items-center rounded-md border border-slate-200 bg-white px-3.5">
                                                        <span className="mr-1 text-[10px] font-bold text-slate-400">/product/</span>
                                                        <input
                                                            value={formData.slug}
                                                            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                                            className="h-10 flex-1 border-none bg-transparent text-sm font-semibold text-slate-500 outline-none"
                                                            placeholder="premium-basmati-rice"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">About this item</label>
                                                <textarea
                                                    value={formData.description}
                                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                    onWheel={(e) => e.stopPropagation()}
                                                    onTouchMove={(e) => e.stopPropagation()}
                                                    className="custom-scrollbar min-h-[160px] max-h-[260px] w-full resize-none overflow-y-auto rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Describe the item here..."
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Brand Name</label>
                                                    <input
                                                        value={formData.brand}
                                                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                        placeholder="e.g. Amul"
                                                    />
                                                </div>
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Product Code</label>
                                                    <input
                                                        value={formData.sku}
                                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-mono font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                        placeholder="AUTO-GENERATED"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'category' && (
                                        <div className="space-y-5">
                                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Main Group (Header) <span className="text-danger">*</span></label>
                                                    <select
                                                        value={formData.header}
                                                        onChange={(e) => setFormData({ ...formData, header: e.target.value, categoryId: '', subcategoryId: '' })}
                                                        className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-3.5 text-sm font-bold outline-none"
                                                    >
                                                        <option value="">Select Main Group</option>
                                                        {categories.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex flex-col space-y-1.5">
                                                    <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Specific Category <span className="text-danger">*</span></label>
                                                    <select
                                                        value={formData.categoryId}
                                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, subcategoryId: '' })}
                                                        disabled={!formData.header}
                                                        className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-3.5 text-sm font-bold outline-none disabled:opacity-50"
                                                    >
                                                        <option value="">Select Category</option>
                                                        {categories.find(h => h._id === formData.header)?.children?.map(c => (
                                                            <option key={c._id} value={c._id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="ml-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Sub-Category <span className="text-danger">*</span></label>
                                                <select
                                                    value={formData.subcategoryId}
                                                    onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })}
                                                    disabled={!formData.categoryId}
                                                    className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-3.5 text-sm font-bold outline-none disabled:opacity-50"
                                                >
                                                    <option value="">Select Sub-Category</option>
                                                    {categories.find(h => h._id === formData.header)?.children?.find(c => c._id === formData.categoryId)?.children?.map(sc => (
                                                        <option key={sc._id} value={sc._id}>{sc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'variants' && (
                                        <div className="space-y-5">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-bold text-slate-900">Product Variants</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, variants: [...formData.variants, { id: Date.now(), name: '', price: '', salePrice: '', stock: '', sku: '' }] })}
                                                    className="rounded-lg bg-danger/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-danger transition-colors hover:bg-danger/20"
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {formData.variants.map((v, i) => (
                                                    <div key={v.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
                                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Variant Name</label>
                                                                <input
                                                                    value={v.name}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].name = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="500g"
                                                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Price</label>
                                                                <input
                                                                    type="number"
                                                                    value={v.price}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].price = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="200"
                                                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-primary">Sale Price</label>
                                                                <input
                                                                    type="number"
                                                                    value={v.salePrice}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].salePrice = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="150"
                                                                    className="w-full rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Stock</label>
                                                                <input
                                                                    type="number"
                                                                    value={v.stock}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].stock = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="50"
                                                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">SKU</label>
                                                                <div className="flex items-start gap-2">
                                                                    <input
                                                                        value={v.sku}
                                                                        onChange={e => {
                                                                            const news = [...formData.variants];
                                                                            news[i].sku = e.target.value;
                                                                            setFormData({ ...formData, variants: news });
                                                                        }}
                                                                        placeholder="mango-001"
                                                                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFormData({ ...formData, variants: formData.variants.filter((_, idx) => idx !== i) })}
                                                                        className="mt-0.5 rounded-lg p-2 text-danger transition-colors hover:bg-danger/10"
                                                                        aria-label="Delete variant"
                                                                    >
                                                                        <HiOutlineTrash className="h-4 w-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'media' && (
                                        <div className="space-y-5">
                                            <div className="space-y-3">
                                                <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Main Cover Photo</label>
                                                <div className="flex flex-col items-start gap-6 md:flex-row">
                                                    <div className="group relative flex aspect-square w-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition-all hover:border-primary hover:bg-primary/5">
                                                        <input
                                                            type="file"
                                                            className="absolute inset-0 z-10 cursor-pointer opacity-0"
                                                            onChange={(e) => handleImageUpload(e, 'main')}
                                                        />
                                                        {formData.mainImage ? (
                                                            <img src={formData.mainImage} alt="Main Preview" className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex flex-col items-center">
                                                                <HiOutlinePhoto className="h-10 w-10 text-slate-200" />
                                                                <p className="mt-2 text-[10px] font-bold text-slate-400">UPLOAD</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-2">
                                                <div className="flex items-center justify-between gap-4">
                                                    <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Gallery Photos</label>
                                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:-translate-y-0.5">
                                                        <HiOutlinePhoto className="h-4 w-4" />
                                                        <span>Add Photos</span>
                                                        <input
                                                            type="file"
                                                            multiple
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={(e) => handleImageUpload(e, 'gallery')}
                                                        />
                                                    </label>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                                    {(formData.galleryImages || []).length > 0 ? (
                                                        formData.galleryImages.map((image, index) => (
                                                            <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                                                                <img src={image} alt={`Gallery ${index + 1}`} className="h-full w-full object-cover" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setFormData({
                                                                        ...formData,
                                                                        galleryImages: formData.galleryImages.filter((_, i) => i !== index)
                                                                    })}
                                                                    className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-danger opacity-0 shadow-md transition-all group-hover:opacity-100"
                                                                >
                                                                    <HiOutlineTrash className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                                                            <p className="text-xs font-medium text-slate-400">No gallery photos added yet.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="border-t border-slate-50 pt-4 text-center text-[10px] font-medium italic text-slate-400">
                                                Quick Tip: Multiple photos help users trust your products more!
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-5">
                                <Button variant="ghost" onClick={() => setIsProductModalOpen(false)}>
                                    Close
                                </Button>
                                <Button onClick={handleSave} isLoading={isSaving}>
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <Modal
                isOpen={isRejectModalOpen}
                onClose={() => {
                    if (moderatingActionId === `reject:${itemToReject?._id}`) return;
                    setIsRejectModalOpen(false);
                    setItemToReject(null);
                    setRejectionNote('');
                }}
                title="Reject Product"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsRejectModalOpen(false);
                                setItemToReject(null);
                                setRejectionNote('');
                            }}
                            disabled={moderatingActionId === `reject:${itemToReject?._id}`}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={confirmReject}
                            isLoading={moderatingActionId === `reject:${itemToReject?._id}`}
                        >
                            {moderatingActionId === `reject:${itemToReject?._id}` ? 'Rejecting...' : 'Reject Product'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-5 py-2">
                    <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                        <p className="line-clamp-2 text-xs font-black text-slate-900">
                            {itemToReject?.name || 'Selected product'}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-danger">
                            Rejection reason required
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Reason for seller
                        </label>
                        <textarea
                            value={rejectionNote}
                            onChange={(e) => setRejectionNote(e.target.value)}
                            rows={5}
                            autoFocus
                            placeholder="Tell the seller what needs to be fixed before resubmitting..."
                            className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition-all focus:border-danger focus:ring-2 focus:ring-danger/20"
                        />
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Confirm Deletion"
                size="sm"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={confirmDelete}>
                            Delete Product
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col items-center py-4 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
                        <HiOutlineExclamationCircle className="h-8 w-8 text-danger" />
                    </div>
                    <h3 className="mb-2 text-lg font-black text-slate-900">Delete Product?</h3>
                    <p className="text-sm font-medium text-slate-500">
                        Are you sure you want to delete <span className="font-bold text-slate-900">"{itemToDelete?.name}"</span>?
                        This action cannot be undone.
                    </p>
                </div>
            </Modal>

            {/* Viewing Variants Modal */}
            <Modal
                isOpen={isVariantsViewModalOpen}
                onClose={() => setIsVariantsViewModalOpen(false)}
                title="Product Variants Details"
                size="lg"
            >
                <div className="py-2">
                    <div className="mb-5 flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                            {viewingVariants?.mainImage || viewingVariants?.images?.[0] || viewingVariants?.galleryImages?.[0] ? (
                                <img src={viewingVariants.mainImage || viewingVariants.images?.[0] || viewingVariants.galleryImages?.[0]} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <HiOutlineCube className="h-7 w-7 text-slate-200" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-black leading-tight text-slate-900">{viewingVariants?.name}</h3>
                            <div className="mt-1 flex items-center gap-2">
                                <Badge variant="primary">{viewingVariants?.categoryId?.name || 'Category'}</Badge>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Master SKU: {viewingVariants?.sku || viewingVariants?._id?.slice(-6).toUpperCase() || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <DataTable
                        columns={[
                            {
                                key: 'spec',
                                header: 'Variant Specification',
                                primary: true,
                                cell: (v) => (
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-700">{v.name}</span>
                                        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Variation {(viewingVariants?.variants || []).indexOf(v) + 1}</span>
                                    </div>
                                ),
                            },
                            {
                                key: 'price',
                                header: 'Unit Price',
                                align: 'center',
                                cell: (v) => (
                                    <div className="flex flex-col items-center">
                                        <span className={cn("text-xs font-bold", v.salePrice > 0 ? "scale-90 text-slate-400 line-through" : "text-slate-900")}>₹{v.price}</span>
                                        {v.salePrice > 0 && <span className="text-xs font-bold text-primary">₹{v.salePrice}</span>}
                                    </div>
                                ),
                            },
                            {
                                key: 'stock',
                                header: 'Available Stock',
                                align: 'center',
                                cell: (v) => (
                                    <Badge variant={v.stock === 0 ? "danger" : v.stock <= 10 ? "warning" : "success"}>
                                        {v.stock === 0 ? 'Out of Stock' : `${v.stock} Units`}
                                    </Badge>
                                ),
                            },
                            {
                                key: 'sku',
                                header: 'Variant SKU',
                                align: 'right',
                                cell: (v) => (
                                    <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                                        {v.sku || 'N/A'}
                                    </span>
                                ),
                            },
                        ]}
                        data={viewingVariants?.variants || []}
                        rowKey={(v, idx) => idx}
                    />

                    <div className="mt-6 flex justify-end">
                        <Button onClick={() => setIsVariantsViewModalOpen(false)}>
                            Close Viewer
                        </Button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default ProductManagement;
