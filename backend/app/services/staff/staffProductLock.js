/**
 * A seller's staff edits only the "shelf" details of a product: variant name,
 * code (SKU), rack number and barcode (plus name / category / photos).
 * Prices and stock come from POS purchase entries, so whatever price or stock
 * a staff member sends is replaced here by what is stored (0 for a new
 * product or size).
 */
const MONEY_STOCK = ["mrp", "sellingPrice", "purchaseRate", "stock", "wholesalePrice"];

const key = (v) => String(v ?? "").trim().toLowerCase();

/** True when the request comes from a seller's staff member (not the owner). */
export const isSellerStaff = (req) =>
  Boolean(req?.staff) && String(req?.user?.role || "").toLowerCase() === "seller";

/**
 * Overwrites prices and stock in `productData` with the stored values of
 * `existing` (a product document, or null when creating).
 * Returns an error message, or null.
 */
export function lockStaffPriceAndStock(productData, existing = null) {
  for (const f of MONEY_STOCK) delete productData[f];

  const old = Array.isArray(existing?.variants) ? existing.variants : [];
  if (Array.isArray(productData.variants)) {
    const used = new Set();
    const match = (v) => {
      const tries = [
        (o) => v?._id && String(o._id) === String(v._id),
        (o) => key(v?.sku) && key(o.sku) === key(v.sku),
        (o) => key(v?.name) && key(o.name) === key(v.name),
      ];
      for (const t of tries) {
        const i = old.findIndex((o, idx) => !used.has(idx) && t(o));
        if (i !== -1) { used.add(i); return old[i]; }
      }
      return null;
    };
    productData.variants = productData.variants.map((v) => {
      const o = match(v);
      const next = { ...v };
      for (const f of MONEY_STOCK) next[f] = o ? (o[f] ?? 0) : 0;
      if (o?._id && !next._id) next._id = o._id;
      return next;
    });
    const dropped = old.find((o, i) => !used.has(i) && Number(o.stock) > 0);
    if (dropped) {
      return `"${dropped.name || dropped.sku}" still has ${dropped.stock} in stock, so staff can't remove it. Ask the owner.`;
    }
  }

  if (!existing) {
    // New product: no price or stock until a purchase entry brings them in.
    productData.mrp = 0;
    productData.sellingPrice = 0;
    productData.purchaseRate = 0;
    productData.stock = 0;
    productData.status = "inactive";
  }
  return null;
}
