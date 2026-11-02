import { describe, test, expect } from "@jest/globals";
import { notificationPath } from "../shared/utils/notificationLink.js";

const n = (eventType, data = {}) => ({ data: { eventType, link: "https://atozgrocery.com/orders/ORD-1", ...data } });

describe("where a notification opens", () => {
  test("order notifications open the order in each person's own panel", () => {
    const order = n("NEW_ORDER", { orderId: "ORD-1" });
    expect(notificationPath(order, "customer")).toBe("/orders/ORD-1");
    expect(notificationPath(order, "seller")).toBe("/seller/orders?tab=Pending&orderId=ORD-1");
    expect(notificationPath(order, "admin")).toBe("/admin/orders/pending");
    expect(notificationPath(n("DELIVERY_ASSIGNED", { orderId: "ORD-1" }), "delivery")).toBe("/delivery/order-details/ORD-1");
  });

  test("returns, stock, approvals and tickets go to their pages", () => {
    expect(notificationPath(n("RETURN_REQUESTED", { orderId: "ORD-1" }), "seller")).toBe("/seller/returns?tab=Requested&orderId=ORD-1");
    expect(notificationPath(n("RETURN_REQUESTED", { orderId: "ORD-1" }), "admin")).toBe("/admin/returns?tab=Requested&orderId=ORD-1");
    expect(notificationPath(n("LOW_STOCK_ALERT", { productId: "p1", link: "" }), "seller")).toBe("/seller/inventory?productId=p1");
    expect(notificationPath(n("PRODUCT_MODERATION_REQUEST", { link: "" }), "admin")).toBe("/admin/moderation");
    expect(notificationPath(n("SUPPORT_TICKET_MESSAGE", { ticketId: "t9", link: "" }), "admin")).toBe("/admin/support-tickets?ticketId=t9");
    expect(notificationPath(n("SUPPORT_TICKET_MESSAGE", { ticketId: "t9", link: "" }), "customer")).toBe("/chat?ticketId=t9");
  });

  test("a new job for riders opens the dashboard to accept it", () => {
    expect(notificationPath(n("NEW_DELIVERY_BROADCAST", { orderId: "ORD-1" }), "delivery")).toBe("/delivery");
  });

  test("other notifications follow their link, but never into another panel", () => {
    expect(notificationPath({ data: { link: "https://atozgrocery.com/offers?x=1" } }, "customer")).toBe("/offers?x=1");
    expect(notificationPath({ data: { link: "/seller/earnings" } }, "seller")).toBe("/seller/earnings");
    expect(notificationPath({ data: { link: "/orders/ORD-1" } }, "seller")).toBe("");
    expect(notificationPath({ data: { link: "/admin/wallet" } }, "customer")).toBe("");
    expect(notificationPath({ data: {} }, "admin")).toBe("");
  });

  test("seller: cancelled order opens Orders on the Cancelled tab, admin the cancelled list", () => {
    const c = n("ORDER_CANCELLED", { orderId: "ORD-9" });
    expect(notificationPath(c, "seller")).toBe("/seller/orders?tab=Cancelled&orderId=ORD-9");
    expect(notificationPath(c, "admin")).toBe("/admin/orders/cancelled");
    expect(notificationPath(n("ORDER_DELIVERED", { orderId: "ORD-9" }), "seller")).toBe("/seller/orders?tab=Delivered&orderId=ORD-9");
    expect(notificationPath(n("RETURN_QC_PASSED", { orderId: "ORD-9" }), "seller")).toBe("/seller/returns?tab=QC%20Passed&orderId=ORD-9");
  });

  test("old notifications with a full atozgrocery.com link still open in the same panel", () => {
    // stored before the fix: customer-style link on the live domain
    const old = { data: { eventType: "ORDER_CANCELLED", orderId: "ORD-5", link: "https://atozgrocery.com/orders/ORD-5" } };
    expect(notificationPath(old, "seller")).toBe("/seller/orders?tab=Cancelled&orderId=ORD-5");
    expect(notificationPath(old, "admin")).toBe("/admin/orders/cancelled");
    expect(notificationPath({ data: { link: "https://www.atozgrocery.com/offers" } }, "customer")).toBe("/offers");
  });

  test("a link to some other website is never turned into a page of the app", () => {
    expect(notificationPath({ data: { link: "https://youtube.com/watch?v=1" } }, "customer")).toBe("");
  });
});
