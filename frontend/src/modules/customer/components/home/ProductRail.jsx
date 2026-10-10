import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";

const MAX_ITEMS = 12;

/**
 * One horizontal product shelf: title (+ optional badge), one-line subtitle,
 * "See all", and a snap-scrolling row of product cards.
 *
 * Kept light on purpose:
 * - `content-visibility: auto` lets the browser skip layout/paint for shelves
 *   that are still below the fold (cheap way to keep long home pages fast).
 * - Desktop arrows only render on pointer devices and only when the row can
 *   actually scroll in that direction.
 */
const ProductRail = ({ id, title, badge, subtitle, products, onSeeAll, accent = "default" }) => {
  const scrollerRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setEdges({ start: node.scrollLeft <= 4, end: node.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(node);
    return () => ro.disconnect();
  }, [updateEdges, products]);

  const scrollByPage = (dir) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: dir * Math.max(240, node.clientWidth * 0.8), behavior: "smooth" });
  };

  if (!products || products.length === 0) return null;
  const items = products.slice(0, MAX_ITEMS);
  const headingId = id ? `rail-${id}` : undefined;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "group/rail relative mx-3 mb-3 overflow-hidden rounded-2xl border bg-white py-3.5 md:mx-0 md:mb-5 md:py-5",
        "[content-visibility:auto] [contain-intrinsic-size:auto_320px]",
        accent === "deal" ? "border-amber-100" : "border-slate-100",
      )}
    >
      {accent === "deal" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-amber-50 to-transparent"
        />
      )}

      <header className="relative mb-3 flex items-start justify-between gap-3 px-3.5 md:mb-4 md:px-5">
        <div className="min-w-0">
          <h3
            id={headingId}
            className="flex items-center gap-1.5 text-[15px] font-extrabold leading-tight tracking-tight text-slate-900 md:text-lg"
          >
            <span className="truncate">{title}</span>
            {badge && (
              <span className="shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-white">
                {badge}
              </span>
            )}
          </h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 md:text-xs">{subtitle}</p>
          )}
        </div>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex shrink-0 items-center gap-0.5 rounded-full px-1 py-1 text-xs font-bold text-primary transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-primary md:text-sm"
          >
            See all
            <ChevronRight size={14} strokeWidth={2.75} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth px-3.5 pb-1 scroll-pl-3.5 md:gap-3.5 md:px-5 md:scroll-pl-5"
        >
          {items.map((product) => (
            <div
              key={product.id || product._id}
              className="w-[128px] shrink-0 snap-start sm:w-[138px] md:w-[156px]"
            >
              <ProductCard
                product={product}
                compact
                className="h-full border-slate-100 shadow-none transition-shadow duration-300 hover:shadow-[0_10px_24px_-12px_rgba(15,23,42,0.25)]"
              />
            </div>
          ))}
          {/* trailing spacer so the last card can snap fully into view */}
          <div aria-hidden="true" className="w-1 shrink-0" />
        </div>

        {/* desktop-only arrows (hidden on touch devices) */}
        {!edges.start && (
          <button
            type="button"
            aria-label={`Scroll ${title} back`}
            onClick={() => scrollByPage(-1)}
            className="absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 opacity-0 shadow-md transition-opacity duration-200 group-hover/rail:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
        )}
        {!edges.end && (
          <button
            type="button"
            aria-label={`Scroll ${title} forward`}
            onClick={() => scrollByPage(1)}
            className="absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 opacity-0 shadow-md transition-opacity duration-200 group-hover/rail:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex"
          >
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </section>
  );
};

export default React.memo(ProductRail);
