/**
 * POS customers (with udhaar/credit ledger) and suppliers (with payable ledger).
 */
import handleResponse from "../../utils/helper.js";
import { getPagination } from "../../utils/pagination.js";
import { buildSearchRegex } from "../../utils/regex.js";
import {
  PosCustomer,
  PosCreditTransaction,
  PosOrder,
  PosSupplier,
  PosSupplierTransaction,
  PosPurchaseEntry,
} from "../../models/pos.js";
import { round2, isObjectId, httpError, ownerFilter, withTransaction } from "../../services/pos/posService.js";

const fail = (res, err) =>
  handleResponse(res, err.statusCode || (err.code === 11000 ? 409 : 500), err.code === 11000 ? "A record with this phone already exists" : err.message);

const pick = (body, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, typeof body[k] === "string" ? body[k].trim() : body[k]]));
const CUSTOMER_FIELDS = ["name", "phone", "email", "address", "gstin", "notes", "creditLimit"];
const SUPPLIER_FIELDS = ["name", "phone", "email", "address", "gstin", "notes"];

function listFilter(pos, q, balanceField) {
  const filter = ownerFilter(pos);
  const term = String(q.search || "").trim();
  if (term) {
    const rx = buildSearchRegex(term, { anchored: false });
    filter.$or = [{ name: rx }, { phone: rx }, { gstin: rx }];
  }
  if (q.filter === "due") filter[balanceField] = { $gt: 0 };
  if (q.filter === "advance") filter[balanceField] = { $lt: 0 };
  return filter;
}

// =============================================================== customers
export const listCustomers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 50, maxLimit: 200 });
    const filter = listFilter(req.pos, req.query, "creditBalance");
    const [items, total, totals] = await Promise.all([
      PosCustomer.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      PosCustomer.countDocuments(filter),
      PosCustomer.aggregate([
        { $match: ownerFilter(req.pos) },
        {
          $group: {
            _id: null,
            due: { $sum: { $cond: [{ $gt: ["$creditBalance", 0] }, "$creditBalance", 0] } },
            advance: { $sum: { $cond: [{ $lt: ["$creditBalance", 0] }, "$creditBalance", 0] } },
          },
        },
      ]),
    ]);
    return handleResponse(res, 200, "Customers", {
      items, page, limit, total, totalPages: Math.ceil(total / limit) || 1,
      totals: { due: round2(totals[0]?.due || 0), advance: round2(Math.abs(totals[0]?.advance || 0)) },
    });
  } catch (err) {
    return fail(res, err);
  }
};

export const createCustomer = async (req, res) => {
  try {
    const data = pick(req.body, CUSTOMER_FIELDS);
    if (!data.name) throw httpError(400, "Customer name is required");
    if (data.phone && !/^\d{10}$/.test(data.phone)) throw httpError(400, "Phone must be 10 digits");
    const customer = await PosCustomer.create({ ...data, owner: req.pos.owner });
    return handleResponse(res, 201, "Customer added", customer);
  } catch (err) {
    return fail(res, err);
  }
};

async function findCustomer(pos, id) {
  if (!isObjectId(id)) throw httpError(400, "Invalid customer id");
  const customer = await PosCustomer.findOne(ownerFilter(pos, { _id: id }));
  if (!customer) throw httpError(404, "Customer not found");
  return customer;
}

export const getCustomer = async (req, res) => {
  try {
    const customer = await findCustomer(req.pos, req.params.id);
    const [ledger, stats] = await Promise.all([
      PosCreditTransaction.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(300).lean(),
      PosOrder.aggregate([
        { $match: { customer: customer._id, status: "completed" } },
        { $group: { _id: null, bills: { $sum: 1 }, spent: { $sum: "$total" }, last: { $max: "$createdAt" } } },
      ]),
    ]);
    return handleResponse(res, 200, "Customer", {
      customer,
      ledger,
      stats: { bills: stats[0]?.bills || 0, spent: round2(stats[0]?.spent || 0), lastBill: stats[0]?.last || null },
    });
  } catch (err) {
    return fail(res, err);
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customer = await findCustomer(req.pos, req.params.id);
    const data = pick(req.body, CUSTOMER_FIELDS);
    if (data.phone && !/^\d{10}$/.test(data.phone)) throw httpError(400, "Phone must be 10 digits");
    Object.assign(customer, data);
    await customer.save();
    return handleResponse(res, 200, "Customer updated", customer);
  } catch (err) {
    return fail(res, err);
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await findCustomer(req.pos, req.params.id);
    if (Math.abs(customer.creditBalance) >= 0.01) throw httpError(400, "Settle the customer's balance before deleting");
    const bills = await PosOrder.countDocuments({ customer: customer._id });
    if (bills > 0) throw httpError(400, "This customer has bills; it can't be deleted");
    await customer.deleteOne();
    return handleResponse(res, 200, "Customer deleted");
  } catch (err) {
    return fail(res, err);
  }
};

