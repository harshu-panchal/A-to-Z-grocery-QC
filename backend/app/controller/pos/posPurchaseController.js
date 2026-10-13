/**
 * Purchase entries (stock coming in from suppliers), quotations (price
 * offers to customers, convertible to a bill) and the purchase GST register.
 *
 * data.lines (purchase): { productId, variantSku, name, quantity, purchasePrice,
 *   gstRate, gstMode: "inclusive"|"exclusive", mrp, sellingPrice, wholesalePrice,
 *   hsnCode, barcode, batch, expiry, updatePrices }
 * data.lines (quotation): { productId, variantSku, name, quantity, price, gstRate, mrp }
 */
import handleResponse from "../../utils/helper.js";
import { getPagination } from "../../utils/pagination.js";
import { buildSearchRegex } from "../../utils/regex.js";
import { dayStartIST, dayEndIST } from "../../services/orderQueryService.js";
import Product from "../../models/product.js";
import { PosPurchaseEntry, PosGstRegisterEntry, PosBatch, nextPosNumber } from "../../models/pos.js";
import { round2, isObjectId, httpError, ownerFilter, withTransaction, moveStock, findVariant, splitGst } from "../../services/pos/posService.js";
import { applySupplierTxn } from "./posPartyController.js";

const fail = (res, err) => handleResponse(res, err.statusCode || 500, err.message);
const TYPES = ["purchase", "quotation"];

/** Server-side line maths so stored totals can't drift from the lines. */
function computeLines(type, lines = []) {
  const out = (Array.isArray(lines) ? lines : []).map((l) => {
    const quantity = Number(l.quantity) || 0;
    const gstRate = Number(l.gstRate) || 0;
    if (type === "quotation") {
      const price = round2(l.price ?? l.sellingPrice ?? 0);
      const total = round2(price * quantity);
      const gst = gstRate ? round2((total * gstRate) / (100 + gstRate)) : 0;
      return { ...l, quantity, price, gstRate, total, gstAmount: gst, taxable: round2(total - gst) };
    }
    const rate = round2(l.purchasePrice ?? 0);
    const inclusive = (l.gstMode || "exclusive") === "inclusive";
    const gross = round2(rate * quantity);
    const taxable = inclusive && gstRate ? round2((gross * 100) / (100 + gstRate)) : gross;
    const gst = round2(inclusive ? gross - taxable : (taxable * gstRate) / 100);
    return { ...l, quantity, purchasePrice: rate, gstRate, taxable, gstAmount: gst, total: round2(taxable + gst) };
  });
  return {
    lines: out,
    taxableTotal: round2(out.reduce((s, l) => s + l.taxable, 0)),
    gstTotal: round2(out.reduce((s, l) => s + l.gstAmount, 0)),
    total: round2(out.reduce((s, l) => s + l.total, 0)),
  };
}

function entryFields(type, body) {
  const calc = computeLines(type, body.data?.lines);
  const extraCharges = round2(body.data?.extraCharges || 0);
  const discount = round2(body.data?.discount || 0);
  const total = round2(calc.total + extraCharges - discount);
  return {
    supplier: type === "purchase" && isObjectId(body.supplierId) ? body.supplierId : null,
    customer: type === "quotation" && isObjectId(body.customerId) ? body.customerId : null,
    partyName: String(body.partyName || "").trim(),
    billNo: String(body.billNo || "").trim(),
    date: body.date ? new Date(body.date) : new Date(),
    paymentMethod: body.paymentMethod,
    // with a supplier account, paying more than the bill leaves the rest as an advance
    paidAmount: type === "purchase" && isObjectId(body.supplierId) ? Math.max(0, round2(body.paidAmount || 0)) : Math.min(round2(body.paidAmount || 0), total),
    data: { ...(body.data || {}), lines: calc.lines, extraCharges, discount },
    taxableTotal: calc.taxableTotal,
    gstTotal: calc.gstTotal,
    total,
  };
}

export const listEntries = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const filter = ownerFilter(req.pos);
    if (TYPES.includes(req.query.type)) filter.type = req.query.type;
    if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = dayStartIST(req.query.from);
      if (req.query.to) filter.date.$lte = dayEndIST(req.query.to);
    }
    const term = String(req.query.search || "").trim();
    if (term) {
      const rx = buildSearchRegex(term, { anchored: false });
      filter.$or = [{ number: rx }, { partyName: rx }, { billNo: rx }];
    }
    const [items, total] = await Promise.all([
      PosPurchaseEntry.find(filter).select("-data").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PosPurchaseEntry.countDocuments(filter),
    ]);
    return handleResponse(res, 200, "Entries", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    return fail(res, err);
  }
};

