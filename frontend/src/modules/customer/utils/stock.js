/**
 * Same rule the backend enforces at order time (stockService): a product is
 * purchasable only when its master stock > 0 AND it has no variants or at
 * least one variant with stock > 0. Missing stock data counts as in stock so
 * older payloads without a `stock` field are never hidden by mistake.
 */
export function isProductOutOfStock(product) {
  if (!product) return false;
  const hasMasterStock = product.stock !== undefined && product.stock !== null;
  if (hasMasterStock && Number(product.stock) <= 0) return true;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const tracked = variants.filter((v) => v && v.stock !== undefined && v.stock !== null);
  if (tracked.length > 0 && tracked.every((v) => Number(v.stock) <= 0)) return true;

  return false;
}

/** A single variant (size/pack) is sold out when its tracked stock is 0 or less. */
export function isVariantOutOfStock(variant) {
  if (!variant || variant.stock === undefined || variant.stock === null) return false;
  return Number(variant.stock) <= 0;
}

/** Drop out-of-stock products from browsing lists (search keeps them, greyed out). */
export function onlyInStock(products) {
  return (Array.isArray(products) ? products : []).filter((p) => !isProductOutOfStock(p));
}
