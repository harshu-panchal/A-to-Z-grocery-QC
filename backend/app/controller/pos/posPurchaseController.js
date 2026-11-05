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

/** Products of the lines (only this shop's), and a key per product + size. */
async function loadLineProducts(pos, lines, session) {
  const ids = lines.map((l) => l.productId).filter(isObjectId);
  const products = await Product.find({ _id: { $in: ids } }).session(session);
  for (const p of products) {
    if (!pos.isAdmin && String(p.sellerId) !== String(pos.owner)) throw httpError(403, `"${p.name}" is not your product`);
  }
  return new Map(products.map((p) => [String(p._id), p]));
}

/** Stock each product/size gets from these lines: key -> { product, seller, variantSku, name, quantity } */
function stockByKey(lines, byId) {
  const map = new Map();
  for (const line of lines) {
    const product = isObjectId(line.productId) ? byId.get(String(line.productId)) : null;
    if (!product) continue; // unlinked line: bookkeeping only
    const variant = findVariant(product, line.variantSku);
    const variantSku = variant ? String(variant.sku || variant.name || "").trim() : "";
    const key = `${product._id}|${variantSku}`;
    const row = map.get(key) || { product: product._id, seller: product.sellerId, variantSku, name: product.name, quantity: 0 };
    row.quantity = round2(row.quantity + (Number(line.quantity) || 0));
    map.set(key, row);
  }
  return map;
}

const unpriced = (x) => !(Number(x?.sellingPrice) > 0) && !(Number(x?.mrp) > 0);

/**
 * "Update prices" ticked on a line: copy its prices onto the product / size.
 * A product or size with no price yet (e.g. added by staff without prices)
 * always takes the line's prices, ticked or not, and a product that was
 * hidden only because it had no price goes live.
 */
async function applyPriceUpdates(lines, byId, session) {
  for (const line of lines) {
    const product = isObjectId(line.productId) ? byId.get(String(line.productId)) : null;
    if (!product) continue;
    const target = findVariant(product, line.variantSku) || product;
    const firstPrice = unpriced(target) && (Number(line.sellingPrice) > 0 || Number(line.mrp) > 0);
    if (!line.updatePrices && !firstPrice) continue;
    if (firstPrice && target !== product && unpriced(product)) {
      // the listing price mirrors the first priced size
      product.mrp = round2(Number(line.mrp) > 0 ? line.mrp : line.sellingPrice);
      product.sellingPrice = round2(Number(line.sellingPrice) > 0 ? line.sellingPrice : line.mrp);
      if (product.status === "inactive") product.status = "active";
    }
    if (firstPrice && target === product && product.status === "inactive") product.status = "active";
    if (firstPrice && !(Number(line.mrp) > 0)) target.mrp = round2(line.sellingPrice);
    if (firstPrice && !(Number(line.sellingPrice) > 0)) target.sellingPrice = round2(line.mrp);
    if (Number(line.mrp) > 0) target.mrp = round2(line.mrp);
    if (Number(line.sellingPrice) > 0) target.sellingPrice = round2(line.sellingPrice);
    if (Number(line.wholesalePrice) > 0) target.wholesalePrice = round2(line.wholesalePrice);
    if (Number(line.purchasePrice) > 0) target.purchaseRate = round2(line.purchasePrice);
    if (line.barcode) target.barcode = String(line.barcode).trim();
    if (line.hsnCode) product.hsnCode = String(line.hsnCode).trim();
    if (line.gstRate !== undefined) product.gstRate = Number(line.gstRate) || 0;
    await product.save({ session });
  }
}

/** Batch / expiry rows for lines that carry a batch number or expiry date. */
async function writeBatches(pos, entry, lines, byId, session) {
  const batches = [];
  for (const line of lines) {
    const product = isObjectId(line.productId) ? byId.get(String(line.productId)) : null;
    const quantity = Number(line.quantity) || 0;
    const batchNo = String(line.batch || "").trim();
    const expiry = line.expiry ? new Date(line.expiry) : null;
    if (!product || quantity <= 0 || (!batchNo && !expiry)) continue;
    const variant = findVariant(product, line.variantSku);
    batches.push({
      seller: product.sellerId,
      product: product._id,
      variantSku: variant ? String(variant.sku || variant.name || "").trim() : "",
      batchNo: batchNo || undefined,
      expiry: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
      quantity,
      receivedAt: entry.date || new Date(),
      purchaseEntry: entry._id,
      owner: pos.owner,
    });
  }
  if (batches.length) await PosBatch.insertMany(batches, { session });
}

