/**
 * Which API call needs which permission, for staff accounts.
 *
 * Staff are refused on EVERY call that has no rule here (default deny), so
 * adding a new endpoint never accidentally opens it to staff. Owners (seller
 * / admin) never go through this file.
 *
 * Rule: [METHOD | "*", "/path/:id", need, label?, level?]
 *   need  - a permission key, a prefix wildcard ("orders.*"), an array (any
 *           one of them), or SELF (always allowed for any staff member).
 *   level - "view" | "edit". Defaults to view for GET, edit for the rest.
 *   label - what the activity log says when the call succeeds.
 * First matching rule wins, so keep specific paths above general ones.
 */

export const SELF = "__self__";

const rule = (method, pattern, need, label, level) => ({ method, pattern, need, label, level });

// "/orders/:id" -> /^\/orders\/[^/]+$/ ; trailing "/*" matches the path and anything below it.
const compile = (pattern) =>
  new RegExp(
    `^${pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:[A-Za-z_]+/g, "[^/]+")
      .replace(/\/\*$/, "(?:/.*)?")}$`,
  );

// ---------------------------------------------------------------- POS (both panels)
const posRules = (portal) => {
  const p = `/${portal}/pos`;
  return [
    rule("GET", `${p}/products`, ["pos.billing", "pos.purchases", "pos.report", "pos.reorder"]),
    rule("POST", `${p}/products/quick`, "pos.quickadd", "Added a new product from POS"),
    rule("GET", `${p}/products/:id`, ["pos.billing", "pos.purchases", "pos.report", "pos.reorder"]),
    rule("GET", `${p}/sellers`, "pos.*"),

    rule("GET", `${p}/summary`, "pos.report"),
    rule("GET", `${p}/orders`, ["pos.billing", "pos.report"]),
    rule("POST", `${p}/orders/online`, "pos.billing", "Started an online payment for a POS bill"),
    rule("POST", `${p}/orders/bulk-cancel`, "pos.cancel", "Cancelled several POS bills"),
    rule("POST", `${p}/orders`, "pos.billing", "Created a POS bill"),
    rule("GET", `${p}/orders/:id`, ["pos.billing", "pos.report"]),
    rule("PATCH", `${p}/orders/:id/items`, "pos.billing", "Edited a POS bill"),
    rule("DELETE", `${p}/orders/:id`, "pos.cancel", "Cancelled a POS bill"),
    rule("POST", `${p}/payment/verify`, "pos.billing", "Confirmed a POS payment"),
    rule("POST", `${p}/exchange`, "pos.cancel", "Exchanged items on a POS bill"),

    rule("GET", `${p}/barcode-check`, ["pos.billing", "pos.purchases"]),
    rule("POST", `${p}/stock-count`, "pos.reorder", "Submitted a stock count"),
    rule("GET", `${p}/pack-list/:id`, "pos.report"),
    rule("GET", `${p}/expiry`, "pos.expiry"),
    rule("GET", `${p}/reorder`, "pos.reorder"),
    rule("GET", `${p}/channel-report`, ["pos.reorder", "pos.expiry", "pos.report"]),

    rule("GET", `${p}/stock-ledger`, "pos.report"),
    rule("PUT", `${p}/stock-ledger/:id`, "pos.report", "Edited a stock ledger entry"),

    rule("GET", `${p}/customers`, ["pos.billing", "pos.customers"]),
    rule("POST", `${p}/customers`, ["pos.billing", "pos.customers"], "Added a POS customer"),
    rule("GET", `${p}/customers/:id`, "pos.customers"),
    rule("GET", `${p}/customers/:id/orders`, "pos.customers"),
    rule("PUT", `${p}/customers/:id`, "pos.customers", "Updated a POS customer"),
    rule("DELETE", `${p}/customers/:id`, "pos.customers", "Deleted a POS customer"),
    rule("POST", `${p}/credit/add`, "pos.customers", "Added udhaar (credit) to a customer"),
    rule("POST", `${p}/credit/payment/initiate`, "pos.customers", "Started an udhaar payment"),
    rule("POST", `${p}/credit/payment`, "pos.customers", "Received an udhaar payment"),

    rule("GET", `${p}/suppliers`, ["pos.suppliers", "pos.purchases"]),
    rule("GET", `${p}/suppliers/:id`, ["pos.suppliers", "pos.purchases"]),
    rule("POST", `${p}/suppliers`, "pos.suppliers", "Added a supplier"),
    rule("PUT", `${p}/suppliers/:id`, "pos.suppliers", "Updated a supplier"),
    rule("DELETE", `${p}/suppliers/:id`, "pos.suppliers", "Deleted a supplier"),
    rule("POST", `${p}/suppliers/:id/debt`, "pos.suppliers", "Added a supplier balance"),
    rule("POST", `${p}/suppliers/:id/pay`, "pos.suppliers", "Paid a supplier"),
    rule("POST", `${p}/suppliers/:id/transactions/:txn/reverse`, "pos.suppliers", "Reversed a supplier entry"),

    rule("GET", `${p}/purchase-entries`, "pos.purchases"),
    rule("GET", `${p}/purchase-entries/:id`, ["pos.purchases", "pos.billing"]),
    rule("POST", `${p}/purchase-entries/:id/complete`, "pos.purchases", "Completed a purchase entry"),
    rule("POST", `${p}/purchase-entries`, "pos.purchases", "Created a purchase entry"),
    rule("PUT", `${p}/purchase-entries/:id`, "pos.purchases", "Updated a purchase entry"),
    rule("DELETE", `${p}/purchase-entries/:id`, "pos.purchases", "Deleted a purchase entry"),

    rule("GET", `${p}/gst-register`, "pos.gst"),
    rule("POST", `${p}/gst-register`, "pos.gst", "Added a GST register entry"),
    rule("PATCH", `${p}/gst-register/:id`, "pos.gst", "Updated a GST register entry"),
    rule("DELETE", `${p}/gst-register/:id`, "pos.gst", "Deleted a GST register entry"),

    rule("GET", `${p}/state`, "pos.billing"),
    rule("PUT", `${p}/state`, "pos.billing"), // held bills etc.; too frequent to log
    rule("GET", `${p}/settings`, ["pos.billing", "pos.report", "pos.settings"]),
    rule("PUT", `${p}/settings`, "pos.settings", "Changed POS settings"),
  ];
};

