import { describe, test, expect } from "@jest/globals";
import {
  buildInvoicePdf,
  buildReceiptLines,
  loadPdfLibs,
  getInvoiceLines,
  getInvoiceNumber,
  getInvoiceSummary,
  RECEIPT_WIDTH,
} from "../../modules/customer/utils/orderInvoicePdf.js";

// Same bill as the reference receipt the store shared.
const product = (name, mrp, rackCode) => ({ name, mrp, rackCode, gstRate: 5 });
const order = {
  orderId: "1024",
  createdAt: "2026-10-24T14:30:00",
  paymentMode: "cod",
  paymentStatus: "pending",
  address: { name: "Neha", phone: "9876543210" },
  couponSnapshot: { code: "SAVE50" },
  items: [
    { name: "Atta 5kg", quantity: 1, price: 220, product: product("Atta 5kg", 250, "A1-02") },
    { name: "Basmati Rice", quantity: 2, price: 100, product: product("Basmati Rice", 120, "B2") },
    { name: "Sunflower Oil", quantity: 1, price: 150, product: product("Sunflower Oil", 180, "C1") },
    { name: "Dairy Milk 100g", quantity: 2, price: 45, product: product("Dairy Milk 100g", 50, "D4") },
  ],
  pricing: { subtotal: 660, deliveryFee: 0, platformFee: 0, gst: 0, tip: 0, discount: 50, total: 610 },
};
const settings = { appName: "AtoZ Grocery", address: "Opp. PAC Gate, Rajgarh, Jhansi", taxId: "09AAAAA0000A1Z5" };
const text = () => buildReceiptLines(order, settings).map((r) => r.text);
const row = (label) => text().find((t) => t.startsWith(label));

describe("customer invoice — receipt format", () => {
  test("every row fits the 48-column receipt", () => {
    for (const t of text()) expect(t.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
  });

  test("header, bill info and item rows match the reference layout", () => {
    const t = text();
    expect(t).toContain("                  ATOZ GROCERY");
    expect(t.some((l) => l.includes("GSTIN: 09AAAAA0000A1Z5"))).toBe(true);
    expect(t.find((l) => l.startsWith("Bill No: #1024"))).toMatch(/Date: 24\/10\/2026$/);
    expect(t.find((l) => l.startsWith("Cust Ph: 9876543210"))).toMatch(/Time: 02:30 PM$/);
    expect(t).toContain("ITEM NAME [RACK]     QTY   MRP SALE RATE     AMT");
    expect(t).toContain("Atta 5kg [A1-02]       1   250       220     220");
    expect(t).toContain("Sunflower Oil [C1]     1   180       150     150");
    expect(t).toContain("Dairy Milk 100g [D4]   2    50        45      90");
  });

  test("totals, coupon, savings and net amount", () => {
    expect(row("TOTAL ITEMS: 4")).toMatch(/TOTAL QTY: 6/);
    expect(row("TOTAL MRP AMOUNT")).toMatch(/Rs\.\s+770\.00$/);
    expect(row("LESS: ITEM DISCOUNT")).toMatch(/Rs\.\s+110\.00$/);
    expect(row("SUBTOTAL")).toMatch(/Rs\.\s+660\.00$/);
    expect(row("LESS: COUPON [SAVE50]")).toMatch(/Rs\.\s+50\.00$/);
    expect(row("NET AMOUNT TO PAY")).toMatch(/Rs\.\s+610\.00$/);
    expect(text().some((l) => l.includes("*** TOTAL SAVED: Rs. 160.00 ***"))).toBe(true);
    expect(text().some((l) => l.includes("(MRP Savings: 110 + Coupon: 50)"))).toBe(true);
    expect(row("PAYMENT MODE")).toBe("PAYMENT MODE : CASH ON DELIVERY");
  });

  test("GST is backed out of the GST-inclusive net amount, split CGST/SGST", () => {
    // 610 incl. 5% GST -> taxable 580.95, GST 29.05
    expect(row("TAXABLE VALUE")).toMatch(/Rs\.\s+580\.95$/);
    expect(row("CGST @ 2.5%")).toMatch(/Rs\.\s+14\.52$/);
    expect(row("SGST @ 2.5%")).toMatch(/Rs\.\s+14\.52$/);
    expect(row("TOTAL GST INCLUDED")).toMatch(/Rs\.\s+29\.05$/);
  });

  test("delivery/handling/tip are listed when charged; MRP never below sale rate", () => {
    const o = { ...order, items: [{ name: "X", quantity: 1, price: 99 }], couponSnapshot: null,
      pricing: { subtotal: 99, deliveryFee: 25, platformFee: 5, tip: 10, discount: 0, total: 139 } };
    const t = buildReceiptLines(o, settings).map((r) => r.text);
    expect(t.find((l) => l.startsWith("ADD: DELIVERY FEE"))).toMatch(/25\.00$/);
    expect(t.find((l) => l.startsWith("ADD: HANDLING FEE"))).toMatch(/5\.00$/);
    expect(t.find((l) => l.startsWith("LESS: ITEM DISCOUNT"))).toMatch(/0\.00$/);
    expect(t.some((l) => l.startsWith("TAXABLE VALUE"))).toBe(false);
    expect(getInvoiceLines(o)[0].mrp).toBe(99);
  });

  test("long names wrap at word boundaries", () => {
    const o = { ...order, items: [{ name: "Fortune Premium Kachi Ghani Mustard Oil", quantity: 1, price: 180, product: product("x", 210, "E7") }] };
    const t = buildReceiptLines(o, settings).map((r) => r.text);
    const i = t.findIndex((l) => l.startsWith("Fortune Premium"));
    expect(t[i]).toBe("Fortune Premium        1   210       180     180");
    expect(t[i + 1]).toBe("Kachi Ghani Mustard");
    expect(t[i + 2]).toBe("Oil [E7]");
  });

  test("invoice number comes from orderId", () => {
    expect(getInvoiceNumber(order)).toBe("1024");
  });

  test("builds an 80mm-wide PDF containing the receipt", async () => {
    const { doc, fileName } = buildInvoicePdf(order, settings, await loadPdfLibs());
    expect(fileName).toBe("Invoice-1024.pdf");
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(80);
    const pdf = doc.output();
    for (const s of ["ATOZ GROCERY", "NET AMOUNT TO PAY", "610.00", "Thank You! Visit Again!"]) expect(pdf).toContain(s);
  });

  test("tolerates an order with no address, items or pricing", async () => {
    const { doc } = buildInvoicePdf({ orderId: "X1" }, {}, await loadPdfLibs());
    expect(doc.output()).toContain("NET AMOUNT TO PAY");
  });
});

describe("customer invoice — on-screen card", () => {
  test("every charge is listed so the rows add up to Total Paid (599 + 10 = 609)", () => {
    const card = getInvoiceSummary({
      orderId: "ORD-9",
      items: [{ name: "Yoga Mat 6mm", quantity: 1, price: 599 }],
      pricing: { subtotal: 599, deliveryFee: 10, gst: 0, discount: 0, total: 609 },
    });
    expect(card.rows).toEqual([["Item Total", 599], ["Delivery Fee", 10]]);
    expect(card.rows.reduce((s, [, v]) => s + v, 0)).toBe(card.total);
    expect(card.total).toBe(609);
  });

  test("coupon shows as a negative row with its code; savings include MRP and coupon", () => {
    const card = getInvoiceSummary(order);
    expect(card.rows).toContainEqual(["Coupon (SAVE50)", -50]);
    expect(card.saved).toBe(160);
  });
});
