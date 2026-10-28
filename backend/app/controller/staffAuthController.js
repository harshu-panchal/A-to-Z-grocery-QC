import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import Staff from "../models/staff.js";
import handleResponse from "../utils/helper.js";
import { buildAccess } from "../services/staff/permissionCatalog.js";
import { STAFF_ROLE, loadStaffSession, resolveStaffRequest } from "../services/staff/staffAccess.js";
import { toStaffProfile } from "../services/staff/staffProfile.js";
import { recordStaffActivity } from "../services/staff/staffActivity.js";
import { extractJwtFromHeaders } from "../middleware/authMiddleware.js";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const TOKEN_TTL = process.env.STAFF_TOKEN_TTL || "12h";
export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 72;

// A throwaway hash so unknown logins take as long as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const normalizePhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
};

export const signStaffToken = (staff) =>
  jwt.sign(
    { id: staff._id, role: STAFF_ROLE, ownerType: staff.ownerType, tokenVersion: staff.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

const logActor = (staff) => ({
  id: String(staff._id),
  name: staff.name,
  jobTitle: staff.jobTitle,
  ownerType: staff.ownerType,
  ownerId: String(staff.ownerId),
});

/** POST /staff/login  { identifier: email or phone, password } */
export const loginStaff = async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.emailOrPhone ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!identifier || !password) {
      return handleResponse(res, 400, "Email or phone and password are required");
    }

    const query = identifier.includes("@") ? { email: identifier.toLowerCase() } : { phone: normalizePhone(identifier) };
    const staff = await Staff.findOne(query).select("+password +tokenVersion +failedLoginAttempts");
    if (!staff) {
      await bcrypt.compare(password, DUMMY_HASH);
      return handleResponse(res, 401, "Invalid login details");
    }

    const actor = logActor(staff);
    const now = new Date();

    if (staff.lockedUntil && staff.lockedUntil > now) {
      const minutes = Math.ceil((staff.lockedUntil - now) / 60000);
      return handleResponse(res, 423, `Too many wrong tries. Try again in ${minutes} minute(s), or ask the owner to reset your password.`);
    }
    if (!staff.isActive) {
      return handleResponse(res, 403, "Your account is switched off. Please contact the owner.");
    }

    if (!(await staff.comparePassword(password))) {
      const attempts = (staff.failedLoginAttempts || 0) + 1;
      const locked = attempts >= MAX_ATTEMPTS;
      await Staff.updateOne(
        { _id: staff._id },
        locked
          ? { $set: { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) } }
          : { $set: { failedLoginAttempts: attempts } },
      );
      recordStaffActivity({
        staff: actor,
        kind: "login_failed",
        action: locked ? "Account locked after wrong passwords" : "Wrong password",
        req,
        status: 401,
      });
      return handleResponse(
        res,
        401,
        locked
          ? `Too many wrong tries. The account is locked for ${LOCK_MINUTES} minutes.`
          : `Invalid login details. ${MAX_ATTEMPTS - attempts} ${MAX_ATTEMPTS - attempts === 1 ? "try" : "tries"} left.`,
      );
    }

    // The owner's shop / account and the working hours must allow this login.
    const session = await loadStaffSession({ id: staff._id, tokenVersion: staff.tokenVersion || 0 });
    if (session.error) {
      return handleResponse(res, session.error.status === 401 ? 403 : session.error.status, session.error.message);
    }

    await Staff.updateOne({ _id: staff._id }, { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now } });
    recordStaffActivity({ staff: actor, kind: "login", action: "Logged in", req, status: 200 });

    return handleResponse(res, 200, "Login successful", {
      token: signStaffToken(staff),
      role: staff.ownerType, // the panel to open; the token itself says "staff"
      ...toStaffProfile(session.staff),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Identify the caller as staff without applying page permissions. */
export const requireStaffToken = async (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);
    if (!token) return handleResponse(res, 401, "Unauthorized, token missing");
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      return handleResponse(res, 401, "Invalid or expired token");
    }
    if (decoded.role !== STAFF_ROLE) return handleResponse(res, 403, "Staff accounts only");
    const result = await resolveStaffRequest(req, res, decoded, { skipRules: true });
    if (!result.ok) return handleResponse(res, result.status, result.message);
    return next();
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** GET /staff/me */
export const getMyStaffProfile = (req, res) => handleResponse(res, 200, "Staff profile", toStaffProfile(req.staff));

/** PUT /staff/me/password  { currentPassword, newPassword } */
export const changeMyPassword = async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      return handleResponse(res, 400, `New password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
    }
    const staff = await Staff.findById(req.staff.id).select("+password +tokenVersion");
    if (!staff || !(await staff.comparePassword(currentPassword))) {
      return handleResponse(res, 400, "Current password is wrong");
    }
    staff.password = newPassword; // hashed by the model
    staff.tokenVersion = (staff.tokenVersion || 0) + 1; // signs out other devices
    await staff.save();
    recordStaffActivity({ staff: req.staff, action: "Changed their password", req, status: 200 });
    return handleResponse(res, 200, "Password changed", { token: signStaffToken(staff) });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** POST /staff/logout */
export const logoutStaff = (req, res) => {
  recordStaffActivity({ staff: req.staff, kind: "logout", action: "Logged out", req, status: 200 });
  return handleResponse(res, 200, "Logged out");
};

export { buildAccess };
