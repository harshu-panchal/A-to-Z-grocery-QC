import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useInViewAnimation } from "@/core/hooks/useInViewAnimation";
import { Sparkles } from "lucide-react";

// MUI Icons (shared with admin & icon selector)
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import KitchenIcon from "@mui/icons-material/Kitchen";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";

import { motion, useScroll, useTransform } from "framer-motion";
import { isMobileOrWebView } from "@/core/utils/deviceUtils";
import { customerApi } from "../services/customerApi";
import MainLocationHeader from "../components/shared/MainLocationHeader";
import { useProductDetail } from "../context/ProductDetailContext";
import { cn } from "@/lib/utils";
import SectionRenderer from "../components/experience/SectionRenderer";
import ExperienceBannerCarousel from "../components/experience/ExperienceBannerCarousel";
import { useLocation } from "../context/LocationContext";
import { useSettings } from "@core/context/SettingsContext";
// Only needed for the rare no-service state; keep the player off the initial load
const Lottie = lazy(() => import("lottie-react"));
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import { getJSON, remove as removeStorage, STORAGE_KEYS } from "@core/utils/storage";
import { scrollPageToTop } from "@core/utils/scrollTop";

import {
  ICON_COMPONENTS,
} from "../constants/homeConstants";
import PromoMarquee from "../components/home/PromoMarquee";
import QuickCategorySlider from "../components/home/QuickCategorySlider";
import LowestPriceSection from "../components/home/LowestPriceSection";
import CategoryRails from "../components/home/CategoryRails";
import CategoryProductRows from "../components/home/CategoryProductRows";
import { onlyInStock } from "../utils/stock";
import OfferSections from "../components/home/OfferSections";
import AtzHome from "../components/atz/AtzHome";

const PHONE_QUERY = "(max-width: 767px)";

const DEFAULT_CATEGORY_THEME = {
  gradient: "linear-gradient(to bottom, var(--primary), var(--brand-400))",
  shadow: "shadow-brand-500/20",
  accent: "text-[#1A1A1A]",
};

const CATEGORY_METADATA = {
  All: {
    icon: HomeIcon,
    theme: DEFAULT_CATEGORY_THEME,
    banner: {
      title: "HOUSEFULL",
      subtitle: "SALE",
      floatingElements: "sparkles",
    },
  },
  Grocery: {
    icon: LocalGroceryStoreIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF9F1C, #FFBF69)",
      shadow: "shadow-orange-500/20",
      accent: "text-orange-900",
    },
    banner: {
      title: "SUPERSAVER",
      subtitle: "FRESH & FAST",
      floatingElements: "leaves",
    },
  },
  Wedding: {
    icon: CardGiftcardIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF4D6D, #FF8FA3)",
      shadow: "shadow-rose-500/20",
      accent: "text-rose-900",
    },
    banner: { title: "WEDDING", subtitle: "BLISS", floatingElements: "hearts" },
  },
  "Home & Kitchen": {
    icon: KitchenIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #BC6C25, #DDA15E)",
      shadow: "shadow-amber-500/20",
      accent: "text-amber-900",
    },
    banner: { title: "HOME", subtitle: "KITCHEN", floatingElements: "smoke" },
  },
  Electronics: {
    icon: DevicesIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #7209B7, #B5179E)",
      shadow: "shadow-purple-500/20",
      accent: "text-purple-900",
    },
    banner: {
      title: "TECH FEST",
      subtitle: "GADGETS",
      floatingElements: "tech",
    },
  },
  Kids: {
    icon: ChildCareIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4CC9F0, #A0E7E5)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: {
      title: "LITTLE ONE",
      subtitle: "CARE",
      floatingElements: "bubbles",
    },
  },
  "Pet Supplies": {
    icon: PetsIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FB8500, #FFB703)",
      shadow: "shadow-yellow-500/20",
      accent: "text-yellow-900",
    },
    banner: { title: "PAWSOME", subtitle: "DEALS", floatingElements: "bones" },
  },
  Sports: {
    icon: SportsSoccerIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4361EE, #4895EF)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: { title: "SPORTS", subtitle: "GEAR", floatingElements: "confetti" },
  },
};

