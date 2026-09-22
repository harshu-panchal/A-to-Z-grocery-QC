import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import Input from '@shared/components/ui/Input';
import Pagination from '@shared/components/ui/Pagination';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import FilterBar from '@shared/components/ui/FilterBar';
import DataTable from '@shared/components/ui/DataTable';
import { SkeletonStatCard, SkeletonCard } from '@shared/components/ui/Skeleton';
import {
    HiOutlineCube,
    HiOutlineExclamationTriangle,
    HiOutlineArchiveBoxXMark,
    HiOutlineArrowsUpDown,
    HiOutlinePlus,
    HiOutlineMinus,
    HiOutlineXMark,
    HiOutlineCalendarDays
} from 'react-icons/hi2';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { sellerApi } from '../services/sellerApi';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

async function fetchAllInventoryPages(stockStatus) {
    // Preserved exactly as before: this page needs the seller's *entire*
    // catalog to compute stats/search/low-stock filtering client-side, so
    // it internally paginates through the products endpoint (up to 50
    // pages of 100) and concatenates the results.
    const requestLimit = 100;
    const maxPages = 50;
    let requestedPage = 1;
    let totalPages = 1;
    const collected = [];

    while (requestedPage <= totalPages && requestedPage <= maxPages) {
        const params = { page: requestedPage, limit: requestLimit };
        if (stockStatus === 'in') params.stockStatus = 'in';
        if (stockStatus === 'out') params.stockStatus = 'out';

        const res = await sellerApi.getProducts(params);
        if (!res.data.success) break;

        // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
        const payload = res.data.result || {};
        const rawProducts = Array.isArray(payload.items)
            ? payload.items
            : (res.data.results || []);

        collected.push(...rawProducts);
        totalPages = Number(payload.totalPages || 1);

        if (!rawProducts.length || requestedPage >= totalPages) {
            break;
        }
        requestedPage += 1;
    }

    const safeProducts = Array.isArray(collected) ? collected : [];
    return safeProducts.map(p => ({
        ...p,
        id: p._id,
        threshold: p.lowStockAlert || 5,
        status:
            p.stock === 0
                ? 'Out of Stock'
                : (p.stock <= (p.lowStockAlert || 5) ? 'Low Stock' : 'In Stock')
    }));
}

