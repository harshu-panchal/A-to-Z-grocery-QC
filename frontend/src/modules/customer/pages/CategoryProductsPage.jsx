import React, { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Search, ArrowUpDown, SlidersHorizontal, PackageSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { useSettings } from '@core/context/SettingsContext';
import Lottie from 'lottie-react';
import BottomSheet from '../components/shared/BottomSheet';
import { ProductGridSkeleton } from '../components/shared/ProductCardSkeleton';
import EmptyState from '@shared/components/ui/EmptyState';

const SORT_OPTIONS = [
    { id: 'relevance', label: 'Relevance' },
    { id: 'price-asc', label: 'Price: low to high' },
    { id: 'price-desc', label: 'Price: high to low' },
    { id: 'discount', label: 'Biggest discount' },
    { id: 'name', label: 'Name (A–Z)' },
];

const EMPTY_FILTERS = { minPrice: '', maxPrice: '', brands: [], discountOnly: false, inStockOnly: false };

const CategoryProductsPage = () => {
    const { categoryName: catId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentLocation } = useAppLocation();
    const { settings } = useSettings();
    const initialSubcategoryId = location.state?.activeSubcategoryId || 'all';
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const [selectedSubCategory, setSelectedSubCategory] = useState(initialSubcategoryId);
    const [noServiceData, setNoServiceData] = useState(null);

    // Dynamically load no-service Lottie on mount
    useEffect(() => {
        import('@/assets/lottie/animation.json')
            .then((m) => setNoServiceData(m.default))
            .catch(() => {});
    }, []);

    const DEFAULT_SUBCATEGORIES = [{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png' }];
    const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

    // The URL id may be a header, a category or a subcategory. Resolve it
    // against the category tree so each tile opens the level it belongs to.
    const { data: categoryTree } = useQuery({
        queryKey: ['customer', 'categoryTree'],
        queryFn: async () => {
            const catRes = await customerApi.getCategories({ tree: true });
            return catRes.data.success ? (catRes.data.results || catRes.data.result || []) : [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const resolved = React.useMemo(() => {
        const tree = Array.isArray(categoryTree) ? categoryTree : [];
        const toTab = (c) => ({
            id: c._id,
            name: c.name,
            icon: c.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321801.png',
        });
        for (const header of tree) {
            if (header._id === catId) {
                // Header: sidebar lists its categories, products filtered by headerId
                return { category: header, filterKey: 'headerId', tabKey: 'categoryId', tabs: (header.children || []).map(toTab) };
            }
            for (const cat of header.children || []) {
                if (cat._id === catId) {
                    return { category: cat, filterKey: 'categoryId', tabKey: 'subcategoryId', tabs: (cat.children || []).map(toTab) };
                }
                const sub = (cat.children || []).find((s) => s._id === catId);
                if (sub) {
                    // Subcategory: open its parent category with this subcategory pre-selected
                    return { category: cat, filterKey: 'categoryId', tabKey: 'subcategoryId', tabs: (cat.children || []).map(toTab), filterId: cat._id, preselect: sub._id };
                }
            }
        }
        return { category: null, filterKey: 'categoryId', tabKey: 'subcategoryId', tabs: [] };
    }, [categoryTree, catId]);

    // Products are filtered on the server (category + selected tab) so large
    // categories are not truncated to the first page before tab filtering.
    const filterId = resolved.filterId || catId;
    const { data: categoryData, isLoading, refetch } = useQuery({
        queryKey: ['customer', 'categoryProducts', resolved.filterKey, filterId, resolved.tabKey, selectedSubCategory, hasValidLocation ? currentLocation.latitude : null, hasValidLocation ? currentLocation.longitude : null],
        enabled: categoryTree !== undefined,
        queryFn: async () => {
            const params = {
                [resolved.filterKey]: filterId,
                limit: 100,
                lat: currentLocation?.latitude,
                lng: currentLocation?.longitude,
            };
            if (selectedSubCategory !== 'all') params[resolved.tabKey] = selectedSubCategory;
            const prodRes = hasValidLocation
                ? await customerApi.getProducts(params)
                : { data: { success: true, result: { items: [] } } };

            let products = [];
            if (prodRes.data.success) {
                const rawResult = prodRes.data.result;
                const dbProds = Array.isArray(prodRes.data.results)
                    ? prodRes.data.results
                    : Array.isArray(rawResult?.items)
                    ? rawResult.items
                    : Array.isArray(rawResult)
                    ? rawResult
                    : [];

                products = dbProds.map(p => ({
                    ...p,
                    id: p._id,
                    image:
                      p.mainImage ||
                      p.image ||
                      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                    price: p.sellingPrice || p.mrp,
                    originalPrice: p.mrp,
                    weight: p.weight || "1 unit",
                    deliveryTime: "8-15 mins"
                }));
            }

            // Backend replies with this message when no seller serves the location
            const noSellersNearby = /in your area/i.test(prodRes.data.message || '');
            return { products, noSellersNearby };
        },
        placeholderData: keepPreviousData,
    });

    const category = resolved.category;
    const subCategories = [...DEFAULT_SUBCATEGORIES, ...resolved.tabs];
    const products = categoryData?.products ?? [];
    const serviceUnavailable = !hasValidLocation || Boolean(categoryData?.noSellersNearby);
    const fetchData = refetch;

    useEffect(() => {
        // A subcategory id in the URL opens its parent with that tab selected
        setSelectedSubCategory(location.state?.activeSubcategoryId || resolved.preselect || 'all');
    }, [catId, location.state?.activeSubcategoryId, resolved.preselect]);

    const safeProducts = React.useMemo(() => (Array.isArray(products) ? products : []), [products]);

    // Sort & filter run on the loaded products (server already filters by category/tab)
    const [sortBy, setSortBy] = useState('relevance');
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
    const [sheet, setSheet] = useState(null); // 'sort' | 'filter' | null

    useEffect(() => {
        setFilters(EMPTY_FILTERS);
        setSortBy('relevance');
    }, [catId]);

    const brands = React.useMemo(
        () => [...new Set(safeProducts.map((p) => String(p.brand || '').trim()).filter(Boolean))].sort(),
        [safeProducts]
    );

    const filteredProducts = React.useMemo(() => {
        const priceOf = (p) => Number(p.price || 0);
        const discountOf = (p) => (p.originalPrice > p.price ? (p.originalPrice - p.price) / p.originalPrice : 0);
        let list = safeProducts.filter((p) => {
            const price = priceOf(p);
            if (filters.minPrice !== '' && price < Number(filters.minPrice)) return false;
            if (filters.maxPrice !== '' && price > Number(filters.maxPrice)) return false;
            if (filters.brands.length && !filters.brands.includes(String(p.brand || '').trim())) return false;
            if (filters.discountOnly && discountOf(p) <= 0) return false;
            if (filters.inStockOnly && Number(p.stock ?? 1) <= 0) return false;
            return true;
        });
        if (sortBy === 'price-asc') list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
        if (sortBy === 'price-desc') list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
        if (sortBy === 'discount') list = [...list].sort((a, b) => discountOf(b) - discountOf(a));
        if (sortBy === 'name') list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return list;
    }, [safeProducts, filters, sortBy]);

    const activeFilterCount =
        (filters.minPrice !== '' || filters.maxPrice !== '' ? 1 : 0) +
        filters.brands.length + (filters.discountOnly ? 1 : 0) + (filters.inStockOnly ? 1 : 0);

    const openFilters = () => { setDraftFilters(filters); setSheet('filter'); };
    const toggleDraftBrand = (brand) => setDraftFilters((f) => ({
        ...f,
        brands: f.brands.includes(brand) ? f.brands.filter((b) => b !== brand) : [...f.brands, brand],
    }));

    const title = category?.name || (catId === 'all' ? 'All Products' : 'Category');

    return (
        <div className="relative flex min-h-screen flex-col bg-slate-50 font-sans">
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-50 border-b border-slate-200 bg-white",
                isProductDetailOpen && "hidden md:block"
            )}>
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 md:px-6">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        aria-label="Go back"
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
                    >
                        <ChevronLeft size={22} className="text-slate-900" />
                    </button>
                    <h1 className="flex-1 truncate text-base font-bold text-slate-900 md:text-lg">{title}</h1>
                    <button
                        type="button"
                        onClick={() => navigate('/search')}
                        aria-label="Search products"
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
                    >
                        <Search size={20} className="text-slate-700" />
                    </button>
                </div>
            </header>

            {(serviceUnavailable && !isLoading) ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
                    <div className="mb-4 h-48 w-48">
                        {noServiceData && <Lottie animationData={noServiceData} loop={true} />}
                    </div>
                    <h2 className="mb-2 text-xl font-bold text-slate-900">We&apos;re not in your area yet</h2>
                    <p className="mb-6 max-w-[300px] text-sm text-slate-500">
                        {settings?.appName || 'Our service'} doesn&apos;t deliver to this location yet. Try another address or check back soon.
                    </p>
                    <button
                        type="button"
                        onClick={fetchData}
                        className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground active:scale-95"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <div className="mx-auto flex w-full max-w-7xl flex-1 items-start">
                    {/* Subcategory sidebar */}
                    {subCategories.length > 1 && (
                        <aside
                            aria-label="Subcategories"
                            className="hide-scrollbar sticky top-14 h-[calc(100vh-56px)] w-[76px] flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white pb-32 md:w-[200px]"
                        >
                            {subCategories.map((cat) => {
                                const active = selectedSubCategory === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setSelectedSubCategory(cat.id)}
                                        aria-pressed={active}
                                        className={cn(
                                            "relative flex w-full flex-col items-center gap-1.5 px-1 py-3 transition-colors md:flex-row md:gap-3 md:px-3",
                                            active ? "bg-primary/5" : "hover:bg-slate-50"
                                        )}
                                    >
                                        {active && <span className="absolute bottom-2 right-0 top-2 w-1 rounded-l-full bg-primary" aria-hidden="true" />}
                                        <span className={cn(
                                            "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl p-1.5",
                                            active ? "bg-white shadow-sm" : "bg-slate-50"
                                        )}>
                                            <img src={applyCloudinaryTransform(cat.icon)} alt="" loading="lazy" className="h-full w-full object-contain" />
                                        </span>
                                        <span className={cn(
                                            "text-center text-[11px] leading-tight md:text-left md:text-sm",
                                            active ? "font-semibold text-primary" : "font-medium text-slate-600"
                                        )}>
                                            {cat.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </aside>
                    )}

                    <main className="min-w-0 flex-1 pb-28">
                        {/* Sort / filter bar */}
                        <div className="sticky top-14 z-40 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:px-5">
                            <button
                                type="button"
                                onClick={() => setSheet('sort')}
                                className={cn(
                                    "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                                    sortBy !== 'relevance' ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-700"
                                )}
                            >
                                <ArrowUpDown size={15} /> Sort
                            </button>
                            <button
                                type="button"
                                onClick={openFilters}
                                className={cn(
                                    "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                                    activeFilterCount ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-700"
                                )}
                            >
                                <SlidersHorizontal size={15} /> Filter
                                {activeFilterCount > 0 && (
                                    <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                            {!isLoading && (
                                <span className="ml-auto text-xs text-slate-500">{filteredProducts.length} items</span>
                            )}
                        </div>

                        <div className="p-2 md:p-5">
                            {isLoading && !categoryData ? (
                                <ProductGridSkeleton count={6} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5" />
                            ) : filteredProducts.length === 0 ? (
                                <EmptyState
                                    icon={<PackageSearch className="h-6 w-6" />}
                                    title={safeProducts.length ? "No products match these filters" : "No products here yet"}
                                    description={safeProducts.length ? "Try removing a filter or changing the price range." : "Check back soon or explore another category."}
                                    action={safeProducts.length ? (
                                        <button
                                            type="button"
                                            onClick={() => setFilters(EMPTY_FILTERS)}
                                            className="h-10 rounded-lg border border-primary px-4 text-sm font-semibold text-primary"
                                        >
                                            Clear filters
                                        </button>
                                    ) : null}
                                />
                            ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                                    {filteredProducts.map((product) => (
                                        <ProductCard key={product.id} product={product} compact={true} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            )}

            {/* Sort sheet */}
            <BottomSheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
                <div role="radiogroup" aria-label="Sort by" className="flex flex-col">
                    {SORT_OPTIONS.map((opt) => (
                        <label key={opt.id} className="flex min-h-12 cursor-pointer items-center justify-between border-b border-slate-100 py-2 text-sm text-slate-800 last:border-0">
                            {opt.label}
                            <input
                                type="radio"
                                name="sort"
                                checked={sortBy === opt.id}
                                onChange={() => { setSortBy(opt.id); setSheet(null); }}
                                className="h-5 w-5 accent-[var(--primary)]"
                            />
                        </label>
                    ))}
                </div>
            </BottomSheet>

            {/* Filter sheet */}
            <BottomSheet
                open={sheet === 'filter'}
                onClose={() => setSheet(null)}
                title="Filters"
                footer={(
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setDraftFilters(EMPTY_FILTERS)}
                            className="h-11 flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
                        >
                            Clear all
                        </button>
                        <button
                            type="button"
                            onClick={() => { setFilters(draftFilters); setSheet(null); }}
                            className="h-11 flex-[2] rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                        >
                            Apply
                        </button>
                    </div>
                )}
            >
                <div className="space-y-6 pb-2">
                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-slate-900">Price (₹)</legend>
                        <div className="flex items-center gap-3">
                            <label className="flex-1">
                                <span className="sr-only">Minimum price</span>
                                <input
                                    type="number" inputMode="numeric" min="0" placeholder="Min"
                                    value={draftFilters.minPrice}
                                    onChange={(e) => setDraftFilters((f) => ({ ...f, minPrice: e.target.value }))}
                                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-primary focus:outline-none"
                                />
                            </label>
                            <span className="text-slate-400">–</span>
                            <label className="flex-1">
                                <span className="sr-only">Maximum price</span>
                                <input
                                    type="number" inputMode="numeric" min="0" placeholder="Max"
                                    value={draftFilters.maxPrice}
                                    onChange={(e) => setDraftFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-primary focus:outline-none"
                                />
                            </label>
                        </div>
                    </fieldset>

                    <fieldset className="space-y-1">
                        <legend className="mb-2 text-sm font-semibold text-slate-900">Availability &amp; offers</legend>
                        <label className="flex min-h-11 cursor-pointer items-center justify-between text-sm text-slate-700">
                            In stock only
                            <input type="checkbox" checked={draftFilters.inStockOnly}
                                onChange={(e) => setDraftFilters((f) => ({ ...f, inStockOnly: e.target.checked }))}
                                className="h-5 w-5 accent-[var(--primary)]" />
                        </label>
                        <label className="flex min-h-11 cursor-pointer items-center justify-between text-sm text-slate-700">
                            On discount
                            <input type="checkbox" checked={draftFilters.discountOnly}
                                onChange={(e) => setDraftFilters((f) => ({ ...f, discountOnly: e.target.checked }))}
                                className="h-5 w-5 accent-[var(--primary)]" />
                        </label>
                    </fieldset>

                    {brands.length > 0 && (
                        <fieldset>
                            <legend className="mb-2 text-sm font-semibold text-slate-900">Brand</legend>
                            <div className="flex flex-wrap gap-2">
                                {brands.map((brand) => {
                                    const on = draftFilters.brands.includes(brand);
                                    return (
                                        <button
                                            key={brand}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => toggleDraftBrand(brand)}
                                            className={cn(
                                                "h-9 rounded-full border px-3.5 text-sm",
                                                on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-slate-300 text-slate-700"
                                            )}
                                        >
                                            {brand}
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>
                    )}
                </div>
            </BottomSheet>

            <MiniCart />
            <ProductDetailSheet />

            <style dangerouslySetInnerHTML={{
                __html: `
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .hide-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}} />
        </div>
    );
};

export default CategoryProductsPage;
