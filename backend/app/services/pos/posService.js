/**
 * Shared POS logic: owner scope, GST maths, product/variant resolution and
 * stock movements (with StockHistory ledger rows).
 */
import mongoose from "mongoose";
import Product from "../../models/product.js";
import StockHistory from "../../models/stockHistory.js";
import { invalidateProductStockCache } from "../stockService.js";
import { buildSearchRegex } from "../../utils/regex.js";

export const WALK_IN = "walk-in-customer";
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const isObjectId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;

export function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ------------------------------------------------------------------ scope
/**
 * Express middleware: attaches req.pos = { role, owner, ownerKey, actor }.
 * Seller POS -> owner = seller id; Admin POS -> owner = null.
 */
export const posScope = (role) => (req, res, next) => {
  const isAdmin = role === "admin";
  const owner = isAdmin ? null : new mongoose.Types.ObjectId(String(req.user.id));
  req.pos = {
    role,
    isAdmin,
    owner,
    ownerKey: isAdmin ? "admin" : `seller:${req.user.id}`,
    actor: new mongoose.Types.ObjectId(String(req.user.id)),
  };
  next();
};

/** Mongo filter limiting a POS collection to the current owner. */
export const ownerFilter = (pos, extra = {}) => ({ owner: pos.owner, ...extra });

// -------------------------------------------------------------------- GST
/** GST portion of a GST-inclusive amount (B2C POS pricing). */
export const inclusiveGst = (amount, rate) => {
  const r = Number(rate) || 0;
  return r > 0 ? round2((Number(amount) * r) / (100 + r)) : 0;
};

/** Split a GST amount into CGST/SGST halves (intra-state). */
export const splitGst = (gst) => ({ cgst: round2(gst / 2), sgst: round2(gst / 2) });

// --------------------------------------------------------------- products
const PRODUCT_POS_FIELDS =
  "name sku barcode mainImage mrp sellingPrice purchaseRate wholesalePrice stock unit weight hsnCode gstRate variants sellerId status categoryId rackCode lowStockAlert";

export function findVariant(product, variantSku) {
  const key = String(variantSku || "").trim();
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!key) return variants.length === 1 ? variants[0] : null;
  return variants.find((v) => String(v.sku || "").trim() === key || String(v.name || "").trim() === key) || null;
}

/** One catalogue row per sellable unit (each variant, or the product itself). */
export function toPosRows(product) {
  const base = {
    productId: String(product._id),
    sellerId: product.sellerId?._id ? String(product.sellerId._id) : String(product.sellerId || ""),
    sellerName: product.sellerId?.shopName || undefined,
    name: product.name,
    image: product.mainImage || "",
    hsnCode: product.hsnCode || "",
    gstRate: Number(product.gstRate) || 0,
    category: product.categoryId?.name || undefined,
  };
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) {
    return [{
      ...base,
      variantSku: "",
      variantName: product.weight || product.unit || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      mrp: Number(product.mrp) || 0,
      price: Number(product.sellingPrice) || Number(product.mrp) || 0,
      wholesalePrice: Number(product.wholesalePrice) || 0,
      purchaseRate: Number(product.purchaseRate) || 0,
      stock: Number(product.stock) || 0,
      rackCode: product.rackCode || "",
    }];
  }
  return variants.map((v) => ({
    ...base,
    variantSku: String(v.sku || v.name || "").trim(),
    variantName: v.name || "",
    sku: v.sku || product.sku || "",
    barcode: v.barcode || "",
    mrp: Number(v.mrp) || Number(product.mrp) || 0,
    price: Number(v.sellingPrice) || Number(v.mrp) || Number(product.sellingPrice) || 0,
    wholesalePrice: Number(v.wholesalePrice) || Number(product.wholesalePrice) || 0,
    purchaseRate: Number(v.purchaseRate) || Number(product.purchaseRate) || 0,
    stock: Number(v.stock) || 0,
    rackCode: v.rackCode || product.rackCode || "",
  }));
}

/**
 * POS catalogue search. Seller POS: own products only (it's their stock).
 * Admin POS: every seller's products, optionally filtered by seller.
 * Exact barcode/SKU matches are returned as `exact` rows.
 */
export async function searchPosProducts(pos, { search = "", sellerId, categoryId, limit = 40, barcode } = {}) {
  const query = { status: "active" };
  if (!pos.isAdmin) query.sellerId = pos.owner;
  else if (sellerId && isObjectId(sellerId)) query.sellerId = sellerId;
  if (categoryId && isObjectId(categoryId)) query.categoryId = categoryId;

  const code = String(barcode || "").trim();
  const term = String(search || "").trim();
  if (code) {
    query.$or = [{ barcode: code }, { "variants.barcode": code }, { sku: code }, { "variants.sku": code }];
  } else if (term) {
    const rx = buildSearchRegex(term, { anchored: false });
    query.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { "variants.sku": rx }, { "variants.barcode": rx }, { brand: rx }];
  }

  const products = await Product.find(query)
    .select(PRODUCT_POS_FIELDS)
    .populate("sellerId", "shopName")
    .populate("categoryId", "name")
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 40, 100))
    .lean();

  let rows = products.flatMap(toPosRows);
  if (code) {
    const exact = rows.filter((r) => r.barcode === code || r.sku === code);
    if (exact.length) rows = exact;
  }
  return rows;
}

/**
 * Validate and price cart lines. Lines with a valid productId are bound to
 * the product/variant (stock owner = product's seller); others are custom
 * "quick" items that never touch stock.
 */
