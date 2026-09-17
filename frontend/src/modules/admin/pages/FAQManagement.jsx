// Ultimate FAQ Management System - Functional Version
import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Button from '@shared/components/ui/Button';
import Modal from '@shared/components/ui/Modal';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import {
    HelpCircle,
    Plus,
    Search,
    Edit3,
    Trash2,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    MessageSquare,
    Layers,
    TrendingUp,
    ArrowUpRight,
    GripVertical,
    Save,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const FAQ_QUERY_KEY = ['admin', 'faqs'];

const FAQManagement = () => {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [expandedId, setExpandedId] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [sortBy, setSortBy] = useState('Most Viewed');
    const [editingFaqId, setEditingFaqId] = useState(null);

    // Form States
    const [newFaq, setNewFaq] = useState({
        question: '',
        answer: '',
        category: 'Customer',
        status: 'published'
    });

    const [newCategoryName, setNewCategoryName] = useState('');

    // Categories State
    const [categories, setCategories] = useState([
        { id: 1, name: 'Customer', color: 'sky' },
        { id: 2, name: 'Seller', color: 'indigo' },
        { id: 3, name: 'Delivery', color: 'amber' },
        { id: 4, name: 'Orders', color: 'emerald' },
    ]);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

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
    }, [activeCategory, pageSize]);

    const queryParams = useMemo(() => ({
        page,
        limit: pageSize,
        search: debouncedSearchTerm || undefined,
        category: activeCategory !== 'All' ? activeCategory : undefined,
    }), [page, pageSize, debouncedSearchTerm, activeCategory]);

    const { data: queryData, isFetching, isError } = useQuery({
        queryKey: [...FAQ_QUERY_KEY, queryParams],
        queryFn: async () => {
            const response = await adminApi.getFAQs(queryParams);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
            return {
                items: data,
                total: typeof payload.total === 'number' ? payload.total : data.length,
                page: typeof payload.page === 'number' ? payload.page : queryParams.page,
            };
        },
        placeholderData: keepPreviousData,
    });

    useEffect(() => {
        if (isError) showToast('Failed to fetch FAQs', 'error');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isError]);

    const faqs = queryData?.items ?? [];
    const total = queryData?.total ?? 0;
    const invalidateFaqs = () => queryClient.invalidateQueries({ queryKey: FAQ_QUERY_KEY });

    // Computed Categories with Counts
    const categoriesWithCounts = useMemo(() => {
        return categories.map(cat => ({
            ...cat,
            count: faqs.filter(f => f.category === cat.name).length
        }));
    }, [categories, faqs]);

    // Core Filtering and Sorting Logic
    const filteredAndSortedFaqs = useMemo(() => {
        let result = [...faqs];

        // Sorting Logic
        switch (sortBy) {
            case 'Most Viewed':
                result.sort((a, b) => b.views - a.views);
                break;
            case 'Newest First':
                result.sort((a, b) => b.createdAt - a.createdAt);
                break;
            case 'Alphabetical':
                result.sort((a, b) => a.question.localeCompare(b.question));
                break;
            default:
                break;
        }

        return result;
    }, [faqs, searchTerm, activeCategory, sortBy]);

    // Actions
    const handleSaveFaq = async (e) => {
        e.preventDefault();

        try {
            if (editingFaqId) {
                await adminApi.updateFAQ(editingFaqId, newFaq);
                showToast(`FAQ updated successfully`, 'success');
            } else {
                await adminApi.createFAQ(newFaq);
                showToast(`FAQ created successfully`, 'success');
            }
            invalidateFaqs();
            setIsAddModalOpen(false);
            setEditingFaqId(null);
            setNewFaq({ question: '', answer: '', category: 'Customer', status: 'published' });
        } catch (error) {
            showToast('Failed to save FAQ', 'error');
        }
    };

    const handleEditClick = (faq) => {
        setNewFaq({
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            status: faq.status
        });
        setEditingFaqId(faq._id);
        setIsAddModalOpen(true);
    };

    const handleDeleteFaq = async (id) => {
        try {
            await adminApi.deleteFAQ(id);
            invalidateFaqs();
            showToast('FAQ deleted successfully', 'warning');
        } catch (error) {
            showToast('Failed to delete FAQ', 'error');
        }
    };

    const handleToggleStatus = async (faq) => {
        try {
            const newStatus = faq.status === 'published' ? 'draft' : 'published';
            await adminApi.updateFAQ(faq._id, { status: newStatus });
            invalidateFaqs();
            showToast('Visibility state updated', 'info');
        } catch (error) {
            showToast('Failed to update status', 'error');
        }
    };

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const colors = ['sky', 'emerald', 'amber', 'rose', 'indigo', 'pink', 'violet'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        setCategories([...categories, { id: Date.now(), name: newCategoryName, color: randomColor }]);
        setNewCategoryName('');
        showToast('New taxonomy node generated', 'success');
    };

    const handleDeleteCategory = (name) => {
        setCategories(categories.filter(c => c.name !== name));
        showToast('Category node removed', 'warning');
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        FAQ Management
                        <div className="rounded-lg bg-primary/10 p-1.5">
                            <HelpCircle className="h-4 w-4 text-primary" />
                        </div>
                    </span>
                }
                description="Manage categories and help customers with common questions."
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)}>
                            <Layers className="h-4 w-4" />
                            Categories
                        </Button>
                        <Button onClick={() => setIsAddModalOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add FAQ
                        </Button>
                    </>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total FAQs" value={faqs.length} icon={MessageSquare} color="text-primary" bg="bg-primary/10" />
                <StatCard label="Total Views" value={faqs.reduce((acc, f) => acc + f.views, 0).toLocaleString()} icon={TrendingUp} color="text-info" bg="bg-info/10" />
                <StatCard label="Published" value={faqs.filter(f => f.status === 'published').length} icon={CheckCircle2} color="text-success" bg="bg-success/10" />
                <StatCard label="Drafts" value={faqs.filter(f => f.status === 'draft').length} icon={Edit3} color="text-warning" bg="bg-warning/10" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                {/* Left Sidebar: Categories */}
                <div className="space-y-4 lg:col-span-1">
                    <Card className="p-4">
                        <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">FAQ Categories</h4>
                        <div className="space-y-1.5">
                            <button
                                onClick={() => setActiveCategory('All')}
                                className={cn(
                                    "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all",
                                    activeCategory === 'All' ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                <span className="flex items-center gap-2.5">
                                    <Layers className="h-4 w-4 opacity-70" />
                                    All Topics
                                </span>
                                <span className="text-[10px] font-black opacity-60">{faqs.length}</span>
                            </button>
                            {categoriesWithCounts.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.name)}
                                    className={cn(
                                        "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all",
                                        activeCategory === cat.name ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <div className={cn("h-1.5 w-1.5 rounded-full", activeCategory === cat.name ? "bg-white" : `bg-${cat.color}-500`)} />
                                        {cat.name}
                                    </span>
                                    <span className="text-[10px] font-black opacity-60">{cat.count}</span>
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Main Content: FAQ List */}
                <div className="space-y-4 lg:col-span-3">
                    {/* Filter & Search Bar */}
                    <Card className="flex flex-col items-center gap-3 p-3.5 md:flex-row">
                        <div className="relative w-full flex-1">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search questions or answers..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-xs font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sort:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
                            >
                                <option>Most Viewed</option>
                                <option>Newest First</option>
                                <option>Alphabetical</option>
                            </select>
                        </div>
                    </Card>

                    {/* FAQ Grid/List */}
                    <div className="space-y-3">
                        <AnimatePresence mode='popLayout'>
                            {filteredAndSortedFaqs.map((faq) => (
                                <motion.div
                                    key={faq.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <Card className="p-0">
                                        <div className="p-5">
                                            <div className="flex items-start gap-3">
                                                <div className="rounded-lg bg-slate-50 p-2.5 text-slate-300">
                                                    <GripVertical className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="mb-2 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline">{faq.id}</Badge>
                                                            <Badge variant={faq.status === 'published' ? 'success' : 'secondary'}>{faq.status}</Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <div className="mr-3 flex items-center gap-1.5">
                                                                <Eye className="h-3.5 w-3.5 text-slate-300" />
                                                                <span className="text-[10px] font-bold text-slate-400">{faq.views.toLocaleString()}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleToggleStatus(faq)}
                                                                title={faq.status === 'published' ? 'Set as Draft' : 'Publish Now'}
                                                                className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                                                            >
                                                                {faq.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditClick(faq)}
                                                                className="rounded-lg p-2 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary"
                                                            >
                                                                <Edit3 className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteFaq(faq._id)}
                                                                className="rounded-lg p-2 text-slate-400 transition-all hover:bg-danger/10 hover:text-danger"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div
                                                        onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                                                        className="group cursor-pointer"
                                                    >
                                                        <h3 className="flex items-center justify-between text-sm font-black text-slate-900 transition-colors group-hover:text-primary">
                                                            {faq.question}
                                                            {expandedId === faq.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                                        </h3>
                                                    </div>
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {expandedId === faq.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="ml-12 mt-4 border-t border-slate-100 pt-4">
                                                            <div className="rounded-xl bg-slate-50 p-4">
                                                                <p className="text-sm font-medium italic leading-relaxed text-slate-600">
                                                                    "{faq.answer}"
                                                                </p>
                                                            </div>
                                                            <div className="mt-3 flex items-center justify-between">
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                                                    <ArrowUpRight className="h-3 w-3" />
                                                                    Category: <span className="text-slate-500">{faq.category}</span>
                                                                </span>
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                                                    Updated: {faq.lastUpdated}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            <div className="flex justify-center">
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
            </div>

            {/* Modals */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditingFaqId(null);
                    setNewFaq({ question: '', answer: '', category: 'Customer', status: 'published' });
                }}
                title={editingFaqId ? `Edit Question: ${editingFaqId}` : "Create New FAQ"}
                size="lg"
            >
                <form onSubmit={handleSaveFaq} className="space-y-5">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Category</label>
                            <select
                                value={newFaq.category}
                                onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Visibility State</label>
                            <div className="flex rounded-lg bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setNewFaq({ ...newFaq, status: 'published' })}
                                    className={cn("flex-1 rounded-md py-2 text-[10px] font-bold uppercase tracking-widest transition-all", newFaq.status === 'published' ? "bg-white text-primary shadow-sm" : "text-slate-400")}
                                >Published</button>
                                <button
                                    type="button"
                                    onClick={() => setNewFaq({ ...newFaq, status: 'draft' })}
                                    className={cn("flex-1 rounded-md py-2 text-[10px] font-bold uppercase tracking-widest transition-all", newFaq.status === 'draft' ? "bg-white text-primary shadow-sm" : "text-slate-400")}
                                >Draft</button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Question</label>
                        <input
                            type="text"
                            required
                            value={newFaq.question}
                            onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                            placeholder="Enter the question..."
                            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Answer</label>
                        <textarea
                            rows={4}
                            required
                            value={newFaq.answer}
                            onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                            placeholder="Type the answer here..."
                            className="w-full resize-none rounded-md border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                        <Button type="submit" className="flex-[2]">
                            <Save className="h-4 w-4" /> Save FAQ
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                title="Manage Categories"
            >
                <div className="space-y-5">
                    <div className="space-y-2">
                        {categories.map((cat) => (
                            <div key={cat.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <div className="flex items-center gap-3">
                                    <div className={cn("h-3.5 w-3.5 rounded-full", `bg-${cat.color}-500`)} />
                                    <span className="text-sm font-bold text-slate-900">{cat.name}</span>
                                </div>
                                <button onClick={() => handleDeleteCategory(cat.name)} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white hover:text-danger">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="relative">
                        <Plus className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                            placeholder="New Category Label..."
                            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-[10px] font-bold uppercase tracking-widest outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <Button className="w-full" onClick={handleAddCategory}>Generate New Category</Button>
                </div>
            </Modal>
        </div>
    );
};

export default FAQManagement;
