import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import EmptyState from '@shared/components/ui/EmptyState';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePlus,
    HiOutlinePhoto,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlineArrowUpCircle,
    HiOutlineArrowDownCircle,
    HiOutlineDevicePhoneMobile,
    HiOutlineSparkles,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { adminApi } from '../services/adminApi';
import BannerListEditor from '../components/BannerListEditor';
import { bannerPayload, newBanner, toEditorItems, validateBanners } from '../components/bannerEditorUtils';
import ProductMultiPicker from '../components/ProductMultiPicker';

// Saved sections may hold populated objects instead of plain ids.
const toIds = (list) => (list || []).map((v) => String(typeof v === 'object' && v ? v._id : v));

const DISPLAY_TYPES = [
    { id: 'banners', label: 'Banners' },
    { id: 'categories', label: 'Categories' },
    { id: 'subcategories', label: 'Sub Categories' },
    { id: 'products', label: 'Products' },
];

const ContentManager = () => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [pageType, setPageType] = useState('home');
    const [selectedHeaderId, setSelectedHeaderId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        displayType: 'banners',
        title: '',
        status: 'active',
        // banners
        bannerItems: [newBanner()],
        // categories
        maxCategories: '',
        categoryIds: [],
        categoryRows: 1,
        categoryColumns: 4,
        // subcategories
        subCategoryCategoryIds: [],
        subCategoryIds: [],
        subCategoryRows: 1,
        subCategoryColumns: 4,
        // products
        productCategoryIds: [],
        productSubCategoryIds: [],
        productIds: [],
        productRows: 1,
        productColumns: 2,
        singleRowScrollable: false,
    });

    // Perf audit Phase 8: migrated `headerCategories` and `sections` to
    // React Query. `headerCategories` is a one-time tree fetch; `sections`
    // is parameterized by pageType/selectedHeaderId, matching the original
    // effect's re-fetch-on-change behavior via the query key.
    const { data: headerCategories = [], isError: isHeaderCategoriesError } = useQuery({
        queryKey: ['admin', 'headerCategoryTree'],
        queryFn: async () => {
            const res = await adminApi.getCategoryTree();
            if (res.data.success) {
                const tree = res.data.results || res.data.result || [];
                return Array.isArray(tree) ? tree : [];
            }
            return [];
        },
    });

    const selectedHeader = useMemo(
        () => headerCategories.find(h => h._id === selectedHeaderId) || null,
        [headerCategories, selectedHeaderId]
    );

    // Main categories for the page being edited (every header's on Home).
    const availableCategories = useMemo(() => {
        const headers = pageType === 'home' ? headerCategories : (selectedHeader ? [selectedHeader] : []);
        return headers.flatMap((header) =>
            (header.children || []).map((category) => ({ ...category, headerName: header.name }))
        );
    }, [headerCategories, pageType, selectedHeader]);

    const availableSubcategories = useMemo(
        () => availableCategories.flatMap((category) =>
            (category.children || []).map((sub) => ({
                ...sub,
                parentCategoryId: category._id,
                parentCategoryName: category.name,
                headerName: category.headerName,
            }))
        ),
        [availableCategories]
    );
    const subcategoryOptions = availableSubcategories.filter((s) => formData.subCategoryCategoryIds.includes(s.parentCategoryId));
    const productSubcategoryOptions = availableSubcategories.filter((s) => formData.productCategoryIds.includes(s.parentCategoryId));
    const headerPrefix = (item) => (pageType === 'home' && item.headerName ? `${item.headerName} · ` : '');

    useEffect(() => {
        if (isHeaderCategoriesError) showToast('Failed to load header categories', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHeaderCategoriesError]);

    useEffect(() => {
        if (!selectedHeaderId && headerCategories.length) {
            setSelectedHeaderId((headerCategories.find(h => (h.children || []).length) || headerCategories[0])._id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [headerCategories]);

    const sectionsQueryKey = useMemo(
        () => ['admin', 'experienceSections', pageType, selectedHeaderId],
        [pageType, selectedHeaderId]
    );

    const {
        data: sections = [],
        isLoading,
        isError: isSectionsError,
    } = useQuery({
        queryKey: sectionsQueryKey,
        queryFn: async () => {
            const params = { pageType };
            if (pageType === 'header') params.headerId = selectedHeaderId;
            const res = await adminApi.getExperienceSections(params);
            if (res.data.success) {
                const list = res.data.results || res.data.result || res.data;
                return Array.isArray(list) ? list : [];
            }
            return [];
        },
        enabled: !(pageType === 'header' && !selectedHeaderId),
    });

    useEffect(() => {
        if (isSectionsError) showToast('Failed to load experience sections', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSectionsError]);

    // Apply deep-link from Hero & categories per page (?pageType=home | ?pageType=header&headerId=xxx)
    useEffect(() => {
        const fromUrl = searchParams.get('pageType');
        const headerIdFromUrl = searchParams.get('headerId');
        if (fromUrl === 'home') {
            setPageType('home');
        } else if (fromUrl === 'header' && headerIdFromUrl) {
            setPageType('header');
            setSelectedHeaderId(headerIdFromUrl);
        }
    }, [searchParams]);

    const resetForm = () => {
        setFormData({
            displayType: 'banners',
            title: '',
            status: 'active',
            bannerItems: [newBanner()],
            maxCategories: '',
            categoryIds: [],
            categoryRows: 1,
            categoryColumns: 4,
            subCategoryCategoryIds: [],
            subCategoryIds: [],
            subCategoryRows: 1,
            subCategoryColumns: 4,
            productCategoryIds: [],
            productSubCategoryIds: [],
            productIds: [],
            productRows: 1,
            productColumns: 2,
            singleRowScrollable: false,
        });
    };

    const openCreateModal = () => {
        setEditingItem(null);
        resetForm();
        setIsModalOpen(true);
    };

    const openEditModal = (section) => {
        setEditingItem(section);
        const { displayType, title, status, config = {} } = section;
        const next = {
            displayType,
            title: title || '',
            status: status || 'active',
            bannerItems: config.banners?.items?.length ? toEditorItems(config.banners.items) : [newBanner()],
            maxCategories: config.categories?.maxItems ?? '',
            categoryIds: toIds(config.categories?.categoryIds),
            categoryRows: config.categories?.rows || 1,
            categoryColumns: config.categories?.columns || 4,
            subCategoryCategoryIds: toIds(config.subcategories?.categoryIds),
            subCategoryIds: toIds(config.subcategories?.subcategoryIds),
            subCategoryRows: config.subcategories?.rows || 1,
            subCategoryColumns: config.subcategories?.columns || 4,
            productCategoryIds: toIds(config.products?.categoryIds),
            productSubCategoryIds: toIds(config.products?.subcategoryIds),
            productIds: toIds(config.products?.productIds),
            productRows: config.products?.rows || 1,
            productColumns: config.products?.columns || 2,
            singleRowScrollable: !!config.products?.singleRowScrollable,
        };
        setFormData(next);
        setIsModalOpen(true);
    };

    const handleDeleteSection = async (id) => {
        if (!window.confirm('Are you sure you want to delete this section?')) return;
        try {
            await adminApi.deleteExperienceSection(id);
            showToast('Section deleted', 'success');
            queryClient.setQueryData(sectionsQueryKey, prev => (prev || []).filter(s => s._id !== id));
        } catch (e) {
            console.error(e);
            showToast('Failed to delete section', 'error');
        }
    };

    const handleSaveSection = async () => {
        const { displayType, title, status } = formData;

        if (['categories', 'subcategories', 'products'].includes(displayType)) {
            if (!title || !title.trim()) {
                showToast('Please enter a heading for this section', 'warning');
                return;
            }
        }

        const basePayload = {
            pageType,
            headerId: pageType === 'header' ? selectedHeaderId : undefined,
            displayType,
            title: title?.trim() || '',
            status,
        };

        let config = {};

        if (displayType === 'banners') {
            const problem = validateBanners(formData.bannerItems);
            if (problem) {
                showToast(problem, 'warning');
                return;
            }
            const items = bannerPayload(formData.bannerItems);
            if (!items.length) {
                showToast('Please add at least one banner image', 'warning');
                return;
            }
            config = { items };
        } else if (displayType === 'categories') {
            if (!formData.categoryIds?.length) {
                showToast('Please select at least one category', 'warning');
                return;
            }
            config = {
                maxItems: Number(formData.maxCategories) || undefined,
                categoryIds: formData.categoryIds,
                rows: Number(formData.categoryRows) || 1,
                columns: Number(formData.categoryColumns) || 4,
            };
        } else if (displayType === 'subcategories') {
            if (!formData.subCategoryCategoryIds?.length || !formData.subCategoryIds?.length) {
                showToast('Please select categories and subcategories', 'warning');
                return;
            }
            config = {
                categoryIds: formData.subCategoryCategoryIds,
                subcategoryIds: formData.subCategoryIds,
                rows: Number(formData.subCategoryRows) || 1,
                columns: Number(formData.subCategoryColumns) || 4,
            };
        } else if (displayType === 'products') {
            if (!formData.productIds?.length && !formData.productCategoryIds?.length && !formData.productSubCategoryIds?.length) {
                showToast('Pick products, or a category / subcategory to fill this section', 'warning');
                return;
            }
            config = {
                categoryIds: formData.productCategoryIds,
                subcategoryIds: formData.productSubCategoryIds,
                productIds: formData.productIds,
                rows: formData.singleRowScrollable ? 1 : (Number(formData.productRows) || 1),
                columns: Math.min(6, Math.max(1, Number(formData.productColumns) || 2)),
                singleRowScrollable: !!formData.singleRowScrollable,
            };
        }

        const payload = {
            ...basePayload,
            config,
        };

        if (isSaving) return;
        setIsSaving(true);
        try {
            if (editingItem) {
                const res = await adminApi.updateExperienceSection(editingItem._id, payload);
                const updated = res.data.result || res.data.results || res.data;
                queryClient.setQueryData(sectionsQueryKey, prev => (prev || []).map(s => (s._id === editingItem._id ? updated : s)));
                showToast('Section updated', 'success');
            } else {
                const res = await adminApi.createExperienceSection(payload);
                const created = res.data.result || res.data.results || res.data;
                queryClient.setQueryData(sectionsQueryKey, prev => [...(prev || []), created]);
                showToast('Section created', 'success');
            }
            setIsModalOpen(false);
        } catch (e) {
            console.error(e);
            showToast(e.response?.data?.message || 'Failed to save section', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReorder = async (direction, section) => {
        const index = sections.findIndex(s => s._id === section._id);
        if (index < 0) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sections.length) return;

        const copy = [...sections];
        const [removed] = copy.splice(index, 1);
        copy.splice(newIndex, 0, removed);

        const items = copy.map((s, idx) => ({ id: s._id, order: idx }));
        try {
            await adminApi.reorderExperienceSections(items);
            queryClient.setQueryData(sectionsQueryKey, copy.map((s, idx) => ({ ...s, order: idx })));
        } catch (e) {
            console.error(e);
            showToast('Failed to reorder sections', 'error');
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Experience Studio
                        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                    </span>
                }
                description="Add and arrange the banners, categories, and products that show in the app."
                actions={
                    <Button onClick={openCreateModal}>
                        <HiOutlinePlus className="h-4 w-4" />
                        Add Component
                    </Button>
                }
            />

            <p className="max-w-2xl text-xs text-slate-500">
                <strong>Top banners and page categories</strong> are set in &quot;Hero & categories per page&quot; in the sidebar. Use this page to manage the main content below them, like banners, categories, and products.
            </p>

            {/* Scope selectors */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex rounded-xl bg-slate-100 p-1">
                    {[
                        { id: 'home', label: 'Home Page' },
                        { id: 'header', label: 'Header Category Pages' },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => setPageType(opt.id)}
                            className={cn(
                                "rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                                pageType === opt.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {pageType === 'header' && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Header Category</span>
                        <select
                            value={selectedHeaderId}
                            onChange={(e) => setSelectedHeaderId(e.target.value)}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none"
                        >
                            {headerCategories.map((h) => (
                                <option key={h._id} value={h._id}>{h.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Section list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
                        Configured Sections ({sections.length})
                    </h3>
                    {isLoading && (
                        <span className="text-[10px] font-bold text-slate-400">Loading...</span>
                    )}
                </div>

                {sections.length === 0 && !isLoading && (
                    <EmptyState
                        icon={<HiOutlineSparkles className="h-6 w-6" />}
                        title="No sections configured yet"
                        description={'Click "Add Component" to start designing this page.'}
                    />
                )}

                <div className="space-y-3">
                    {sections.map((section, idx) => {
                        const displayMeta = DISPLAY_TYPES.find(d => d.id === section.displayType);
                        return (
                            <Card key={section._id} className="p-4">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                    <div className="flex min-w-0 flex-1 items-start gap-4">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                                            {section.displayType === 'banners' && <HiOutlinePhoto className="h-5 w-5" />}
                                            {section.displayType === 'categories' && <HiOutlineSparkles className="h-5 w-5" />}
                                            {section.displayType === 'subcategories' && <HiOutlineSparkles className="h-5 w-5" />}
                                            {section.displayType === 'products' && <HiOutlineDevicePhoneMobile className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-1 flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                    #{idx + 1} • {displayMeta?.label || section.displayType}
                                                </span>
                                                <Badge variant={section.status === 'active' ? 'success' : 'secondary'}>
                                                    {section.status}
                                                </Badge>
                                            </div>
                                            <h4 className="mb-0.5 text-sm font-black text-slate-900">
                                                {section.title || '(No heading)'}
                                            </h4>
                                            <p className="text-[11px] text-slate-500">
                                                {section.displayType === 'banners' && `${section.config?.banners?.items?.length || 0} banners configured`}
                                                {section.displayType === 'categories' && `${section.config?.categories?.categoryIds?.length || 0} categories • ${section.config?.categories?.rows || 1}x${section.config?.categories?.columns || 4} grid`}
                                                {section.displayType === 'subcategories' && `${section.config?.subcategories?.subcategoryIds?.length || 0} subcategories • ${section.config?.subcategories?.rows || 1}x${section.config?.subcategories?.columns || 4} grid`}
                                                {section.displayType === 'products' && `${section.config?.products?.productIds?.length ? `${section.config.products.productIds.length} picked products` : 'Products from chosen categories'} • ${section.config?.products?.singleRowScrollable ? 'Single row scroll' : `${section.config?.products?.rows || 1}x${section.config?.products?.columns || 2}`}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 self-end md:items-end">
                                        <div className="flex items-center gap-1">
                                            <button
                                                disabled={idx === 0}
                                                onClick={() => handleReorder('up', section)}
                                                className={cn(
                                                    "rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700",
                                                    idx === 0 && "cursor-not-allowed opacity-30"
                                                )}
                                            >
                                                <HiOutlineArrowUpCircle className="h-4 w-4" />
                                            </button>
                                            <button
                                                disabled={idx === sections.length - 1}
                                                onClick={() => handleReorder('down', section)}
                                                className={cn(
                                                    "rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-700",
                                                    idx === sections.length - 1 && "cursor-not-allowed opacity-30"
                                                )}
                                            >
                                                <HiOutlineArrowDownCircle className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => openEditModal(section)}
                                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                                        >
                                            <HiOutlinePencilSquare className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSection(section._id)}
                                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                                        >
                                            <HiOutlineTrash className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingItem ? "Edit Section" : "Create Section"}
            >
                <div className="space-y-5">
                    {/* Display type & status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Display Type</label>
                            <select
                                value={formData.displayType}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setFormData(prev => ({ ...prev, displayType: value }));
                                }}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                                {DISPLAY_TYPES.map(dt => (
                                    <option key={dt.id} value={dt.id}>{dt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</label>
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

                    {/* Heading - required for category/subcategory/product */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Section Heading {['categories', 'subcategories', 'products'].includes(formData.displayType) && <span className="text-danger">*</span>}
                        </label>
                        <input
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder={formData.displayType === 'banners' ? 'Optional, shown above the banners' : 'E.g. Grocery Essentials'}
                        />
                    </div>

                    {/* Type-specific config */}
                    {formData.displayType === 'banners' && (
                        <BannerListEditor
                            items={formData.bannerItems}
                            onChange={(updater) => setFormData(prev => ({ ...prev, bannerItems: updater(prev.bannerItems) }))}
                        />
                    )}

                    {formData.displayType === 'categories' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                                <div className="col-span-2 md:col-span-1">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Maximum categories (optional)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={formData.maxCategories ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, maxCategories: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="No limit"
                                    />
                                </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Rows
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        step={1}
                                        value={formData.categoryRows ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, categoryRows: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Columns
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={8}
                                        step={1}
                                        value={formData.categoryColumns ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, categoryColumns: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Select categories to show ({formData.categoryIds.length} selected)
                                </label>
                                {!availableCategories.length && (
                                    <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                        {pageType === 'header'
                                            ? 'This header has no categories yet. Choose another header, switch to Home Page, or add categories first.'
                                            : 'No categories found. Add categories first.'}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {availableCategories.map(c => {
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
                                                    "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                    isSelected
                                                        ? "border-primary bg-primary text-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                )}
                                            >
                                                {headerPrefix(c)}{c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Choose the number of rows and columns. Leave the maximum blank to use the full grid size. Extra categories appear under &quot;See all&quot;.
                                </p>
                            </div>
                        </div>
                    )}

                    {formData.displayType === 'subcategories' && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Select parent categories ({formData.subCategoryCategoryIds.length} selected)
                                </label>
                                {!availableCategories.length && (
                                    <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                        {pageType === 'header'
                                            ? 'This header has no categories yet. Choose another header, switch to Home Page, or add categories first.'
                                            : 'No categories found. Add categories first.'}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {availableCategories.map(c => {
                                        const isSelected = formData.subCategoryCategoryIds.includes(c._id);
                                        return (
                                            <button
                                                key={c._id}
                                                type="button"
                                                onClick={() =>
                                                    setFormData(prev => {
                                                        if (prev.subCategoryCategoryIds.includes(c._id)) {
                                                            // Unselecting a parent also drops its subcategories
                                                            const childIds = (c.children || []).map(child => child._id);
                                                            return {
                                                                ...prev,
                                                                subCategoryCategoryIds: prev.subCategoryCategoryIds.filter(id => id !== c._id),
                                                                subCategoryIds: prev.subCategoryIds.filter(id => !childIds.includes(id)),
                                                            };
                                                        }
                                                        return { ...prev, subCategoryCategoryIds: [...prev.subCategoryCategoryIds, c._id] };
                                                    })
                                                }
                                                className={cn(
                                                    "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                    isSelected
                                                        ? "border-primary bg-primary text-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                )}
                                            >
                                                {headerPrefix(c)}{c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Select subcategories ({formData.subCategoryIds.length} selected)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {subcategoryOptions.map(sub => {
                                        const isSelected = formData.subCategoryIds.includes(sub._id);
                                        return (
                                            <button
                                                key={sub._id}
                                                type="button"
                                                onClick={() =>
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategoryIds: isSelected
                                                            ? prev.subCategoryIds.filter(id => id !== sub._id)
                                                            : [...prev.subCategoryIds, sub._id],
                                                    }))
                                                }
                                                className={cn(
                                                    "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                    isSelected
                                                        ? "border-primary bg-primary text-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                )}
                                            >
                                                {headerPrefix(sub)}{sub.parentCategoryName} · {sub.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                {!subcategoryOptions.length && (
                                    <p className="text-[10px] text-slate-400">Choose a parent category to see its subcategories.</p>
                                )}
                                <p className="text-[10px] text-slate-400">
                                    Choose the number of rows and columns to display. Extra subcategories appear under &quot;See all&quot;.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Rows
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        step={1}
                                        value={formData.subCategoryRows ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, subCategoryRows: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Columns
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={8}
                                        step={1}
                                        value={formData.subCategoryColumns ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, subCategoryColumns: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {formData.displayType === 'products' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Rows
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        disabled={formData.singleRowScrollable}
                                        value={formData.productRows ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, productRows: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Columns (1-6)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={6}
                                        value={formData.productColumns ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, productColumns: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    id="singleRowScrollable"
                                    type="checkbox"
                                    checked={formData.singleRowScrollable}
                                    onChange={(e) => setFormData(prev => ({ ...prev, singleRowScrollable: e.target.checked }))}
                                />
                                <label htmlFor="singleRowScrollable" className="text-[11px] font-bold text-slate-600">
                                    Show products in a single horizontally scrollable row
                                </label>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Filter by categories / subcategories (optional)
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-wrap gap-2">
                                        {availableCategories.map(c => {
                                            const isSelected = formData.productCategoryIds.includes(c._id);
                                            return (
                                                <button
                                                    key={c._id}
                                                    type="button"
                                                    onClick={() =>
                                                        setFormData(prev => {
                                                            const alreadySelected = prev.productCategoryIds.includes(c._id);
                                                            let nextCategoryIds;
                                                            let nextSubCategoryIds = prev.productSubCategoryIds;

                                                            if (alreadySelected) {
                                                                nextCategoryIds = prev.productCategoryIds.filter(id => id !== c._id);
                                                                const childIds = (c.children || []).map(child => child._id);
                                                                nextSubCategoryIds = prev.productSubCategoryIds.filter(
                                                                    id => !childIds.includes(id)
                                                                );
                                                            } else {
                                                                nextCategoryIds = [...prev.productCategoryIds, c._id];
                                                            }

                                                            return {
                                                                ...prev,
                                                                productCategoryIds: nextCategoryIds,
                                                                productSubCategoryIds: nextSubCategoryIds,
                                                            };
                                                        })
                                                    }
                                                    className={cn(
                                                        "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                        isSelected
                                                            ? "border-primary bg-primary text-white"
                                                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                    )}
                                                >
                                                    {headerPrefix(c)}{c.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {productSubcategoryOptions
                                            .map(s => {
                                                const isSelected = formData.productSubCategoryIds.includes(s._id);
                                                return (
                                                    <button
                                                        key={s._id}
                                                        type="button"
                                                        onClick={() =>
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                productSubCategoryIds: isSelected
                                                                    ? prev.productSubCategoryIds.filter(id => id !== s._id)
                                                                    : [...prev.productSubCategoryIds, s._id],
                                                            }))
                                                        }
                                                        className={cn(
                                                            "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                            isSelected
                                                                ? "border-primary bg-primary text-white"
                                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                        )}
                                                    >
                                                        {headerPrefix(s)}{s.parentCategoryName} · {s.name}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Without picked products below, the section fills with in-stock products from these categories.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Pick specific products (optional)
                                </label>
                                <ProductMultiPicker
                                    value={formData.productIds}
                                    onChange={(ids) => setFormData(prev => ({ ...prev, productIds: ids }))}
                                />
                                <p className="text-[10px] text-slate-400">
                                    Picked products are shown in this order and take priority over the category filter.
                                </p>
                            </div>
                        </div>
                    )}
                    <Button className="w-full" onClick={handleSaveSection} disabled={isSaving}>
                        {isSaving ? 'Saving…' : editingItem ? 'Save Changes' : 'Publish Section'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default ContentManager;
