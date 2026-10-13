/**
 * Inventory tools shared by the Admin and Seller POS:
 * barcode check, stock count (audit), scan-to-pack for app orders,
 * expiry report, reorder suggestions and the App-vs-Counter report.
 */
import mongoose from "mongoose";
import handleResponse from "../../utils/helper.js";
import { dayStartIST, dayEndIST } from "../../services/orderQueryService.js";
import Product from "../../models/product.js";
import Order from "../../models/order.js";
import StockHistory from "../../models/stockHistory.js";
import { PosBatch, PosOrder } from "../../models/pos.js";
import { round2, isObjectId, httpError, findVariant } from "../../services/pos/posService.js";
import { findBarcodeConflict, normalizeBarcode } from "../../services/inventory/barcodeService.js";
import { invalidateProductStockCache } from "../../services/stockService.js";

const fail = (res, err) => handleResponse(res, err.statusCode || 500, err.message);
const oid = (v) => new mongoose.Types.ObjectId(String(v));
/** Seller filter for product/order queries (admin may narrow with ?sellerId). */
const sellerScope = (pos, sellerId) => (!pos.isAdmin ? pos.owner : isObjectId(sellerId) ? oid(sellerId) : null);
const OPEN_ORDER_STATUSES = ["pending", "confirmed", "packed"];

// ----------------------------------------------------------- barcode check
/** Is this code free for the seller? Used live by the product form. */
export const barcodeCheck = async (req, res) => {
  try {
    const code = normalizeBarcode(req.query.code);
    if (!code) throw httpError(400, "Enter a barcode");
    const sellerId = req.pos.isAdmin ? req.query.sellerId : req.pos.owner;
    if (!isObjectId(sellerId)) return handleResponse(res, 200, "Pick a seller to check", { available: true, unchecked: true });
    const conflict = await findBarcodeConflict(sellerId, [code], isObjectId(req.query.productId) ? req.query.productId : null);
    return handleResponse(res, 200, conflict ? "Barcode in use" : "Barcode available", { available: !conflict, conflict });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------- stock count
/**
 * Physical stock count: each line sets a product/variant to the counted
 * quantity; the difference is written to the ledger as "Stock Count".
 */
export const submitStockCount = async (req, res) => {
  try {
    const pos = req.pos;
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) throw httpError(400, "Count at least one item");
    const note = String(req.body.note || "").slice(0, 200);
    const results = [];
    const touched = [];
    for (const line of lines) {
      if (!isObjectId(line.productId)) continue;
      const counted = Math.max(0, Math.floor(Number(line.counted)));
      if (!Number.isFinite(counted)) continue;
      const product = await Product.findOne({ _id: line.productId, ...(pos.isAdmin ? {} : { sellerId: pos.owner }) });
      if (!product) continue;
      const variant = findVariant(product, line.variantSku);
      const sku = variant ? String(variant.sku || "").trim() : "";
      const systemQty = Number(variant ? variant.stock : product.stock) || 0;
      const delta = counted - systemQty;
      if (delta !== 0) {
        await Product.updateOne(
          sku ? { _id: product._id, "variants.sku": sku } : { _id: product._id },
          { $inc: sku ? { stock: delta, "variants.$.stock": delta } : { stock: delta } },
        );
        await StockHistory.create({
          product: product._id,
          seller: product.sellerId,
          type: "Stock Count",
          quantity: delta,
          source: "AUDIT",
          variantSku: sku || undefined,
          stockAfter: counted,
          note: note || `Counted ${counted}, system had ${systemQty}`,
          createdByRole: pos.role,
          createdBy: pos.actor,
        });
        touched.push(product._id);
      }
      results.push({ productId: String(product._id), variantSku: sku, name: product.name, systemQty, counted, delta });
    }
    if (touched.length) invalidateProductStockCache(touched).catch(() => {});
    const changed = results.filter((r) => r.delta !== 0);
    return handleResponse(res, 200, `${changed.length} item(s) corrected`, {
      results,
      summary: { counted: results.length, changed: changed.length, short: changed.filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0), extra: changed.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0) },
    });
  } catch (err) {
    return fail(res, err);
  }
};

