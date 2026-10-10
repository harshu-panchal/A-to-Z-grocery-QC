import AtzIcon from "./AtzIcon";
import ProductCard from "../shared/ProductCard";

/** Design product shelf: heading + "See all" + scrolling row of cards. */
const Shelf = ({ className = "shelf", title, subtitle, onSeeAll, products = [] }) => {
  if (!products.length) return null;
  return (
    <section className={className}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll}>
            See all <AtzIcon name="arrow" size={13} />
          </button>
        )}
      </div>
      <div className="product-row">
        {products.slice(0, 12).map((p) => <ProductCard key={p.id || p._id} product={p} />)}
      </div>
    </section>
  );
};

export default Shelf;