/** Purchase GST register row for this entry (if it has GST). */
async function writeGstRegister(pos, entry, session) {
  if (!(entry.gstTotal > 0)) return;
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

      const byId = await loadLineProducts(pos, lines, session);
      await applyPriceUpdates(lines, byId, session);
      await moveStock([...stockByKey(lines, byId).values()].filter((l) => l.quantity > 0), {
        direction: 1, type: "Purchase", source: "PURCHASE", pos, note: `Purchase ${entry.number}${entry.billNo ? ` (bill ${entry.billNo})` : ""}`, strict: false, session,
      });
      await writeBatches(pos, entry, lines, byId, session);

      if (entry.supplier) {
        await applySupplierTxn(pos, entry.supplier, { amount: entry.total, type: "purchase", reference: entry.billNo || entry.number, note: `Purchase ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
        if (entry.paidAmount > 0) {
          await applySupplierTxn(pos, entry.supplier, { amount: -entry.paidAmount, type: "payment", method: entry.paymentMethod || "Cash", reference: entry.billNo || entry.number, note: `Paid with ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
        }
      }

      await writeGstRegister(pos, entry, session);

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

/**
 * Edit a completed purchase. Only the difference is applied:
 * stock (+/- per product and size; taking stock back is refused if it was
 * already sold), supplier balance (bill and paid amounts), GST register and
 * batch rows are rebuilt from the new bill, ticked price updates re-applied.
 */
export const revisePurchase = async (req, res) => {
  try {
    const pos = req.pos;
    const result = await withTransaction(async (session) => {
      const entry = await PosPurchaseEntry.findOne(ownerFilter(pos, { _id: req.params.id, type: "purchase" })).session(session);
      if (!entry) throw httpError(404, "Purchase not found");
      if (entry.status !== "completed") throw httpError(400, "Only a completed purchase is edited here; save the draft instead");

      const before = { lines: entry.data?.lines || [], supplier: entry.supplier ? String(entry.supplier) : null, total: entry.total, paid: entry.paidAmount || 0 };
      const next = entryFields("purchase", req.body);
      if (!next.data.lines.length) throw httpError(400, "Add at least one item");
      if (next.data.lines.some((l) => !String(l.name || "").trim() || !(Number(l.quantity) > 0))) throw httpError(400, "Every line needs a name and quantity");

      // 1. stock: only the difference per product + size
      const byId = await loadLineProducts(pos, [...before.lines, ...next.data.lines], session);
      const oldStock = stockByKey(before.lines, byId);
      const newStock = stockByKey(next.data.lines, byId);
      const ups = [];
      const downs = [];
      for (const key of new Set([...oldStock.keys(), ...newStock.keys()])) {
        const base = newStock.get(key) || oldStock.get(key);
        const diff = round2((newStock.get(key)?.quantity || 0) - (oldStock.get(key)?.quantity || 0));
        if (diff > 0) ups.push({ ...base, quantity: diff });
        if (diff < 0) downs.push({ ...base, quantity: -diff });
      }
      const note = `Purchase ${entry.number} edited`;
      try {
        await moveStock(downs, { direction: -1, type: "Purchase", source: "PURCHASE", pos, note, strict: true, session });
      } catch (err) {
        if (err.statusCode === 409) throw httpError(409, `${err.message.replace(/^Not enough stock for /, "Can't reduce ")}: that stock was already sold. Keep a higher quantity.`);
        throw err;
      }
      await moveStock(ups, { direction: 1, type: "Purchase", source: "PURCHASE", pos, note, strict: false, session });
      await applyPriceUpdates(next.data.lines, byId, session);

      // 2. the bill itself
      Object.assign(entry, next);
      entry.markModified("data");
      entry.editCount = (entry.editCount || 0) + 1;
      entry.editedAt = new Date();

      // 3. supplier balance
      const ref = entry.billNo || entry.number;
      const after = { supplier: entry.supplier ? String(entry.supplier) : null, total: entry.total, paid: entry.paidAmount || 0 };
      if (before.supplier && before.supplier === after.supplier) {
        const billDiff = round2(after.total - before.total);
        const paidDiff = round2(after.paid - before.paid);
        if (billDiff) await applySupplierTxn(pos, after.supplier, { amount: billDiff, type: "adjust", reference: ref, note: `${note}: bill ${billDiff > 0 ? "+" : ""}${billDiff}`, date: entry.date, purchaseEntry: entry._id }, session);
        if (paidDiff) await applySupplierTxn(pos, after.supplier, { amount: -paidDiff, type: paidDiff > 0 ? "payment" : "adjust", method: entry.paymentMethod || "Cash", reference: ref, note: `${note}: paid ${paidDiff > 0 ? "+" : ""}${paidDiff}`, date: entry.date, purchaseEntry: entry._id }, session);
      } else {
        if (before.supplier) {
          await applySupplierTxn(pos, before.supplier, { amount: round2(before.paid - before.total), type: "adjust", reference: ref, note: `${note}: moved to another supplier`, date: entry.date, purchaseEntry: entry._id }, session);
        }
        if (after.supplier) {
          await applySupplierTxn(pos, after.supplier, { amount: after.total, type: "purchase", reference: ref, note: `Purchase ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
          if (after.paid > 0) await applySupplierTxn(pos, after.supplier, { amount: -after.paid, type: "payment", method: entry.paymentMethod || "Cash", reference: ref, note: `Paid with ${entry.number}`, date: entry.date, purchaseEntry: entry._id }, session);
        }
      }

      // 4. GST register and batches follow the new bill
      await PosGstRegisterEntry.deleteMany(ownerFilter(pos, { purchaseEntry: entry._id })).session(session);
      await writeGstRegister(pos, entry, session);
      await PosBatch.deleteMany({ purchaseEntry: entry._id }).session(session);
      await writeBatches(pos, entry, entry.data.lines, byId, session);

      await entry.save({ session });
      return entry;
    });
    return handleResponse(res, 200, "Purchase updated: stock, supplier balance and GST adjusted", result);
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
