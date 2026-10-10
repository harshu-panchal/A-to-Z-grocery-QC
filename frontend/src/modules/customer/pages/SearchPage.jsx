import { useState, useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { Search, Mic, ArrowLeft, X, ChevronRight, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { customerApi } from '../services/customerApi';
import ProductCard from '../components/shared/ProductCard';
import { onlyInStock } from '../utils/stock';
import ProductCardSkeleton, { ProductGridSkeleton } from '../components/shared/ProductCardSkeleton';
import { useProductDetail } from '../context/ProductDetailContext';
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { getJSON, setJSON, STORAGE_KEYS } from '@core/utils/storage';
import Lottie from 'lottie-react';

// Shared empty array: a fresh [] each render made results -> setResults loop forever
const EMPTY_LIST = [];

const SearchPage = () => {
    const navigate = useNavigate();
    const location = useRouterLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const { settings } = useSettings();
    const { currentLocation } = useAppLocation();
    const appName = settings?.appName || 'App';

    // Get initial query from URL state or params
    const initialQuery = location.state?.query || new URLSearchParams(location.search).get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [noServiceData, setNoServiceData] = useState(null);
    const [listeningAnimData, setListeningAnimData] = useState(null);

    // Manage Recent Searches with LocalStorage
    const [pastSearches, setPastSearches] = useState(() => {
        const saved = getJSON(STORAGE_KEYS.RECENT_SEARCHES, []);
        return Array.isArray(saved) ? saved.filter((s) => typeof s === 'string') : [];
    });

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Debounce Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 400); 
        return () => clearTimeout(timer);
    }, [query]);

    // Voice Search Logic (Enhanced)
    const handleVoiceSearch = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice search is not supported in your browser. Please try Chrome.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN'; 
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setQuery(''); // Clear previous search if starting fresh
        };
        
        recognition.onend = () => setIsListening(false);
        
        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }

            if (transcript) {
                setQuery(transcript);
                // Save to history only if it's the final result
                if (event.results[event.results.length - 1].isFinal) {
                    saveSearch(transcript);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please enable it in your browser settings.');
            } else {
                console.warn('Voice recognition stopped due to error:', event.error);
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error('Recognition start error:', e);
            setIsListening(false);
        }
    };

    // Perf audit Phase 8: migrated to React Query. `placeholderData:
    // keepPreviousData` keeps the previous location's product list visible
    // while a location change silently refetches (matches the original's
    // no-blocking-spinner-on-refetch behavior; the empty-state-only
    // skeleton grid below still checks isLoading, same as before).
    const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

    const { data: allProducts = EMPTY_LIST, isLoading } = useQuery({
        queryKey: ['customer', 'searchAllProducts', hasValidLocation ? currentLocation.latitude : null, hasValidLocation ? currentLocation.longitude : null],
        queryFn: async () => {
            const response = await customerApi.getProducts({
                limit: 100,
                lat: currentLocation.latitude,
                lng: currentLocation.longitude,
                // Search is the one place out-of-stock products appear (shown greyed out)
                includeOutOfStock: true,
            });
            if (response.data.success) {
                const rawResult = response.data.result;
                const dbProds = Array.isArray(response.data.results)
                    ? response.data.results
                    : Array.isArray(rawResult?.items)
                    ? rawResult.items
                    : Array.isArray(rawResult)
                    ? rawResult
                    : [];
                return dbProds.map(p => ({
                    ...p,
                    id: p._id,
                    image:
                      p.mainImage ||
                      p.image ||
                      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                    price: p.sellingPrice || p.mrp,
                    originalPrice: p.mrp,
                    weight: p.weight || '1 unit',
                    deliveryTime: '8-15 mins'
                }));
            }
            return [];
        },
        enabled: hasValidLocation,
        placeholderData: keepPreviousData,
    });

    // Save search term to history
    const saveSearch = (term) => {
        if (!term.trim()) return;
        const updated = [term, ...pastSearches.filter(s => s !== term)].slice(0, 10);
        setPastSearches(updated);
        setJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
    };

    // Remove specific search term
    const handleRemoveSearch = (e, term) => {
        e.stopPropagation();
        const updated = pastSearches.filter(s => s !== term);
        setPastSearches(updated);
        setJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
    };

    // Trigger save on Enter or clicking a result
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            saveSearch(query);
        }
    };

    // Real-time filtering logic
    const filteredResults = useMemo(() => {
        if (!debouncedQuery.trim()) return EMPTY_LIST;
        return allProducts.filter(p =>
            p.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            p.categoryId?.name?.toLowerCase().includes(debouncedQuery.toLowerCase())
        );
    }, [debouncedQuery, allProducts]);

    useEffect(() => {
        setResults(filteredResults);
    }, [filteredResults]);

    // Autocomplete: up to 5 product names matching what's typed so far,
    // names that start with the term first. Uses the live query (not the
    // debounced one) so suggestions keep pace with typing.
    const suggestions = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length < 2) return [];
        const seen = new Set();
        const starts = [];
        const contains = [];
        for (const p of allProducts) {
            const name = String(p.name || '').trim();
            const key = name.toLowerCase();
            if (!name || seen.has(key) || key === term) continue;
            const idx = key.indexOf(term);
            if (idx === -1) continue;
            seen.add(key);
            (idx === 0 ? starts : contains).push({ name, idx, image: p.image });
            if (starts.length >= 5) break;
        }
        return [...starts, ...contains].slice(0, 5);
    }, [query, allProducts]);

    const handleSuggestionClick = (name) => {
        setQuery(name);
        setDebouncedQuery(name);
        saveSearch(name);
    };

    // Dynamically load no-service Lottie when results are empty
    useEffect(() => {
        if (!isLoading) {
            import('@/assets/lottie/animation.json')
                .then((m) => setNoServiceData(m.default))
                .catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load listening Lottie when voice search starts
    useEffect(() => {
        if (!isListening || listeningAnimData) return;
        import('@/assets/lottie/listening.json')
            .then((m) => setListeningAnimData(m.default))
            .catch(() => {});
    }, [isListening, listeningAnimData]);

    // Lowest Price Section
    const lowestPriceProducts = useMemo(() => {
        // Browsing strip, not search results: keep it to in-stock products
        return onlyInStock(allProducts)
            .sort((a, b) => a.price - b.price)
            .slice(0, 10);
    }, [allProducts]);

    const handleClear = () => {
        setQuery('');
        setResults([]);
    };

    const clearAllSearches = () => {
        setPastSearches([]);
        setJSON(STORAGE_KEYS.RECENT_SEARCHES, []);
    };

    // Level-2 categories for "Shop by category" suggestions and category matches
    const { data: categoryTree = EMPTY_LIST } = useQuery({
        queryKey: ['customer', 'categoryTree'],
        queryFn: async () => {
            const catRes = await customerApi.getCategories({ tree: true });
            return catRes.data.success ? (catRes.data.results || catRes.data.result || []) : [];
        },
        staleTime: 5 * 60 * 1000,
    });
    const allCategories = useMemo(
        () => (Array.isArray(categoryTree) ? categoryTree : []).flatMap((h) => (h.children || []).map((c) => ({ id: c._id, name: c.name, image: c.image }))),
        [categoryTree]
    );
    const matchingCategories = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length < 2) return [];
        return allCategories.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 6);
    }, [query, allCategories]);

    return (
        <div className="min-h-screen bg-white font-outfit">
            {/* Header / Search Input */}
            <div className={cn(
                "sticky top-0 z-50 border-b border-slate-200 bg-white",
                isProductDetailOpen && "hidden md:block"
            )}>
                <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2.5 md:px-4">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            aria-label="Go back"
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100 active:scale-90"
                        >
                            <ArrowLeft size={22} />
                        </button>

                        <div className="relative flex-1">
                            <div className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2">
                                <Search size={18} className="text-slate-400" />
                            </div>
                            <input
                                autoFocus
                                type="search"
                                enterKeyHint="search"
                                aria-label="Search products"
                                placeholder='Search items, categories...'
                                value={query}
                                onKeyDown={handleKeyDown}
                                onChange={(e) => setQuery(e.target.value)}
                                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-20 [&::-webkit-search-cancel-button]:appearance-none text-[15px] font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:bg-white"
                            />
                            
                            {/* Integrated Actions inside Search Input */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                                {query && (
                                    <button
                                        onClick={handleClear}
                                        aria-label="Clear search"
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                                    >
                                        <X size={12} strokeWidth={3} className="text-slate-600" />
                                    </button>
                                )}
                                <div className="w-[1px] h-6 bg-slate-100 mx-1" />
                                <button 
                                    onClick={handleVoiceSearch}
                                    aria-label="Search by voice"
                                    className={cn(
                                        "p-2 transition-all rounded-full relative",
                                        isListening ? "text-red-500 bg-red-50 scale-110" : "text-slate-400 hover:text-primary hover:bg-slate-50"
                                    )}
                                >
                                    <Mic size={20} strokeWidth={2.5} className={cn(isListening && "animate-pulse")} />
                                    {isListening && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-6xl space-y-8 p-4 pb-24 md:p-6">
                {/* Search Results List */}
                {query ? (
                    <section>
                        {matchingCategories.length > 0 && (
                            <div className="mb-5">
                                <h3 className="mb-2 text-xs font-semibold text-slate-500">Categories</h3>
                                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                                    {matchingCategories.map((cat) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => { saveSearch(query); navigate(`/category/${cat.id}`); }}
                                            className="flex h-10 flex-shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1.5 pr-3.5 text-sm font-medium text-slate-800 hover:border-primary"
                                        >
                                            <img src={cat.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png'} alt="" className="h-7 w-7 rounded-full bg-slate-50 object-contain" />
                                            {cat.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {suggestions.length > 0 && (
                            <ul className="-mt-1 mb-6 divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden" aria-label="Search suggestions">
                                {suggestions.map(({ name, idx, image }) => {
                                    const end = idx + query.trim().length;
                                    return (
                                        <li key={name}>
                                            <button
                                                type="button"
                                                onClick={() => handleSuggestionClick(name)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                            >
                                                <span className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                                                    {image ? (
                                                        <img src={image} alt="" loading="lazy" className="h-full w-full object-contain" />
                                                    ) : (
                                                        <Search size={14} className="text-slate-400" />
                                                    )}
                                                </span>
                                                <span className="flex-1 min-w-0 truncate text-sm text-slate-500">
                                                    {name.slice(0, idx)}
                                                    <span className="font-medium text-slate-500">{name.slice(idx, end)}</span>
                                                    <span className="font-bold text-slate-800">{name.slice(end)}</span>
                                                </span>
                                                <ArrowLeft size={16} className="rotate-[135deg] text-slate-300 flex-shrink-0" aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <div className="mb-3 flex items-baseline justify-between">
                            <h2 className="text-base font-bold text-slate-900">Products</h2>
                            {!isLoading && <span className="text-xs text-slate-500">{results.length} found</span>}
                        </div>

                        {isLoading && allProducts.length === 0 ? (
                            <ProductGridSkeleton count={6} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5" />
                        ) : results.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
                                {results.map((product) => (
                                    <div key={product.id} onClick={() => saveSearch(query)}>
                                        <ProductCard product={product} compact={isMobile} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center py-12 text-center">
                                <div className="mb-4 h-40 w-40">
                                    {noServiceData && <Lottie animationData={noServiceData} loop={true} />}
                                </div>
                                <h3 className="mb-1 text-lg font-bold text-slate-900">No products found</h3>
                                <p className="max-w-xs text-sm text-slate-500">
                                    Nothing matches &ldquo;{query}&rdquo;. Check the spelling or try a more general word.
                                </p>
                            </div>
                        )}
                    </section>
                ) : (
                    <>
                        {/* 1. Recently Searched Item Section */}
                        {pastSearches.length > 0 && (
                            <section>
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-base font-bold text-slate-900">Recent searches</h2>
                                    <button type="button" onClick={clearAllSearches} className="text-sm font-medium text-primary">
                                        Clear all
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {pastSearches.map((term) => (
                                        <span
                                            key={term}
                                            className="flex h-9 items-center rounded-full border border-slate-200 bg-white text-sm text-slate-700"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setQuery(term)}
                                                className="flex h-full items-center gap-1.5 pl-3 pr-1"
                                            >
                                                <History size={14} className="text-slate-400" aria-hidden="true" />
                                                {term}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => handleRemoveSearch(e, term)}
                                                aria-label={`Remove ${term} from recent searches`}
                                                className="flex h-full w-8 items-center justify-center rounded-r-full text-slate-400 hover:text-red-500"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Category suggestions */}
                        {allCategories.length > 0 && (
                            <section>
                                <h2 className="mb-3 text-base font-bold text-slate-900">Shop by category</h2>
                                <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
                                    {allCategories.slice(0, 12).map((cat) => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => navigate(`/category/${cat.id}`)}
                                            className="flex flex-col items-center gap-1.5"
                                        >
                                            <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-50 p-2">
                                                <img src={cat.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png'} alt="" loading="lazy" className="h-full w-full object-contain" />
                                            </span>
                                            <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-slate-700">{cat.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 2. Lowest Price Ever Section */}
                        <section>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-base font-bold text-slate-900">Lowest prices</h2>
                                <button
                                    type="button"
                                    className="flex items-center gap-0.5 text-sm font-semibold text-primary"
                                    onClick={() => navigate('/category/all')}
                                >
                                    See all <ChevronRight size={16} />
                                </button>
                            </div>
                            <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-3 md:gap-4">
                                {isLoading && allProducts.length === 0 ? (
                                    [...Array(4)].map((_, i) => (
                                        <div key={i} className="w-[140px] flex-shrink-0 md:w-[160px]"><ProductCardSkeleton /></div>
                                    ))
                                ) : lowestPriceProducts.map((product) => (
                                    <div key={product.id} className="w-[140px] flex-shrink-0 snap-start md:w-[160px]">
                                        <ProductCard product={product} compact={isMobile} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>

            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-white/92 backdrop-blur-md px-6"
                    >
                        <div className="w-56 h-56 md:w-72 md:h-72">
                            {listeningAnimData ? (
                                <Lottie animationData={listeningAnimData} loop />
                            ) : (
                                <div className="w-full h-full rounded-full bg-slate-100 animate-pulse" />
                            )}
                        </div>
                        <p className="mt-2 text-xl font-black text-slate-800 tracking-tight">
                            Listening...
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-400">
                            Speak now to search
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchPage;
