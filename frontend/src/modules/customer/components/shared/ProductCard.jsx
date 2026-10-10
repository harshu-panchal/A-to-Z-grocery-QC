import React from "react";
import { useLocation } from "react-router-dom";
import { Heart, Plus, Minus, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "@shared/components/ui/Toast";
import { useCartAnimation } from "../../context/CartAnimationContext";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";

import { useProductDetail } from "../../context/ProductDetailContext";
import { isProductOutOfStock, isVariantOutOfStock } from "../../utils/stock";

const ProductCard = React.memo(
  ({ product, badge, className, compact = false, neutralBg = false }) => {
    const { toggleWishlist: toggleWishlistGlobal, isInWishlist } =
      useWishlist();
    const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
    const { showToast } = useToast();
    const { animateAddToCart, animateRemoveFromCart } = useCartAnimation();

    const { openProduct } = useProductDetail();
    const [showHeartPopup, setShowHeartPopup] = React.useState(false);
    
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

        if (!isWishlisted) {
          setShowHeartPopup(true);
          setTimeout(() => setShowHeartPopup(false), 1000);
        }

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

    return (
      <div
        className={cn(
          "group relative flex-shrink-0 w-full h-full flex flex-col overflow-hidden rounded-xl border cursor-pointer transition-shadow duration-200",
          outOfStock ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200/80 hover:shadow-md",
          className,
        )}
        onClick={handleProductClick}>
        {/* Image */}
        <div className="relative aspect-square bg-white p-2">
          {outOfStock && (
            <span className="absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-md bg-slate-800/80 py-1 text-center text-xs font-semibold text-white">
              Out of stock
            </span>
          )}
          {badgeText && !outOfStock && (
            <span className="absolute left-0 top-2 z-10 rounded-r-md bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-tight text-primary-foreground">
              {badgeText}
            </span>
          )}
          <button
            type="button"
            onClick={toggleWishlist}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            aria-pressed={isWishlisted}
            className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-primary">
            <motion.div
              whileTap={{ scale: 0.8 }}
              animate={isWishlisted ? { scale: [1, 1.2, 1] } : {}}>
              <Heart
                size={15}
                className={cn(isWishlisted ? "text-red-500 fill-current" : "text-slate-400")}
              />
            </motion.div>
          </button>
          <AnimatePresence>
            {showHeartPopup && (
              <motion.div
                initial={{ scale: 0.5, opacity: 1, y: 0 }}
                animate={{ scale: 2, opacity: 0, y: -40 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute right-3 top-3 z-50 text-red-500">
                <Heart size={24} fill="currentColor" />
              </motion.div>
            )}
          </AnimatePresence>
          {product.image ? (
            <img
              ref={imageRef}
              src={applyCloudinaryTransform(product.image)}
              alt={product.name}
              loading="lazy"
              className={cn("h-full w-full object-contain", outOfStock && "opacity-40 grayscale")}
            />
          ) : (
            // no image saved: a placeholder instead of <img src=""> (which makes
            // the browser re-request the page and logs a React warning)
            <div
              ref={imageRef}
              role="img"
              aria-label={product.name}
              className={cn("flex h-full w-full items-center justify-center rounded-lg bg-slate-50", outOfStock && "opacity-40")}
            >
              <Package size={32} strokeWidth={1.5} className="text-slate-300" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className={cn("flex flex-1 flex-col px-2.5 pb-2.5", compact ? "gap-0.5" : "gap-1", outOfStock && "opacity-70")}>
          {outOfStock ? (
            <span className="inline-flex w-fit items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              Currently unavailable
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              <Clock size={10} aria-hidden="true" />
              {product.deliveryTime || "8-12 mins"}
            </span>
          )}
          <h4
            className={cn(
              "line-clamp-2 font-semibold leading-snug",
              outOfStock ? "text-slate-500" : "text-slate-900",
              compact ? "min-h-[2.5rem] text-[13px]" : "min-h-[2.75rem] text-sm",
            )}>
            {product.name}
          </h4>
          <p className="text-xs text-slate-500">{defaultVariant?.name || product.weight || "1 unit"}</p>

          {/* Price + ADD / quantity */}
          {/* flex-wrap: long prices push the button onto its own line instead of overlapping */}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-1.5 gap-y-1.5 pt-1.5">
            <div className="flex min-w-0 flex-col leading-tight">
              {price ? (
                <span className={cn("font-bold", outOfStock ? "text-slate-500" : "text-slate-900", compact ? "text-sm" : "text-[15px]")}>₹{formatRupees(price)}</span>
              ) : (
                <span className="text-xs text-slate-500">See options</span>
              )}
              {mrp && <span className="text-[11px] text-slate-400 line-through">₹{formatRupees(mrp)}</span>}
            </div>
            {quantity > 0 ? (
              <div
                className="ml-auto flex h-9 min-w-[76px] items-center justify-between rounded-lg bg-primary text-primary-foreground"
                role="group"
                aria-label={`${product.name} quantity`}>
                <button
                  type="button"
                  onClick={handleDecrement}
                  aria-label={`Decrease ${product.name} quantity`}
                  className="flex h-full w-7 items-center justify-center active:scale-90 transition-transform">
                  <Minus size={14} strokeWidth={3} />
                </button>
                <span className="text-sm font-bold tabular-nums" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={outOfStock}
                  aria-label={`Increase ${product.name} quantity`}
                  className="flex h-full w-7 items-center justify-center active:scale-90 transition-transform disabled:opacity-40">
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            ) : outOfStock ? (
              <button
                type="button"
                disabled
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-label={`${product.name} is out of stock`}
                className="ml-auto h-9 min-w-[76px] cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-2 text-[11px] font-semibold text-slate-500">
                Out of stock
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={`Add ${product.name} to cart`}
                className="ml-auto h-9 min-w-[76px] rounded-lg border border-primary bg-white px-3 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-primary/5 active:scale-95">
                ADD
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default ProductCard;