async function findEntry(pos, id) {
  if (!isObjectId(id)) throw httpError(400, "Invalid entry id");
  const entry = await PosPurchaseEntry.findOne(ownerFilter(pos, { _id: id }));
  if (!entry) throw httpError(404, "Entry not found");
  return entry;
}

export const getEntry = async (req, res) => {
  try {
    const entry = await findEntry(req.pos, req.params.id);
    await entry.populate([{ path: "supplier", select: "name phone gstin balance" }, { path: "customer", select: "name phone gstin" }]);
    return handleResponse(res, 200, "Entry", entry);
  } catch (err) {
    return fail(res, err);
  }
};

export const createEntry = async (req, res) => {
  try {
    const type = req.body.type;
    if (!TYPES.includes(type)) throw httpError(400, "type must be purchase or quotation");
    const seq = await nextPosNumber(`${type}:${req.pos.ownerKey}`);
    const entry = await PosPurchaseEntry.create({
      owner: req.pos.owner,
      type,
      number: `${type === "purchase" ? "PO" : "QT"}-${String(seq).padStart(5, "0")}`,
      ...entryFields(type, req.body),
      createdBy: req.pos.actor,
    });
    return handleResponse(res, 201, "Saved", entry);
  } catch (err) {
    return fail(res, err);
  }
};

export const updateEntry = async (req, res) => {
  try {
    const entry = await findEntry(req.pos, req.params.id);
    if (entry.status !== "draft") throw httpError(400, "Completed entries can't be edited");
    Object.assign(entry, entryFields(entry.type, req.body));
    entry.markModified("data");
    await entry.save();
    return handleResponse(res, 200, "Saved", entry);
  } catch (err) {
    return fail(res, err);
  }
};

export const deleteEntry = async (req, res) => {
  try {
    const entry = await findEntry(req.pos, req.params.id);
    if (entry.type === "purchase" && entry.status === "completed") {
      throw httpError(400, "A completed purchase already moved stock; it can't be deleted");
    }
    await entry.deleteOne();
    return handleResponse(res, 200, "Deleted");
  } catch (err) {
    return fail(res, err);
  }
};

