import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";
import ExperienceBannerCarousel from "./ExperienceBannerCarousel";
import { setJSON, STORAGE_KEYS } from "@core/utils/storage";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

const rememberExperienceReturn = (headerId, sectionId) =>
  setJSON(
    STORAGE_KEYS.EXPERIENCE_RETURN,
    { headerId: headerId || null, sectionId: sectionId || null },
    { storage: "session" },
  );

const LAZY_CHUNK_SIZE = 20;
const LAZY_ROOT_MARGIN = "260px 0px";

/**
 * Format section titles nicely (e.g. "buymee" -> "Buy Mee", "drop" -> "Drop")
 * using title-case.
 */
const formatSectionTitle = (rawTitle) => {
  if (!rawTitle) return "";
  const trimmed = rawTitle.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "buymee") return "Buy Mee";
  if (lower === "drop") return "Drop";
  if (trimmed === lower) {
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return trimmed;
};

/**
 * Section Header matching QuickCategorySlider and LowestPriceSection:
 * - Eyebrow label: uppercase tracking-[0.14em] text-primary
 * - Heading: font-extrabold tracking-tight text-[#183321]
 * - Rounded circular desktop navigation buttons
 * - "See all" pill button
 */
const SectionHeader = ({
  heading,
  onSeeAll,
  seeAllLabel = "See all",
  canScrollPrev = false,
  canScrollNext = false,
  onScrollPrev,
  onScrollNext,
}) => (
  <div className="flex items-center justify-between gap-3 mb-3 md:mb-5">
    <div>
      <h3 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#183321] leading-tight">
        {heading}
      </h3>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {/* Desktop Chevron Navigation Buttons (identical to DesktopQuickCategories) */}
      {onScrollPrev && onScrollNext && (
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={onScrollPrev}
            disabled={!canScrollPrev}
            aria-label="Scroll left"
            className={cn(
              "grid h-9 w-9 md:h-10 md:w-10 place-items-center rounded-full border bg-white transition duration-200 active:scale-95 shadow-xs",
              canScrollPrev
                ? "border-slate-200 text-slate-700 hover:border-primary/40 hover:text-primary cursor-pointer"
                : "border-slate-100 text-slate-300 cursor-not-allowed opacity-50"
            )}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            type="button"
            onClick={onScrollNext}
            disabled={!canScrollNext}
            aria-label="Scroll right"
            className={cn(
              "grid h-9 w-9 md:h-10 md:w-10 place-items-center rounded-full border bg-white transition duration-200 active:scale-95 shadow-xs",
              canScrollNext
                ? "border-slate-200 text-slate-700 hover:border-primary/40 hover:text-primary cursor-pointer"
                : "border-slate-100 text-slate-300 cursor-not-allowed opacity-50"
            )}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      )}

      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1 bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-full text-primary font-bold text-xs md:text-sm cursor-pointer shadow-xs border border-primary/20 transition hover:bg-primary/5 active:scale-95 whitespace-nowrap"
        >
          {seeAllLabel}
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  </div>
);

const LazyLoadTrigger = ({ enabled, onVisible }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      onVisible();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) onVisible();
        });
      },
      { root: null, rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onVisible]);
  return <div ref={ref} className="h-2 w-full" aria-hidden="true" />;
};

/**
 * Category & Subcategory Tile matching QuickCategorySlider:
 * - Image Container: rounded-2xl or rounded-full border border-[#e3eae0] bg-white p-1.5 shadow-[0_3px_10px_rgba(24,51,33,.06)]
 * - Hover: group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-md
 * - Label: text-xs md:text-sm font-semibold leading-tight text-slate-700 group-hover:text-primary line-clamp-2
 * - Fixed width and clamp to prevent horizontal text overlapping.
 */
const BrowseTile = ({ item, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full max-w-[110px] flex-col items-center gap-1 sm:gap-2 text-center cursor-pointer select-none"
    >
      <span className="relative grid aspect-square h-[52px] w-[52px] sm:h-[68px] sm:w-[68px] md:h-[82px] md:w-[82px] place-items-center overflow-hidden rounded-2xl border border-[#e3eae0] bg-white p-1 sm:p-1.5 shadow-[0_2px_8px_rgba(24,51,33,.05)] transition duration-200 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-md">
        {item.image && (
          <img
            src={applyCloudinaryTransform(item.image, "f_auto,q_auto,w_200")}
            alt={item.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="relative z-[1] h-full w-full rounded-xl object-cover transition-transform duration-200 group-hover:scale-105"
          />
        )}
      </span>
      <span className="w-full text-[10px] sm:text-xs md:text-sm font-semibold leading-tight text-slate-700 group-hover:text-primary line-clamp-2 transition-colors break-words px-0.5">
        {item.name}
      </span>
    </button>
  );
};

const getCategoryGridClass = (cols) => {
  switch (Number(cols)) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-2";
    case 3:
      return "grid-cols-3";
    case 4:
      return "grid-cols-4";
    case 5:
      return "grid-cols-5";
    case 6:
      return "grid-cols-3 sm:grid-cols-6";
    case 7:
      return "grid-cols-4 sm:grid-cols-7";
    case 8:
      return "grid-cols-4 sm:grid-cols-8";
    default:
      return "grid-cols-4";
  }
};