const StockManagement = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [activeView] = useState('inventory'); // 'inventory' or 'history' — history view has no reachable toggle today, kept as-is
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustType, setAdjustType] = useState('Restock');
    const [adjustValue, setAdjustValue] = useState('');
    const [adjustNote, setAdjustNote] = useState('');

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const stockStatusParam = useMemo(() => {
        if (filterStatus === 'In Stock') return 'in';
        if (filterStatus === 'Out of Stock') return 'out';
        return undefined; // All / Low Stock -> no backend filter
    }, [filterStatus]);

    // Perf audit Phase 8: migrated to React Query. `fetchInventory(true)`'s
    // "silent" refresh (no loading flicker after a stock adjustment) is
    // preserved automatically — a query `refetch()` sets `isFetching`, not
    // `isLoading`, and this page's skeleton only ever gated on `isLoading`.
    const inventoryQueryKey = ['seller', 'stockInventory', stockStatusParam];
    const { data: inventory = [], isLoading, isError } = useQuery({
        queryKey: inventoryQueryKey,
        queryFn: () => fetchAllInventoryPages(stockStatusParam),
        enabled: activeView === 'inventory',
    });

    useEffect(() => {
        if (isError) toast.error("Failed to load inventory");
    }, [isError]);

    // `history` view has no reachable UI toggle (see comment above) — left
    // as page-local dead-code state exactly as it was, not worth migrating
    // an unreachable path.
    const [history] = useState([]);

    const stats = useMemo(() => [
        { label: 'Total Inventory', value: inventory.reduce((acc, item) => acc + item.stock, 0), icon: HiOutlineCube, color: 'text-primary', bg: 'bg-primary/10', status: 'All' },
        { label: 'Low Stock Items', value: inventory.filter(i => i.stock > 0 && i.stock <= i.threshold).length, icon: HiOutlineExclamationTriangle, color: 'text-warning', bg: 'bg-warning/10', status: 'Low Stock' },
        { label: 'Out of Stock', value: inventory.filter(i => i.stock === 0).length, icon: HiOutlineArchiveBoxXMark, color: 'text-danger', bg: 'bg-danger/10', status: 'Out of Stock' },
        { label: 'Stock Valuation', value: `₹${inventory.reduce((acc, item) => acc + (item.stock * item.mrp), 0).toLocaleString()}`, icon: HiOutlineArrowsUpDown, color: 'text-success', bg: 'bg-success/10', status: 'In Stock' }
    ], [inventory]);

    const filteredInventory = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return inventory.filter(item => {
            const matchesSearch =
                item.name.toLowerCase().includes(term) ||
                (item.sku || '').toString().toLowerCase().includes(term);
            const matchesStatus = filterStatus === 'All' || item.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [inventory, searchTerm, filterStatus]);

    const handleFullAdjustment = async () => {
        const value = parseInt(adjustValue);
        if (isNaN(value) || value <= 0) {
            toast.error("Please enter a valid quantity");
            return;
        }

        try {
            const res = await sellerApi.adjustStock({
                productId: selectedItem.id,
                type: adjustType === 'Restock' ? 'Restock' : 'Correction',
                quantity: adjustType === 'Restock' ? value : -value,
                note: adjustNote
            });

            if (res.data.success) {
                toast.success("Stock adjusted successfully");
                setIsAdjustModalOpen(false);
                // Perf audit Phase 8: refreshes whichever stock-status
                // filter the seller currently has selected (the original
                // single-array implementation always re-fetched the full
                // unfiltered catalog here and relied on client-side
                // re-filtering to show the right subset either way — since
                // this migration caches each filter value separately,
                // invalidating all of them keeps every cached view correct
                // without leaving a differently-filtered tab stale).
                queryClient.invalidateQueries({ queryKey: ['seller', 'stockInventory'] });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to adjust stock");
        }
    };

    const openAdjustModal = (item) => {
        setSelectedItem(item);
        setAdjustValue('');
        setAdjustNote('');
        setIsAdjustModalOpen(true);
    };

    const pagedInventory = filteredInventory.slice((page - 1) * pageSize, page * pageSize);

    const stockColumns = [
        {
            header: 'Product Information',
            key: 'product',
            cell: (item) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
                        {item.mainImage ? (
                            <img src={item.mainImage} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                            <HiOutlineCube className="h-5 w-5" />
                        )}
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">SKU: {item.sku || 'N/A'}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Inventory',
            key: 'stock',
            cell: (item) => (
                <div className="flex flex-col">
                    <span className={cn("text-sm font-bold", item.stock <= item.threshold ? "text-danger" : "text-slate-900")}>
                        {item.stock} units
                    </span>
                    {item.stock <= item.threshold && (
                        <Badge variant="danger" className="mt-1 w-fit">Low Stock</Badge>
                    )}
                </div>
            ),
        },
        {
            header: 'Stock Health',
            key: 'status',
            cell: (item) => <Badge variant={item.status === 'In Stock' ? 'success' : 'danger'}>{item.status}</Badge>,
        },
        {
            header: 'Price',
            key: 'mrp',
            cell: (item) => <span className="text-sm font-bold text-slate-900">₹{item.mrp}</span>,
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            cell: (item) => (
                <button
                    onClick={() => openAdjustModal(item)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200"
                >
                    Adjust Stock
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        Stock Management
                        <Badge variant="warning">Inventory Control</Badge>
                    </span>
                }
                description="Monitor stock levels, manage restocks, and track every inventory movement across your store."
            />

            {activeView === 'inventory' ? (
                <>
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {isLoading && inventory.length === 0
                            ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
                            : stats.map((stat, i) => (
                                <StatCard
                                    key={i}
                                    label={stat.label}
                                    value={stat.value}
                                    icon={stat.icon}
                                    color={stat.color}
                                    bg={stat.bg}
                                    onClick={() => setFilterStatus(stat.status)}
                                />
                            ))}
                    </div>

                    <FilterBar
                        left={
                            <Input
                                placeholder="Search by product name or SKU..."
                                className="w-full sm:w-72"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        }
                        right={
                            <Button onClick={() => navigate('/seller/products/add')}>
                                <HiOutlinePlus className="h-4 w-4" />
                                Add New Product
                            </Button>
                        }
                        pills={['All', 'In Stock', 'Out of Stock'].map((status) => ({
                            label: status,
                            active: filterStatus === status,
                            onClick: () => { setFilterStatus(status); setPage(1); },
                        }))}
                    />

                    {isLoading && inventory.length === 0 ? (
                        <SkeletonCard lines={6} />
                    ) : (
                        <DataTable
                            columns={stockColumns}
                            data={pagedInventory}
                            rowKey={(item) => item.id}
                            emptyState={
                                <div className="py-10 text-center text-sm text-slate-400">No products found for this filter.</div>
                            }
                        />
                    )}

                    <Pagination
                        page={page}
                        totalPages={Math.ceil(filteredInventory.length / pageSize) || 1}
                        total={filteredInventory.length}
                        pageSize={pageSize}
                        onPageChange={(p) => setPage(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={isLoading}
                    />
                </>
            ) : (
                /* History View */
                <Card title="Inventory Movement Log" subtitle="Audit trail for all stock adjustments and sales." contentClassName="p-0">
                    <div className="divide-y divide-slate-100">
                        {history.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-400">No history found.</div>
                        ) : history.map((log) => (
                            <div key={log._id} className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-xl",
                                        log.type === 'Restock' ? "bg-primary/10 text-primary" :
                                            log.type === 'Sale' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                                    )}>
                                        {log.type === 'Restock' ? <HiOutlinePlus className="h-5 w-5" /> :
                                            log.type === 'Sale' ? <HiOutlineCube className="h-5 w-5" /> : <HiOutlineMinus className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-slate-900">{log.product?.name || 'Unknown Product'}</h4>
                                            <Badge variant={log.type === 'Restock' ? 'primary' : log.type === 'Sale' ? 'success' : 'danger'}>
                                                {log.type}
                                            </Badge>
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-500">Note: {log.note || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={cn("mb-0.5 text-base font-black tracking-tight", log.quantity > 0 ? "text-success" : "text-danger")}>
                                        {log.quantity > 0 ? `+${log.quantity}` : log.quantity}
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold text-slate-400">
                                        <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                        {new Date(log.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} • {new Date(log.createdAt).toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Advanced Adjustment Modal */}
            <AnimatePresence>
                {isAdjustModalOpen && selectedItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setIsAdjustModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="w-full max-w-md relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                                        <HiOutlineArrowsUpDown className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">Adjust Inventory</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Update product stock</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsAdjustModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                                    <HiOutlineXMark className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 overflow-hidden">
                                        {selectedItem.mainImage ? (
                                            <img src={selectedItem.mainImage} alt="" className="h-full w-full object-cover" />
                                        ) : <HiOutlineCube className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900">{selectedItem.name}</h4>
                                        <p className="text-xs font-medium text-slate-500">Current stock: <span className="font-bold text-slate-900">{selectedItem.stock} units</span></p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                                        {['Restock', 'Remove'].map((type) => (
                                            <button
                                                key={type}
                                                onClick={() => setAdjustType(type)}
                                                className={cn(
                                                    "flex-1 rounded-md py-2 text-xs font-bold uppercase tracking-wide transition-all",
                                                    adjustType === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                                )}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-700 ml-0.5">Quantity Change</label>
                                        <div className="relative">
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">#</div>
                                            <input
                                                type="number"
                                                value={adjustValue}
                                                onChange={(e) => setAdjustValue(e.target.value)}
                                                className="w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-xl font-black text-slate-900 outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-700 ml-0.5">Internal Note (Optional)</label>
                                        <textarea
                                            value={adjustNote}
                                            onChange={(e) => setAdjustNote(e.target.value)}
                                            className="h-20 w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                                            placeholder="Reason for adjustment..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <Button onClick={() => setIsAdjustModalOpen(false)} variant="outline" className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={handleFullAdjustment} className="flex-1">
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StockManagement;
