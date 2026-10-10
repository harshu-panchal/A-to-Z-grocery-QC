import React, { useMemo, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";

const FALLBACK_ICON = "https://cdn-icons-png.flaticon.com/128/2321/2321831.png";
const MIXED_LIMIT = 12;

/** Round-robin across categories so the "All" grid is a real mix, not category blocks. */
function interleave(groups) {
  const out = [];
  const max = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < max; i += 1) {
    for (const g of groups) if (g[i]) out.push(g[i]);
  }
  return out;
}

const SectionHeader = ({ title, icon, onSeeAll }) => (
  <div className="mb-3 flex items-center justify-between px-1">
    <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900 md:text-xl">
      {icon}
      {title}
    </h3>
    {onSeeAll && (
      <button
        type="button"
        onClick={onSeeAll}
        className="flex items-center gap-0.5 rounded-full border border-primary/10 bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm active:scale-95 md:text-sm">
        See all
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    )}
  </div>
);

const ProductGrid = ({ items }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
    {items.map((product) => (
      <ProductCard key={product.id} product={product} compact={true} />
    ))}
  </div>
);

// Flipkart-style browser for a header tab: level-2 category tiles on top.
// "All" = mixed products from every level-2 category + Trending in this header.
// A tile = grid of that category's products.
const CategoryProductRows = ({ categories, products, trendingProducts = [], onSeeAll, onSeeAllHeader }) => {
  const [selectedId, setSelectedId] = useState("all");

  const productsByCategory = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      const catId = String(p.categoryId?._id || p.categoryId || "");
      if (!catId) return;
      (map[catId] = map[catId] || []).push(p);
    });
    return map;
  }, [products]);

  const mixedProducts = useMemo(
    () => interleave((categories || []).map((c) => productsByCategory[String(c.id)] || [])),
    [categories, productsByCategory]
  );

  if (!categories || categories.length === 0) return null;

  const selected = categories.find((c) => String(c.id) === String(selectedId));
  const selectedItems = selected ? productsByCategory[String(selected.id)] || [] : [];
  const tiles = [{ id: "all", name: "All", image: FALLBACK_ICON }, ...categories];

  return (
    <div className="container mx-auto px-4 md:px-8 lg:px-[50px] pt-2 pb-6">
      {/* Level-2 category tiles */}
      <div className="flex overflow-x-auto gap-3 md:gap-5 pb-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x">
        {tiles.map((cat) => {
          const isActive = String(selectedId) === String(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedId(cat.id)}
              aria-pressed={isActive}
              className="flex flex-col items-center gap-1.5 w-[68px] md:w-[84px] shrink-0 snap-start focus:outline-none">
              <div
                className={cn(
                  "w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white border-2 flex items-center justify-center overflow-hidden p-1.5 transition-all",
                  isActive ? "border-primary shadow-md scale-105" : "border-slate-100"
                )}>
                <img src={cat.image || FALLBACK_ICON} alt="" loading="lazy" className="w-full h-full object-contain" />
              </div>
              <span
                className={cn(
                  "text-[11px] md:text-xs font-semibold text-center leading-tight line-clamp-2",
                  isActive ? "text-primary" : "text-slate-700"
                )}>
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <section className="mt-3">
          <SectionHeader title={selected.name} onSeeAll={() => onSeeAll(selected.id)} />
          {selectedItems.length ? (
            <ProductGrid items={selectedItems} />
          ) : (
            <p className="py-10 text-center text-sm font-semibold text-slate-500">No products in {selected.name} yet</p>
          )}
        </section>
      ) : (
        <div className="mt-3 space-y-8">
          {mixedProducts.length > 0 && (
            <section>
              <SectionHeader
                title="Top picks for you"
                onSeeAll={mixedProducts.length > MIXED_LIMIT ? onSeeAllHeader : undefined}
              />
              <ProductGrid items={mixedProducts.slice(0, MIXED_LIMIT)} />
            </section>
          )}

          {trendingProducts.length > 0 && (
            <section>
              <SectionHeader
                title="Trending now"
                icon={<Flame size={18} className="text-orange-500" aria-hidden="true" />}
              />
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-4 md:px-0">
                {trendingProducts.slice(0, 12).map((product, index) => (
                  <div key={product.id} className="relative w-[140px] shrink-0 snap-start pt-2 md:w-[160px]">
                    {/* top-centre so it doesn't cover the discount badge (left) or wishlist (right) */}
                    <span className="absolute left-1/2 top-0 z-20 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full bg-orange-500 px-2 text-[11px] font-bold text-white shadow">
                      #{index + 1}
                    </span>
                    <ProductCard product={product} compact={true} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CategoryProductRows);
