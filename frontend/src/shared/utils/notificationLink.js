/**
 * Where a notification opens, for the person who got it: always a page of
 * their OWN panel, on the matching tab. E.g. a seller's "order cancelled"
 * opens Seller > Orders on the Cancelled tab with that order open.
 *
 * (The server stores one customer-style link for every order notification,
 * so it is only followed when it already points inside the right panel.)
 */

// order event -> seller Orders tab / admin orders list
const ORDER_TAB = {
  NEW_ORDER: ["Pending", "pending"],
  ORDER_PLACED: ["Pending", "pending"],
  PAYMENT_SUCCESS: ["Pending", "pending"],
  ORDER_CONFIRMED: ["Confirmed", "processed"],
  ORDER_PACKED: ["Packed", "processed"],
  ORDER_READY: ["Packed", "processed"],
  DELIVERY_ASSIGNED: ["Out for Delivery", "out-for-delivery"],
  OUT_FOR_DELIVERY: ["Out for Delivery", "out-for-delivery"],
  ORDER_DELIVERED: ["Delivered", "delivered"],
  ORDER_CANCELLED: ["Cancelled", "cancelled"],
};

// return event -> seller Returns tab / admin Returns tab
const RETURN_TAB = {
  RETURN_REQUESTED: ["Requested", "Requested"],
  RETURN_APPROVED: ["Approved", "Approved"],
  RETURN_REJECTED: ["Rejected", "Rejected"],
  RETURN_PICKUP_ASSIGNED: ["Pickup Assigned", "Pickup Assigned"],
  RETURN_PICKUP_OTP: ["In Transit", "In Transit"],
  RETURN_DROP_OTP: ["At Store (OTP)", "In Transit"],
  RETURN_COMPLETED: ["Received", "Quality Check"],
  RETURN_QC_PASSED: ["QC Passed", "Completed"],
  RETURN_QC_FAILED: ["QC Failed", "Completed"],
  REFUND_INITIATED: ["QC Passed", "Completed"],
  REFUND_COMPLETED: ["QC Passed", "Completed"],
};

const pathOf = (link) => {
  const raw = String(link || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    return isOwnHost(url.host) ? `${url.pathname}${url.search}` : "";
  } catch {
    return "";
  }
};

const withQuery = (path, params) => {
  const q = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return q ? `${path}?${q}` : path;
};

export function notificationPath(notification, role) {
  const d = notification?.data || {};
  const ev = String(d.eventType || notification?.eventType || "").toUpperCase();
  const orderId = String(d.orderId || d.publicOrderId || "").trim();
  const ticketId = String(d.ticketId || "").trim();
  const productId = String(d.productId || "").trim();
  const ret = RETURN_TAB[ev] || (ev === "NEW_RETURN_BROADCAST" ? ["Pickup Assigned", "Pickup Assigned"] : null);
  const ord = ORDER_TAB[ev];

  if (role === "seller") {
    if (ticketId || ev === "SUPPORT_TICKET_MESSAGE") return "/seller/support";
    if (ev === "LOW_STOCK_ALERT") return withQuery("/seller/inventory", { productId });
    if (ev === "PRODUCT_MODERATION_REQUEST") return "/seller/products";
    if (ret) return withQuery("/seller/returns", { tab: ret[0], orderId });
    if (ord || orderId) return withQuery("/seller/orders", { tab: ord?.[0], orderId });
  }
  if (role === "admin") {
    if (ticketId || ev === "SUPPORT_TICKET_MESSAGE") return withQuery("/admin/support-tickets", { ticketId });
    if (ev === "PRODUCT_MODERATION_REQUEST") return "/admin/moderation";
    if (ret) return withQuery("/admin/returns", { tab: ret[1], orderId });
    if (ord) return `/admin/orders/${ord[1]}`;
    if (orderId) return "/admin/orders/all";
  }
  if (role === "delivery") {
    // new jobs aren't this rider's yet: the dashboard shows them to accept
    if (ev === "NEW_DELIVERY_BROADCAST" || ev === "NEW_RETURN_BROADCAST") return "/delivery";
    if (orderId) return `/delivery/order-details/${encodeURIComponent(orderId)}`;
  }
  if (role === "customer") {
    if (ticketId || ev === "SUPPORT_TICKET_MESSAGE") return withQuery("/chat", { ticketId });
    if (orderId) return `/orders/${encodeURIComponent(orderId)}`;
  }

  // anything else: follow the stored link only if it stays inside this panel
  const p = pathOf(d.link || d.deepLink);
  const prefix = { seller: "/seller", admin: "/admin", delivery: "/delivery" }[role];
  if (!p) return "";
  if (prefix) return p.startsWith(prefix) ? p : "";
  return /^\/(seller|admin|delivery)(\/|$)/.test(p) ? "" : p;
}

// Our own site: wherever the app runs (localhost or live) and the live domain.
const isOwnHost = (host) => {
  const h = String(host || "").toLowerCase();
  const here = typeof window !== "undefined" ? window.location.host.toLowerCase() : "";
  return (here && h === here) || /(^|\.)atozgrocery\.com$/.test(h);
};

/**
 * Only a link to some OTHER website opens in a new tab. Links to our own
 * site (localhost or atozgrocery.com) always stay in this app, this panel.
 */
export const isExternalLink = (notification, role) => {
  if (notificationPath(notification, role)) return false;
  const raw = String(notification?.data?.link || notification?.data?.deepLink || "").trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    return !isOwnHost(new URL(raw).host);
  } catch {
    return false;
  }
};