const BrowseSection = ({
  section,
  heading,
  items,
  columns: propColumns = 4,
  expanded = false,
  onToggle,
  onItemClick,
}) => {
  const configuredRows = Math.max(
    1,
    Math.floor(
      Number(
        section.config?.categories?.rows ||
        section.config?.subcategories?.rows ||
        1
      )
    )
  );
  const columns = Math.max(
    1,
    Math.floor(
      Number(
        propColumns ||
        section.config?.categories?.columns ||
        section.config?.subcategories?.columns ||
        4
      )
    )
  );

  const desktopLimit = columns * configuredRows;
  const canExpand = items.length > desktopLimit;

  // Strict admin-defined order (no randomization)
  const desktopItems = expanded ? items : items.slice(0, desktopLimit);

  const formattedHeading = formatSectionTitle(heading);

  return (
    <section id={`section-${section._id}`} className="w-full" aria-label={heading}>
      <div className="rounded-[22px] md:rounded-[24px] border border-[#e2e9df] bg-white shadow-[0_2px_12px_rgba(24,51,33,0.04)] p-3.5 sm:p-6 md:p-8">
        <SectionHeader
          heading={formattedHeading}
          onSeeAll={canExpand ? onToggle : undefined}
          seeAllLabel={expanded ? "Show less" : "See all"}
        />

        <div
          className={cn(
            "grid gap-2 sm:gap-4 md:gap-5 justify-items-center pt-1 w-full",
            getCategoryGridClass(columns)
          )}
          style={columns <= 5 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        >
          {desktopItems.map((item) => (
            <BrowseTile
              key={item._id}
              item={item}
              onClick={() => onItemClick(item)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const SectionRenderer = ({
  sections = [],
  productsById = {},
  categoriesById = {},
  subcategoriesById = {},
}) => {
  const navigate = useNavigate();
  const [sectionVisibleCounts, setSectionVisibleCounts] = useState({});
  const [expandedBrowseSections, setExpandedBrowseSections] = useState({});

  // Product carousel scroll state tracking
  const productScrollRefs = useRef({});
  const [productScrollStates, setProductScrollStates] = useState({});

  const updateProductScrollState = useCallback((key) => {
    const node = productScrollRefs.current[key];
    if (!node) return;
    const { scrollLeft, scrollWidth, clientWidth } = node;
    setProductScrollStates((prev) => ({
      ...prev,
      [key]: {
        canScrollPrev: scrollLeft > 10,
        canScrollNext: scrollLeft < scrollWidth - clientWidth - 10,
      },
    }));
  }, []);

  const loadMoreForSection = useCallback((sectionKey, totalCount) => {
    if (!sectionKey || totalCount <= 0) return;
    setSectionVisibleCounts((prev) => {
      const current = prev[sectionKey] ?? LAZY_CHUNK_SIZE;
      if (current >= totalCount) return prev;
      return {
        ...prev,
        [sectionKey]: Math.min(totalCount, current + LAZY_CHUNK_SIZE),
      };
    });
  }, []);

  const resolveVisibleCount = useCallback(
    (sectionKey, totalCount) => {
      const current = sectionVisibleCounts[sectionKey] ?? LAZY_CHUNK_SIZE;
      return Math.min(totalCount, current);
    },
    [sectionVisibleCounts]
  );

  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10 w-full">
      {sections.map((section, sectionIndex) => {
        const sectionKey = String(
          section?._id || section?.id || `${section?.displayType || "section"}-${sectionIndex}`
        );
        const heading = section.title;

        // 1. BANNER SECTIONS
        if (section.displayType === "banners") {
          const items = section.config?.banners?.items || [];
          if (!items.length) return null;
          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className={heading ? "w-full" : "-mt-8 md:-mt-8"}
            >
              {heading && <SectionHeader heading={formatSectionTitle(heading)} />}
              <ExperienceBannerCarousel section={section} items={items} />
            </div>
          );
        }

        // 2. CATEGORIES SECTIONS (e.g. "drop")
        if (section.displayType === "categories") {
          const ids = section.config?.categories?.categoryIds || [];
          const columns = Math.max(1, Math.floor(Number(section.config?.categories?.columns) || 4));
          const maxItems = Number(section.config?.categories?.maxItems);
          const allItems = ids
            .map((id) => categoriesById[id])
            .filter(Boolean);
          const items =
            Number.isFinite(maxItems) && maxItems > 0
              ? allItems.slice(0, Math.floor(maxItems))
              : allItems;
          if (!items.length) return null;

          const handleCategoryClick = (category) => {
            rememberExperienceReturn(section.headerId, section._id);
            navigate(`/category/${category._id}`);
          };

          return (
            <BrowseSection
              key={section._id || sectionKey}
              section={section}
              heading={heading}
              items={items}
              columns={columns}
              expanded={!!expandedBrowseSections[sectionKey]}
              onToggle={() =>
                setExpandedBrowseSections((previous) => ({
                  ...previous,
                  [sectionKey]: !previous[sectionKey],
                }))
              }
              onItemClick={handleCategoryClick}
            />
          );
        }

        // 3. SUBCATEGORIES SECTIONS (e.g. "buymee")
        if (section.displayType === "subcategories") {
          const ids = section.config?.subcategories?.subcategoryIds || [];
          const columns = Math.max(1, Math.floor(Number(section.config?.subcategories?.columns) || 4));
          const allItems = ids
            .map((id) => subcategoriesById[id])
            .filter(Boolean);
          if (!allItems.length) return null;

          const handleSubcategoryClick = (subcategory) => {
            rememberExperienceReturn(section.headerId, section._id);
            const parentId =
              subcategory.parentId?._id ||
              subcategory.parentId ||
              subcategory.categoryId?._id ||
              subcategory.categoryId;
            navigate(
              parentId ? `/category/${parentId}` : `/category/${subcategory._id}`,
              parentId ? { state: { activeSubcategoryId: subcategory._id } } : undefined
            );
          };

          return (
            <BrowseSection
              key={section._id || sectionKey}
              section={section}
              heading={heading}
              items={allItems}
              columns={columns}
              expanded={!!expandedBrowseSections[sectionKey]}
              onToggle={() =>
                setExpandedBrowseSections((previous) => ({
                  ...previous,
                  [sectionKey]: !previous[sectionKey],
                }))
              }
              onItemClick={handleSubcategoryClick}
            />
          );
        }

        // 4. PRODUCTS SECTIONS
        if (section.displayType === "products") {
          const productConfig = section.config?.products || {};
          const ids = productConfig.productIds || [];
          const rows = Math.max(1, Math.floor(Number(productConfig.rows) || 1));
          const columns = Math.min(6, Math.max(1, Math.floor(Number(productConfig.columns) || 2)));
          const singleRowScrollable = !!productConfig.singleRowScrollable;

          let allProducts;

          if (ids.length) {
            allProducts = ids.map((id) => productsById[id]).filter(Boolean);
          } else {
            const categoryFilter = productConfig.categoryIds || [];
            const subcategoryFilter = productConfig.subcategoryIds || [];
            const hasCategoryFilter = categoryFilter.length > 0;
            const hasSubcategoryFilter = subcategoryFilter.length > 0;
            const all = Object.values(productsById);
            const filtered = all.filter((p) => {
              const catId = p.categoryId?._id || p.categoryId;
              const subId = p.subcategoryId?._id || p.subcategoryId;
              const matchesCategory = hasCategoryFilter ? categoryFilter.includes(catId) : true;
              const matchesSubcategory = hasSubcategoryFilter ? subcategoryFilter.includes(subId) : true;
              return matchesCategory && matchesSubcategory;
            });
            allProducts = filtered;
          }

          if (!allProducts.length) return null;

          // Single row horizontal scrollable products
          if (singleRowScrollable) {
            const visibleCount = resolveVisibleCount(sectionKey, allProducts.length);
            const items = allProducts.slice(0, visibleCount);
            const hasMore = items.length < allProducts.length;

            const scrollState = productScrollStates[sectionKey] || {};

            const handleProductScrollPrev = () => {
              const node = productScrollRefs.current[sectionKey];
              if (node) node.scrollBy({ left: -360, behavior: "smooth" });
            };

            const handleProductScrollNext = () => {
              const node = productScrollRefs.current[sectionKey];
              if (node) node.scrollBy({ left: 360, behavior: "smooth" });
            };

            return (
              <div
                key={section._id || sectionKey}
                id={`section-${section._id}`}
                className="w-full"
              >
                <div className="rounded-[22px] md:rounded-[24px] border border-[#e2e9df] bg-white shadow-[0_2px_12px_rgba(24,51,33,0.04)] p-2.5 sm:p-6 md:p-8">
                  <SectionHeader
                    heading={formatSectionTitle(heading) || "Featured Products"}
                    canScrollPrev={scrollState.canScrollPrev}
                    canScrollNext={scrollState.canScrollNext}
                    onScrollPrev={handleProductScrollPrev}
                    onScrollNext={handleProductScrollNext}
                  />

                  {/* Mobile View: Slide from left to right, 3 products per row */}
                  <div
                    onScroll={(e) => {
                      if (!hasMore) return;
                      const node = e.currentTarget;
                      const distanceToEnd = node.scrollWidth - node.scrollLeft - node.clientWidth;
                      if (distanceToEnd < 240) loadMoreForSection(sectionKey, allProducts.length);
                    }}
                    className="flex md:hidden overflow-x-auto gap-2 pb-2 pt-1 no-scrollbar scroll-smooth snap-x snap-mandatory"
                  >
                    {items.map((product) => (
                      <div
                        key={product._id || product.id}
                        className="w-[calc((100%-16px)/3)] shrink-0 snap-start"
                      >
                        <ProductCard product={product} compact={true} neutralBg={true} />
                      </div>
                    ))}
                  </div>

                  {/* Desktop View: Horizontal scrollable rail */}
                  <div
                    ref={(el) => {
                      productScrollRefs.current[sectionKey] = el;
                    }}
                    onScroll={(e) => {
                      updateProductScrollState(sectionKey);
                      if (!hasMore) return;
                      const node = e.currentTarget;
                      const distanceToEnd = node.scrollWidth - node.scrollLeft - node.clientWidth;
                      if (distanceToEnd < 240) loadMoreForSection(sectionKey, allProducts.length);
                    }}
                    className="hidden md:flex relative z-10 overflow-x-auto gap-3 sm:gap-4 md:gap-5 pb-3 pt-1 no-scrollbar scroll-smooth snap-x snap-mandatory"
                  >
                    {items.map((product) => (
                      <div
                        key={product._id || product.id}
                        className="customer-product-rail-item w-[156px] md:w-[185px] shrink-0 snap-start"
                      >
                        <ProductCard product={product} compact={true} neutralBg={true} />
                      </div>
                    ))}
                  </div>

                  <LazyLoadTrigger
                    enabled={hasMore}
                    onVisible={() => loadMoreForSection(sectionKey, allProducts.length)}
                  />
                </div>
              </div>
            );
          }

          // Grid products strictly respecting rows and columns
          const layoutCount = rows * columns;
          const cappedItems = allProducts.slice(0, layoutCount);
          const visibleCount = resolveVisibleCount(sectionKey, cappedItems.length);
          const items = cappedItems.slice(0, visibleCount);
          const hasMore = items.length < cappedItems.length;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="w-full"
            >
              <div className="rounded-[22px] md:rounded-[24px] border border-[#e2e9df] bg-white shadow-[0_2px_12px_rgba(24,51,33,0.04)] p-2.5 sm:p-6 md:p-8">
                <SectionHeader
                  heading={formatSectionTitle(heading) || "Featured Products"}
                />

                {/* Mobile View: Slide from left to right, 3 products per row */}
                <div
                  className="grid md:hidden grid-flow-col gap-2 pt-1 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pb-2"
                  style={{
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    gridAutoColumns: "calc((100% - 16px) / 3)",
                  }}
                >
                  {items.map((product) => (
                    <div
                      key={product._id || product.id}
                      className="w-full shrink-0 snap-start"
                    >
                      <ProductCard product={product} compact={true} neutralBg={true} />
                    </div>
                  ))}
                </div>

                {/* Desktop View: Grid strictly adhering to configured columns */}
                <div
                  className={cn(
                    "hidden md:grid gap-4 lg:gap-5 pt-1",
                    columns === 1
                      ? "md:grid-cols-1"
                      : columns === 2
                      ? "md:grid-cols-2"
                      : columns === 3
                      ? "md:grid-cols-3"
                      : columns === 4
                      ? "md:grid-cols-4"
                      : columns === 5
                      ? "md:grid-cols-5"
                      : "md:grid-cols-6"
                  )}
                >
                  {items.map((product) => (
                    <div
                      key={product._id || product.id}
                      className="transition-transform duration-200 hover:-translate-y-1"
                    >
                      <ProductCard product={product} compact={true} neutralBg={true} />
                    </div>
                  ))}
                </div>

                <LazyLoadTrigger
                  enabled={hasMore}
                  onVisible={() => loadMoreForSection(sectionKey, cappedItems.length)}
                />
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default SectionRenderer;
