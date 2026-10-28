/**
 * Turns a staff token into a checked request.
 *
 * A staff JWT is { id: <staff id>, role: "staff", tokenVersion }. After the
 * checks below the request carries:
 *   req.user  = { id: <owner id>, role: "seller" | "admin", isStaff, staffId }
 *               so every existing handler keeps working "as the owner";
 *   req.staff = { id, name, jobTitle, ownerType, ownerId, permissions }.
 * Staff are refused on any API call that has no rule (see permissionRules.js).
 */
import Staff from "../../models/staff.js";
import Seller from "../../models/seller.js";
import Admin from "../../models/admin.js";
import { can, buildAccess } from "./permissionCatalog.js";
import { matchRule } from "./permissionRules.js";
import { attachActivityLogging, recordStaffActivity } from "./staffActivity.js";

export const STAFF_ROLE = "staff";

const TIMEZONE = process.env.STAFF_TIMEZONE || "Asia/Kolkata";

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** Is `now` inside this staff member's allowed working hours? (always true when switched off) */
export function withinWorkingHours(workingHours, now = new Date()) {
  if (!workingHours?.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const current = Number(get("hour")) * 60 + Number(get("minute"));
  const start = toMinutes(workingHours.start);
  const end = toMinutes(workingHours.end);
  if (start === null || end === null) return true;
  const days = Array.isArray(workingHours.days) && workingHours.days.length ? workingHours.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(day)) return false;
  // a shift that ends after midnight (e.g. 18:00-02:00) wraps around
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

const fail = (status, message) => ({ ok: false, status, message });

/** Check the staff account and its owner. Returns { staff } or { error }. */
export async function loadStaffSession(decoded) {
  const doc = await Staff.findById(decoded?.id).select("+tokenVersion").lean();
  if (!doc || doc.isActive === false || (doc.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
    return { error: fail(401, "Session expired, please log in again") };
  }

  let ownerName = "";
  if (doc.ownerType === "seller") {
    const seller = await Seller.findById(doc.ownerId).select("isActive isVerified applicationStatus shopName name").lean();
    const status = seller?.applicationStatus || (seller?.isVerified ? "approved" : "pending");
    if (!seller || seller.isActive !== true || seller.isVerified !== true || status !== "approved") {
      return { error: fail(403, "This shop's account is not active right now") };
    }
    ownerName = seller.shopName || seller.name || "";
  } else if (!(await Admin.exists({ _id: doc.ownerId }))) {
    return { error: fail(401, "Session expired, please log in again") };
  }

  if (!withinWorkingHours(doc.workingHours)) {
    return { error: fail(403, "You can only log in during your working hours") };
  }

  return {
    staff: {
      id: String(doc._id),
      name: doc.name,
      jobTitle: doc.jobTitle || "",
      ownerType: doc.ownerType,
      ownerId: String(doc.ownerId),
      ownerName,
      permissions: doc.permissions || {},
      access: buildAccess(doc.ownerType, doc.permissions),
    },
  };
}

/**
 * Resolve a staff token for one request.
 *   skipRules - only identify the staff member (used by /staff/me etc.)
 * Returns { ok: true } or { ok: false, status, message } - the caller answers.
 */
export async function resolveStaffRequest(req, res, decoded, { skipRules = false } = {}) {
  if (req.staff) return { ok: true };

  const session = await loadStaffSession(decoded);
  if (session.error) return session.error;
  const { staff } = session;

  let rule = null;
  if (!skipRules) {
    rule = matchRule(staff.ownerType, req.method, req.originalUrl || req.url);
    if (!rule) {
      return fail(403, "This is not available for staff accounts");
    }
    if (!rule.self && !can(staff.permissions, rule.need, rule.level)) {
      if (req.method !== "GET") {
        recordStaffActivity({
          staff,
          kind: "blocked",
          action: `Tried to ${(rule.label || "do something").replace(/^./, (c) => c.toLowerCase())} without permission`,
          req,
          status: 403,
        });
      }
      return fail(403, "You don't have permission to do this");
    }
  }

  req.user = { id: staff.ownerId, role: staff.ownerType, isStaff: true, staffId: staff.id };
  req.staff = staff;
  if (rule && !rule.self) attachActivityLogging(req, res, staff, rule);
  return { ok: true };
}