// ---------------------------------------------------------- scan-to-pack
/** Items of an app order with the barcode and rack of each variant. */
export const packList = async (req, res) => {
  try {
    const pos = req.pos;
    const key = String(req.params.orderId);
    const filter = isObjectId(key) ? { _id: key } : { orderId: key };
    if (!pos.isAdmin) filter.seller = pos.owner;
    const order = await Order.findOne(filter).select("orderId seller items status workflowStatus createdAt address.name").lean();
    if (!order) throw httpError(404, "Order not found");
    const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } })
      .select("name mainImage barcode sku rackCode variants")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = order.items.map((it) => {
      const product = byId.get(String(it.product));
      const variant = product ? findVariant(product, it.variantSlot) : null;
      const codes = [variant?.barcode, variant?.sku, !variant ? product?.barcode : null, !variant ? product?.sku : null].filter(Boolean);
      return {
        productId: String(it.product),
        name: it.name || product?.name,
        variantName: variant?.name || it.variantSlot || "",
        image: it.image || product?.mainImage || "",
        quantity: it.quantity,
        rackCode: variant?.rackCode || product?.rackCode || "",
        barcodes: [...new Set(codes.map(String))],
      };
    });
    return handleResponse(res, 200, "Pack list", { orderId: order.orderId, _id: order._id, status: order.status, customer: order.address?.name, createdAt: order.createdAt, items });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------------ expiry
/**
 * Batches that still have stock, with expiry. Remaining per batch: current
 * stock is assigned to the newest batches first (older units sell first).
 */
