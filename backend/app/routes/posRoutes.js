/**
 * POS API. The same router is mounted twice:
 *   /api/admin/pos  -> Admin POS (owner = null)
 *   /api/seller/pos -> Seller POS (owner = the seller)
 * Every handler reads req.pos for scoping, so data never crosses owners.
 */
import express from "express";
import { verifyToken, allowRoles, requireApprovedSeller } from "../middleware/authMiddleware.js";
import { posScope } from "../services/pos/posService.js";
import { hideCostForStaff } from "../services/staff/redactCost.js";
import * as orders from "../controller/pos/posOrderController.js";
import * as parties from "../controller/pos/posPartyController.js";
import * as purchases from "../controller/pos/posPurchaseController.js";
import * as misc from "../controller/pos/posMiscController.js";
import * as inventory from "../controller/pos/posInventoryController.js";

export function buildPosRouter(role) {
  const router = express.Router();
  router.use(verifyToken, allowRoles(role));
  if (role === "seller") router.use(requireApprovedSeller);
  router.use(posScope(role));
  router.use(hideCostForStaff);

  // catalogue
  router.get("/products", misc.posProducts);
  router.post("/products/quick", misc.quickAddProduct);
  router.get("/products/:id", misc.productStock);
  if (role === "admin") router.get("/sellers", misc.posSellers);

  // bills
  router.get("/summary", orders.posSummary);
  router.get("/orders", orders.listPosOrders);
  router.post("/orders", orders.createPosOrder);
  router.post("/orders/bulk-cancel", orders.bulkCancelPosOrders);
  router.get("/orders/:id", orders.getPosOrder);
  router.patch("/orders/:id/items", orders.updatePosOrderItems);
  router.delete("/orders/:id", orders.cancelPosOrder);
  router.post("/exchange", orders.posExchange);

  // inventory tools
  router.get("/barcode-check", inventory.barcodeCheck);
  router.post("/stock-count", inventory.submitStockCount);
  router.get("/pack-list/:orderId", inventory.packList);
  router.get("/expiry", inventory.expiryReport);
  router.get("/reorder", inventory.reorderReport);
  router.get("/channel-report", inventory.channelReport);

  // stock ledger
  router.get("/stock-ledger", misc.stockLedger);
  router.put("/stock-ledger/:id", misc.updateLedgerEntry);

  // customers + udhaar
  router.get("/customers", parties.listCustomers);
  router.post("/customers", parties.createCustomer);
  router.get("/customers/:id", parties.getCustomer);
  router.put("/customers/:id", parties.updateCustomer);
  router.delete("/customers/:id", parties.deleteCustomer);
  router.get("/customers/:id/orders", parties.customerOrders);
  router.post("/credit/add", parties.addCredit);
  router.post("/credit/payment", parties.receiveCreditPayment);

  // suppliers
  router.get("/suppliers", parties.listSuppliers);
  router.post("/suppliers", parties.createSupplier);
  router.get("/suppliers/:id", parties.getSupplier);
  router.put("/suppliers/:id", parties.updateSupplier);
  router.delete("/suppliers/:id", parties.deleteSupplier);
  router.post("/suppliers/:id/debt", parties.addSupplierDebt);
  router.post("/suppliers/:id/pay", parties.paySupplier);
  router.post("/suppliers/:id/transactions/:txnId/reverse", parties.reverseSupplierTxn);

  // purchase entries + quotations
  router.get("/purchase-entries", purchases.listEntries);
  router.post("/purchase-entries", purchases.createEntry);
  router.get("/purchase-entries/:id", purchases.getEntry);
  router.put("/purchase-entries/:id", purchases.updateEntry);
  router.delete("/purchase-entries/:id", purchases.deleteEntry);
  router.post("/purchase-entries/:id/complete", purchases.completePurchase);

  // purchase GST register
  router.get("/gst-register", purchases.listGstRegister);
  router.post("/gst-register", purchases.createGstEntry);
  router.patch("/gst-register/:id", purchases.updateGstEntry);
  router.delete("/gst-register/:id", purchases.deleteGstEntry);

  // terminal state + settings
  router.get("/state", misc.getPosState);
  router.put("/state", misc.savePosState);
  router.get("/settings", misc.getPosSettings);
  router.put("/settings", misc.savePosSettings);

  return router;
}

export const adminPosRouter = buildPosRouter("admin");
export const sellerPosRouter = buildPosRouter("seller");