export const customerOrders = async (req, res) => {
  try {
    const customer = await findCustomer(req.pos, req.params.id);
    const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const filter = { customer: customer._id, status: { $ne: "pending_payment" } };
    const [items, total] = await Promise.all([
      PosOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PosOrder.countDocuments(filter),
    ]);
    return handleResponse(res, 200, "Customer bills", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    return fail(res, err);
  }
};

// ------------------------------------------------------------ credit ledger
async function applyCredit(pos, customerId, { amount, type, method, reference, note }) {
  return withTransaction(async (session) => {
    const customer = await PosCustomer.findOne(ownerFilter(pos, { _id: customerId })).session(session);
    if (!customer) throw httpError(404, "Customer not found");
    customer.creditBalance = round2(customer.creditBalance + amount);
    await customer.save({ session });
    const [txn] = await PosCreditTransaction.create(
      [{ owner: pos.owner, customer: customer._id, type, amount: round2(amount), balanceAfter: customer.creditBalance, method, reference, note, createdBy: pos.actor }],
      { session },
    );
    return { customer, transaction: txn };
  });
}

const positive = (v, label = "Amount") => {
  const n = round2(v);
  if (!(n > 0)) throw httpError(400, `${label} must be more than 0`);
  return n;
};

/** Manual due (e.g. old udhaar) or an advance taken from the customer. */
export const addCredit = async (req, res) => {
  try {
    const { customerId, amount, kind = "due", note, method } = req.body;
    if (!isObjectId(customerId)) throw httpError(400, "Pick a customer");
    const value = positive(amount);
    const result = await applyCredit(req.pos, customerId, kind === "advance"
      ? { amount: -value, type: "advance", method: method || "Cash", note }
      : { amount: value, type: "add", note });
    return handleResponse(res, 201, kind === "advance" ? "Advance recorded" : "Due added", result);
  } catch (err) {
    return fail(res, err);
  }
};

/** Customer pays back (cash/UPI/card counted at the counter). */
export const receiveCreditPayment = async (req, res) => {
  try {
    const { customerId, amount, method = "Cash", reference, note } = req.body;
    if (!isObjectId(customerId)) throw httpError(400, "Pick a customer");
    const result = await applyCredit(req.pos, customerId, { amount: -positive(amount), type: "payment", method, reference, note });
    return handleResponse(res, 201, "Payment received", result);
  } catch (err) {
    return fail(res, err);
  }
};

// =============================================================== suppliers
export const listSuppliers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 50, maxLimit: 200 });
    const filter = listFilter(req.pos, req.query, "balance");
    const [items, total, totals] = await Promise.all([
      PosSupplier.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      PosSupplier.countDocuments(filter),
      PosSupplier.aggregate([
        { $match: ownerFilter(req.pos) },
        {
          $group: {
            _id: null,
            payable: { $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] } },
            advance: { $sum: { $cond: [{ $lt: ["$balance", 0] }, "$balance", 0] } },
          },
        },
      ]),
    ]);
    return handleResponse(res, 200, "Suppliers", {
      items, page, limit, total, totalPages: Math.ceil(total / limit) || 1,
      totals: { payable: round2(totals[0]?.payable || 0), advance: round2(Math.abs(totals[0]?.advance || 0)) },
    });
  } catch (err) {
    return fail(res, err);
  }
};

export const createSupplier = async (req, res) => {
  try {
    const data = pick(req.body, SUPPLIER_FIELDS);
    if (!data.name) throw httpError(400, "Supplier name is required");
    const supplier = await PosSupplier.create({ ...data, owner: req.pos.owner });
    const opening = round2(req.body.openingBalance || 0);
    if (opening) {
      supplier.balance = opening;
      await supplier.save();
      await PosSupplierTransaction.create({ owner: req.pos.owner, supplier: supplier._id, type: "adjust", amount: opening, balanceAfter: opening, note: "Opening balance", createdBy: req.pos.actor });
    }
    return handleResponse(res, 201, "Supplier added", supplier);
  } catch (err) {
    return fail(res, err);
  }
};

async function findSupplier(pos, id) {
  if (!isObjectId(id)) throw httpError(400, "Invalid supplier id");
  const supplier = await PosSupplier.findOne(ownerFilter(pos, { _id: id }));
  if (!supplier) throw httpError(404, "Supplier not found");
  return supplier;
}

