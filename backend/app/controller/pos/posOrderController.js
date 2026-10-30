import mongoose from "mongoose";
import handleResponse from "../../utils/helper.js";
import { getPagination } from "../../utils/pagination.js";
import { buildSearchRegex } from "../../utils/regex.js";
import { dayStartIST, dayEndIST } from "../../services/orderQueryService.js";
import {
  PosOrder,
  PosCustomer,
  PosCreditTransaction,
  PosPurchaseEntry,
  nextPosNumber,
} from "../../models/pos.js";
import {
  WALK_IN,
  round2,
  isObjectId,
  httpError,
  ownerFilter,
  resolveLines,
  computeTotals,
  moveStock,
  withTransaction,
} from "../../services/pos/posService.js";

const OFFLINE_METHODS = ["Cash", "Credit", "UPI", "Card"];

const fail = (res, err) => handleResponse(res, err.statusCode || 500, err.message || "Something went wrong");

async function nextInvoiceNumber(pos, session) {
  const seq = await nextPosNumber(`invoice:${pos.ownerKey}`, session);
  return `${pos.isAdmin ? "A" : "S"}-${String(seq).padStart(6, "0")}`;
}

async function loadCustomer(pos, customerId, session) {
  if (!customerId || customerId === WALK_IN) return null;
  if (!isObjectId(customerId)) throw httpError(400, "Invalid customer");
  const customer = await PosCustomer.findOne(ownerFilter(pos, { _id: customerId })).session(session);
  if (!customer) throw httpError(404, "Customer not found");
  return customer;
}

/**
 * Prices on a quotation the owner made are allowed for staff who can't change
 * prices themselves (the quotation was the owner's decision).
 */
async function quotationLines(pos, quotationId) {
  if (!pos.isStaff || !isObjectId(quotationId)) return [];
  const q = await PosPurchaseEntry.findOne(ownerFilter(pos, { _id: quotationId, type: "quotation" })).select("data").lean();
  return (q?.data?.lines || []).map((l) => ({ product: l.productId, variantSku: l.variantSku || "", unitPrice: Number(l.price) || 0, lineDiscount: 0 }));
}

/** Udhaar must stay within the customer's limit (when one is set). */
function checkCreditLimit(customer, amount) {
  const limit = Number(customer?.creditLimit) || 0;
  if (limit > 0 && round2((Number(customer.creditBalance) || 0) + amount) > limit) {
    throw httpError(400, "This customer's udhaar limit would be crossed. Take payment another way or ask the owner.");
  }
}

const snapshotOf = (customer) =>
  customer
    ? { name: customer.name, phone: customer.phone, gstin: customer.gstin, address: customer.address }
    : { name: "Walk-in Customer" };

/** Apply a signed change to a customer's credit balance and log it. */
async function changeCredit({ pos, customer, amount, type, order = null, method, note, session }) {
  if (!amount) return;
  customer.creditBalance = round2((customer.creditBalance || 0) + amount);
  await customer.save({ session });
  await PosCreditTransaction.create(
    [{
      owner: pos.owner,
      customer: customer._id,
      type,
      amount: round2(amount),
      balanceAfter: customer.creditBalance,
      method,
      order,
      note,
      createdBy: pos.actor,
    }],
    { session },
  );
}

