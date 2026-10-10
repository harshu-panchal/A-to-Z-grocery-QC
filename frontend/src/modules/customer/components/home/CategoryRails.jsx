import React, { useEffect, useMemo, useRef, useState } from "react";
import ProductRail from "./ProductRail";
import { customerApi } from "../../services/customerApi";
import { onlyInStock } from "../../utils/stock";

const MIN_PRODUCTS = 3;
const MAX_RAILS = 4;
const PER_RAIL = 12;
const PREFETCH_MARGIN = "500px 0px";

// Friendly shelf names for known categories (matched on the category name).
// Known grocery shelves come first; other categories follow under their own
// name, so a new category (e.g. snacks) gets a shelf as soon as it has stock.
const RAIL_COPY = [
  { match: /fruit|vegetable/i, title: "Your Daily Fresh Needs", subtitle: "Fresh-picked fruits & vegetables" },
  { match: /snack|chip|namkeen|biscuit|sweet|chocolate|drink|beverage/i, title: "Snack It Away", subtitle: "Chips, namkeen, cold drinks & sweets" },
  { match: /dairy|bread|milk|egg/i, title: "Morning Essentials", subtitle: "Milk, bread & breakfast basics" },
  { match: /masala|spice/i, title: "Spice Up Your Kitchen", subtitle: "Whole & ground masalas" },
  { match: /aata|atta|dal|rice|flour|grain/i, title: "Pantry Staples", subtitle: "Aata, dal & rice for every day" },
];

const copyIndex = (name) => RAIL_COPY.findIndex((c) => c.match.test(name || ""));

const toCardProduct = (p) => ({
  ...p,
  id: p._id,
  image: p.mainImage || p.image || null,
  price: p.sellingPrice || p.mrp,
  originalPrice: p.mrp,
  weight: p.weight || "1 unit",
  deliveryTime: "8-15 mins",
});

/**
 * Fetches one category's products the first time it gets near the viewport,
 * then reports back so the next shelf can start. Renders nothing until it
 * has enough in-stock products.
 */
const LazyCategoryRail = ({ category, location, onSeeAll, onSettled }) => {
  const sentinelRef = useRef(null);
  const [products, setProducts] = useState(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || products) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const params = { categoryId: category._id, limit: PER_RAIL };
        if (location) {
          params.lat = location.lat;
          params.lng = location.lng;
        }
        const res = await customerApi.getProducts(params);
        const raw = res?.data?.result?.items || res?.data?.results || [];
        if (!cancelled) setProducts(onlyInStock(raw.map(toCardProduct)));
      } catch {
        if (!cancelled) setProducts([]);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [category._id, location, products]);

  const shown = products && products.length >= MIN_PRODUCTS;
  useEffect(() => {
    if (products) onSettled(category._id, shown);
  }, [products, shown, category._id, onSettled]);

  if (!products) return <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />;
  if (!shown) return null;

  const copy = RAIL_COPY[copyIndex(category.name)] || {
    title: category.name,
    subtitle: `${products.length} items available now`,
  };
  return (
    <ProductRail
      id={category._id}
      title={copy.title}
      subtitle={copy.subtitle}
      products={products}
      onSeeAll={() => onSeeAll(category._id)}
    />
  );
};

/** Category shelves for the home "All" tab, loaded one by one as the user scrolls. */
const CategoryRails = ({ categoryMap, latitude, longitude, onSeeAll }) => {
  const candidates = useMemo(() => {
    const list = Object.values(categoryMap || {}).filter((c) => c?._id && c.name);
    // known grocery shelves first (in RAIL_COPY order), then the rest by name
    return list.sort((a, b) => {
      const ia = copyIndex(a.name), ib = copyIndex(b.name);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.name.localeCompare(b.name);
    });
  }, [categoryMap]);

  const location = useMemo(
    () => (Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null),
    [latitude, longitude],
  );

  // mount shelves one at a time: next one starts after the previous settled
  const [settled, setSettled] = useState({});
  const onSettled = React.useCallback((id, shown) => {
    setSettled((prev) => (prev[id] === shown ? prev : { ...prev, [id]: shown }));
  }, []);


  if (!candidates.length) return null;

  const mounted = [];
  let shownCount = 0;
  for (const cat of candidates) {
    if (shownCount >= MAX_RAILS) break;
    mounted.push(cat);
    if (!(cat._id in settled)) break; // wait for this one before mounting the next
    if (settled[cat._id]) shownCount += 1;
  }

  return (
    <div className="container mx-auto px-0 md:px-8 lg:px-[50px]">
      {mounted.map((cat) => (
        <LazyCategoryRail
          key={cat._id}
          category={cat}
          location={location}
          onSeeAll={onSeeAll}
          onSettled={onSettled}
        />
      ))}
    </div>
  );
};

export default React.memo(CategoryRails);
