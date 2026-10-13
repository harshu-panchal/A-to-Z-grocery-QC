/**
 * Barcode rules shared by product create/update and the POS.
 *
 * A barcode identifies exactly one variant (or a product without variants)
 * within one seller's catalogue, so a scan always resolves to one stock row.
 * Uniqueness is per seller, not global: the same manufacturer EAN (e.g. a
 * branded packet) legitimately exists at many sellers.
 */
import mongoose from "mongoose";
import Product from "../../models/product.js";

export const normalizeBarcode = (v) => String(v ?? "").trim().replace(/\s+/g, "");

/** Every barcode a product payload carries (root + variants), normalized. */
export function collectBarcodes(productData) {
  const codes = [];
  if (normalizeBarcode(productData.barcode)) codes.push(normalizeBarcode(productData.barcode));
  for (const v of Array.isArray(productData.variants) ? productData.variants : []) {
    const code = normalizeBarcode(v?.barcode);
    if (code) codes.push(code);
  }
  return codes;
}

/** First product of this seller (other than excludeId) already using one of the codes. */
export async function findBarcodeConflict(sellerId, codes, excludeId = null) {
  if (!codes.length || !mongoose.isValidObjectId(sellerId)) return null;
  const filter = {
    sellerId,
    $or: [{ barcode: { $in: codes } }, { "variants.barcode": { $in: codes } }],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const hit = await Product.findOne(filter).select("name barcode variants.name variants.barcode").lean();
  if (!hit) return null;
  const code = codes.find((c) => hit.barcode === c || (hit.variants || []).some((v) => v.barcode === c));
  const variant = (hit.variants || []).find((v) => v.barcode === code);
  return { code, productId: String(hit._id), productName: hit.name, variantName: variant?.name || "" };
}

/**
 * Normalize barcodes in a create/update payload and check them.
 * Returns an error message, or null when everything is unique.
 */
export async function validateProductBarcodes(productData, sellerId, excludeId = null) {
  // "" (not undefined) so clearing the field in a form really removes the code
  if (productData.barcode !== undefined) productData.barcode = normalizeBarcode(productData.barcode);
  if (Array.isArray(productData.variants)) {
    productData.variants = productData.variants.map((v) => ({
      ...v,
      barcode: normalizeBarcode(v?.barcode) || undefined,
      rackCode: v?.rackCode !== undefined ? String(v.rackCode).trim() : v?.rackCode,
    }));
  }
  const codes = collectBarcodes(productData);
  const seen = new Set();
  for (const c of codes) {
    if (seen.has(c)) return `Barcode ${c} is used twice in this product; each variant needs its own`;
    seen.add(c);
  }
  const conflict = await findBarcodeConflict(sellerId, codes, excludeId);
  if (conflict) {
    return `Barcode ${conflict.code} is already used by "${conflict.productName}${conflict.variantName ? ` (${conflict.variantName})` : ""}"`;
  }
  return null;
}

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12) {
  const sum = String(first12).split("").reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}
