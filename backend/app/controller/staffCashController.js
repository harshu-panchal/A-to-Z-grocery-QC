import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import Staff from "../models/staff.js";
import StaffCashCollection from "../models/staffCashCollection.js";
import { currentPeriod, summarize, shifts } from "../services/staff/staffCash.js";
import { withLock } from "../utils/distributedLock.js";

/**
 * Cash & shifts (owner only): how much each staff member took at the counter
 * since the last collection, their login -> logout shifts, and "Collect cash"
 * which records the handover and starts the count again from zero.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });
const fail = (res, err) => handleResponse(res, err.statusCode || 500, err.statusCode ? err.message : "Something went wrong");
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));

// seller: one shop's staff; admin: the whole admin team (ownerId null)
const scopeOf = (ownerType, req) => ({ ownerType, ownerId: ownerType === "seller" ? req.user.id : null });
const staffFilter = (scope) => (scope.ownerType === "seller" ? { ownerType: "seller", ownerId: scope.ownerId } : { ownerType: "admin" });
const collectionFilter = (scope) => ({ ownerType: scope.ownerType, ownerId: scope.ownerId ? new mongoose.Types.ObjectId(String(scope.ownerId)) : null });

async function staffSummary(scope, staff, now) {
  const period = await currentPeriod(scope, staff);
  const sum = await summarize(scope, staff._id, period.from, now, { floatIn: period.floatIn });
  return {
    staffId: String(staff._id),
    name: staff.name,
    jobTitle: staff.jobTitle || "",
    isActive: staff.isActive !== false,
    lastLoginAt: staff.lastLoginAt || null,
    from: period.from,
    cashToCollect: sum.cash,
    breakdown: sum.breakdown,
    lastCollection: period.lastCollection
      ? { at: period.lastCollection.to, received: period.lastCollection.received, difference: period.lastCollection.difference }
      : null,
  };
}

export function makeStaffCash(ownerType) {
  return {
    /** GET /cash: every staff member's money since their last collection. ?staffId adds their shifts. */
    summary: async (req, res) => {
      try {
        const scope = scopeOf(ownerType, req);
        const now = new Date();
        const staff = await Staff.find(staffFilter(scope)).sort({ name: 1 }).lean();
        const items = await Promise.all(staff.map((s) => staffSummary(scope, s, now)));
        let shiftList;
        if (req.query.staffId) {
          const one = staff.find((s) => String(s._id) === String(req.query.staffId));
          if (!one) throw httpError(404, "Staff member not found");
          const since = new Date(Math.min(new Date(items.find((i) => i.staffId === String(one._id)).from).getTime(), now - 7 * 864e5));
          shiftList = await shifts(scope, one._id, since, now);
        }
        return handleResponse(res, 200, "Staff cash", { asOf: now, items, shifts: shiftList });
      } catch (err) {
        return fail(res, err);
      }
    },

    /** POST /members/:id/cash/collect { received, floatLeft?, note? } */
    collect: async (req, res) => {
      try {
        const scope = scopeOf(ownerType, req);
        if (!isId(req.params.id)) throw httpError(400, "Invalid staff id");
        const received = Number(req.body?.received);
        const floatLeft = Number(req.body?.floatLeft || 0);
        if (!Number.isFinite(received) || received < 0) throw httpError(400, "Enter the cash you received (0 or more)");
        if (!Number.isFinite(floatLeft) || floatLeft < 0) throw httpError(400, "Change left in the drawer can't be negative");
        const note = String(req.body?.note || "").trim().slice(0, 300);

        const result = await withLock(`staffcash:${req.params.id}`, 10_000, async () => {
          const staff = await Staff.findOne({ _id: req.params.id, ...staffFilter(scope) }).lean();
          if (!staff) throw httpError(404, "Staff member not found");
          const to = new Date();
          const period = await currentPeriod(scope, staff);
          const sum = await summarize(scope, staff._id, period.from, to, { floatIn: period.floatIn });
          const difference = r2(received - sum.cash);
          if (Math.abs(difference) >= 1 && !note) {
            throw httpError(400, `Cash is ${difference < 0 ? "short" : "extra"} by ₹${Math.abs(difference)}. Add a note before saving.`);
          }
          return StaffCashCollection.create({
            ...collectionFilter(scope),
            staffId: staff._id,
            staffName: staff.name,
            from: period.from,
            to,
            expected: sum.cash,
            received: r2(received),
            difference,
            floatLeft: r2(floatLeft),
            breakdown: sum.breakdown,
            note,
            collectedBy: req.user.id,
            collectedByName: req.user.role === "admin" ? "Admin" : "Owner",
          });
        });
        const msg = result.difference === 0
          ? `Collected ₹${result.received} from ${result.staffName}`
          : `Collected ₹${result.received} from ${result.staffName} (${result.difference < 0 ? "short" : "extra"} ₹${Math.abs(result.difference)})`;
        return handleResponse(res, 201, msg, result);
      } catch (err) {
        return fail(res, err);
      }
    },

    /** GET /cash/history?staffId=&page= */
    history: async (req, res) => {
      try {
        const scope = scopeOf(ownerType, req);
        const filter = collectionFilter(scope);
        if (req.query.staffId && isId(req.query.staffId)) filter.staffId = new mongoose.Types.ObjectId(String(req.query.staffId));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 20;
        const [items, total] = await Promise.all([
          StaffCashCollection.find(filter).sort({ to: -1 }).skip((page - 1) * limit).limit(limit).lean(),
          StaffCashCollection.countDocuments(filter),
        ]);
        return handleResponse(res, 200, "Cash collections", { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
      } catch (err) {
        return fail(res, err);
      }
    },
  };
}