// ------------------------------------------------------------- create sale
export const createPosOrder = async (req, res) => {
  try {
    const pos = req.pos;
    const { customerId, paymentMethod = "Cash", items, billDiscount = 0, amountReceived, notes, quotationId } = req.body;
    const clientRef = req.body.clientRef ? String(req.body.clientRef).slice(0, 80) : undefined;
    const offline = Boolean(req.body.offline);
    if (clientRef) {
      // offline bill re-sent after a dropped connection: return the saved one
      const existing = await PosOrder.findOne(ownerFilter(pos, { clientRef })).lean();
      if (existing) return handleResponse(res, 200, "Bill already saved", existing);
    }
    if (!OFFLINE_METHODS.includes(paymentMethod)) throw httpError(400, "Use Cash, UPI, Card or Credit (Online has its own checkout)");
    if (paymentMethod === "Credit" && (!customerId || customerId === WALK_IN)) {
      throw httpError(400, "Credit (udhaar) needs a saved customer");
    }

    const order = await withTransaction(async (session) => {
      const customer = await loadCustomer(pos, customerId, session);
      const priceWarnings = offline ? [] : null;
      const lines = await resolveLines(pos, items, { knownLines: await quotationLines(pos, quotationId), priceWarnings });
      const totals = computeTotals(lines, { billDiscount });
      if (paymentMethod === "Credit" && !offline) checkCreditLimit(customer, totals.total);
      const received = paymentMethod === "Credit" ? 0 : round2(amountReceived ?? totals.total);
      if (paymentMethod === "Cash" && received < totals.total && !offline) throw httpError(400, "Cash received is less than the bill total");

      const [doc] = await PosOrder.create(
        [{
          owner: pos.owner,
          channel: pos.role,
          invoiceNumber: await nextInvoiceNumber(pos, session),
          createdBy: pos.actor,
          createdByName: pos.actorName,
          customer: customer?._id || null,
          customerSnapshot: snapshotOf(customer),
          items: lines,
          ...totals,
          paymentMethod,
          paymentStatus: paymentMethod === "Credit" ? "Pending" : "Paid",
          amountReceived: received,
          changeReturned: paymentMethod === "Cash" ? round2(received - totals.total) : 0,
          status: "completed",
          notes: priceWarnings?.length
            ? [notes, `Offline bill by ${pos.actorName || "staff"}, price differs from shop price: ${priceWarnings.join("; ")}`].filter(Boolean).join("\n")
            : notes,
          quotation: isObjectId(quotationId) ? quotationId : null,
          clientRef,
          billedOffline: offline,
          billedAt: offline && req.body.billedAt ? new Date(req.body.billedAt) : undefined,
        }],
        { session },
      );

      // Offline bills were already handed over at the counter: record them even if stock went short
      await moveStock(doc.items, { direction: -1, type: "POS Sale", pos, posOrder: doc._id, note: `POS bill ${doc.invoiceNumber}${offline ? " (offline)" : ""}`, strict: !offline, session });
      doc.markModified("items");
      await doc.save({ session });

      if (paymentMethod === "Credit") {
        await changeCredit({ pos, customer, amount: doc.total, type: "sale", order: doc._id, note: `Bill ${doc.invoiceNumber}`, session });
      }
      if (doc.quotation) {
        await PosPurchaseEntry.updateOne(
          ownerFilter(pos, { _id: doc.quotation, type: "quotation" }),
          { $set: { status: "converted", convertedOrder: doc._id } },
          { session },
        );
      }
      return doc;
    });

    return handleResponse(res, 201, "Bill saved", order);
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------ list/report
function buildOrderFilter(pos, q) {
  const filter = ownerFilter(pos, { channel: pos.role });
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = dayStartIST(q.from);
    if (q.to) filter.createdAt.$lte = dayEndIST(q.to);
  }
  if (q.paymentMethod && q.paymentMethod !== "all") filter.paymentMethod = q.paymentMethod;
  if (q.paymentStatus && q.paymentStatus !== "all") filter.paymentStatus = q.paymentStatus;
  if (q.status && q.status !== "all") filter.status = q.status;
  else filter.status = { $ne: "pending_payment" };
  if (isObjectId(q.customerId)) filter.customer = new mongoose.Types.ObjectId(String(q.customerId));
  const term = String(q.search || "").trim();
  if (term) {
    const rx = buildSearchRegex(term, { anchored: false });
    filter.$or = [{ invoiceNumber: rx }, { "customerSnapshot.name": rx }, { "customerSnapshot.phone": rx }];
  }
  return filter;
}

export const listPosOrders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });
    const filter = buildOrderFilter(req.pos, req.query);
    const [items, total, summaryRows] = await Promise.all([
      PosOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PosOrder.countDocuments(filter),
      PosOrder.aggregate([
        { $match: { ...filter, status: "completed" } },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$total" }, gst: { $sum: "$gstTotal" } } },
      ]),
    ]);
    const byMethod = Object.fromEntries(summaryRows.map((r) => [r._id, { count: r.count, total: round2(r.total) }]));
    const summary = {
      bills: summaryRows.reduce((s, r) => s + r.count, 0),
      sales: round2(summaryRows.reduce((s, r) => s + r.total, 0)),
      gst: round2(summaryRows.reduce((s, r) => s + r.gst, 0)),
      byMethod,
    };
    return handleResponse(res, 200, "POS bills", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1, summary });
  } catch (err) {
    return fail(res, err);
  }
};

