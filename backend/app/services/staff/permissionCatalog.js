/**
 * What can be given to staff, per panel.
 *
 * A permission key is "<module>.<sub>" (e.g. "orders.returns"). A staff
 * member's permissions are { [key]: "view" | "edit" }; "edit" includes "view".
 * "Special" keys are single on/off switches for risky actions (stored as
 * "edit") - e.g. cancelling a bill or seeing cost price.
 *
 * `paths` are the screen URLs a sub-module opens. A trailing "$" means that
 * exact URL only (so "/seller/pos$" is the billing screen but not the other
 * POS pages); otherwise the URL and everything under it.
 *
 * The owners (seller / admin) always have full access and never appear here.
 */

export const LEVELS = Object.freeze({ view: 1, edit: 2 });

const sub = (key, label, paths = [], extra = {}) => ({ key, label, paths, special: false, ...extra });
const special = (key, label, hint) => ({ key, label, paths: [], special: true, hint });
const mod = (key, label, subs, extra = {}) => ({ key, label, subs, sharedPaths: [], ...extra });

// -------------------------------------------------------------------- POS
const posModule = (portal) =>
  mod("pos", "POS (Counter Billing)", [
    sub("pos.billing", "Billing", [`/${portal}/pos$`, `/${portal}/pos/payment-return`], {
      hint: "Make bills, print receipts, find customers",
    }),
    sub("pos.report", "Bills & Stock Report", [`/${portal}/pos/report`]),
    sub("pos.reorder", "Low Stock & Reorder", [`/${portal}/pos/reorder`]),
    sub("pos.expiry", "Expiry Alerts", [`/${portal}/pos/expiry`]),
    sub("pos.customers", "Customers & Udhaar", [`/${portal}/pos/customers`]),
    sub("pos.suppliers", "Suppliers", [`/${portal}/pos/suppliers`]),
    sub("pos.purchases", "Purchase Entries & Quotations", [`/${portal}/pos/purchases`, `/${portal}/pos/quotations`]),
    sub("pos.gst", "GST Register", [`/${portal}/pos/gst-register`]),
    sub("pos.settings", "POS Settings", [`/${portal}/pos/settings`]),
    special("pos.cost", "See cost price and profit", "Purchase rate and profit on the billing screen and bills"),
    special("pos.cancel", "Cancel, edit or exchange a saved bill", "Cancel bills, bulk cancel, edit a saved bill, exchange items"),
    special("pos.price", "Change price while billing", "Edit the selling price or give a discount on a bill item; without it the shop price is used"),
    special("pos.quickadd", "Add new products while billing", "Create a product from the billing screen"),
  ]);

// ----------------------------------------------------------------- SELLER
const SELLER_MODULES = [
  mod("dashboard", "Dashboard", [sub("dashboard.overview", "Dashboard overview", ["/seller$"])]),
  mod("catalog", "Products & Stock", [
    sub("catalog.products", "Products (list, add, edit)", ["/seller/products"]),
    sub("catalog.stock", "Stock", ["/seller/inventory"]),
  ]),
  mod("orders", "Orders", [
    sub("orders.orders", "Orders", ["/seller/orders"]),
    sub("orders.returns", "Returns", ["/seller/returns"]),
    sub("orders.tracking", "Track Orders", ["/seller/tracking"]),
  ]),
  posModule("seller"),
  mod("finance", "Money & Reports", [
    sub("finance.reports", "Sales Reports", ["/seller/analytics"]),
    sub("finance.transactions", "Payment History", ["/seller/transactions"]),
    sub("finance.earnings", "Earnings", ["/seller/earnings"]),
    sub("finance.withdrawals", "Money Request", ["/seller/withdrawals"]),
  ]),
  mod("support", "Support", [sub("support.tickets", "Help tickets", ["/seller/support"])]),
];

