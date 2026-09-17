import React, { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Heart, Search, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import SectionRenderer from "../components/experience/SectionRenderer";
import { useLocation as useAppLocation } from '../context/LocationContext';
import { useSettings } from '@core/context/SettingsContext';
import Lottie from 'lottie-react';

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

    // Perf audit Phase 8: migrated to React Query. Products + category tree
    // were always fetched together in parallel as one unit, so they stay
    // one query, keyed on catId + location (matches the original effect's
    // dependency array exactly). `placeholderData: keepPreviousData` avoids
    // a blank flash when switching categories or when location refreshes.
    const { data: categoryData, isLoading, refetch } = useQuery({
        queryKey: ['customer', 'categoryProducts', catId, hasValidLocation ? currentLocation.latitude : null, hasValidLocation ? currentLocation.longitude : null],
        queryFn: async () => {
            const [prodRes, catRes] = await Promise.all([
                hasValidLocation
                    ? customerApi.getProducts({
                        categoryId: catId,
                        lat: currentLocation.latitude,
                        lng: currentLocation.longitude,
                    })
                    : Promise.resolve({ data: { success: true, result: { items: [] } } }),
                customerApi.getCategories({ tree: true }),
            ]);

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
                    price: p.salePrice || p.price,
                    originalPrice: p.price,
                    weight: p.weight || "1 unit",
                    deliveryTime: "8-15 mins"
                }));
            }

            let category = null;
            let subCategories = DEFAULT_SUBCATEGORIES;
            if (catRes.data.success) {
                const tree = catRes.data.results || catRes.data.result || [];
                let currentCat = null;
                for (const header of tree) {
                    const found = (header.children || []).find(c => c._id === catId);
                    if (found) {
                        currentCat = found;
                        break;
                    }
                }

                if (currentCat) {
                    category = currentCat;
                    const subs = (currentCat.children || []).map(s => ({
                        id: s._id,
                        name: s.name,
                        icon: s.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321801.png'
                    }));
                    subCategories = [...DEFAULT_SUBCATEGORIES, ...subs];
                }
            }

            return { products, category, subCategories };
        },
        placeholderData: keepPreviousData,
    });

    const category = categoryData?.category ?? null;
    const subCategories = categoryData?.subCategories ?? DEFAULT_SUBCATEGORIES;
    const products = categoryData?.products ?? [];
    const fetchData = refetch;

    useEffect(() => {
        setSelectedSubCategory(location.state?.activeSubcategoryId || 'all');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catId, location.state?.activeSubcategoryId]);

    const safeProducts = Array.isArray(products) ? products : [];

    const filteredProducts = safeProducts.filter(p =>
        selectedSubCategory === 'all' || p.subcategoryId?._id === selectedSubCategory || p.subcategoryId === selectedSubCategory
    );

    const productsById = React.useMemo(() => {
        const map = {};
        safeProducts.forEach(p => {
            map[p._id || p.id] = p;
        });
        return map;
    }, [safeProducts]);

    return (
        <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative font-sans">
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-50 bg-white border-b border-gray-50 px-4 py-4 flex items-center justify-between",
                isProductDetailOpen && "hidden md:flex"
            )}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 hover:bg-gray-50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} className="text-gray-900" />
                    </button>
                    <h1 className="text-[18px] font-bold text-gray-800 tracking-tight">
                        {category?.name || catId}
                    </h1>
                </div>

            </header>

            <div className="flex flex-1 relative items-start">
                {(safeProducts.length === 0 && !isLoading) ? (
                    <div className="w-full flex-1 py-20 px-8 flex flex-col items-center justify-center text-center">
                        <div className="w-64 h-64 mb-6">
                            {noServiceData ? (
                                <Lottie animationData={noServiceData} loop={true} />
                            ) : (
                                <div className="w-64 h-64" />
                            )}
                        </div>
                        <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                            Service <span className="text-primary">Unavailable</span>
                        </h3>
                        <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                            {settings?.appName || 'Our service'} is not available in your area yet. We're expanding fast!
                        </p>
                        <button 
                            onClick={fetchData}
                            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-black/10"
                        >
                            Try Refreshing
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Sidebar */}
                        <aside className="w-[70px] border-r border-gray-50 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky top-[60px] h-[calc(100vh-60px)] pb-32 flex-shrink-0">
                            {subCategories.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedSubCategory(cat.id)}
                                    className={cn(
                                        "flex flex-col items-center py-4 px-1 gap-2 transition-all relative border-l-4",
                                        selectedSubCategory === cat.id
                                            ? "bg-[#F7FCF5] border-primary"
                                            : "border-transparent hover:bg-gray-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center p-1.5 transition-all duration-300",
                                        selectedSubCategory === cat.id ? "scale-110" : "opacity-100"
                                    )}>
                                        <img src={applyCloudinaryTransform(cat.icon)} alt={cat.name} loading="lazy" className="w-full h-full object-contain" />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] text-center font-bold font-sans leading-tight px-1",
                                        selectedSubCategory === cat.id ? "text-primary" : "text-gray-600"
                                    )}>
                                        {cat.name}
                                    </span>
                                </button>
                            ))}
                        </aside>

                        {/* Content */}
                        <main className="flex-1 p-2 pb-24 bg-white space-y-4 overflow-x-hidden">
                            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                {filteredProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                                ))}
                            </div>
                        </main>
                    </>
                )}
            </div>

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