export const getPosOrder = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid bill id");
    const order = await PosOrder.findOne(ownerFilter(req.pos, { _id: req.params.id })).populate("customer").lean();
    if (!order) throw httpError(404, "Bill not found");
    return handleResponse(res, 200, "POS bill", order);
  } catch (err) {
    return fail(res, err);
  }
};

// --------------------------------------------------------------- edit bill
export const updatePosOrderItems = async (req, res) => {
  try {
    const pos = req.pos;
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid bill id");
    const { items, billDiscount = 0, customerId, notes } = req.body;

    const order = await withTransaction(async (session) => {
      const doc = await PosOrder.findOne(ownerFilter(pos, { _id: req.params.id })).session(session);
      if (!doc) throw httpError(404, "Bill not found");
      if (doc.status !== "completed") throw httpError(400, "Only completed bills can be edited");
      if (doc.paymentMethod === "Online") throw httpError(400, "Online-paid bills can't be edited; cancel and re-bill instead");
      if (doc.items.some((l) => l.returnedQty > 0)) throw httpError(400, "Items on this bill were exchanged, so it can't be edited. Use Exchange instead.");

      // 1. put back what the old bill took
      const oldLines = doc.items.filter((l) => l.stockDeducted).map((l) => l.toObject());
      await moveStock(oldLines, { direction: 1, type: "POS Edit Restore", pos, posOrder: doc._id, note: `Edit of ${doc.invoiceNumber}`, strict: false, session });

      // 2. take the new lines
      const lines = await resolveLines(pos, items, { knownLines: doc.items });
      await moveStock(lines, { direction: -1, type: "POS Edit Deduct", pos, posOrder: doc._id, note: `Edit of ${doc.invoiceNumber}`, session });

      const oldTotal = doc.total;
      const totals = computeTotals(lines, { billDiscount });
      if (customerId !== undefined && doc.paymentMethod !== "Credit") {
        const customer = await loadCustomer(pos, customerId, session);
        doc.customer = customer?._id || null;
        doc.customerSnapshot = snapshotOf(customer);
      }
      doc.items = lines;
      Object.assign(doc, totals);
      if (notes !== undefined) doc.notes = notes;
      if (doc.paymentMethod !== "Credit") {
        doc.amountReceived = Math.max(doc.amountReceived, totals.total);
        doc.changeReturned = doc.paymentMethod === "Cash" ? round2(doc.amountReceived - totals.total) : 0;
      }
      doc.editCount += 1;
      await doc.save({ session });

      // 3. credit bills: the customer's due follows the new total
      if (doc.paymentMethod === "Credit" && doc.customer) {
        const customer = await PosCustomer.findById(doc.customer).session(session);
        await changeCredit({ pos, customer, amount: round2(doc.total - oldTotal), type: "adjust", order: doc._id, note: `Bill ${doc.invoiceNumber} edited`, session });
      }
      return doc;
    });
    return handleResponse(res, 200, "Bill updated", order);
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------- cancel bill
/**
 * Cancel a bill. Stock is put back (unless ?restoreStock=false) and a credit
 * bill's due is reversed. The bill stays in the report as "cancelled".
 */
async function cancelOne(pos, id, { restore, reason }) {
  return withTransaction(async (session) => {
    const doc = await PosOrder.findOne(ownerFilter(pos, { _id: id })).session(session);
    if (!doc) throw httpError(404, "Bill not found");
    if (doc.status === "cancelled") throw httpError(400, "Bill is already cancelled");
    if (restore && doc.status === "completed") {
      const lines = doc.items
        .filter((l) => l.stockDeducted && l.quantity - (l.returnedQty || 0) > 0)
        .map((l) => ({ ...l.toObject(), quantity: round2(l.quantity - (l.returnedQty || 0)) }));
      await moveStock(lines, { direction: 1, type: "POS Cancel Restore", pos, posOrder: doc._id, note: `Cancelled ${doc.invoiceNumber}`, strict: false, session });
    }
    if (doc.paymentMethod === "Credit" && doc.customer && doc.status === "completed") {
      const customer = await PosCustomer.findById(doc.customer).session(session);
      if (customer) await changeCredit({ pos, customer, amount: -round2(doc.total - (doc.returnedValue || 0)), type: "reversal", order: doc._id, note: `Bill ${doc.invoiceNumber} cancelled`, session });
    }
    doc.status = "cancelled";
    doc.cancelledAt = new Date();
    doc.cancelReason = String(reason || "").slice(0, 200) || undefined;
    if (doc.paymentStatus === "Paid") doc.paymentStatus = "Refunded";
    await doc.save({ session });
    return doc;
  });
}

const cancelOptions = (req) => ({
  restore: String(req.query.restoreStock ?? req.body?.restoreStock ?? "true") !== "false",
  reason: req.body?.reason || req.query.reason,
});

export const cancelPosOrder = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw httpError(400, "Invalid bill id");
    const order = await cancelOne(req.pos, req.params.id, cancelOptions(req));
    return handleResponse(res, 200, "Bill cancelled", order);
  } catch (err) {
    return fail(res, err);
  }
};