// ------------------------------------------------------------------ ADMIN
const ADMIN_MODULES = [
  mod("dashboard", "Dashboard", [sub("dashboard.overview", "Dashboard overview", ["/admin$"])]),
  mod(
    "orders",
    "Orders",
    [
      sub("orders.all", "All Orders", ["/admin/orders/all"]),
      sub("orders.new", "New Orders", ["/admin/orders/pending"]),
      sub("orders.prepared", "Being Prepared", ["/admin/orders/processed"]),
      sub("orders.onway", "On the Way", ["/admin/orders/out-for-delivery"]),
      sub("orders.delivered", "Delivered", ["/admin/orders/delivered"]),
      sub("orders.cancelled", "Cancelled", ["/admin/orders/cancelled"]),
      sub("orders.returned", "Returned", ["/admin/orders/returned"]),
      sub("orders.returns", "Return Requests", ["/admin/returns"]),
    ],
    { sharedPaths: ["/admin/orders/view"] },
  ),
  mod("catalog", "Products & Categories", [
    sub("catalog.products", "Products", ["/admin/products"]),
    sub("catalog.categories", "Categories (all levels)", ["/admin/categories"]),
  ]),
  mod("marketing", "Marketing Tools", [
    sub("marketing.sections", "Create Sections", ["/admin/experience-studio"]),
    sub("marketing.hero", "Hero & categories per page", ["/admin/hero-categories"]),
    sub("marketing.notifications", "Send Notifications", ["/admin/notifications"]),
    sub("marketing.coupons", "Coupons & Promos", ["/admin/coupons"]),
    sub("marketing.offers", "Offers Page", ["/admin/offers"]),
    sub("marketing.offersections", "Offer Sections", ["/admin/offer-sections"]),
    sub("marketing.stores", "Shop by Store", ["/admin/shop-by-store"]),
  ]),
  mod("people", "Customers & Sellers", [
    sub("people.customers", "Customers", ["/admin/customers"]),
    sub("people.sellers_active", "Active Sellers", ["/admin/sellers/active"]),
    sub("people.sellers_pending", "Sellers Waiting for Review", ["/admin/sellers/pending"]),
    sub("people.sellers_locations", "Seller Locations", ["/admin/seller-locations"]),
  ]),
  mod("delivery", "Delivery Drivers", [
    sub("delivery.active", "Active Drivers", ["/admin/delivery-boys/active"]),
    sub("delivery.pending", "Drivers Waiting for Review", ["/admin/delivery-boys/pending"]),
    sub("delivery.tracking", "Track Drivers", ["/admin/tracking"]),
    sub("delivery.funds", "Send Money to Drivers", ["/admin/delivery-funds"]),
  ]),
  mod("finance", "Finance", [
    sub("finance.wallet", "Wallet", ["/admin/wallet"]),
    sub("finance.withdrawals", "Money Requests", ["/admin/withdrawals"]),
    sub("finance.sellerpay", "Seller Payments", ["/admin/seller-transactions"]),
    sub("finance.cash", "Collect Cash", ["/admin/cash-collection"]),
    sub("finance.fees", "Fees & Charges", ["/admin/billing"]),
  ]),
  mod("support", "Customer Support", [
    sub("support.tickets", "Help Tickets", ["/admin/support-tickets"]),
    sub("support.reviews", "Review Content", ["/admin/moderation"]),
    sub("support.faqs", "FAQs", ["/admin/faqs"]),
  ]),
  mod("content", "Content & Settings", [
    sub("content.legal", "Legal Pages", ["/admin/legal-pages"]),
    sub("content.settings", "Settings", ["/admin/settings"]),
  ]),
  posModule("admin"),
];

const CATALOGS = Object.freeze({ seller: SELLER_MODULES, admin: ADMIN_MODULES });

export const isOwnerType = (t) => t === "seller" || t === "admin";
export const getModules = (ownerType) => CATALOGS[ownerType] || [];

const allSubs = (ownerType) => getModules(ownerType).flatMap((m) => m.subs.map((s) => ({ ...s, module: m.key })));
const subIndex = (ownerType) => new Map(allSubs(ownerType).map((s) => [s.key, s]));

export const knownKeys = (ownerType) => allSubs(ownerType).map((s) => s.key);

// ------------------------------------------------------- quick buttons (built in)
const grant = (ownerType, spec) => {
  // spec: { "module": "edit" | "view" (every non-special sub), "a.b": "edit", ... }
  const out = {};
  const subs = allSubs(ownerType);
  for (const [key, level] of Object.entries(spec)) {
    if (key.includes(".")) {
      out[key] = level;
    } else {
      subs.filter((s) => s.module === key && !s.special).forEach((s) => { out[s.key] = level; });
    }
  }
  return out;
};

const SELLER_PRESETS = (o) => [
  { key: "cashier", label: "Cashier", description: "POS billing only", permissions: grant(o, { "pos.billing": "edit", "pos.quickadd": "edit" }) },
  { key: "stock_manager", label: "Stock Manager", description: "Products, stock, low stock and expiry", permissions: grant(o, { "catalog.products": "edit", "catalog.stock": "edit", "pos.reorder": "view", "pos.expiry": "view" }) },
  { key: "order_packer", label: "Order Packer", description: "Orders, returns (view)", permissions: grant(o, { "orders.orders": "edit", "orders.returns": "view" }) },
  { key: "returns_handler", label: "Returns Handler", description: "Returns, orders (view)", permissions: grant(o, { "orders.returns": "edit", "orders.orders": "view" }) },
  { key: "purchase_operator", label: "Purchase Operator", description: "Suppliers and purchase entries", permissions: grant(o, { "pos.suppliers": "edit", "pos.purchases": "edit", "pos.cost": "edit", "catalog.products": "view" }) },
  { key: "accounts", label: "Accounts", description: "Reports and earnings (view only)", permissions: grant(o, { "finance.reports": "view", "finance.transactions": "view", "finance.earnings": "view", "pos.report": "view", "pos.gst": "view", "pos.cost": "edit" }) },
  {
    key: "store_manager",
    label: "Store Manager",
    description: "Everything except money requests and POS settings",
    permissions: (() => {
      const all = {};
      for (const s of allSubs(o)) all[s.key] = "edit";
      delete all["finance.withdrawals"];
      delete all["pos.settings"];
      return all;
    })(),
  },
];

