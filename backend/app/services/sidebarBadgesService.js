import mongoose from "mongoose";
import Order from "../models/order.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import Product from "../models/product.js";
import Transaction from "../models/transaction.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { PRODUCT_APPROVAL_STATUS } from "./productModerationService.js";

const PENDING_ORDER_STATUSES = [
  WORKFLOW_STATUS.CREATED,
  WORKFLOW_STATUS.SELLER_PENDING,
];

const PENDING_WITHDRAWAL_STATUSES = ["Pending", "Processing"];

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(String(id));
}

/**
 * Lightweight counts for admin sidebar notification bubbles.
 */
export async function getAdminSidebarBadges() {
  const [
    pendingOrders,
    pendingSellers,
    pendingDelivery,
    pendingWithdrawals,
    pendingProducts,
    pendingReturns,
  ] = await Promise.all([
    Order.countDocuments({
      $or: [
        { status: "pending" },
        { workflowStatus: { $in: PENDING_ORDER_STATUSES } },
      ],
    }),
    Seller.countDocuments({
      isVerified: { $ne: true },
      $or: [
        { applicationStatus: "pending" },
        { applicationStatus: { $exists: false } },
        { applicationStatus: null },
      ],
    }),
    Delivery.countDocuments({ isVerified: { $ne: true } }),
    Transaction.countDocuments({
      type: "Withdrawal",
      status: { $in: PENDING_WITHDRAWAL_STATUSES },
    }),
    Product.countDocuments({
      approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
    }),
    Order.countDocuments({ returnStatus: "return_requested" }),
  ]);

  return {
    pendingOrders,
    pendingSellers,
    pendingDelivery,
    pendingWithdrawals,
    pendingProducts,
    pendingReturns,
  };
}

/**
 * Lightweight counts for seller sidebar notification bubbles.
 */
export async function getSellerSidebarBadges(sellerId) {
  const sellerObjectId = toObjectId(sellerId);
  if (!sellerObjectId) {
    return {
      pendingOrders: 0,
      pendingReturns: 0,
      pendingWithdrawals: 0,
    };
  }

  const [pendingOrders, pendingReturns, pendingWithdrawals] = await Promise.all([
    Order.countDocuments({
      seller: sellerObjectId,
      $or: [
        { status: "pending" },
        { workflowStatus: { $in: PENDING_ORDER_STATUSES } },
      ],
    }),
    Order.countDocuments({
      seller: sellerObjectId,
      returnStatus: "return_requested",
    }),
    Transaction.countDocuments({
      user: sellerObjectId,
      userModel: "Seller",
      type: "Withdrawal",
      status: { $in: PENDING_WITHDRAWAL_STATUSES },
    }),
  ]);

  return {
    pendingOrders,
    pendingReturns,
    pendingWithdrawals,
  };
}