/** Apply a purchase: stock in, optional price updates, supplier dues, GST register. */
export const completePurchase = async (req, res) => {
  try {
    const pos = req.pos;
    const result = await withTransaction(async (session) => {
      const entry = await PosPurchaseEntry.findOne(ownerFilter(pos, { _id: req.params.id, type: "purchase" })).session(session);
      if (!entry) throw httpError(404, "Purchase not found");
      if (entry.status !== "draft") throw httpError(400, "This purchase is already completed");
      const lines = entry.data?.lines || [];
      if (!lines.length) throw httpError(400, "Add at least one item");

      const ids = lines.map((l) => l.productId).filter(isObjectId);
      const products = await Product.find({ _id: { $in: ids } }).session(session);
      const byId = new Map(products.map((p) => [String(p._id), p]));
      const stockLines = [];

      for (const line of lines) {
        const product = isObjectId(line.productId) ? byId.get(String(line.productId)) : null;
        if (!product) continue; // unlinked line: bookkeeping only
        if (!pos.isAdmin && String(product.sellerId) !== String(pos.owner)) throw httpError(403, `"${product.name}" is not your product`);
        const variant = findVariant(product, line.variantSku);
        if (line.updatePrices) {
          const target = variant || product;
          if (Number(line.mrp) > 0) target.mrp = round2(line.mrp);
          if (Number(line.sellingPrice) > 0) target.sellingPrice = round2(line.sellingPrice);
          if (Number(line.wholesalePrice) > 0) target.wholesalePrice = round2(line.wholesalePrice);
          if (Number(line.purchasePrice) > 0) target.purchaseRate = round2(line.purchasePrice);
          if (line.barcode) target.barcode = String(line.barcode).trim();
          if (line.hsnCode) product.hsnCode = String(line.hsnCode).trim();
          if (line.gstRate !== undefined) product.gstRate = Number(line.gstRate) || 0;
          await product.save({ session });
        }
        stockLines.push({
          product: product._id,
          seller: product.sellerId,
          variantSku: variant ? String(variant.sku || variant.name || "").trim() : "",
          name: product.name,
          quantity: Number(line.quantity) || 0,
          batchNo: String(line.batch || "").trim(),
          expiry: line.expiry ? new Date(line.expiry) : null,
        });
      }
      await moveStock(stockLines.filter((l) => l.quantity > 0), {
        direction: 1, type: "Purchase", source: "PURCHASE", pos, note: `Purchase ${entry.number}${entry.billNo ? ` (bill ${entry.billNo})` : ""}`, strict: false, session,
      });

      // batch/expiry tracking for lines that carry a batch number or expiry date
      const batches = stockLines
        .filter((l) => l.quantity > 0 && (l.batchNo || l.expiry))
        .map((l) => ({
          seller: l.seller,
          product: l.product,
          variantSku: l.variantSku,
          batchNo: l.batchNo || undefined,
          expiry: l.expiry && !Number.isNaN(l.expiry.getTime()) ? l.expiry : null,
          quantity: l.quantity,
          receivedAt: entry.date || new Date(),
          purchaseEntry: entry._id,
          owner: pos.owner,
        }));
      if (batches.length) await PosBatch.insertMany(batches, { session });

      if (entry.supplier) {
        await applySupplierTxn(pos, entry.supplier, { amount: entry.total, type: "purchase", reference: entry.billNo || entry.number, note: `Purchase ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
        if (entry.paidAmount > 0) {
          await applySupplierTxn(pos, entry.supplier, { amount: -entry.paidAmount, type: "payment", method: entry.paymentMethod || "Cash", reference: entry.billNo || entry.number, note: `Paid with ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
        }
      }

      if (entry.gstTotal > 0) {
        const igst = Boolean(entry.data?.igst);
        const split = splitGst(entry.gstTotal);
        await PosGstRegisterEntry.create([{
          owner: pos.owner,
          date: entry.date,
          invoiceNo: entry.billNo || entry.number,
          partyName: entry.partyName,
          gstin: entry.data?.supplierGstin || "",
          taxableValue: entry.taxableTotal,
          cgst: igst ? 0 : split.cgst,
          sgst: igst ? 0 : split.sgst,
          igst: igst ? entry.gstTotal : 0,
          total: entry.total,
          purchaseEntry: entry._id,
        }], { session });
      }

      entry.status = "completed";
      entry.completedAt = new Date();
      await entry.save({ session });
      return entry;
    });
    return handleResponse(res, 200, "Purchase completed, stock updated", result);
  } catch (err) {
    return fail(res, err);
  }
};

// ======================================================== GST register
export const listGstRegister = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 50, maxLimit: 500 });
    const filter = ownerFilter(req.pos);
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = dayStartIST(req.query.from);
      if (req.query.to) filter.date.$lte = dayEndIST(req.query.to);
    }
    const [items, total, sums] = await Promise.all([
      PosGstRegisterEntry.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      PosGstRegisterEntry.countDocuments(filter),
      PosGstRegisterEntry.aggregate([
        { $match: filter },
        { $group: { _id: null, taxable: { $sum: "$taxableValue" }, cgst: { $sum: "$cgst" }, sgst: { $sum: "$sgst" }, igst: { $sum: "$igst" }, total: { $sum: "$total" } } },
      ]),
    ]);
    const s = sums[0] || {};
    return handleResponse(res, 200, "GST register", {
      items, page, limit, total, totalPages: Math.ceil(total / limit) || 1,
      totals: { taxable: round2(s.taxable), cgst: round2(s.cgst), sgst: round2(s.sgst), igst: round2(s.igst), total: round2(s.total) },
    });
  } catch (err) {
    return fail(res, err);
  }
};

const GST_FIELDS = ["date", "invoiceNo", "partyName", "gstin", "taxableValue", "cgst", "sgst", "igst", "notes"];
function gstData(body) {
  const data = Object.fromEntries(GST_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
  for (const k of ["taxableValue", "cgst", "sgst", "igst"]) if (data[k] !== undefined) data[k] = round2(data[k]);
  return data;
}

export const createGstEntry = async (req, res) => {
  try {
    const data = gstData(req.body);
    if (!data.date) throw httpError(400, "Date is required");
    data.total = round2((data.taxableValue || 0) + (data.cgst || 0) + (data.sgst || 0) + (data.igst || 0));
    const entry = await PosGstRegisterEntry.create({ ...data, owner: req.pos.owner });
    return handleResponse(res, 201, "Added", entry);
  } catch (err) {
    return fail(res, err);
  }
};

export const updateGstEntry = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
    const entry = await PosGstRegisterEntry.findOne(ownerFilter(req.pos, { _id: req.params.id }));
    if (!entry) throw httpError(404, "Entry not found");
    Object.assign(entry, gstData(req.body));
    entry.total = round2(entry.taxableValue + entry.cgst + entry.sgst + entry.igst);
    await entry.save();
    return handleResponse(res, 200, "Updated", entry);
  } catch (err) {
    return fail(res, err);
  }
};

export const deleteGstEntry = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
    const out = await PosGstRegisterEntry.deleteOne(ownerFilter(req.pos, { _id: req.params.id }));
    if (!out.deletedCount) throw httpError(404, "Entry not found");
    return handleResponse(res, 200, "Deleted");
  } catch (err) {
    return fail(res, err);
  }
};