/** Bulk cancel (report page). */
export const bulkCancelPosOrders = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isObjectId) : [];
  const results = [];
  for (const id of ids) {
    try {
      await cancelOne(req.pos, id, cancelOptions(req));
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, message: err.message });
    }
  }
  return handleResponse(res, 200, "Bulk cancel finished", { results });
};

// ---------------------------------------------------------------- exchange
/** Items returned (stock in) and new items given (stock out), no new bill. */
/**
 * Items taken back from a bill, refunded at what the customer actually paid:
 * the line's own price and discount, then the bill discount / round-off.
 * `returnLines`: [{ lineId, quantity }]. Marks them returned on the bill.
 */
export function takeBackFromBill(doc, returnLines) {
  const share = doc.subtotal > 0 ? doc.total / doc.subtotal : 1;
  return returnLines.map((r, idx) => {
    const line = doc.items.id(r.lineId);
    if (!line) throw httpError(400, `Returned item ${idx + 1} is not on bill ${doc.invoiceNumber}`);
    const quantity = Number(r.quantity);
    const left = round2(line.quantity - (line.returnedQty || 0));
    if (!(quantity > 0) || quantity > left) {
      throw httpError(400, `Only ${left} of "${line.name}" can still be returned on this bill`);
    }
    line.returnedQty = round2((line.returnedQty || 0) + quantity);
    const refund = round2((line.total / line.quantity) * quantity * share);
    // stock goes back only if the sale took it out
    return { ...line.toObject(), quantity, total: refund, product: line.stockDeducted ? line.product : null };
  });
}