// ------------------------------------------------------------------- SELLER
const SELLER_RULES = [
  rule("GET", "/seller/profile", SELF),
  rule("GET", "/seller/sidebar-badges", SELF),

  rule("GET", "/seller/stats", "dashboard.overview"),
  // Earnings, Payment History, Money Request and Reports all read this one call.
  rule("GET", "/seller/earnings", ["finance.earnings", "finance.reports", "finance.transactions", "finance.withdrawals"]),
  rule("GET", "/seller/wallet/summary", ["finance.earnings", "finance.withdrawals", "finance.transactions"]),
  rule("POST", "/seller/request-withdrawal", "finance.withdrawals", "Requested a withdrawal"),

  rule("GET", "/products/seller/me", ["catalog.products", "catalog.stock"]),
  rule("GET", "/products/stock-history", "catalog.stock"),
  rule("POST", "/products/adjust-stock", "catalog.stock", "Adjusted stock"),
  rule("GET", "/products/:id", ["catalog.products", "catalog.stock"]),
  rule("POST", "/products", "catalog.products", "Added a product"),
  rule("PUT", "/products/:id", ["catalog.products", "catalog.stock"], "Updated a product"),
  rule("DELETE", "/products/:id", "catalog.products", "Deleted a product"),
  rule("GET", "/admin/categories", "catalog.products"),
  rule("POST", "/media/*", "catalog.products", "Uploaded an image"),

  rule("GET", "/orders/seller-orders", ["orders.orders", "orders.tracking"]),
  rule("PUT", "/orders/status/:id", "orders.orders", "Updated an order status"),
  rule("POST", "/orders/:id/delivered", "orders.orders", "Marked an order delivered"),
  rule("GET", "/orders/seller-returns", "orders.returns"),
  rule("GET", "/orders/:id/returns", "orders.returns"),
  rule("PUT", "/orders/returns/:id/approve", "orders.returns", "Approved a return"),
  rule("PUT", "/orders/returns/:id/reject", "orders.returns", "Rejected a return"),
  rule("PUT", "/orders/returns/:id/assign-delivery", "orders.returns", "Assigned a return pickup"),
  rule("GET", "/orders/workflow/:id/route", ["orders.tracking", "orders.orders"]),

  rule("*", "/tickets/*", "support.tickets", "Updated a support ticket"),

  ...posRules("seller"),
];

