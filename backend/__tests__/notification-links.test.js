process.env.REDIS_DISABLED = "true";
process.env.FRONTEND_URL = "https://atozgrocery.com";

const { buildNotification, roleLinkFor } = await import("../app/modules/notifications/notification.builder.js");

describe("notification links: own panel, matching tab, no domain", () => {
  it("each role gets its own page for the same order event", () => {
    expect(roleLinkFor("ORDER_CANCELLED", "seller", { orderId: "ORD-1" })).toBe("/seller/orders?tab=Cancelled&orderId=ORD-1");
    expect(roleLinkFor("ORDER_CANCELLED", "admin", { orderId: "ORD-1" })).toBe("/admin/orders/cancelled");
    expect(roleLinkFor("ORDER_CANCELLED", "customer", { orderId: "ORD-1" })).toBe("/orders/ORD-1");
    expect(roleLinkFor("DELIVERY_ASSIGNED", "delivery", { orderId: "ORD-1" })).toBe("/delivery/order-details/ORD-1");
    expect(roleLinkFor("NEW_DELIVERY_BROADCAST", "delivery", { orderId: "ORD-1" })).toBe("/delivery");
  });

  it("returns, stock and tickets", () => {
    expect(roleLinkFor("RETURN_REQUESTED", "seller", { orderId: "ORD-1" })).toBe("/seller/returns?tab=Requested&orderId=ORD-1");
    expect(roleLinkFor("RETURN_COMPLETED", "admin", { orderId: "ORD-1" })).toBe("/admin/returns?tab=Quality%20Check&orderId=ORD-1");
    expect(roleLinkFor("LOW_STOCK_ALERT", "seller", { productId: "p1" })).toBe("/seller/inventory?productId=p1");
    expect(roleLinkFor("SUPPORT_TICKET_MESSAGE", "admin", { ticketId: "t1" })).toBe("/admin/support-tickets?ticketId=t1");
    expect(roleLinkFor("SUPPORT_TICKET_MESSAGE", "customer", { ticketId: "t1" })).toBe("/chat?ticketId=t1");
  });

  it("built notifications never carry the live domain (so localhost stays on localhost)", () => {
    const list = buildNotification("ORDER_CANCELLED", { orderId: "ORD-7", customerId: "c1", sellerId: "s1", userId: "c1", deliveryId: "d1" });
    expect(list.length).toBeGreaterThan(0);
    for (const n of list) {
      expect(n.data.link.startsWith("/")).toBe(true);
      expect(n.data.link).not.toMatch(/atozgrocery\.com|https?:/);
      if (n.role === "seller") expect(n.data.link).toBe("/seller/orders?tab=Cancelled&orderId=ORD-7");
      if (n.role === "customer") expect(n.data.link).toBe("/orders/ORD-7");
    }
  });
});