export const expiryReport = async (req, res) => {
  try {
    const pos = req.pos;
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const seller = sellerScope(pos, req.query.sellerId);
    const batches = await PosBatch.find({ ...(seller ? { seller } : {}), expiry: { $ne: null } }).sort({ receivedAt: -1 }).lean();
    if (!batches.length) return handleResponse(res, 200, "No batches", { items: [], days });

    const products = await Product.find({ _id: { $in: [...new Set(batches.map((b) => String(b.product)))] } })
      .select("name mainImage stock variants sellerId rackCode")
      .populate("sellerId", "shopName")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const groups = new Map();
    for (const b of batches) {
      const k = `${b.product}::${b.variantSku || ""}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    }
    const now = Date.now();
    const items = [];
    for (const [, list] of groups) {
      const product = byId.get(String(list[0].product));
      if (!product) continue;
      const variant = list[0].variantSku ? findVariant(product, list[0].variantSku) : null;
      let left = Number(variant ? variant.stock : product.stock) || 0;
      for (const b of list) { // newest first
        const remaining = Math.max(0, Math.min(left, b.quantity));
        left -= remaining;
        if (remaining <= 0) continue;
        const daysLeft = Math.ceil((new Date(b.expiry).getTime() - now) / 86400000);
        if (daysLeft > days) continue;
        items.push({
          productId: String(product._id),
          name: product.name,
          variantName: variant?.name || "",
          image: product.mainImage || "",
          sellerName: product.sellerId?.shopName,
          rackCode: variant?.rackCode || product.rackCode || "",
          batchNo: b.batchNo || "",
          expiry: b.expiry,
          daysLeft,
          remaining,
          received: b.quantity,
        });
      }
    }
    items.sort((a, b) => a.daysLeft - b.daysLeft);
    return handleResponse(res, 200, "Expiry report", { items, days });
  } catch (err) {
    return fail(res, err);
  }
};

// ---------------------------------------------------------- reorder/low stock
/** Units sold per product+variant in the window, split by channel. */
async function salesByVariant({ seller, from, to }) {
  const onlineMatch = { status: { $ne: "cancelled" }, createdAt: { $gte: from, $lte: to } };
  if (seller) onlineMatch.seller = seller;
  const posMatch = { status: "completed", createdAt: { $gte: from, $lte: to } };
  const [online, counter] = await Promise.all([
    Order.aggregate([
      { $match: onlineMatch },
      { $unwind: "$items" },
      { $group: { _id: { p: "$items.product", v: { $ifNull: ["$items.variantSlot", ""] } }, qty: { $sum: "$items.quantity" }, sales: { $sum: { $multiply: ["$items.quantity", "$items.price"] } } } },
    ]),
    PosOrder.aggregate([
      { $match: posMatch },
      { $unwind: "$items" },
      { $match: { "items.product": { $ne: null }, ...(seller ? { "items.seller": seller } : {}) } },
      { $group: { _id: { p: "$items.product", v: "$items.variantSku" }, qty: { $sum: "$items.quantity" }, sales: { $sum: "$items.total" } } },
    ]),
  ]);
  const map = new Map();
  const add = (rows, ch) => rows.forEach((r) => {
    const k = `${r._id.p}::${r._id.v || ""}`;
    const cur = map.get(k) || { online: 0, onlineSales: 0, counter: 0, counterSales: 0 };
    cur[ch] += r.qty;
    cur[`${ch}Sales`] += r.sales;
    map.set(k, cur);
  });
  add(online, "online");
  add(counter, "counter");
  return map;
}

export const reorderReport = async (req, res) => {
  try {
    const pos = req.pos;
    const windowDays = Math.min(Math.max(Number(req.query.days) || 30, 7), 180);
    const leadDays = Math.min(Math.max(Number(req.query.leadDays) || 7, 1), 60);
    const seller = sellerScope(pos, req.query.sellerId);
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * 86400000);
    const [sales, products] = await Promise.all([
      salesByVariant({ seller, from, to }),
      Product.find({ status: "active", ...(seller ? { sellerId: seller } : {}) })
        .select("name mainImage stock lowStockAlert variants sellerId rackCode purchaseRate")
        .populate("sellerId", "shopName")
        .lean(),
    ]);
    const items = [];
    for (const p of products) {
      const units = Array.isArray(p.variants) && p.variants.length
        ? p.variants.map((v) => ({ key: String(v.sku || v.name || "").trim(), name: v.name, stock: Number(v.stock) || 0, rack: v.rackCode, cost: v.purchaseRate }))
        : [{ key: "", name: "", stock: Number(p.stock) || 0, rack: p.rackCode, cost: p.purchaseRate }];
      for (const u of units) {
        const s = sales.get(`${p._id}::${u.key}`) || { online: 0, counter: 0 };
        const sold = s.online + s.counter;
        const perDay = sold / windowDays;
        const daysLeft = perDay > 0 ? u.stock / perDay : null;
        const threshold = Number(p.lowStockAlert) || 5;
        const target = Math.ceil(perDay * (leadDays + 7)); // lead time + one week of safety stock
        const suggest = Math.max(0, target - u.stock, u.stock <= threshold && sold === 0 ? threshold * 2 - u.stock : 0);
        const low = u.stock <= threshold || (daysLeft !== null && daysLeft <= leadDays);
        if (!low && req.query.all !== "true") continue;
        items.push({
          productId: String(p._id),
          name: p.name,
          variantName: u.name || "",
          variantSku: u.key,
          image: p.mainImage || "",
          sellerName: p.sellerId?.shopName,
          rackCode: u.rack || p.rackCode || "",
          stock: u.stock,
          threshold,
          soldOnline: s.online,
          soldCounter: s.counter,
          perDay: round2(perDay),
          daysLeft: daysLeft === null ? null : round2(daysLeft),
          suggest,
          estCost: round2(suggest * (Number(u.cost) || 0)),
          outOfStock: u.stock <= 0,
        });
      }
    }
    items.sort((a, b) => (a.outOfStock === b.outOfStock ? (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) : a.outOfStock ? -1 : 1));
    return handleResponse(res, 200, "Reorder suggestions", { items, windowDays, leadDays });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------ app vs counter
export const channelReport = async (req, res) => {
  try {
    const pos = req.pos;
    const seller = sellerScope(pos, req.query.sellerId);
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const from = dayStartIST(req.query.from || `${today.slice(0, 7)}-01`);
    const to = dayEndIST(req.query.to || today);
    const sales = await salesByVariant({ seller, from, to });
    const ids = [...new Set([...sales.keys()].map((k) => k.split("::")[0]))].filter(isObjectId);
    const products = await Product.find({ _id: { $in: ids } }).select("name variants").lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const rows = [...sales.entries()].map(([k, v]) => {
      const [pid, sku] = k.split("::");
      const product = byId.get(pid);
      const variant = product && sku ? findVariant(product, sku) : null;
      return {
        productId: pid,
        name: product?.name || "(deleted product)",
        variantName: variant?.name || sku || "",
        online: v.online,
        onlineSales: round2(v.onlineSales),
        counter: v.counter,
        counterSales: round2(v.counterSales),
        total: v.online + v.counter,
        totalSales: round2(v.onlineSales + v.counterSales),
      };
    }).sort((a, b) => b.totalSales - a.totalSales);
    const totals = rows.reduce((t, r) => ({
      online: t.online + r.online, onlineSales: t.onlineSales + r.onlineSales,
      counter: t.counter + r.counter, counterSales: t.counterSales + r.counterSales,
    }), { online: 0, onlineSales: 0, counter: 0, counterSales: 0 });
    Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
    return handleResponse(res, 200, "Channel report", { rows, totals, from, to });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------ held stock for POS rows
/** Units of each product/variant sitting in not-yet-dispatched app orders. */
export async function heldQuantities(productIds) {
  if (!productIds.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { status: { $in: OPEN_ORDER_STATUSES }, "items.product": { $in: productIds.map(oid) } } },
    { $unwind: "$items" },
    { $match: { "items.product": { $in: productIds.map(oid) } } },
    { $group: { _id: { p: "$items.product", v: { $ifNull: ["$items.variantSlot", ""] } }, qty: { $sum: "$items.quantity" } } },
  ]);
  return new Map(rows.map((r) => [`${r._id.p}::${r._id.v || ""}`, r.qty]));
}