export const posExchange = async (req, res) => {
  try {
    const pos = req.pos;
    const { orderId, returnLines = [], returnItems = [], newItems = [], note = "" } = req.body;
    if (!returnLines.length && !returnItems.length && !newItems.length) throw httpError(400, "Nothing to exchange");
    // staff must take returns against the bill, so the refund is what was paid
    if (returnItems.length && pos.isStaff) throw httpError(400, "Pick the original bill for the items coming back");
    if (returnLines.length && !isObjectId(orderId)) throw httpError(400, "Pick the original bill");
    const result = await withTransaction(async (session) => {
      const doc = isObjectId(orderId) ? await PosOrder.findOne(ownerFilter(pos, { _id: orderId })).session(session) : null;
      if (orderId && !doc) throw httpError(404, "Bill not found");
      if (doc && doc.status !== "completed") throw httpError(400, "Only completed bills can take an exchange");

      const fromBill = doc ? takeBackFromBill(doc, returnLines) : [];
      const ins = [...fromBill, ...(returnItems.length ? await resolveLines(pos, returnItems) : [])];
      const outs = newItems.length ? await resolveLines(pos, newItems) : [];
      const ref = note || (doc ? `Exchange on ${doc.invoiceNumber}` : "POS exchange");
      await moveStock(ins, { direction: 1, type: "Exchange In", pos, posOrder: doc?._id || null, note: ref, strict: false, session });
      await moveStock(outs, { direction: -1, type: "Exchange Out", pos, posOrder: doc?._id || null, note: ref, session });
      const returnedValue = round2(ins.reduce((s, l) => s + l.total, 0));
      const newValue = round2(outs.reduce((s, l) => s + l.total, 0));
      const difference = round2(newValue - returnedValue);

      if (doc) {
        const fromBillValue = round2(fromBill.reduce((s, l) => s + l.total, 0));
        doc.returnedValue = round2((doc.returnedValue || 0) + fromBillValue);
        const when = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
        const what = [
          fromBill.length && `returned ${fromBill.map((l) => `${l.name} ×${l.quantity}`).join(", ")} (₹${fromBillValue})`,
          outs.length && `gave ${outs.map((l) => `${l.name} ×${l.quantity}`).join(", ")} (₹${newValue})`,
        ].filter(Boolean).join("; ");
        doc.exchanges.push({ at: new Date(), by: pos.actor, byName: pos.actorName || "", returnedValue, newValue, difference });
        doc.notes = [doc.notes, `Exchange ${when}${pos.actorName ? ` by ${pos.actorName}` : ""}: ${what}`].filter(Boolean).join("\n");
        await doc.save({ session });
        // an udhaar bill settles the difference on the customer's account
        if (doc.paymentMethod === "Credit" && doc.customer && difference) {
          const customer = await PosCustomer.findById(doc.customer).session(session);
          if (customer) await changeCredit({ pos, customer, amount: difference, type: "adjust", order: doc._id, note: `Exchange on ${doc.invoiceNumber}`, session });
        }
      }
      return { returnedValue, newValue, difference, onAccount: doc?.paymentMethod === "Credit" };
    });
    return handleResponse(res, 200, "Exchange recorded", result);
  } catch (err) {
    return fail(res, err);
  }
};

// ----------------------------------------------------------------- summary
export const posSummary = async (req, res) => {
  try {
    const pos = req.pos;
    const now = new Date();
    const today = new Date(now.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const base = ownerFilter(pos, { channel: pos.role, status: "completed" });
    const sumOf = async (from) => {
      const [row] = await PosOrder.aggregate([
        { $match: { ...base, createdAt: { $gte: dayStartIST(from), $lte: dayEndIST(today) } } },
        { $group: { _id: null, bills: { $sum: 1 }, sales: { $sum: "$total" }, gst: { $sum: "$gstTotal" } } },
      ]);
      return { bills: row?.bills || 0, sales: round2(row?.sales || 0), gst: round2(row?.gst || 0) };
    };
    const [todaySum, monthSum, topProducts, recent, dues] = await Promise.all([
      sumOf(today),
      sumOf(monthStart),
      PosOrder.aggregate([
        { $match: { ...base, createdAt: { $gte: dayStartIST(monthStart) } } },
        { $unwind: "$items" },
        { $group: { _id: { name: "$items.name", variant: "$items.variantName" }, qty: { $sum: "$items.quantity" }, sales: { $sum: "$items.total" } } },
        { $sort: { sales: -1 } },
        { $limit: 8 },
      ]),
      PosOrder.find(ownerFilter(pos, { channel: pos.role, status: { $ne: "pending_payment" } })).sort({ createdAt: -1 }).limit(10).lean(),
      PosCustomer.aggregate([
        { $match: ownerFilter(pos, { creditBalance: { $gt: 0 } }) },
        { $group: { _id: null, total: { $sum: "$creditBalance" }, customers: { $sum: 1 } } },
      ]),
    ]);
    return handleResponse(res, 200, "POS summary", {
      today: todaySum,
      month: monthSum,
      topProducts: topProducts.map((t) => ({ name: t._id.name, variant: t._id.variant, qty: t.qty, sales: round2(t.sales) })),
      recent,
      creditDue: { total: round2(dues[0]?.total || 0), customers: dues[0]?.customers || 0 },
    });
  } catch (err) {
    return fail(res, err);
  }
};
