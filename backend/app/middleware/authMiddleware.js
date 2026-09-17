import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import Seller from "../models/seller.js";
import Admin from "../models/admin.js";

function extractJwtFromHeaders(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    const parts = authHeader.split(/\s+/);
    if (parts.length >= 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }

    // Allow raw JWT in Authorization header for non-standard clients.
    // Still requires signature verification so it doesn't weaken auth.
    if (authHeader.split(".").length === 3) {
      return authHeader;
    }
  }

  const xAccessToken = String(req.headers["x-access-token"] || "").trim();
  if (xAccessToken && xAccessToken.split(".").length === 3) {
    return xAccessToken;
  }

  return null;
}

const TOKEN_VERSION_MODELS = { admin: Admin, seller: Seller };

/* ===============================
   Verify Token
================================ */
export const verifyToken = async (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (!token) {
      return handleResponse(res, 401, "Unauthorized, token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Audit fix H5: admin/seller password change increments `tokenVersion`
    // in the DB (see admin/profileController.js updateAdminPassword and
    // sellerAuthController.js resetSellerPassword). Reject any token issued
    // before that change instead of letting a stale/leaked token stay valid
    // for the rest of its 7-day lifetime. Scoped to admin/seller — the only
    // two roles with password-based auth — so customer/delivery requests
    // (OTP-only, no password-change flow) don't pay for an extra DB lookup
    // on every request.
    const TokenVersionModel = TOKEN_VERSION_MODELS[decoded.role];
    if (TokenVersionModel) {
      const current = await TokenVersionModel.findById(decoded.id)
        .select("tokenVersion")
        .lean();
      if (!current || (current.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return handleResponse(res, 401, "Session expired, please log in again");
      }
    }

    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    return handleResponse(res, 401, "Invalid or expired token");
  }
};

/* ===============================
   Optional Verify Token (for public routes that need user context)
================================ */
export const optionalVerifyToken = (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role }
      } catch (error) {
        // Token is invalid, but we don't block the request
        req.user = null;
      }
    }

    next();
  } catch (error) {
    // Don't block the request, just continue without user
    next();
  }
};

/* ===============================
   Role Based Access
================================ */
export const allowRoles = (...roles) => {
  return (req, res, next) => {
    // Audit fix M4: fail closed (401) instead of throwing a TypeError when
    // `allowRoles` is ever wired onto a route without `verifyToken` running
    // first (req.user undefined) — a coding mistake should surface as a
    // clean 401, not an unhandled exception.
    if (!req.user || !roles.includes(req.user.role)) {
      return handleResponse(res, req.user ? 403 : 401, req.user ? "Access denied" : "Unauthorized, token missing");
    }
    next();
  };
};

/* ===============================
   Ensure seller can access seller-only operational routes
================================ */
export const requireApprovedSeller = async (req, res, next) => {
  try {
    if (req.user?.role !== "seller") {
      return next();
    }

    const seller = await Seller.findById(req.user.id)
      .select("isVerified isActive applicationStatus rejectionReason")
      .lean();

    if (!seller) {
      return handleResponse(res, 401, "Seller account not found");
    }

    const applicationStatus =
      seller.applicationStatus || (seller.isVerified ? "approved" : "pending");
    const isApproved =
      seller.isVerified === true &&
      seller.isActive === true &&
      applicationStatus === "approved";

    if (!isApproved) {
      const message =
        applicationStatus === "rejected"
          ? "Seller application rejected. Please contact admin support."
          : "Seller account is pending admin approval.";

      return handleResponse(res, 403, message, {
        applicationStatus,
        isVerified: seller.isVerified === true,
        isActive: seller.isActive === true,
        rejectionReason: seller.rejectionReason || "",
      });
    }

    next();
  } catch (error) {
    return handleResponse(res, 500, "Unable to validate seller approval status");
  }
};
