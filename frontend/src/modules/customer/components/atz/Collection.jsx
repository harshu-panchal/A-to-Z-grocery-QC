import AtzIcon from "./AtzIcon";
import ProductCard from "../shared/ProductCard";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

/** Design "Trending right now" block: blue/yellow banner, then a scrolling row of products. */
const Collection = ({ tone, title, subtitle, image, products = [] }) => {
  if (!products.length) return null;
  const bannerImage = image || products[0]?.image;

  return (
    <section className="collection">
      <div className={`collection-banner ${tone}`}>
        <div>
          <span className="eyebrow"><AtzIcon name="spark" size={11} /> Trending right now</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {bannerImage && <img src={applyCloudinaryTransform(bannerImage, "f_auto,q_auto,w_120")} alt="" />}
      </div>
      <div className="product-row">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
};

export default Collection;
