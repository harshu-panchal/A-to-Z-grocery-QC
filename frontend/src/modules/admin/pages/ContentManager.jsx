import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    HiOutlineXMark
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { adminApi } from '../services/adminApi';

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
    const [pageType, setPageType] = useState('header');
    const [selectedHeaderId, setSelectedHeaderId] = useState('');

    const [activeTab, setActiveTab] = useState('banners');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        displayType: 'banners',
        title: '',
        status: 'active',
        // banners
        bannerItems: [{ imageUrl: '', title: '', subtitle: '', linkType: 'none', linkValue: '', isUploading: false }],
        // categories
        maxCategories: 4,
        categoryIds: [],
        categoryRows: 1,
        // subcategories
        subCategoryCategoryIds: [],
        subCategoryIds: [],
        subCategoryRows: 1,
        // products
        productCategoryIds: [],
        productSubCategoryIds: [],
        productIds: [],
        productRows: 1,
        productColumns: 2,
        singleRowScrollable: false,
    });

    const bannerFileInputsRef = useRef([]);

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

    const availableCategories = useMemo(() => {
        if (pageType === 'home') {
            return headerCategories.flatMap((header) => header.children || []);
        }
        return selectedHeader?.children || [];
    }, [headerCategories, pageType, selectedHeader]);

    useEffect(() => {
        if (isHeaderCategoriesError) showToast('Failed to load header categories', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHeaderCategoriesError]);

    useEffect(() => {
        if (!selectedHeaderId && headerCategories.length) {
            setSelectedHeaderId(headerCategories[0]._id);
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
            bannerItems: [{ imageUrl: '', title: '', subtitle: '', linkType: 'none', linkValue: '', isUploading: false }],
            maxCategories: 4,
            categoryIds: [],
            categoryRows: 1,
            subCategoryCategoryIds: [],
            subCategoryIds: [],
            subCategoryRows: 1,
            productCategoryIds: [],
            productSubCategoryIds: [],
            productIds: [],
            productRows: 1,
            productColumns: 2,
            singleRowScrollable: false,
        });
        setActiveTab('banners');
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
            bannerItems: config.banners?.items?.length
                ? config.banners.items.map(b => ({ ...b, isUploading: false }))
                : [{ imageUrl: '', title: '', subtitle: '', linkType: 'none', linkValue: '', isUploading: false }],
            maxCategories: config.categories?.maxItems || 4,
            categoryIds: config.categories?.categoryIds || [],
            categoryRows: config.categories?.rows || 1,
            subCategoryCategoryIds: config.subcategories?.categoryIds || [],
            subCategoryIds: config.subcategories?.subcategoryIds || [],
            subCategoryRows: config.subcategories?.rows || 1,
            productCategoryIds: config.products?.categoryIds || [],
            productSubCategoryIds: config.products?.subcategoryIds || [],
            productIds: config.products?.productIds || [],
            productRows: config.products?.rows || 1,
            productColumns: config.products?.columns || 2,
            singleRowScrollable: !!config.products?.singleRowScrollable,
        };
        setFormData(next);
        setActiveTab(displayType);
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
            if ((formData.bannerItems || []).some(b => b.isUploading)) {
                showToast('Please wait for all banner images to finish uploading', 'warning');
                return;
            }
            const items = (formData.bannerItems || []).filter(b => b.imageUrl);
            if (!items.length) {
                showToast('Please add at least one banner image', 'warning');
                return;
            }
            config = {
                items: items.map(b => ({
                    imageUrl: b.imageUrl,
                    title: b.title,
                    subtitle: b.subtitle,
                    linkType: b.linkType || 'none',
                    linkValue: b.linkValue || '',
                    status: b.status || 'active',
                })),
            };
        } else if (displayType === 'categories') {
            if (!formData.categoryIds?.length) {
                showToast('Please select at least one category', 'warning');
                return;
            }
            config = {
                maxItems: Number(formData.maxCategories) || 1,
                categoryIds: formData.categoryIds,
                rows: Number(formData.categoryRows) || 1,
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
            };
        } else if (displayType === 'products') {
            config = {
                categoryIds: formData.productCategoryIds,
                subcategoryIds: formData.productSubCategoryIds,
                productIds: formData.productIds,
                rows: formData.singleRowScrollable ? 1 : (Number(formData.productRows) || 1),
                columns: Number(formData.productColumns) || 2,
                singleRowScrollable: !!formData.singleRowScrollable,
            };
        }

        const payload = {
            ...basePayload,
            config,
        };

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

    const updateBannerItem = (idx, changes) => {
        setFormData(prev => {
            const items = [...prev.bannerItems];
            items[idx] = { ...items[idx], ...changes };
            return { ...prev, bannerItems: items };
        });
    };

    const handleBannerFileChange = async (idx, file) => {
        if (!file) return;
        updateBannerItem(idx, { isUploading: true });
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await adminApi.uploadExperienceBanner(fd);
            const url = res.data?.result?.url || res.data?.url;
            if (!url) {
                throw new Error('Upload failed');
            }
            updateBannerItem(idx, { imageUrl: url, isUploading: false });
            showToast('Banner image uploaded', 'success');
        } catch (e) {
            console.error(e);
            updateBannerItem(idx, { isUploading: false });
            showToast('Failed to upload banner image', 'error');
        }
    };

    const addBannerItem = () => {
        setFormData(prev => ({
            ...prev,
            bannerItems: [
                ...prev.bannerItems,
                { imageUrl: '', title: '', subtitle: '', linkType: 'none', linkValue: '', isUploading: false },
            ],
        }));
    };

    const removeBannerItem = (idx) => {
        setFormData(prev => ({
            ...prev,
            bannerItems: prev.bannerItems.filter((_, i) => i !== idx),
        }));
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
                                                {section.displayType === 'categories' && `${section.config?.categories?.categoryIds?.length || 0} categories • ${section.config?.categories?.rows || 1} rows`}
                                                {section.displayType === 'subcategories' && `${section.config?.subcategories?.subcategoryIds?.length || 0} subcategories • ${section.config?.subcategories?.rows || 1} rows`}
                                                {section.displayType === 'products' && `${section.config?.products?.productIds?.length || 0} products • ${section.config?.products?.rows || 1}x${section.config?.products?.columns || 2}${section.config?.products?.singleRowScrollable ? ' • Single row scroll' : ''}`}
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
                                    setActiveTab(value);
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
                            placeholder="E.g. Grocery Essentials"
                        />
                    </div>

                    {/* Type-specific config */}
                    {formData.displayType === 'banners' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Banner Items
                                </span>
                                <button
                                    type="button"
                                    onClick={addBannerItem}
                                    className="flex items-center gap-1 text-[10px] font-bold text-primary"
                                >
                                    <HiOutlinePlus className="h-3 w-3" />
                                    Add banner
                                </button>
                            </div>
                            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                                {formData.bannerItems.map((item, idx) => (
                                    <Card key={idx} className="p-3">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                        {item.imageUrl ? (
                                                            <img
                                                                src={item.imageUrl}
                                                                alt={item.title || `Banner ${idx + 1}`}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <HiOutlinePhoto className="h-6 w-6 text-slate-300" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <input
                                                            ref={(el) => {
                                                                bannerFileInputsRef.current[idx] = el;
                                                            }}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={(e) =>
                                                                handleBannerFileChange(idx, e.target.files?.[0])
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                bannerFileInputsRef.current[idx]?.click()
                                                            }
                                                            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-800"
                                                        >
                                                            {item.imageUrl ? 'Change image' : 'Choose image file'}
                                                        </button>
                                                        <p className="text-[10px] text-slate-400">
                                                            {item.isUploading
                                                                ? 'Uploading...'
                                                                : item.imageUrl
                                                                ? 'Image uploaded'
                                                                : 'PNG, JPG up to 5MB'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <input
                                                    value={item.title || ''}
                                                    onChange={(e) => updateBannerItem(idx, { title: e.target.value })}
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Banner title (optional)"
                                                />
                                                <input
                                                    value={item.subtitle || ''}
                                                    onChange={(e) => updateBannerItem(idx, { subtitle: e.target.value })}
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Subtitle (optional)"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <select
                                                        value={item.linkType || 'none'}
                                                        onChange={(e) => updateBannerItem(idx, { linkType: e.target.value })}
                                                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none"
                                                    >
                                                        <option value="none">No link</option>
                                                        <option value="header">Header</option>
                                                        <option value="category">Category</option>
                                                        <option value="subcategory">Subcategory</option>
                                                        <option value="product">Product</option>
                                                        <option value="url">External URL</option>
                                                    </select>
                                                    <input
                                                        value={item.linkValue || ''}
                                                        onChange={(e) => updateBannerItem(idx, { linkValue: e.target.value })}
                                                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                        placeholder={item.linkType === 'url' ? "https://..." : "Slug / ID"}
                                                    />
                                                </div>
                                            </div>
                                            {formData.bannerItems.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeBannerItem(idx)}
                                                    className="rounded-lg p-2 text-slate-300 transition-all hover:bg-danger/10 hover:text-danger"
                                                >
                                                    <HiOutlineXMark className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {formData.displayType === 'categories' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Categories to show
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.maxCategories ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, maxCategories: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        Rows (4 columns on mobile)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.categoryRows ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, categoryRows: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Choose categories to show
                                </label>
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
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Pick the categories you want to show. One row displays 4 categories.
                                </p>
                            </div>
                        </div>
                    )}

                    {formData.displayType === 'subcategories' && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Parent categories
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedHeader?.children || []).map(c => {
                                        const isSelected = formData.subCategoryCategoryIds.includes(c._id);
                                        return (
                                            <button
                                                key={c._id}
                                                type="button"
                                                onClick={() =>
                                                    setFormData(prev => {
                                                        const alreadySelected = prev.subCategoryCategoryIds.includes(c._id);
                                                        let nextCategoryIds;
                                                        let nextSubCategoryIds = prev.subCategoryIds;

                                                        if (alreadySelected) {
                                                            nextCategoryIds = prev.subCategoryCategoryIds.filter(id => id !== c._id);
                                                            const childIds = (c.children || []).map(child => child._id);
                                                            nextSubCategoryIds = prev.subCategoryIds.filter(
                                                                id => !childIds.includes(id)
                                                            );
                                                        } else {
                                                            nextCategoryIds = [...prev.subCategoryCategoryIds, c._id];
                                                        }

                                                        return {
                                                            ...prev,
                                                            subCategoryCategoryIds: nextCategoryIds,
                                                            subCategoryIds: nextSubCategoryIds,
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
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Subcategories
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedHeader?.children || [])
                                        .filter(c => formData.subCategoryCategoryIds.includes(c._id))
                                        .flatMap(c => c.children || [])
                                        .map(s => {
                                        const isSelected = formData.subCategoryIds.includes(s._id);
                                        return (
                                            <button
                                                key={s._id}
                                                type="button"
                                                onClick={() =>
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subCategoryIds: isSelected
                                                            ? prev.subCategoryIds.filter(id => id !== s._id)
                                                            : [...prev.subCategoryIds, s._id],
                                                    }))
                                                }
                                                className={cn(
                                                    "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all",
                                                    isSelected
                                                        ? "border-primary bg-primary text-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                                                )}
                                            >
                                                {s.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Displayed in 4-column grids per row.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Rows
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formData.subCategoryRows ?? ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, subCategoryRows: e.target.value === '' ? '' : Number(e.target.value) }))}
                                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
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
                                        Columns
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
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
                                        {(selectedHeader?.children || []).map(c => {
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
                                                    {c.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedHeader?.children || [])
                                            .filter(c => formData.productCategoryIds.includes(c._id))
                                            .flatMap(c => c.children || [])
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
                                                        {s.name}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    You can later extend this to select specific products.
                                </p>
                            </div>
                        </div>
                    )}
                    <Button className="w-full" onClick={handleSaveSection}>
                        {editingItem ? 'Save Changes' : 'Publish Section'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default ContentManager;