// -------------------------------------------------------------------- ADMIN
const ADMIN_RULES = [
  rule("GET", "/admin/profile", SELF),
  rule("GET", "/admin/sidebar-badges", SELF),

  rule("GET", "/admin/stats", "dashboard.overview"),
  rule("GET", "/admin/dashboard", "dashboard.overview"),
  rule("GET", "/admin/reports", "dashboard.overview"),

  // categories + products (marketing forms read both to pick links)
  rule("GET", "/admin/categories", ["catalog.*", "marketing.*"]),
  rule("POST", "/admin/categories", "catalog.categories", "Added a category"),
  rule("PUT", "/admin/categories/:id", "catalog.categories", "Updated a category"),
  rule("DELETE", "/admin/categories/:id", "catalog.categories", "Deleted a category"),
  rule("GET", "/products/moderation", "catalog.products"),
  rule("PATCH", "/products/moderation/:id/approve", "catalog.products", "Approved a product"),
  rule("PATCH", "/products/moderation/:id/reject", "catalog.products", "Rejected a product"),
  rule("GET", "/products", ["catalog.products", "marketing.*"]),
  rule("GET", "/products/:id", ["catalog.products", "marketing.*"]),
  rule("POST", "/products", "catalog.products", "Added a product"),
  rule("PUT", "/products/:id", "catalog.products", "Updated a product"),
  rule("DELETE", "/products/:id", "catalog.products", "Deleted a product"),
  rule("POST", "/media/*", ["catalog.products", "marketing.*", "content.settings"], "Uploaded an image"),

  // marketing
  rule("GET", "/admin/experience/hero", ["marketing.hero"]),
  rule("PUT", "/admin/experience/hero", "marketing.hero", "Updated the hero banners"),
  rule("POST", "/admin/experience/upload-banner", ["marketing.sections", "marketing.hero"], "Uploaded a banner image"),
  rule("GET", "/admin/experience", "marketing.sections"),
  rule("POST", "/admin/experience", "marketing.sections", "Created a home section"),
  rule("PUT", "/admin/experience/reorder", "marketing.sections", "Reordered home sections"),
  rule("PUT", "/admin/experience/:id", "marketing.sections", "Updated a home section"),
  rule("DELETE", "/admin/experience/:id", "marketing.sections", "Deleted a home section"),
  rule("*", "/admin-offers/*", "marketing.offers", "Changed an offer"),
  rule("*", "/admin-offers", "marketing.offers", "Changed an offer"),
  rule("*", "/admin-offer-sections/*", ["marketing.offersections", "marketing.stores"], "Changed an offer section / store"),
  rule("*", "/admin-offer-sections", ["marketing.offersections", "marketing.stores"], "Changed an offer section / store"),
  rule("*", "/admin/coupons/*", "marketing.coupons", "Changed a coupon"),
  rule("*", "/admin/coupons", "marketing.coupons", "Changed a coupon"),
  rule("GET", "/notifications/broadcast/audience-stats", "marketing.notifications"),
  rule("POST", "/notifications/broadcast", "marketing.notifications", "Sent a notification to users"),

  // people
  rule("GET", "/admin/users", "people.customers"),
  rule("GET", "/admin/users/:id", "people.customers"),
  rule("GET", "/admin/sellers/locations", "people.sellers_locations"),
  rule("GET", "/admin/sellers/active", "people.sellers_active"),
  rule("GET", "/admin/sellers/pending", "people.sellers_pending"),
  rule("PATCH", "/admin/sellers/approve/:id", "people.sellers_pending", "Approved a seller"),
  rule("DELETE", "/admin/sellers/reject/:id", "people.sellers_pending", "Rejected a seller"),
  rule("GET", "/admin/sellers", ["people.sellers_active", "people.sellers_pending", "people.sellers_locations"]),

  // delivery
  rule("GET", "/admin/delivery-partners", ["delivery.active", "delivery.pending"]),
  rule("POST", "/admin/delivery-partners", "delivery.active", "Added a delivery driver"),
  rule("PATCH", "/admin/delivery-partners/approve/:id", "delivery.pending", "Approved a delivery driver"),
  rule("DELETE", "/admin/delivery-partners/reject/:id", "delivery.pending", "Rejected a delivery driver"),
  rule("PATCH", "/admin/delivery-partners/:id/deactivate", "delivery.active", "Deactivated a delivery driver"),
  rule("PUT", "/admin/delivery-partners/:id", "delivery.active", "Updated a delivery driver"),
  rule("GET", "/admin/active-fleet", "delivery.tracking"),
  rule("GET", "/admin/delivery-transactions", "delivery.funds"),
  rule("PUT", "/admin/transactions/bulk-settle-delivery", "delivery.funds", "Paid delivery earnings"),
  rule("PUT", "/admin/transactions/:id/settle", "delivery.funds", "Paid a delivery earning"),

  // finance
  rule("GET", "/admin/wallet-data", "finance.wallet"),
  rule("POST", "/admin/finance/payouts/process", "finance.wallet", "Processed payouts"),
  rule("GET", "/admin/finance/*", "finance.wallet"),
  rule("GET", "/admin/seller-withdrawals", "finance.withdrawals"),
  rule("GET", "/admin/delivery-withdrawals", "finance.withdrawals"),
  rule("PUT", "/admin/withdrawals/:id", "finance.withdrawals", "Updated a withdrawal request"),
  rule("GET", "/admin/seller-transactions", "finance.sellerpay"),
  rule("GET", "/admin/delivery-cash", "finance.cash"),
  rule("GET", "/admin/rider-cash-details/:id", "finance.cash"),
  rule("POST", "/admin/settle-cash", "finance.cash", "Collected rider cash"),
  rule("GET", "/admin/cash-history", "finance.cash"),
  rule("GET", "/admin/settings/platform", ["content.settings", "finance.fees"]),
  rule("PUT", "/admin/settings/platform", ["content.settings", "finance.fees"], "Changed platform settings"),
  rule("GET", "/admin/settings/delivery", ["content.settings", "finance.fees"]),
  rule("PUT", "/admin/settings/delivery", ["content.settings", "finance.fees"], "Changed delivery fees"),
  rule("PUT", "/settings", "content.settings", "Changed app settings"),
  rule("POST", "/settings/upload", "content.settings", "Uploaded a settings image"),

  // orders (the order screens share these calls, so any orders.* permission opens them)
  rule("GET", "/orders/seller-orders", "orders.*"),
  rule("GET", "/orders/details/:id", "orders.*"),
  rule("PUT", "/orders/status/:id", "orders.*", "Updated an order status"),
  rule("GET", "/orders/seller-returns", "orders.*"),
  rule("GET", "/orders/:id/returns", "orders.*"),
  rule("PUT", "/orders/returns/:id/approve", "orders.*", "Approved a return"),
  rule("PUT", "/orders/returns/:id/reject", "orders.*", "Rejected a return"),
  rule("PUT", "/orders/returns/:id/assign-delivery", "orders.*", "Assigned a return pickup"),
  rule("PUT", "/orders/returns/:id/qc", "orders.*", "Completed a return quality check"),

  // support + content
  rule("GET", "/tickets/admin/all", "support.tickets"),
  rule("PATCH", "/tickets/admin/status/:id", "support.tickets", "Changed a ticket status"),
  rule("POST", "/tickets/reply/:id", "support.tickets", "Replied to a ticket"),
  rule("GET", "/reviews/admin/pending", "support.reviews"),
  rule("PATCH", "/reviews/admin/status/:id", "support.reviews", "Moderated a review"),
  rule("*", "/admin/faqs/*", "support.faqs", "Changed a FAQ"),
  rule("*", "/admin/faqs", "support.faqs", "Changed a FAQ"),
  rule("*", "/admin/legal-pages/*", "content.legal", "Changed a legal page"),
  rule("*", "/admin/legal-pages", "content.legal", "Changed a legal page"),

  ...posRules("admin"),
];

const compileAll = (rules) => rules.map((r) => ({ ...r, regex: compile(r.pattern) }));
const COMPILED = { seller: compileAll(SELLER_RULES), admin: compileAll(ADMIN_RULES) };

/** "/api/orders/x?y=1/" -> "/orders/x" */
export const normalizePath = (url) => {
  let p = String(url || "").split("?")[0].replace(/\/{2,}/g, "/").replace(/^\/api(?=\/|$)/, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
};

/** First rule for this panel + method + path, or null (= staff are refused). */
export function matchRule(ownerType, method, url) {
  const rules = COMPILED[ownerType];
  if (!rules) return null;
  const m = String(method || "GET").toUpperCase();
  const path = normalizePath(url);
  const hit = rules.find((r) => (r.method === "*" || r.method === m) && r.regex.test(path));
  if (!hit) return null;
  const level = hit.level || (m === "GET" || m === "HEAD" ? "view" : "edit");
  return { need: hit.need, level, label: hit.label || "", self: hit.need === SELF, pattern: hit.pattern };
}

export const __rulesForTests = { SELLER_RULES, ADMIN_RULES };
