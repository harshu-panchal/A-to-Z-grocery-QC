/**
 * Staff Management for owners: the seller (their own shop's staff) and the
 * admin team. One controller serves both panels; `ownerType` says which.
 */
import mongoose from "mongoose";
import Staff from "../models/staff.js";
import StaffType from "../models/staffType.js";
import StaffActivity from "../models/staffActivity.js";
import handleResponse from "../utils/helper.js";
import { buildAccess, cleanPermissions, getCatalog } from "../services/staff/permissionCatalog.js";
import { MAX_PASSWORD, MIN_PASSWORD, normalizePhone } from "./staffAuthController.js";

const MAX_STAFF = Number(process.env.STAFF_MAX_PER_OWNER) || 30;
const MAX_TYPES = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });
const fail = (res, err) =>
  handleResponse(
    res,
    err.statusCode || (err.code === 11000 ? 409 : 500),
    err.code === 11000 ? "That email or phone is already used by another staff account" : err.message,
  );

// Which documents belong to this owner. The admin team shares one list.
const staffScope = (ownerType, req) => (ownerType === "seller" ? { ownerType, ownerId: req.user.id } : { ownerType });
const typeScope = (ownerType, req) => (ownerType === "seller" ? { ownerType, ownerId: req.user.id } : { ownerType, ownerId: null });

const presentStaff = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  jobTitle: doc.jobTitle || "",
  email: doc.email || "",
  phone: doc.phone || "",
  isActive: doc.isActive !== false,
  typeId: doc.typeId ? String(doc.typeId) : null,
  permissions: doc.permissions || {},
  modules: buildAccess(doc.ownerType, doc.permissions).modules,
  workingHours: doc.workingHours || { enabled: false },
  lastLoginAt: doc.lastLoginAt || null,
  lockedUntil: doc.lockedUntil && doc.lockedUntil > new Date() ? doc.lockedUntil : null,
  createdAt: doc.createdAt,
});

const presentType = (doc) => ({ id: String(doc._id), name: doc.name, permissions: doc.permissions || {}, createdAt: doc.createdAt });

// ------------------------------------------------------------- input checks
function readPermissions(ownerType, raw) {
  const { permissions, unknown } = cleanPermissions(ownerType, raw);
  if (unknown.length) throw httpError(400, `Unknown permission: ${unknown[0]}`);
  const hasAccess = Object.keys(permissions).some((k) => !getCatalog(ownerType).modules.flatMap((m) => m.subs).find((s) => s.key === k)?.special);
  if (!hasAccess) throw httpError(400, "Pick at least one section this person can open");
  return permissions;
}

function readWorkingHours(raw) {
  if (!raw || !raw.enabled) return { enabled: false, start: "09:00", end: "21:00", days: [0, 1, 2, 3, 4, 5, 6] };
  if (!TIME_RE.test(String(raw.start)) || !TIME_RE.test(String(raw.end))) throw httpError(400, "Working hours must look like 09:00");
  const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) throw httpError(400, "Pick at least one working day");
  return { enabled: true, start: raw.start, end: raw.end, days };
}

function readLogin(body, { requirePassword }) {
  const name = String(body.name ?? "").trim();
  if (!name) throw httpError(400, "Name is required");
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  if (!email && !phone) throw httpError(400, "Enter a phone number or an email so they can log in");
  if (email && !EMAIL_RE.test(email)) throw httpError(400, "That email doesn't look right");
  if (phone && phone.length !== 10) throw httpError(400, "Phone number must be 10 digits");
  const out = { name, email: email || undefined, phone: phone || undefined };
  if (requirePassword) {
    const password = String(body.password ?? "");
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw httpError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
    }
    out.password = password;
  }
  return out;
}

async function readType(ownerType, req, typeId) {
  if (!typeId) return null;
  if (!isId(typeId) || !(await StaffType.exists({ _id: typeId, ...typeScope(ownerType, req) }))) {
    throw httpError(400, "That staff type doesn't exist");
  }
  return typeId;
}

