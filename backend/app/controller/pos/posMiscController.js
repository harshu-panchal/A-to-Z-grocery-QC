/**
 * POS catalogue search, quick-add product, stock ledger, terminal state,
 * bill/barcode settings and the admin's seller list.
 */
import crypto from "crypto";
import handleResponse from "../../utils/helper.js";
import { getPagination } from "../../utils/pagination.js";
import { buildSearchRegex } from "../../utils/regex.js";
import { slugify } from "../../utils/slugify.js";
import { dayStartIST, dayEndIST } from "../../services/orderQueryService.js";
import { enqueueProductIndex } from "../../services/searchSyncService.js";
import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Seller from "../../models/seller.js";
import StockHistory from "../../models/stockHistory.js";
import { PosState, PosSettings } from "../../models/pos.js";
import { round2, isObjectId, httpError, searchPosProducts, toPosRows, findVariant } from "../../services/pos/posService.js";
import { invalidateProductStockCache } from "../../services/stockService.js";
import { heldQuantities } from "./posInventoryController.js";

const fail = (res, err) => handleResponse(res, err.statusCode || (err.code === 11000 ? 409 : 500), err.code === 11000 ? "That barcode/SKU is already used" : err.message);

// --------------------------------------------------------------- products
export const posProducts = async (req, res) => {
  try {
    const rows = await searchPosProducts(req.pos, req.query);
    // units already promised to app orders that haven't left the shop yet
    const held = await heldQuantities([...new Set(rows.map((r) => r.productId))]).catch(() => new Map());
    for (const r of rows) r.heldQty = held.get(`${r.productId}::${r.variantSku}`) || 0;
    return handleResponse(res, 200, "Products", rows);
  } catch (err) {
    return fail(res, err);
  }
};

/** Create a real product from the POS (e.g. an unknown barcode at the counter). */
export const quickAddProduct = async (req, res) => {
  try {
    const pos = req.pos;
    const b = req.body;
    const name = String(b.name || "").trim();
    if (!name) throw httpError(400, "Product name is required");
    const mrp = round2(b.mrp ?? b.price);
    if (!(mrp > 0)) throw httpError(400, "MRP must be more than 0");
    const sellerId = pos.isAdmin ? b.sellerId : pos.owner;
    if (!isObjectId(sellerId)) throw httpError(400, "Pick the store (seller) this product belongs to");
    if (pos.isAdmin && !(await Seller.exists({ _id: sellerId }))) throw httpError(404, "Seller not found");

    if (!isObjectId(b.categoryId)) throw httpError(400, "Pick a category");
    const category = await Category.findOne({ _id: b.categoryId, type: "category" }).lean();
    if (!category?.parentId) throw httpError(400, "Pick a main category (under a header)");
    let subcategoryId = isObjectId(b.subcategoryId) ? b.subcategoryId : null;
    if (!subcategoryId) {
      const sub = await Category.findOne({ parentId: category._id, type: "subcategory" }).select("_id").lean();
      if (!sub) throw httpError(400, "This category has no sub-category yet; add one first");
      subcategoryId = sub._id;
    }

    const barcode = String(b.barcode || "").trim();
    if (barcode && (await Product.exists({ sellerId, $or: [{ barcode }, { "variants.barcode": barcode }] }))) {
      throw httpError(409, "A product with this barcode already exists");
    }
    const stock = Math.max(0, Math.floor(Number(b.stock) || 0));
    const product = await Product.create({
      name,
      slug: `${slugify(name)}-${crypto.randomBytes(3).toString("hex")}`,
      sku: String(b.sku || "").trim() || `POS-${Date.now().toString(36).toUpperCase()}`,
      barcode: barcode || undefined,
      mrp,
      sellingPrice: round2(b.price ?? mrp),
      purchaseRate: round2(b.purchaseRate || 0),
      wholesalePrice: Number(b.wholesalePrice) > 0 ? round2(b.wholesalePrice) : undefined,
      stock,
      weight: String(b.unit || b.weight || "").trim() || undefined,
      hsnCode: String(b.hsnCode || "").trim() || undefined,
      gstRate: Number(b.gstRate) || 0,
      headerId: category.parentId,
      categoryId: category._id,
      subcategoryId,
      sellerId,
      status: "active",
      // Seller-created products still go through admin review before customers see them online
      approvalStatus: pos.isAdmin ? "approved" : "pending",
      approvalRequestedAt: pos.isAdmin ? null : new Date(),
      lastSubmittedByRole: pos.isAdmin ? "admin" : "seller",
    });
    if (stock > 0) {
      await StockHistory.create({ product: product._id, seller: sellerId, type: "Restock", quantity: stock, source: "POS", stockAfter: stock, note: "Opening stock (POS quick add)", createdByRole: pos.role, createdBy: pos.actor });
    }
    enqueueProductIndex(product._id).catch(() => {});
    return handleResponse(res, 201, pos.isAdmin ? "Product added" : "Product added (online listing awaits admin approval)", toPosRows(product.toObject())[0]);
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------ stock ledger
export const stockLedger = async (req, res) => {
  try {
    const pos = req.pos;
    const { page, limit, skip } = getPagination(req, { defaultLimit: 50, maxLimit: 200 });
    const filter = {};
    if (!pos.isAdmin) filter.seller = pos.owner;
    else if (isObjectId(req.query.sellerId)) filter.seller = req.query.sellerId;
    const source = req.query.source || "pos";
    if (source === "pos") filter.source = { $in: ["POS", "PURCHASE"] };
    else if (source !== "all") filter.source = String(source).toUpperCase();
    if (req.query.type && req.query.type !== "all") filter.type = req.query.type;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = dayStartIST(req.query.from);
      if (req.query.to) filter.createdAt.$lte = dayEndIST(req.query.to);
    }
    const term = String(req.query.search || "").trim();
    if (term) {
      const rx = buildSearchRegex(term, { anchored: false });
      const ids = await Product.find({ ...(filter.seller ? { sellerId: filter.seller } : {}), $or: [{ name: rx }, { sku: rx }, { barcode: rx }] }).select("_id").limit(200).lean();
      filter.product = { $in: ids.map((p) => p._id) };
    }
    const [items, total] = await Promise.all([
      StockHistory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name sku mainImage")
        .populate("seller", "shopName")
        .populate("posOrder", "invoiceNumber")
        .lean(),
      StockHistory.countDocuments(filter),
    ]);
    return handleResponse(res, 200, "Stock ledger", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    return fail(res, err);
  }
};

/** Correct a ledger row; with syncStock the quantity change is applied to the product too. */
export const updateLedgerEntry = async (req, res) => {
  try {
    const pos = req.pos;
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid entry id");
    const entry = await StockHistory.findOne({ _id: req.params.id, ...(pos.isAdmin ? {} : { seller: pos.owner }) });
    if (!entry) throw httpError(404, "Ledger entry not found");
    if (req.body.note !== undefined) entry.note = String(req.body.note).slice(0, 300);
    if (req.body.quantity !== undefined) {
      const qty = Number(req.body.quantity);
      if (!Number.isFinite(qty)) throw httpError(400, "Invalid quantity");
      const delta = qty - entry.quantity;
      if (delta && req.body.syncStock) {
        const sku = entry.variantSku;
        await Product.updateOne(
          sku ? { _id: entry.product, "variants.sku": sku } : { _id: entry.product },
          { $inc: sku ? { stock: delta, "variants.$.stock": delta } : { stock: delta } },
        );
        invalidateProductStockCache([entry.product]).catch(() => {});
      }
      entry.quantity = qty;
    }
    await entry.save();
    return handleResponse(res, 200, "Ledger entry updated", entry);
  } catch (err) {
    return fail(res, err);
  }
};

/** Product + variant lookup used by the purchase editor for current stock/prices. */
export const productStock = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid product id");
    const product = await Product.findOne({ _id: req.params.id, ...(req.pos.isAdmin ? {} : { sellerId: req.pos.owner }) }).lean();
    if (!product) throw httpError(404, "Product not found");
    const variant = findVariant(product, req.query.variantSku);
    return handleResponse(res, 200, "Product", { rows: toPosRows(product), variant });
  } catch (err) {
    return fail(res, err);
  }
};