export async function resolveLines(pos, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw httpError(400, "Add at least one item");
  const ids = [...new Set(rawItems.map((i) => i.productId).filter(isObjectId).map(String))];
  const products = ids.length
    ? await Product.find({ _id: { $in: ids } }).select(PRODUCT_POS_FIELDS).lean()
    : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return rawItems.map((raw, idx) => {
    const quantity = Number(raw.quantity);
    if (!(quantity > 0)) throw httpError(400, `Invalid quantity on line ${idx + 1}`);
    const product = isObjectId(raw.productId) ? byId.get(String(raw.productId)) : null;
    if (isObjectId(raw.productId) && !product) throw httpError(404, `Product on line ${idx + 1} no longer exists`);
    if (product && !pos.isAdmin && String(product.sellerId) !== String(pos.owner)) {
      throw httpError(403, `"${product.name}" is not your product`);
    }

    const variant = product ? findVariant(product, raw.variantSku) : null;
    if (product && Array.isArray(product.variants) && product.variants.length > 1 && !variant) {
      throw httpError(400, `Pick a size/variant for "${product.name}"`);
    }
    const defaultPrice = variant
      ? Number(variant.sellingPrice) || Number(variant.mrp) || 0
      : product ? Number(product.sellingPrice) || Number(product.mrp) || 0 : 0;
    const unitPrice = round2(raw.price ?? raw.unitPrice ?? defaultPrice);
    if (!(unitPrice >= 0)) throw httpError(400, `Invalid price on line ${idx + 1}`);
    const lineDiscount = Math.max(0, round2(raw.lineDiscount || 0));
    const total = Math.max(0, round2(unitPrice * quantity - lineDiscount));
    const gstRate = Number(raw.gstRate ?? raw.gst ?? product?.gstRate ?? 0) || 0;
    const name = String(raw.name || product?.name || "").trim();
    if (!name) throw httpError(400, `Line ${idx + 1} needs a name`);

    return {
      product: product ? product._id : null,
      seller: product ? product.sellerId : null,
      variantSku: variant ? String(variant.sku || variant.name || "").trim() : "",
      variantName: variant ? variant.name || "" : String(raw.variantName || ""),
      name,
      sku: raw.sku || variant?.sku || product?.sku || "",
      barcode: raw.barcode || variant?.barcode || product?.barcode || "",
      hsnCode: raw.hsnCode || product?.hsnCode || "",
      gstRate,
      quantity,
      mrp: round2(raw.mrp ?? variant?.mrp ?? product?.mrp ?? unitPrice),
      unitPrice,
      purchaseRate: round2(variant?.purchaseRate ?? product?.purchaseRate ?? 0),
      priceType: ["retail", "wholesale", "custom"].includes(raw.priceType) ? raw.priceType : "retail",
      lineDiscount,
      total,
      gstAmount: inclusiveGst(total, gstRate),
      warrantyType: raw.warrantyType || "",
      warrantyDuration: raw.warrantyDuration || "",
      stockDeducted: false,
    };
  });
}

/** Totals for a set of resolved lines. */
export function computeTotals(lines, { billDiscount = 0, roundOff = true } = {}) {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discount = Math.min(Math.max(0, round2(billDiscount)), subtotal);
  const afterDiscount = round2(subtotal - discount);
  const total = roundOff ? Math.round(afterDiscount) : afterDiscount;
  // GST shrinks proportionally with the bill discount
  const ratio = subtotal > 0 ? afterDiscount / subtotal : 0;
  const gstTotal = round2(lines.reduce((s, l) => s + l.gstAmount, 0) * ratio);
  return {
    subtotal,
    billDiscount: discount,
    roundOff: round2(total - afterDiscount),
    gstTotal,
    total,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

// ------------------------------------------------------------------ stock
/**
 * Move stock for product-bound lines and write ledger rows.
 * direction -1 = out (sale), +1 = in (restore/purchase).
 * `strict` (default for sales) refuses to go below zero.
 */
export async function moveStock(lines, { direction, type, source = "POS", pos, posOrder = null, note = "", strict = direction < 0, session = null }) {
  const touched = [];
  const ledger = [];
  for (const line of lines) {
    if (!line.product) continue;
    const qty = Number(line.quantity);
    const delta = direction * qty;
    const sku = String(line.variantSku || "").trim();
    const filter = { _id: line.product };
    if (sku) filter["variants.sku"] = sku;
    if (strict && direction < 0) {
      filter.stock = { $gte: qty };
      if (sku) {
        delete filter["variants.sku"];
        filter.variants = { $elemMatch: { sku, stock: { $gte: qty } } };
      }
    }
    const inc = sku ? { stock: delta, "variants.$.stock": delta } : { stock: delta };
    const updated = await Product.findOneAndUpdate(filter, { $inc: inc }, { new: true, session });
    if (!updated) {
      if (strict) throw httpError(409, `Not enough stock for "${line.name}${line.variantName ? ` (${line.variantName})` : ""}"`);
      continue;
    }
    const stockAfter = sku
      ? Number(updated.variants.find((v) => String(v.sku || "").trim() === sku)?.stock ?? updated.stock)
      : Number(updated.stock);
    touched.push(updated._id);
    ledger.push({
      product: updated._id,
      seller: updated.sellerId,
      type,
      quantity: delta,
      source,
      variantSku: sku || undefined,
      posOrder,
      stockAfter,
      note: note || undefined,
      createdByRole: pos?.role,
      createdBy: pos?.actor,
    });
    line.stockDeducted = direction < 0;
  }
  if (ledger.length) await StockHistory.insertMany(ledger, session ? { session } : {});
  if (touched.length) invalidateProductStockCache(touched).catch(() => {});
  return ledger.length;
}

/** Run fn inside a transaction when the deployment supports it. */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    // Standalone MongoDB (no replica set): run without a transaction
    if (/Transaction numbers are only allowed|replica set/i.test(String(err?.message))) {
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
}