const ADMIN_PRESETS = (o) => [
  { key: "support", label: "Support", description: "Help tickets, review moderation, customers (view)", permissions: grant(o, { "support.tickets": "edit", "support.reviews": "edit", "people.customers": "view" }) },
  { key: "accountant", label: "Accountant", description: "Wallet, withdrawals, seller payments, cash collection", permissions: grant(o, { "finance.wallet": "view", "finance.withdrawals": "edit", "finance.sellerpay": "view", "finance.cash": "edit" }) },
  { key: "marketing", label: "Marketing", description: "Banners and sections, coupons, offers, notifications", permissions: grant(o, { marketing: "edit" }) },
  { key: "catalog_manager", label: "Catalog Manager", description: "Products and categories", permissions: grant(o, { catalog: "edit" }) },
  { key: "order_operator", label: "Order Operator", description: "All orders and returns", permissions: grant(o, { orders: "edit" }) },
  { key: "seller_manager", label: "Seller Manager", description: "Sellers and seller locations", permissions: grant(o, { "people.sellers_active": "edit", "people.sellers_pending": "edit", "people.sellers_locations": "edit" }) },
  { key: "delivery_manager", label: "Delivery Manager", description: "Drivers and tracking", permissions: grant(o, { "delivery.active": "edit", "delivery.pending": "edit", "delivery.tracking": "edit" }) },
  { key: "content_editor", label: "Content Editor", description: "FAQs and legal pages", permissions: grant(o, { "support.faqs": "edit", "content.legal": "edit" }) },
  {
    key: "ops_manager",
    label: "Operations Manager",
    description: "Everything except finance and settings",
    permissions: (() => {
      const all = {};
      for (const s of allSubs(o)) {
        if (s.module === "finance" || s.key === "content.settings" || s.key === "pos.settings") continue;
        all[s.key] = "edit";
      }
      return all;
    })(),
  },
];

export const getPresets = (ownerType) =>
  ownerType === "seller" ? SELLER_PRESETS("seller") : ownerType === "admin" ? ADMIN_PRESETS("admin") : [];

/** What the Staff Management screens need to draw the permission picker. */
export const getCatalog = (ownerType) => ({
  ownerType,
  modules: getModules(ownerType).map((m) => ({
    key: m.key,
    label: m.label,
    subs: m.subs.map((s) => ({ key: s.key, label: s.label, special: s.special, hint: s.hint || "" })),
  })),
  presets: getPresets(ownerType),
});

// ------------------------------------------------------------ validating input
/**
 * Clean the permissions sent by the owner. Returns { permissions, unknown }.
 * Specials (on/off switches) are stored as "edit"; everything else must be
 * "view" or "edit". Anything else is dropped.
 */
export function cleanPermissions(ownerType, raw) {
  const index = subIndex(ownerType);
  const permissions = {};
  const unknown = [];
  for (const [key, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    const def = index.get(key);
    if (!def) { unknown.push(key); continue; }
    if (def.special) {
      if (value === "edit" || value === true || value === "view") permissions[key] = "edit";
    } else if (value === "view" || value === "edit") {
      permissions[key] = value;
    }
  }
  return { permissions, unknown };
}

// ------------------------------------------------------------ checking access
/**
 * Does `perms` give at least `level` on `need`?
 * `need` is a key, a prefix wildcard ("orders.*" = any orders sub-module) or
 * an array of those (any one is enough).
 */
export function can(perms, need, level = "view") {
  if (!perms || !need) return false;
  if (Array.isArray(need)) return need.some((n) => can(perms, n, level));
  const required = LEVELS[level] || LEVELS.view;
  if (need.endsWith(".*")) {
    const prefix = need.slice(0, -1);
    return Object.entries(perms).some(([k, v]) => k.startsWith(prefix) && (LEVELS[v] || 0) >= required);
  }
  return (LEVELS[perms[need]] || 0) >= required;
}

const stripExact = (p) => (p.endsWith("$") ? { path: p.slice(0, -1), exact: true } : { path: p, exact: false });

/** Everything the frontend needs to filter menus and guard screens. */
export function buildAccess(ownerType, perms) {
  const granted = perms && typeof perms === "object" ? perms : {};
  const allowedPaths = [];
  const modules = [];
  let landing = null;
  let hasNonPos = false;

  for (const m of getModules(ownerType)) {
    let moduleGranted = false;
    for (const s of m.subs) {
      if (s.special || !granted[s.key]) continue;
      moduleGranted = true;
      if (m.key !== "pos") hasNonPos = true;
      for (const p of s.paths) {
        allowedPaths.push(stripExact(p));
        if (!landing) landing = stripExact(p).path;
      }
    }
    if (moduleGranted) {
      modules.push(m.label);
      for (const p of m.sharedPaths) allowedPaths.push(stripExact(p));
    }
  }

  return {
    allowedPaths,
    modules,
    landing: landing || `/${ownerType}/my-account`,
    posOnly: modules.length > 0 && !hasNonPos,
    specials: Object.fromEntries(
      getModules(ownerType).flatMap((m) => m.subs.filter((s) => s.special).map((s) => [s.key, Boolean(granted[s.key])])),
    ),
  };
}
