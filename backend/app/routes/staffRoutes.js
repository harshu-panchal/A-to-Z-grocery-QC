import express from "express";
import { verifyToken, allowRoles, requireApprovedSeller } from "../middleware/authMiddleware.js";
import { authRouteRateLimiter } from "../middleware/securityMiddlewares.js";
import handleResponse from "../utils/helper.js";
import {
  changeMyPassword,
  getMyStaffProfile,
  loginStaff,
  logoutStaff,
  requireStaffToken,
} from "../controller/staffAuthController.js";
import { makeStaffManagement } from "../controller/staffManagementController.js";

/**
 * /staff - what staff themselves use: log in, see their profile, change their
 * own password.
 */
export const staffAuthRouter = express.Router();
staffAuthRouter.post("/login", authRouteRateLimiter, loginStaff);
staffAuthRouter.get("/me", requireStaffToken, getMyStaffProfile);
staffAuthRouter.put("/me/password", requireStaffToken, changeMyPassword);
staffAuthRouter.post("/logout", requireStaffToken, logoutStaff);

// Owners only. Staff are refused here anyway (no permission rule covers these
// paths), this is a second lock.
const ownerOnly = (req, res, next) =>
  req.staff ? handleResponse(res, 403, "Only the account owner can manage staff") : next();

function managementRouter(ownerType, ...guards) {
  const router = express.Router();
  const h = makeStaffManagement(ownerType);
  router.use(verifyToken, allowRoles(ownerType), ownerOnly, ...guards);

  router.get("/catalog", h.catalog);
  router.get("/activity", h.activity);

  router.get("/types", h.listTypes);
  router.post("/types", h.createType);
  router.put("/types/:id", h.updateType);
  router.delete("/types/:id", h.removeType);

  router.get("/members", h.list);
  router.post("/members", h.create);
  router.put("/members/:id/password", h.resetPassword);
  router.put("/members/:id", h.update);
  router.delete("/members/:id", h.remove);
  return router;
}

export const sellerStaffRouter = managementRouter("seller", requireApprovedSeller);
export const adminStaffRouter = managementRouter("admin");
