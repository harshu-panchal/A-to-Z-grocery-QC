import mongoose from "mongoose";
import { PosOrder, PosCreditTransaction } from "../../models/pos.js";
import StaffActivity from "../../models/staffActivity.js";
import StaffCashCollection from "../../models/staffCashCollection.js";

/**
 * Money a staff member took at the POS counter, and their shifts.
 *
 * Cash to hand over for a period = change left in the drawer at the last
 * collection + cash bills + cash udhaar payments / advances received + cash
 * collected on exchanges - cash given back on exchanges.
 * UPI / card / online go straight to the owner's account: shown, not collected.
 * Cancelled bills are left out.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const posOwner = (scope) => (scope.ownerType === "seller" ? oid(scope.ownerId) : null);

/** Start of the current period: the last collection, else when the staff member was added. */
export async function currentPeriod(scope, staff) {
  const last = await StaffCashCollection.findOne({ ownerType: scope.ownerType, ownerId: scope.ownerId || null, staffId: staff._id })
    .sort({ to: -1 })
    .lean();
  return {
    from: last ? last.to : staff.createdAt || new Date(0),
    floatIn: r2(last?.floatLeft || 0),
    lastCollection: last || null,
  };
}

/** Totals for one staff member over [from, to). */
export async function summarize(scope, staffId, from, to, { floatIn = 0 } = {}) {
  const owner = posOwner(scope);
  const by = oid(staffId);
  const when = { $gte: from, $lt: to };

  const [bills, exchanges, credit] = await Promise.all([
    PosOrder.aggregate([
      { $match: { owner, createdBy: by, status: "completed", createdAt: when } },
      { $group: { _id: "$paymentMethod", amount: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    PosOrder.aggregate([
      { $match: { owner, "exchanges.by": by } },
      { $unwind: "$exchanges" },
      { $match: { "exchanges.by": by, "exchanges.at": when } },
      {
        $group: {
          _id: { onAccount: { $eq: ["$paymentMethod", "Credit"] } },
          collected: { $sum: { $cond: [{ $gt: ["$exchanges.difference", 0] }, "$exchanges.difference", 0] } },
          given: { $sum: { $cond: [{ $lt: ["$exchanges.difference", 0] }, { $abs: "$exchanges.difference" }, 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    PosCreditTransaction.aggregate([
      { $match: { owner, createdBy: by, type: { $in: ["payment", "advance"] }, createdAt: when } },
      { $group: { _id: "$method", amount: { $sum: { $abs: "$amount" } } } },
    ]),
  ]);

  const bill = (m) => bills.find((b) => b._id === m) || { amount: 0, count: 0 };
  const cashExchange = exchanges.find((e) => !e._id.onAccount) || { collected: 0, given: 0, count: 0 };
  const udhaarCash = r2(credit.filter((c) => !c._id || /^cash$/i.test(c._id)).reduce((s, c) => s + c.amount, 0));
  const udhaarOther = r2(credit.filter((c) => c._id && !/^cash$/i.test(c._id)).reduce((s, c) => s + c.amount, 0));

  const breakdown = {
    floatIn: r2(floatIn),
    cashBills: r2(bill("Cash").amount),
    udhaarCash,
    exchangeCollected: r2(cashExchange.collected),
    exchangeGiven: r2(cashExchange.given),
    upi: r2(bill("UPI").amount),
    card: r2(bill("Card").amount),
    online: r2(bill("Online").amount),
    udhaarGiven: r2(bill("Credit").amount),
    udhaarReceivedOnline: udhaarOther,
    bills: bills.reduce((s, b) => s + b.count, 0),
    exchanges: exchanges.reduce((s, e) => s + e.count, 0),
  };
  const cash = r2(breakdown.floatIn + breakdown.cashBills + breakdown.udhaarCash + breakdown.exchangeCollected - breakdown.exchangeGiven);
  return { from, to, cash, breakdown };
}

/**
 * Login -> logout sessions since `from` (newest first, at most `limit`).
 * A session with no logout ends at the next login, or is still open.
 */
export async function shifts(scope, staffId, from, to, { limit = 15 } = {}) {
  const rows = await StaffActivity.find({
    ownerType: scope.ownerType,
    ownerId: scope.ownerId || null,
    staffId: oid(staffId),
    kind: { $in: ["login", "logout"] },
    createdAt: { $gte: from, $lt: to },
  })
    .sort({ createdAt: 1 })
    .select("kind createdAt")
    .lean();

  const sessions = [];
  for (const row of rows) {
    if (row.kind === "login") {
      const open = sessions[sessions.length - 1];
      if (open && !open.end) { open.end = row.createdAt; open.noLogout = true; }
      sessions.push({ start: row.createdAt, end: null });
    } else {
      const open = sessions[sessions.length - 1];
      if (open && !open.end) open.end = row.createdAt;
      else sessions.push({ start: from, end: row.createdAt, startUnknown: true }); // logged in before this period
    }
  }

  const recent = sessions.slice(-limit).reverse();
  return Promise.all(recent.map(async (s) => {
    const end = s.end || to;
    const sum = await summarize(scope, staffId, s.start, end);
    return {
      start: s.start,
      end: s.end,
      open: !s.end,
      noLogout: Boolean(s.noLogout),
      startUnknown: Boolean(s.startUnknown),
      minutes: Math.max(0, Math.round((end - new Date(s.start)) / 60000)),
      bills: sum.breakdown.bills,
      cash: r2(sum.cash),
      upi: sum.breakdown.upi,
      card: sum.breakdown.card,
      udhaarGiven: sum.breakdown.udhaarGiven,
    };
  }));
}