export const getSupplier = async (req, res) => {
  try {
    const supplier = await findSupplier(req.pos, req.params.id);
    const [ledger, deliveries] = await Promise.all([
      PosSupplierTransaction.find({ supplier: supplier._id }).sort({ date: -1, createdAt: -1 }).limit(300).lean(),
      PosPurchaseEntry.find({ supplier: supplier._id, type: "purchase", status: "completed" })
        .select("number billNo date total data.lines.productId data.lines.variantSku data.lines.name data.lines.variantName data.lines.quantity data.lines.purchasePrice")
        .sort({ date: -1, createdAt: -1 }).limit(500).lean(),
    ]);
    // what this supplier has sent: one row per product/size, newest delivery first
    const byItem = new Map();
    for (const e of deliveries) {
      for (const l of e.data?.lines || []) {
        const key = `${l.productId || l.name}::${l.variantSku || ""}`;
        const row = byItem.get(key) || { productId: l.productId || null, variantSku: l.variantSku || "", name: l.name, variantName: l.variantName || "", quantity: 0, deliveries: 0, lastDate: e.date, lastRate: Number(l.purchasePrice) || 0 };
        row.quantity += Number(l.quantity) || 0;
        row.deliveries += 1;
        byItem.set(key, row);
      }
    }
    // a product that later got its first variant: fold the old no-size rows into it
    for (const [key, row] of byItem) {
      if (!row.productId || row.variantSku) continue;
      const sized = [...byItem.values()].filter((r) => r !== row && String(r.productId) === String(row.productId));
      if (sized.length !== 1) continue;
      sized[0].quantity += row.quantity;
      sized[0].deliveries += row.deliveries;
      byItem.delete(key);
    }
    const supplied = [...byItem.values()].sort((a, b) => b.quantity - a.quantity);
    const recentDeliveries = deliveries.slice(0, 50).map((e) => ({
      _id: e._id, number: e.number, billNo: e.billNo, date: e.date, total: e.total,
      items: (e.data?.lines || []).map((l) => ({ name: l.name, variantName: l.variantName || "", quantity: Number(l.quantity) || 0 })),
    }));
    return handleResponse(res, 200, "Supplier", { supplier, ledger, supplied, deliveries: recentDeliveries });
  } catch (err) {
    return fail(res, err);
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const supplier = await findSupplier(req.pos, req.params.id);
    Object.assign(supplier, pick(req.body, SUPPLIER_FIELDS));
    await supplier.save();
    return handleResponse(res, 200, "Supplier updated", supplier);
  } catch (err) {
    return fail(res, err);
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const supplier = await findSupplier(req.pos, req.params.id);
    if (Math.abs(supplier.balance) >= 0.01) throw httpError(400, "Settle the supplier's balance before deleting");
    await PosSupplierTransaction.deleteMany({ supplier: supplier._id });
    await supplier.deleteOne();
    return handleResponse(res, 200, "Supplier deleted");
  } catch (err) {
    return fail(res, err);
  }
};

/** Record money owed to / paid to a supplier. Exported for purchase finalize. */
export async function applySupplierTxn(pos, supplierId, { amount, type, method, reference, note, date, purchaseEntry = null, reverses = null }, session = null) {
  const supplier = await PosSupplier.findOne(ownerFilter(pos, { _id: supplierId })).session(session);
  if (!supplier) throw httpError(404, "Supplier not found");
  supplier.balance = round2(supplier.balance + amount);
  await supplier.save({ session });
  const [txn] = await PosSupplierTransaction.create(
    [{ owner: pos.owner, supplier: supplier._id, type, amount: round2(amount), balanceAfter: supplier.balance, method, reference, note, date: date || new Date(), purchaseEntry, reverses, createdBy: pos.actor }],
    { session },
  );
  return { supplier, transaction: txn };
}

/**
 * Undo a payment or bill amount entered by mistake: adds an opposite
 * "adjust" row (history is kept). Purchase rows come from a purchase entry
 * and can't be undone here.
 */
export const reverseSupplierTxn = async (req, res) => {
  try {
    if (!isObjectId(req.params.txnId)) throw httpError(400, "Invalid entry id");
    const result = await withTransaction(async (session) => {
      const txn = await PosSupplierTransaction.findOne(ownerFilter(req.pos, { _id: req.params.txnId, supplier: req.params.id })).session(session);
      if (!txn) throw httpError(404, "Entry not found");
      if (!["payment", "debt"].includes(txn.type) || txn.purchaseEntry) throw httpError(400, "Only a payment or bill amount added by hand can be undone");
      if (txn.reversedBy) throw httpError(400, "This entry is already undone");
      const label = txn.type === "payment" ? "payment" : "bill amount";
      const out = await applySupplierTxn(req.pos, txn.supplier, {
        amount: -txn.amount, type: "adjust", reference: txn.reference, note: `Undo ${label} of ₹${Math.abs(txn.amount)}`, reverses: txn._id,
      }, session);
      txn.reversedBy = out.transaction._id;
      await txn.save({ session });
      return out;
    });
    return handleResponse(res, 200, "Entry undone", result);
  } catch (err) {
    return fail(res, err);
  }
};

export const addSupplierDebt = async (req, res) => {
  try {
    const { amount, reference, note, date } = req.body;
    const result = await withTransaction((session) =>
      applySupplierTxn(req.pos, req.params.id, { amount: positive(amount), type: "debt", reference, note, date }, session));
    return handleResponse(res, 201, "Bill amount added", result);
  } catch (err) {
    return fail(res, err);
  }
};

export const paySupplier = async (req, res) => {
  try {
    const { amount, method = "Cash", reference, note, date } = req.body;
    const result = await withTransaction((session) =>
      applySupplierTxn(req.pos, req.params.id, { amount: -positive(amount), type: "payment", method, reference, note, date }, session));
    return handleResponse(res, 201, "Payment recorded", result);
  } catch (err) {
    return fail(res, err);
  }
};