// ---------------------------------------------------------- terminal state
export const getPosState = async (req, res) => {
  try {
    const state = await PosState.findOne({ ownerKey: req.pos.ownerKey }).lean();
    return handleResponse(res, 200, "POS state", state || { bills: [], activeBillId: null });
  } catch (err) {
    return fail(res, err);
  }
};

export const savePosState = async (req, res) => {
  try {
    const bills = Array.isArray(req.body.bills) ? req.body.bills.slice(0, 20) : [];
    if (JSON.stringify(bills).length > 500000) throw httpError(413, "Open bills are too large to save");
    const state = await PosState.findOneAndUpdate(
      { ownerKey: req.pos.ownerKey },
      { $set: { bills, activeBillId: req.body.activeBillId || null } },
      { new: true, upsert: true },
    ).lean();
    return handleResponse(res, 200, "Saved", { updatedAt: state.updatedAt });
  } catch (err) {
    return fail(res, err);
  }
};

// ---------------------------------------------------------------- settings
export const getPosSettings = async (req, res) => {
  try {
    const doc = await PosSettings.findOne({ ownerKey: req.pos.ownerKey }).lean();
    let bill = doc?.bill || {};
    // First visit: prefill the receipt header from the seller's shop profile
    if (!doc && !req.pos.isAdmin) {
      const seller = await Seller.findById(req.pos.owner).select("shopName address city phone").lean();
      if (seller) {
        bill = {
          shopName: { text: seller.shopName || "", enabled: true },
          address: { text: [seller.address, seller.city].filter(Boolean).join(", "), enabled: true },
          phone: { text: seller.phone || "", enabled: true },
        };
      }
    }
    return handleResponse(res, 200, "POS settings", { bill, barcode: doc?.barcode || {} });
  } catch (err) {
    return fail(res, err);
  }
};

export const savePosSettings = async (req, res) => {
  try {
    const set = {};
    if (req.body.bill && typeof req.body.bill === "object") set.bill = req.body.bill;
    if (req.body.barcode && typeof req.body.barcode === "object") set.barcode = req.body.barcode;
    if (!Object.keys(set).length) throw httpError(400, "Nothing to save");
    const doc = await PosSettings.findOneAndUpdate({ ownerKey: req.pos.ownerKey }, { $set: set }, { new: true, upsert: true }).lean();
    return handleResponse(res, 200, "Settings saved", { bill: doc.bill, barcode: doc.barcode });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------- admin only
export const posSellers = async (req, res) => {
  try {
    const sellers = await Seller.find({ isActive: true }).select("shopName name phone").sort({ shopName: 1 }).lean();
    return handleResponse(res, 200, "Sellers", sellers);
  } catch (err) {
    return fail(res, err);
  }
};
