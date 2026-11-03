import express from "express";
import {
  adminListCampaigns,
  adminGetCampaign,
  adminCreateCampaign,
  adminUpdateCampaign,
  adminDeleteCampaign,
  adminPublishCampaign,
  adminCampaignAction,
  adminRemindSellers,
  adminRemoveProduct,
  adminCampaignReport,
  sellerListCampaigns,
  sellerGetCampaign,
  sellerJoinCampaign,
  sellerDeclineCampaign,
  publicListCampaigns,
} from "../controller/campaignController.js";
import { verifyToken, allowRoles, requireApprovedSeller } from "../middleware/authMiddleware.js";

// Mounted at /admin/campaigns
export const adminCampaignRouter = express.Router();
adminCampaignRouter.use(verifyToken, allowRoles("admin"));
adminCampaignRouter.get("/", adminListCampaigns);
adminCampaignRouter.post("/", adminCreateCampaign);
adminCampaignRouter.get("/:id", adminGetCampaign);
adminCampaignRouter.put("/:id", adminUpdateCampaign);
adminCampaignRouter.delete("/:id", adminDeleteCampaign);
adminCampaignRouter.post("/:id/publish", adminPublishCampaign);
adminCampaignRouter.post("/:id/action", adminCampaignAction);
adminCampaignRouter.post("/:id/remind", adminRemindSellers);
adminCampaignRouter.get("/:id/report", adminCampaignReport);
adminCampaignRouter.delete("/:id/sellers/:sellerId/products/:productId", adminRemoveProduct);

// Mounted at /seller/campaigns
export const sellerCampaignRouter = express.Router();
sellerCampaignRouter.use(verifyToken, allowRoles("seller"), requireApprovedSeller);
sellerCampaignRouter.get("/", sellerListCampaigns);
sellerCampaignRouter.get("/:id", sellerGetCampaign);
sellerCampaignRouter.post("/:id/join", sellerJoinCampaign);
sellerCampaignRouter.post("/:id/decline", sellerDeclineCampaign);

// Mounted at /campaigns (customer Offers page)
export const publicCampaignRouter = express.Router();
publicCampaignRouter.get("/", publicListCampaigns);
