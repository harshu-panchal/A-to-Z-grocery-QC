import React, { useMemo } from "react";
import ProductRail from "./ProductRail";
import { onlyInStock } from "../../utils/stock";

const savingPct = (p) => {
  const mrp = Number(p.originalPrice ?? p.mrp) || 0;
  const price = Number(p.price ?? p.sellingPrice) || 0;
  return mrp > price && mrp > 0 ? (mrp - price) / mrp : 0;
};

/** "Lowest Price Ever" shelf: biggest discounts first. */
const LowestPriceSection = ({ products, onSeeAll }) => {
  const deals = useMemo(
    () => [...onlyInStock(products || [])].sort((a, b) => savingPct(b) - savingPct(a)),
    [products],
  );

  if (!deals.length) return null;

  return (
    <div className="container mx-auto px-0 md:px-8 lg:px-[50px]">
      <ProductRail
        id="lowest-price"
        title="Lowest Price Ever"
        badge="Hot"
        subtitle="Unbeatable savings · updated hourly"
        products={deals}
        onSeeAll={onSeeAll}
        accent="deal"
      />
    </div>
  );
};

export default React.memo(LowestPriceSection);
