import React from "react";
import { useLocation } from "react-router-dom";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "@shared/components/ui/Toast";
import { useCartAnimation } from "../../context/CartAnimationContext";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";


import { useProductDetail } from "../../context/ProductDetailContext";
import { isProductOutOfStock, isVariantOutOfStock } from "../../utils/stock";
import AtzIcon from "../atz/AtzIcon";
import "../atz/atz.css";

const ProductCard = React.memo(
  ({ product, badge, className }) => {
    const { toggleWishlist: toggleWishlistGlobal, isInWishlist } =
      useWishlist();
    const { cart, addToCart, updateQuantity, removeFromCart, getAvailableStock } = useCart();
    const { showToast } = useToast();
    const { animateAddToCart, animateRemoveFromCart } = useCartAnimation();

    const { openProduct } = useProductDetail();
    
    const location = useLocation();
    const isWishlistPage = location.pathname === '/wishlist';

    const imageRef = React.useRef(null);

    const defaultVariant = React.useMemo(() => {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      if (variants.length === 0) return null;

      const displayed = Number(product?.price || 0);
      const displayedOriginal = Number(product?.originalPrice || 0);

      const matchesDisplayedPrice = (variant) => {
        const mrp = Number(variant?.mrp || 0);
        const sale = Number(variant?.sellingPrice || 0);
        const effective = sale > 0 && sale < mrp ? sale : mrp;

        if (Number.isFinite(displayedOriginal) && displayedOriginal > displayed) {
          // Try to match both (sale + original) when card shows a discount.
          if (effective === displayed && (mrp === displayedOriginal || displayedOriginal === 0)) {
            return true;
          }
        }

        return effective === displayed || mrp === displayed;
      };

      // Show a size the customer can actually buy: prefer the price-matching
      // variant only if it's in stock, otherwise the first in-stock variant;
      // fall back to sold-out sizes only when every size is sold out.
      const inStock = variants.filter((v) => !isVariantOutOfStock(v));
      const pool = inStock.length ? inStock : variants;
      const priceMatch = pool.find(matchesDisplayedPrice);
      const picked = priceMatch || pool[0];
      const key = String(picked?.sku || picked?.name || "").trim();

      const variantMrp = Number(picked?.mrp || 0);
      const variantSale = Number(picked?.sellingPrice || 0);
      const hasDiscount = variantSale > 0 && variantSale < variantMrp;
      // The product-level original price only describes the price-matching variant
      const fallbackOriginal = priceMatch && displayedOriginal > displayed ? displayedOriginal : null;

      return {
        key,
        name: String(picked?.name || "").trim(),
        displayPrice: hasDiscount ? variantSale : (variantMrp || displayed),
        displayOriginalPrice: hasDiscount ? variantMrp : fallbackOriginal,
        discountPercent: hasDiscount ? Math.round(((variantMrp - variantSale) / variantMrp) * 100) : (fallbackOriginal ? Math.round(((fallbackOriginal - displayed) / fallbackOriginal) * 100) : 0)
      };
    }, [product]);

    const productId = product.id || product._id;
    const variantKey = String(defaultVariant?.key || "").trim();
    const cartKey = `${productId}::${variantKey || ""}`;

    const cartItem = React.useMemo(
      () =>
        cart.find(
          (item) =>
            `${item.id || item._id}::${String(item.variantSku || "").trim()}` ===
            cartKey,
        ),
      [cart, cartKey],
    );
    const quantity = cartItem ? cartItem.quantity : 0;
    const maxQuantity = getAvailableStock(cartItem ? { ...product, ...cartItem } : product, variantKey);

    // Main image + gallery, browsable with the arrows on the card
    const images = React.useMemo(() => {
      const list = [product.image || product.mainImage, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])];
      return [...new Set(list.filter(Boolean))];
    }, [product.image, product.mainImage, product.galleryImages]);
    const [imageIndex, setImageIndex] = React.useState(0);
    const currentImage = images[imageIndex] || images[0];
    const slideImage = (step) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      setImageIndex((i) => (i + step + images.length) % images.length);
    };
    const isWishlisted = isInWishlist(product.id || product._id);

    const handleProductClick = React.useCallback(
      (e) => {
        if (openProduct) {
          e.preventDefault();
          openProduct(product);
        }
      },
      [openProduct, product],
    );

    const toggleWishlist = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        toggleWishlistGlobal(product);
        showToast(
          isWishlisted
            ? `${product.name} removed from wishlist`
            : `${product.name} added to wishlist`,
          isWishlisted ? "info" : "success",
        );
      },
      [isWishlisted, toggleWishlistGlobal, product, showToast],
    );

    const handleAddToCart = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        // If the product has multiple variants, open the product detail sheet
        // so the user can select which variant they want to add.
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        if (variants.length > 1 && openProduct) {
          openProduct(product);
          return;
        }

        if (imageRef.current) {
          animateAddToCart(
            imageRef.current.getBoundingClientRect(),
            product.image,
          );
        }
        addToCart({
          ...product,
          variantSku: variantKey,
          variantName: defaultVariant?.name || "",
        });
        
        if (isWishlistPage && isWishlisted) {
          toggleWishlistGlobal(product);
        }
      },
      [animateAddToCart, product, addToCart, variantKey, defaultVariant?.name, openProduct, isWishlistPage, isWishlisted, toggleWishlistGlobal],
    );

    const handleIncrement = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateQuantity(productId, 1, variantKey);
      },
      [updateQuantity, productId, variantKey],
    );

    const handleDecrement = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (quantity === 1) {
          animateRemoveFromCart(product.image);
          removeFromCart(productId, variantKey);
        } else {
          updateQuantity(productId, -1, variantKey);
        }
      },
      [
        quantity,
        animateRemoveFromCart,
        product.image,
        removeFromCart,
        productId,
        updateQuantity,
        variantKey,
      ],
    );

    // Fall back to the cheapest variant price when the product has no top-level price
    const lowestVariantPrice = (Array.isArray(product?.variants) ? product.variants : [])
      .map((v) => Number(v?.sellingPrice) || Number(v?.mrp) || 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b)[0];
    const price = defaultVariant?.displayPrice || product.price || lowestVariantPrice;
    const formatRupees = (n) => Number(n).toLocaleString("en-IN");
    const mrp = defaultVariant?.displayOriginalPrice;
    const outOfStock = isProductOutOfStock(product);
    const badgeText =
      badge ||
      product.discount ||
      (defaultVariant?.discountPercent > 0 ? `${defaultVariant.discountPercent}% OFF` : null);

    // Design card (styles in components/atz/atz.css)
    return (
      <article className={cn("atz product-card", outOfStock && "sold-out", className)} onClick={handleProductClick}>
        <div className="product-visual">
          {badgeText && !outOfStock && <span className="discount">{badgeText}</span>}
          <button
            type="button"
            className={cn("favorite", isWishlisted && "saved")}
            aria-label={`${isWishlisted ? "Unsave" : "Save"} ${product.name}`}
            aria-pressed={isWishlisted}
            onClick={toggleWishlist}>
            <AtzIcon name="heart" size={17} />
          </button>
          {currentImage ? (
            <img ref={imageRef} src={applyCloudinaryTransform(currentImage)} alt={product.name} loading="lazy" />
          ) : (
            <Package ref={imageRef} size={32} strokeWidth={1.5} className="text-slate-300" aria-label={product.name} />
          )}
          {images.length > 1 && (
            <>
              <button type="button" className="img-arrow prev" aria-label="Previous image" onClick={slideImage(-1)}>‹</button>
              <button type="button" className="img-arrow next" aria-label="Next image" onClick={slideImage(1)}>›</button>
            </>
          )}
        </div>
        <span className="delivery-time">
          <AtzIcon name="truck" size={12} /> {outOfStock ? "Currently unavailable" : (product.deliveryTime || "8–15 mins")}
        </span>
        <h3>{product.name}</h3>
        <p className="unit">{defaultVariant?.name || product.weight || "1 unit"}</p>
        <div className="product-bottom">
          <div>
            {price ? <strong>₹{formatRupees(price)}</strong> : <span className="unit">See options</span>}
            {mrp && <del>₹{formatRupees(mrp)}</del>}
          </div>
          {quantity > 0 ? (
            <div className="quantity" role="group" aria-label={`${product.name} quantity`}>
              <button type="button" aria-label={`Remove one ${product.name}`} onClick={handleDecrement}>−</button>
              <span aria-live="polite">{quantity}</span>
              <button type="button" aria-label={`Add one ${product.name}`} onClick={handleIncrement} disabled={outOfStock || quantity >= maxQuantity} title={quantity >= maxQuantity ? `Only ${maxQuantity} available` : undefined}>+</button>
            </div>
          ) : (
            <button
              type="button"
              className="add-button"
              disabled={outOfStock}
              aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
              onClick={outOfStock ? (e) => e.stopPropagation() : handleAddToCart}>
              ADD <span>+</span>
            </button>
          )}
        </div>
      </article>
    );
  },
);

export default ProductCard;
