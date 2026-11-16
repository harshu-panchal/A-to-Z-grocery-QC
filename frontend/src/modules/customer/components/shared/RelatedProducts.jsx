import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { useLocation as useAppLocation } from "../../context/LocationContext";
import ProductCard from "./ProductCard";
import { cn } from "@/lib/utils";

const extractId = (field) => {
  if (!field) return "";
  if (typeof field === "object") return String(field._id || field.id || "");
  return String(field);
};

const idOf = (p) => String(p?._id || p?.id || "");

const fetchItems = async (params) => {
  const res = await customerApi.getProducts(params);
  if (!res.data.success) return [];
  const payload = res.data.result || {};
  return Array.isArray(payload.items) ? payload.items : res.data.results || [];
};

const toCard = (p) => ({
  ...p,
  id: idOf(p),
  image: p.mainImage || p.image,
  price:
    p.sellingPrice && p.sellingPrice < p.mrp
      ? p.sellingPrice
      : p.mrp || p.sellingPrice || 0,
  originalPrice: p.mrp || 0,
});

const ProductRail = ({ title, items }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollButtons();
  }, [items]);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  };

  const arrowClass = (enabled) =>
    cn(
      "h-9 w-9 rounded-full border border-slate-200 grid place-items-center transition-all",
      enabled
        ? "bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
        : "bg-slate-50 text-slate-300 cursor-not-allowed"
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-lg md:text-2xl font-black text-slate-800">{title}</h3>
        <div className="hidden md:flex items-center gap-2">
          <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} disabled={!canScrollLeft} className={arrowClass(canScrollLeft)}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} disabled={!canScrollRight} className={arrowClass(canScrollRight)}>
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2 -mx-1 px-1"
      >
        {items.map((p) => (
          <div key={p.id} className="flex-shrink-0 w-[140px] md:w-[190px]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
};

const RelatedProducts = ({ product, className }) => {
  const { currentLocation } = useAppLocation();

  const productId = idOf(product);
  const subcategoryId = extractId(product?.subcategoryId);
  const categoryId = extractId(product?.categoryId);
  const headerId = extractId(product?.headerId);
  const sellerId = extractId(product?.sellerId);
  const shopName =
    (typeof product?.sellerId === "object" && product.sellerId?.shopName) ||
    product?.store?.shopName ||
    "";

  const hasValidLocation =
    Number.isFinite(currentLocation?.latitude) &&
    Number.isFinite(currentLocation?.longitude);
  const geo = hasValidLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : {};
  const geoKey = hasValidLocation
    ? `${currentLocation.latitude},${currentLocation.longitude}`
    : "";

  const { data: boughtWith = [] } = useQuery({
    queryKey: ["customer", "related", "boughtWith", productId, geoKey],
    queryFn: () => fetchItems({ ...geo, limit: 12, boughtWith: productId }),
    enabled: !!productId,
    staleTime: 5 * 60_000,
  });

  const { data: similar = [] } = useQuery({
    queryKey: ["customer", "related", "similar", productId, subcategoryId, categoryId, headerId, geoKey],
    queryFn: async () => {
      const results = [];
      const seen = new Set([productId]);
      const levels = [
        subcategoryId && { subcategory: subcategoryId },
        categoryId && { category: categoryId },
        headerId && { header: headerId },
      ].filter(Boolean);
      for (const filter of levels) {
        if (results.length >= 4) break;
        for (const item of await fetchItems({ ...geo, limit: 12, ...filter })) {
          if (!seen.has(idOf(item))) {
            seen.add(idOf(item));
            results.push(item);
          }
        }
      }
      return results;
    },
    enabled: !!productId && !!(subcategoryId || categoryId || headerId),
    staleTime: 60_000,
  });

  const { data: fromStore = [] } = useQuery({
    queryKey: ["customer", "related", "store", sellerId, geoKey],
    queryFn: () => fetchItems({ ...geo, limit: 12, sellerId }),
    enabled: !!sellerId,
    staleTime: 60_000,
  });

  const trendingFilter = categoryId
    ? { category: categoryId }
    : headerId
      ? { header: headerId }
      : null;
  const { data: trending = [] } = useQuery({
    queryKey: ["customer", "related", "trending", categoryId || headerId, geoKey],
    queryFn: () => fetchItems({ ...geo, limit: 12, sort: "trending", ...trendingFilter }),
    enabled: !!trendingFilter,
    staleTime: 5 * 60_000,
  });

  // Earlier rails win: a product is shown in at most one rail.
  const seen = new Set([productId]);
  const take = (list) =>
    list
      .filter((p) => {
        const id = idOf(p);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 10)
      .map(toCard);

  const rails = [
    { key: "boughtWith", title: "Frequently Bought Together", items: take(boughtWith) },
    { key: "similar", title: "You May Also Like", items: take(similar) },
    { key: "store", title: shopName ? `More From ${shopName}` : "More From This Store", items: take(fromStore) },
    { key: "trending", title: "Trending in This Category", items: take(trending) },
  ].filter((r) => r.items.length > 0);

  if (rails.length === 0) return null;

  return (
    <div className={cn("space-y-8 md:space-y-10", className)}>
      {rails.map((r) => (
        <ProductRail key={r.key} title={r.title} items={r.items} />
      ))}
    </div>
  );
};

export default RelatedProducts;
