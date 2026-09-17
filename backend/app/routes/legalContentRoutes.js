import express from "express";
import {
  listLegalPages,
  getAdminLegalPage,
  upsertLegalPage,
  getPublicLegalPage,
} from "../controller/legalContentController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const adminRouter = express.Router();
const publicRouter = express.Router();

adminRouter.get("/", verifyToken, allowRoles("admin"), listLegalPages);
adminRouter.get(
  "/:audience/:pageType",
  verifyToken,
  allowRoles("admin"),
  getAdminLegalPage,
);
adminRouter.put(
  "/:audience/:pageType",
  verifyToken,
  allowRoles("admin"),
  upsertLegalPage,
);

publicRouter.get("/:audience/:pageType", getPublicLegalPage);

export { adminRouter as legalPagesAdminRouter, publicRouter as legalPagesPublicRouter };
export default adminRouter;