const ALL_CATEGORY = {
  id: "all",
  _id: "all",
  name: "All",
  icon: HomeIcon,
  theme: DEFAULT_CATEGORY_THEME,
  headerColor: "#0e7490",
  headerFontColor: "#111111",
  headerIconColor: "#111111",
  banner: {
    title: "HOUSEFULL",
    subtitle: "SALE",
    floatingElements: "sparkles",
    textColor: "text-white",
  },
};

const EMPTY_HERO_CONFIG = {
  banners: { items: [] },
  categoryIds: [],
};

const homePageDataCache = new Map();
const headerSectionsMemoryCache = {};
const heroConfigMemoryCache = {};

const getHomePageDataCacheKey = (location) => {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "home:no-location";
  return `home:${lat.toFixed(5)}:${lng.toFixed(5)}`;
};

const getCachedHomePageData = (location) =>
  homePageDataCache.get(getHomePageDataCacheKey(location)) || null;

const Home = () => {
  const { scrollY } = useScroll();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const { currentLocation } = useLocation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const quickCatsRef = useRef(null);
  const cachedHomePageData = getCachedHomePageData(currentLocation);

  const { ref: particleContainerRef, isVisible: particlesVisible } = useInViewAnimation();
  const heroRef = useRef(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setHeroVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { rootMargin: "0px" });
    const el = heroRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [categories, setCategories] = useState(() => cachedHomePageData?.categories || [ALL_CATEGORY]);
  const [activeCategory, setActiveCategory] = useState(() => cachedHomePageData?.activeCategory || ALL_CATEGORY);
  const [products, setProducts] = useState(() => cachedHomePageData?.products || []);
  const productsRef = useRef(cachedHomePageData?.products || []);
  const [quickCategories, setQuickCategories] = useState(() => cachedHomePageData?.quickCategories || []);
  const [isLoading, setIsLoading] = useState(() => !cachedHomePageData);
  const [experienceSections, setExperienceSections] = useState(() => cachedHomePageData?.experienceSections || []);
  const [headerSections, setHeaderSections] = useState([]);
  const [heroConfig, setHeroConfig] = useState(() => cachedHomePageData?.heroConfig || heroConfigMemoryCache.__home__ || EMPTY_HERO_CONFIG);
  const [mobileBannerIndex, setMobileBannerIndex] = useState(0);
  const [isInstantBannerJump, setIsInstantBannerJump] = useState(false);
  const [categoryMap, setCategoryMap] = useState(() => cachedHomePageData?.categoryMap || {});
  const [subcategoryMap, setSubcategoryMap] = useState(() => cachedHomePageData?.subcategoryMap || {});
  const [pendingReturn, setPendingReturn] = useState(null);
  const [offerSections, setOfferSections] = useState(() => cachedHomePageData?.offerSections || []);
  const [noServiceData, setNoServiceData] = useState(null);

  useEffect(() => {
    productsRef.current = products || [];
  }, [products]);

  useEffect(() => {
    if (products.length === 0 && !isLoading) {
      import("@/assets/lottie/animation.json").then((m) => setNoServiceData(m.default)).catch(() => {});
    }
  }, [products.length, isLoading]);

  const applyHomePageData = (data, { cacheKey, persist = true } = {}) => {
    if (!data) return;
    setCategoryMap(data.categoryMap || {});
    setSubcategoryMap(data.subcategoryMap || {});
    setCategories(data.categories || [ALL_CATEGORY]);
    setQuickCategories(data.quickCategories || []);
    setProducts(data.products || []);
    setExperienceSections(data.experienceSections || []);
    setOfferSections(data.offerSections || []);
    if (data.heroConfig) setHeroConfig(data.heroConfig);
    setActiveCategory((prev) => {
      const parsed = getJSON(STORAGE_KEYS.EXPERIENCE_RETURN, null, { storage: "session" });
      if (parsed?.headerId) {
        const match = (data.formattedHeaders || []).find((h) => h._id === parsed.headerId);
        if (match) return match;
      }
      if (!prev || prev._id === "all") return data.activeCategory || data.categories?.[0] || ALL_CATEGORY;
      return (data.categories || []).find((cat) => cat._id === prev._id) || data.activeCategory || prev;
    });
    if (persist && cacheKey) homePageDataCache.set(cacheKey, data);
  };

  const fetchData = async ({ forceRefresh = false } = {}) => {
    const cacheKey = getHomePageDataCacheKey(currentLocation);
    // Show the cached copy instantly, but always refetch in the background so
    // newly created offer sections / products appear without a page reload
    const cached = forceRefresh ? null : homePageDataCache.get(cacheKey);
    if (cached) applyHomePageData(cached, { cacheKey, persist: false });
    setIsLoading(!cached);
    try {
      const hasValidLocation = Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);
      const productParams = { limit: 20 };
      if (hasValidLocation) {
        productParams.lat = currentLocation.latitude;
        productParams.lng = currentLocation.longitude;
      }
      const [catRes, prodRes, expRes, sectionsRes] = await Promise.all([
        customerApi.getCategories(),
        hasValidLocation ? customerApi.getProducts(productParams) : Promise.resolve({ data: { success: true, result: { items: [] } } }),
        customerApi.getExperienceSections({ pageType: "home" }).catch(() => null),
        hasValidLocation ? customerApi.getOfferSections({ lat: currentLocation.latitude, lng: currentLocation.longitude }).catch(() => ({ data: {} })) : Promise.resolve({ data: { results: [] } }),
      ]);
      const nextHomeData = {
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        products: [],
        quickCategories: [],
        experienceSections: [],
        offerSections: [],
        categoryMap: {},
        subcategoryMap: {},
        formattedHeaders: [],
        heroConfig: heroConfigMemoryCache.__home__ || EMPTY_HERO_CONFIG,
      };
      if (catRes.data.success) {
        const dbCats = catRes.data.results || catRes.data.result || [];
        const catMap = {};
        const subMap = {};
        dbCats.forEach((c) => { if (c.type === "category") catMap[c._id] = c; else if (c.type === "subcategory") subMap[c._id] = c; });
        nextHomeData.categoryMap = catMap;
        nextHomeData.subcategoryMap = subMap;
        const formattedHeaders = dbCats.filter((cat) => cat.type === "header").map((cat) => {
          const catName = cat.name;
          const meta = CATEGORY_METADATA[catName] || CATEGORY_METADATA[catName.toUpperCase()] || { icon: Sparkles, theme: DEFAULT_CATEGORY_THEME, banner: { title: catName.toUpperCase(), subtitle: "TOP PICKS", floatingElements: "sparkles" } };
          const IconComp = (cat.iconId && ICON_COMPONENTS[cat.iconId]) || meta.icon || Sparkles;
          return { ...cat, id: cat._id, icon: IconComp, theme: meta.theme, banner: { ...meta.banner, textColor: "text-white" } };
        });
        nextHomeData.formattedHeaders = formattedHeaders;
        const allHeaderFromAdmin = formattedHeaders.find((h) => (h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all"));
        const mergedAllCategory = allHeaderFromAdmin ? { ...ALL_CATEGORY, headerColor: allHeaderFromAdmin.headerColor || ALL_CATEGORY.headerColor, headerFontColor: allHeaderFromAdmin.headerFontColor || ALL_CATEGORY.headerFontColor, headerIconColor: allHeaderFromAdmin.headerIconColor || ALL_CATEGORY.headerIconColor, icon: allHeaderFromAdmin.icon || ALL_CATEGORY.icon } : ALL_CATEGORY;
        nextHomeData.categories = [mergedAllCategory, ...formattedHeaders.filter((h) => !((h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all")))];
        nextHomeData.activeCategory = mergedAllCategory;
        nextHomeData.quickCategories = dbCats.filter((cat) => cat.type === "category").map((cat) => ({ id: cat._id, name: cat.name, image: cat.image || "https://cdn-icons-png.flaticon.com/128/2321/2321831.png" }));
      }
      if (prodRes.data.success) {
        const rawResult = prodRes.data.result;
        const dbProds = Array.isArray(prodRes.data.results) ? prodRes.data.results : Array.isArray(rawResult?.items) ? rawResult.items : Array.isArray(rawResult) ? rawResult : [];
        nextHomeData.products = dbProds.map((p) => ({ ...p, id: p._id, image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400", price: p.sellingPrice || p.mrp, originalPrice: p.mrp, weight: p.weight || "1 unit", deliveryTime: "8-15 mins" }));
      }
      if (expRes?.data?.success) nextHomeData.experienceSections = Array.isArray(expRes.data.result || expRes.data.results) ? (expRes.data.result || expRes.data.results) : [];
      const sectionsList = sectionsRes?.data?.results || sectionsRes?.data?.result || sectionsRes?.data;
      nextHomeData.offerSections = Array.isArray(sectionsList) ? sectionsList : [];
      applyHomePageData(nextHomeData, { cacheKey });
    } catch (error) { console.error("Error:", error); } finally { setIsLoading(false); }
  };

  const hydrateSelectedSectionProducts = async (sections = []) => {
    const selectedProductIds = Array.from(new Set(sections.flatMap((s) => s?.displayType === "products" ? (s?.config?.products?.productIds || []) : []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!selectedProductIds.length) return;
    const existingIds = new Set(productsRef.current.map((p) => String(p?._id || p?.id || "").trim()));
    const missingIds = selectedProductIds.filter((id) => !existingIds.has(id));
    if (!missingIds.length) return;
    try {
      const locationParams = Number.isFinite(currentLocation?.latitude) ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : undefined;
      const missingResults = await Promise.allSettled(missingIds.map((id) => customerApi.getProductById(id, locationParams)));
      const fetchedMissing = missingResults.filter((r) => r.status === "fulfilled").flatMap((r) => { const p = r.value?.data?.result || r.value?.data?.results; return Array.isArray(p) ? p : (p ? [p] : []); }).map((p) => ({ ...p, id: p._id, image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400", price: p.sellingPrice || p.mrp, originalPrice: p.mrp, weight: p.weight || "1 unit", deliveryTime: "8-15 mins" }));
      if (fetchedMissing.length) setProducts((prev) => { const merged = [...prev]; const mergedIds = new Set(merged.map((p) => String(p?._id || p?.id || "").trim())); fetchedMissing.forEach((p) => { const key = String(p?._id || p?.id || "").trim(); if (!mergedIds.has(key)) { merged.push(p); mergedIds.add(key); } }); return merged; });
    } catch (e) {}
  };

  useEffect(() => { fetchData(); }, [currentLocation?.latitude, currentLocation?.longitude]);
  const headerSectionsCache = useRef(headerSectionsMemoryCache);
  const heroConfigCache = useRef(heroConfigMemoryCache);

  useEffect(() => {
    const fetchHeaderSections = async () => {
      if (!activeCategory || activeCategory._id === "all") { setHeaderSections([]); return; }
      const cacheKey = activeCategory._id;
      if (headerSectionsCache.current[cacheKey]) { setHeaderSections(headerSectionsCache.current[cacheKey]); return; }
      try {
        const res = await customerApi.getExperienceSections({ pageType: "header", headerId: activeCategory._id });
        if (res.data.success) { const sections = Array.isArray(res.data.result || res.data.results) ? (res.data.result || res.data.results) : []; headerSectionsCache.current[cacheKey] = sections; setHeaderSections(sections); await hydrateSelectedSectionProducts(sections); }
        else setHeaderSections([]);
      } catch (e) { setHeaderSections([]); }
    };
    fetchHeaderSections();
  }, [activeCategory]);

  // Products for the selected header tab, so each tab shows its own items
  // instead of the generic home list.
  const [headerProducts, setHeaderProducts] = useState(null);
  const [headerTrending, setHeaderTrending] = useState([]);
  useEffect(() => {
    const isHeader = activeCategory && activeCategory._id !== "all";
    const hasValidLocation = Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);
    if (!isHeader || !hasValidLocation) { setHeaderProducts(null); setHeaderTrending([]); return; }
    let cancelled = false;
    const toCardProducts = (res) => {
      const rawResult = res.data?.result;
      const dbProds = Array.isArray(res.data?.results) ? res.data.results : Array.isArray(rawResult?.items) ? rawResult.items : Array.isArray(rawResult) ? rawResult : [];
      return dbProds.map((p) => ({ ...p, id: p._id, image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400", price: p.sellingPrice || p.mrp, originalPrice: p.mrp, weight: p.weight || "1 unit", deliveryTime: "8-15 mins" }));
    };
    const params = { headerId: activeCategory._id, lat: currentLocation.latitude, lng: currentLocation.longitude };
    customerApi.getProducts({ ...params, limit: 100 })
      .then((res) => { if (!cancelled) setHeaderProducts(toCardProducts(res)); })
      .catch(() => { if (!cancelled) setHeaderProducts([]); });
    // Best-sellers in this header (last 30 days of orders)
    customerApi.getProducts({ ...params, sort: "trending", limit: 12 })
      .then((res) => { if (!cancelled) setHeaderTrending(toCardProducts(res)); })
      .catch(() => { if (!cancelled) setHeaderTrending([]); });
    return () => { cancelled = true; };
  }, [activeCategory, currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    const fetchHeroConfig = async () => {
      try {
        const isHeader = activeCategory && activeCategory._id !== "all";
        const cacheKey = isHeader ? activeCategory._id : "__home__";
        if (heroConfigCache.current[cacheKey]) { setHeroConfig(heroConfigCache.current[cacheKey]); return; }
        let payload = null;
        if (isHeader) { const res = await customerApi.getHeroConfig({ pageType: "header", headerId: activeCategory._id }); if (res.data?.success && res.data?.result) payload = res.data.result; }
        // Header without its own hero: borrow home banners only, never the home
        // category picks (the header's own categories are shown instead)
        if (!payload || (payload.banners?.items?.length === 0 && !payload.categoryIds?.length)) { const homeRes = await customerApi.getHeroConfig({ pageType: "home" }); if (homeRes.data?.success && homeRes.data?.result) payload = isHeader ? { ...homeRes.data.result, categoryIds: [] } : homeRes.data.result; }
        const resolved = payload && (payload.banners?.items?.length > 0 || payload.categoryIds?.length > 0) ? { banners: payload.banners || { items: [] }, categoryIds: payload.categoryIds || [] } : { banners: { items: [] }, categoryIds: [] };
        heroConfigCache.current[cacheKey] = resolved;
        if (cacheKey === "__home__") { const homeCacheKey = getHomePageDataCacheKey(currentLocation); const cachedHomeData = homePageDataCache.get(homeCacheKey); if (cachedHomeData) homePageDataCache.set(homeCacheKey, { ...cachedHomeData, heroConfig: resolved }); }
        setHeroConfig(resolved);
      } catch (e) { setHeroConfig(EMPTY_HERO_CONFIG); }
    };
    fetchHeroConfig();
  }, [activeCategory, currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    const firstUrl = heroConfig?.banners?.items?.[0]?.imageUrl;
    if (!firstUrl) return;
    const link = document.createElement("link");
    link.rel = "preload"; link.as = "image"; link.href = applyCloudinaryTransform(firstUrl, "f_auto,q_auto,c_scale,w_824");
    link.setAttribute("fetchpriority", "high"); document.head.appendChild(link);
    return () => { if (link.parentNode) link.parentNode.removeChild(link); };
  }, [heroConfig?.banners?.items?.[0]?.imageUrl]);

  useEffect(() => {
    const totalSlides = 3;
    const intervalId = setInterval(() => { setMobileBannerIndex((prev) => prev >= totalSlides - 1 ? prev : prev + 1); }, 3500);
    return () => clearInterval(intervalId);
  }, []);

  const handleBannerTransitionEnd = () => { if (mobileBannerIndex === 2) { setIsInstantBannerJump(true); setMobileBannerIndex(0); } };
  useEffect(() => { if (!isInstantBannerJump) return; const id = requestAnimationFrame(() => setIsInstantBannerJump(false)); return () => cancelAnimationFrame(id); }, [isInstantBannerJump]);

  // Experience sections pick products from this map; hide out-of-stock ones (search still shows them)
  const productsById = useMemo(() => { const map = {}; onlyInStock(products).forEach((p) => { map[p._id || p.id] = p; }); return map; }, [products]);
  const effectiveQuickCategories = useMemo(() => {
    const ids = heroConfig.categoryIds || [];
    if (ids.length > 0) { const resolved = ids.map((id) => categoryMap[id]).filter(Boolean).map((c) => ({ id: c._id, name: c.name, image: c.image || "https://cdn-icons-png.flaticon.com/128/2321/2321831.png" })); if (resolved.length > 0) return resolved; }
    // Header tab without admin-picked categories: show that header's own categories
    if (activeCategory && activeCategory._id !== "all") {
      const headerId = String(activeCategory._id);
      return Object.values(categoryMap)
        .filter((c) => String(c.parentId?._id || c.parentId || "") === headerId)
        .map((c) => ({ id: c._id, name: c.name, image: c.image || "https://cdn-icons-png.flaticon.com/128/2321/2321831.png" }));
    }
    return quickCategories;
  }, [heroConfig.categoryIds, categoryMap, quickCategories, activeCategory]);

  const isHeaderTab = Boolean(activeCategory && activeCategory._id !== "all");
  // A header tab never falls back to the generic home sections
  const sectionsForRenderer = isHeaderTab ? headerSections : experienceSections;
  const tabProducts = isHeaderTab && headerProducts ? headerProducts : products;
  // All level-2 categories of the selected header, used for per-category product rows
  const headerLevel2Categories = useMemo(() => {
    if (!isHeaderTab) return [];
    const headerId = String(activeCategory._id);
    return Object.values(categoryMap)
      .filter((c) => String(c.parentId?._id || c.parentId || "") === headerId)
      .map((c) => ({ id: c._id, name: c.name, image: c.image }));
  }, [isHeaderTab, activeCategory, categoryMap]);
  const isMobile = useMemo(() => isMobileOrWebView(), []);
  // Phones get the mobile design (AtzHome); tablet/desktop keep the layout below
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const opacity = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [1, 0.6]);
  const y = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [0, 80]);
  const scale = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [1, 0.95]);
  const pointerEvents = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 100] : [0, 0], ["auto", "none"]);

  useEffect(() => {
    if (!pendingReturn?.sectionId) return;
    const allSections = headerSections.length ? headerSections : experienceSections;
    if (!allSections.length) return;
    if (allSections.some((s) => s._id === pendingReturn.sectionId)) { const el = document.getElementById(`section-${pendingReturn.sectionId}`); if (el) { el.scrollIntoView({ behavior: "instant", block: "start" }); removeStorage(STORAGE_KEYS.EXPERIENCE_RETURN, { storage: "session" }); setPendingReturn(null); } }
  }, [headerSections, experienceSections, pendingReturn]);

  // Header category tap swaps the page content in place (no route change, so
  // ScrollToTop doesn't fire): start the new category from the top instead of
  // leaving the user somewhere in the middle of it.
  const handleHeaderCategorySelect = (cat) => {
    setActiveCategory(cat);
    scrollPageToTop();
  };

  const renderFloatingElements = (type, isVisible = true) => {
    if (isMobile) return null;
    return null; // Particles were already simplified out earlier
  };

  const headerTabEmpty = isHeaderTab && headerProducts && headerProducts.length === 0 && (
    <div className="mx-4 my-6 rounded-2xl border border-slate-100 bg-white py-10 text-center">
      <p className="text-sm font-bold text-slate-700">No products in {activeCategory.name} yet</p>
      <p className="text-xs text-slate-500 mt-1">Check back soon or explore other categories.</p>
    </div>
  );
  const headerTabRows = isHeaderTab && (
    <CategoryProductRows
      key={activeCategory._id}
      categories={headerLevel2Categories}
      products={tabProducts}
      trendingProducts={headerTrending}
      onSeeAll={(id) => navigate(`/category/${id}`)}
      onSeeAllHeader={() => navigate(`/category/${activeCategory._id}`)}
    />
  );
  const adminSections = (
    <>
      <OfferSections sections={offerSections} noServiceData={noServiceData} />
      {sectionsForRenderer.length > 0 && (
        <div className="container mx-auto px-4 md:px-8 lg:px-[50px] py-10 md:py-16">
          <SectionRenderer sections={sectionsForRenderer} productsById={productsById} categoriesById={categoryMap} subcategoriesById={subcategoryMap} />
        </div>
      )}
    </>
  );

  // AtzHome has its own "Explore top categories" grid, so skip admin category grids there
  const phoneSections = sectionsForRenderer.filter((s) => s.displayType !== "categories");

  if (isPhone && !(products.length === 0 && !isLoading)) {
    return (
      <AtzHome
        categories={categories}
        activeCategory={activeCategory}
        onCategorySelect={handleHeaderCategorySelect}
        banners={heroConfig.banners?.items || []}
        products={tabProducts}
        quickCategories={effectiveQuickCategories}
        categoryMap={categoryMap}
        offerSections={<OfferSections sections={offerSections} noServiceData={noServiceData} design="atz" />}>
        {headerTabEmpty}
        {isHeaderTab && (
          <CategoryProductRows
            key={activeCategory._id}
            design="atz"
            categories={headerLevel2Categories}
            products={tabProducts}
            trendingProducts={headerTrending}
            onSeeAll={(id) => navigate(`/category/${id}`)}
            onSeeAllHeader={() => navigate(`/category/${activeCategory._id}`)}
          />
        )}
        {phoneSections.length > 0 && (
          <div className="px-5 py-6">
            <SectionRenderer sections={phoneSections} productsById={productsById} categoriesById={categoryMap} subcategoriesById={subcategoryMap} />
          </div>
        )}
      </AtzHome>
    );
  }

  return (
    <div className={`min-h-screen bg-[#f7f8f6] pt-[190px] md:pt-[250px] ${products.length === 0 && !isLoading ? "bg-white" : ""}`}>
      <div className={cn("contents", isProductDetailOpen && "hidden md:contents")}>
        <MainLocationHeader categories={categories} activeCategory={activeCategory} onCategorySelect={handleHeaderCategorySelect} />
      </div>

      {products.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center pt-24 pb-48">
          <div className="w-64 h-64 md:w-96 md:h-96 mb-8">{noServiceData && <Suspense fallback={null}><Lottie animationData={noServiceData} loop={true} /></Suspense>}</div>
          <h3 className="text-3xl md:text-5xl font-black text-slate-800 text-center uppercase">Service <span className="text-primary">Unavailable</span></h3>
          <p className="text-slate-500 font-bold max-w-md text-center px-10 text-sm md:text-lg opacity-80">Ah! We haven't reached your neighborhood yet.</p>
          <button onClick={() => window.location.reload()} className="mt-12 px-10 py-4 bg-primary text-white font-black rounded-[24px] uppercase text-[13px] tracking-widest transition-all active:scale-95">Check Again</button>
        </div>
      ) : (
        <>
          <motion.div ref={heroRef} className="block md:hidden will-change-transform" style={isMobile ? { opacity: 1 } : { opacity, y, scale, pointerEvents }}>
            <div className="relative w-full overflow-hidden">
              {heroConfig.banners?.items?.length ? (
                <ExperienceBannerCarousel section={{ title: "" }} items={heroConfig.banners.items} fullWidth edgeToEdge />
              ) : (
                <div className="relative flex h-[190px] w-full items-center overflow-hidden border-y border-primary/10 bg-gradient-to-br from-brand-50 via-white to-emerald-50 px-6 shadow-sm">
                  <div className="relative z-10 w-3/5 flex flex-col items-start gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Fresh finds, delivered</p>
                    <h4 className="text-2xl font-extrabold tracking-tight text-slate-900">Good things<br /><span className="text-primary">start here.</span></h4>
                    <button onClick={() => navigate("/offers")} className="mt-1 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 transition hover:brightness-95 active:scale-95">Explore offers</button>
                  </div>
                  <div aria-hidden="true" className="absolute -right-8 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
                  <div aria-hidden="true" className="absolute -bottom-16 right-5 h-48 w-48 rounded-full border-[24px] border-emerald-500/5" />
                </div>
              )}
            </div>
          </motion.div>

          <PromoMarquee />
          {/* Header tabs use the in-page category browser below instead */}
          {!isHeaderTab && <QuickCategorySlider categories={effectiveQuickCategories} onCategoryClick={(id) => navigate(`/category/${id}`)} />}
          {headerTabEmpty}
          {isHeaderTab ? headerTabRows : (
            <div className="pt-1 md:pt-2">
              <LowestPriceSection products={tabProducts} onSeeAll={() => navigate("/category/all")} />
              <CategoryRails key={`${currentLocation?.latitude},${currentLocation?.longitude}`} categoryMap={categoryMap} latitude={currentLocation?.latitude} longitude={currentLocation?.longitude} onSeeAll={(id) => navigate(`/category/${id}`)} />
            </div>
          )}
          {adminSections}
        </>
      )}
    </div>
  );
};

export default Home;