// ---------------------------------------------------------------- handlers
export function makeStaffManagement(ownerType) {
  return {
    /** GET /catalog: what can be ticked, the built-in quick buttons and this owner's own. */
    catalog: async (req, res) => {
      try {
        const types = await StaffType.find(typeScope(ownerType, req)).sort({ name: 1 }).lean();
        return handleResponse(res, 200, "Staff catalog", { ...getCatalog(ownerType), types: types.map(presentType), limits: { maxStaff: MAX_STAFF } });
      } catch (err) {
        return fail(res, err);
      }
    },

    // ------------------------------------------------------------- staff
    list: async (req, res) => {
      try {
        const docs = await Staff.find(staffScope(ownerType, req)).sort({ createdAt: -1 }).lean();
        return handleResponse(res, 200, "Staff", docs.map(presentStaff));
      } catch (err) {
        return fail(res, err);
      }
    },

    create: async (req, res) => {
      try {
        const login = readLogin(req.body, { requirePassword: true });
        const permissions = readPermissions(ownerType, req.body.permissions);
        const workingHours = readWorkingHours(req.body.workingHours);
        const typeId = await readType(ownerType, req, req.body.typeId);
        if ((await Staff.countDocuments(staffScope(ownerType, req))) >= MAX_STAFF) {
          throw httpError(400, `You can add up to ${MAX_STAFF} staff members`);
        }
        const doc = await Staff.create({
          ...login,
          ownerType,
          ownerId: req.user.id,
          jobTitle: String(req.body.jobTitle ?? "").trim().slice(0, 60),
          permissions,
          workingHours,
          typeId,
          createdBy: req.user.id,
        });
        return handleResponse(res, 201, "Staff member added", presentStaff(doc.toObject()));
      } catch (err) {
        return fail(res, err);
      }
    },

    update: async (req, res) => {
      try {
        const { id } = req.params;
        if (!isId(id)) throw httpError(404, "Staff member not found");
        const doc = await Staff.findOne({ _id: id, ...staffScope(ownerType, req) });
        if (!doc) throw httpError(404, "Staff member not found");
        const b = req.body || {};

        if (b.name !== undefined || b.email !== undefined || b.phone !== undefined) {
          const login = readLogin({ name: b.name ?? doc.name, email: b.email ?? doc.email, phone: b.phone ?? doc.phone }, { requirePassword: false });
          doc.name = login.name;
          doc.email = login.email;
          doc.phone = login.phone;
        }
        if (b.jobTitle !== undefined) doc.jobTitle = String(b.jobTitle).trim().slice(0, 60);
        if (b.permissions !== undefined) doc.permissions = readPermissions(ownerType, b.permissions);
        if (b.workingHours !== undefined) doc.workingHours = readWorkingHours(b.workingHours);
        if (b.typeId !== undefined) doc.typeId = await readType(ownerType, req, b.typeId);
        if (b.isActive !== undefined) doc.isActive = Boolean(b.isActive);

        doc.markModified("permissions");
        await doc.save();
        return handleResponse(res, 200, "Staff member updated", presentStaff(doc.toObject()));
      } catch (err) {
        return fail(res, err);
      }
    },

    /** PUT /members/:id/password  { password } - the owner sets a new one. */
    resetPassword: async (req, res) => {
      try {
        const { id } = req.params;
        const password = String(req.body?.password ?? "");
        if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
          throw httpError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
        }
        const doc = isId(id) ? await Staff.findOne({ _id: id, ...staffScope(ownerType, req) }).select("+tokenVersion") : null;
        if (!doc) throw httpError(404, "Staff member not found");
        doc.password = password;
        doc.tokenVersion = (doc.tokenVersion || 0) + 1; // signs them out everywhere
        doc.failedLoginAttempts = 0;
        doc.lockedUntil = null;
        await doc.save();
        return handleResponse(res, 200, "Password reset. Share the new password with them.");
      } catch (err) {
        return fail(res, err);
      }
    },

    remove: async (req, res) => {
      try {
        const { id } = req.params;
        const doc = isId(id) ? await Staff.findOneAndDelete({ _id: id, ...staffScope(ownerType, req) }) : null;
        if (!doc) throw httpError(404, "Staff member not found");
        return handleResponse(res, 200, "Staff member removed");
      } catch (err) {
        return fail(res, err);
      }
    },

    // ------------------------------------------------------------- types
    listTypes: async (req, res) => {
      try {
        const docs = await StaffType.find(typeScope(ownerType, req)).sort({ name: 1 }).lean();
        return handleResponse(res, 200, "Staff types", docs.map(presentType));
      } catch (err) {
        return fail(res, err);
      }
    },

    createType: async (req, res) => {
      try {
        const name = String(req.body?.name ?? "").trim();
        if (!name) throw httpError(400, "Give the staff type a name");
        const permissions = readPermissions(ownerType, req.body?.permissions);
        if ((await StaffType.countDocuments(typeScope(ownerType, req))) >= MAX_TYPES) {
          throw httpError(400, `You can create up to ${MAX_TYPES} staff types`);
        }
        const doc = await StaffType.create({ ...typeScope(ownerType, req), name: name.slice(0, 60), permissions, createdBy: req.user.id });
        return handleResponse(res, 201, "Staff type created", presentType(doc.toObject()));
      } catch (err) {
        if (err.code === 11000) return handleResponse(res, 409, "You already have a staff type with that name");
        return fail(res, err);
      }
    },

    updateType: async (req, res) => {
      try {
        const { id } = req.params;
        const doc = isId(id) ? await StaffType.findOne({ _id: id, ...typeScope(ownerType, req) }) : null;
        if (!doc) throw httpError(404, "Staff type not found");
        if (req.body?.name !== undefined) {
          const name = String(req.body.name).trim();
          if (!name) throw httpError(400, "Give the staff type a name");
          doc.name = name.slice(0, 60);
        }
        if (req.body?.permissions !== undefined) {
          doc.permissions = readPermissions(ownerType, req.body.permissions);
          doc.markModified("permissions");
        }
        await doc.save();
        return handleResponse(res, 200, "Staff type updated", presentType(doc.toObject()));
      } catch (err) {
        if (err.code === 11000) return handleResponse(res, 409, "You already have a staff type with that name");
        return fail(res, err);
      }
    },

    /** Deleting a type never changes the people already created from it. */
    removeType: async (req, res) => {
      try {
        const { id } = req.params;
        const doc = isId(id) ? await StaffType.findOneAndDelete({ _id: id, ...typeScope(ownerType, req) }) : null;
        if (!doc) throw httpError(404, "Staff type not found");
        await Staff.updateMany({ typeId: doc._id, ...staffScope(ownerType, req) }, { $set: { typeId: null } });
        return handleResponse(res, 200, "Staff type deleted");
      } catch (err) {
        return fail(res, err);
      }
    },

    // ---------------------------------------------------------- activity
    activity: async (req, res) => {
      try {
        const q = req.query || {};
        const filter = ownerType === "seller" ? { ownerType, ownerId: req.user.id } : { ownerType };
        if (q.staffId) {
          if (!isId(q.staffId)) throw httpError(400, "Invalid staff member");
          filter.staffId = q.staffId;
        }
        if (q.kind && ["login", "login_failed", "logout", "action", "blocked"].includes(q.kind)) filter.kind = q.kind;
        const from = q.from ? new Date(q.from) : null;
        const to = q.to ? new Date(q.to) : null;
        if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw httpError(400, "Invalid date");
        if (from || to) {
          filter.createdAt = {};
          if (from) filter.createdAt.$gte = from;
          if (to) filter.createdAt.$lte = new Date(to.getTime() + (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to)) ? 86400000 - 1 : 0));
        }
        const term = String(q.q ?? "").trim();
        if (term) {
          const rx = new RegExp(escapeRegex(term.slice(0, 60)), "i");
          filter.$or = [{ action: rx }, { detail: rx }, { staffName: rx }];
        }

        const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
        const page = Math.max(parseInt(q.page, 10) || 1, 1);
        const [items, total] = await Promise.all([
          StaffActivity.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
          StaffActivity.countDocuments(filter),
        ]);
        return handleResponse(res, 200, "Activity", {
          items: items.map((a) => ({
            id: String(a._id),
            staffId: String(a.staffId),
            staffName: a.staffName,
            jobTitle: a.jobTitle || "",
            kind: a.kind,
            action: a.action,
            detail: a.detail || "",
            amount: a.amount ?? null,
            ip: a.ip || "",
            createdAt: a.createdAt,
          })),
          page,
          limit,
          total,
          pages: Math.max(Math.ceil(total / limit), 1),
        });
      } catch (err) {
        return fail(res, err);
      }
    },
  };
}
