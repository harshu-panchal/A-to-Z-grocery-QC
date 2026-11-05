import { describe, test, expect } from "@jest/globals";
import { buildPosReceiptLines } from "../../modules/pos/posPrint.js";
import { RECEIPT_WIDTH } from "../../modules/customer/utils/orderInvoicePdf.js";

// A POS bill: 2 x atta (MRP 300, sold 250, 5% GST) + 1 rice (no GST), ₹20 bill discount
const order = {
  invoiceNumber: "S-000123",
  createdAt: "2026-11-02T10:30:00+05:30",
  createdByName: "Ravi Kumar",
  customerSnapshot: { name: "Neha Sharma", phone: "9833333333" },
  items: [
    { name: "Aashirvaad Atta 5kg", quantity: 2, unitPrice: 250, mrp: 300, total: 500, gstRate: 5 },
    { name: "Basmati Rice", variantName: "1 kg", quantity: 1, unitPrice: 120, mrp: 120, total: 120, gstRate: 0 },
  ],
  subtotal: 620,
  billDiscount: 20,
  total: 600,
  paymentMethod: "Cash",
  paymentStatus: "Paid",
  amountReceived: 1000,
  changeReturned: 400,
};
const bill = { shopName: { text: "Gupta Kirana" }, gstin: { text: "23ABCDE1234F1Z5" } };
const text = (rows) => rows.map((r) => r.text).join("\n");

describe("POS bill in the customer-invoice style", () => {
  const rows = buildPosReceiptLines(order, bill);

  test("every row fits the 48-column receipt", () => {
    rows.forEach((r) => expect(r.text.length).toBeLessThanOrEqual(RECEIPT_WIDTH));
  });

  test("same sections and wording as the online invoice", () => {
    const t = text(rows);
    expect(t).toContain("=".repeat(RECEIPT_WIDTH));
    expect(t).toContain("GUPTA KIRANA");
    expect(t).toContain("ITEM NAME [RACK]");
    expect(t).toContain("SALE RATE");
    expect(t).toMatch(/TOTAL MRP AMOUNT\s+: Rs.\s+720\.00/);
    expect(t).toMatch(/LESS: ITEM DISCOUNT\s+: Rs.\s+100\.00/);
    expect(t).toMatch(/LESS: BILL DISCOUNT\s+: Rs.\s+20\.00/);
    expect(t).toMatch(/CGST @ 2\.5%/);
    expect(t).toMatch(/NET AMOUNT TO PAY\s+: Rs.\s+600\.00/);
    expect(t).toContain("*** TOTAL SAVED: Rs. 120.00 ***");
    expect(t).toContain("PAYMENT MODE : CASH");
    expect(t).toContain("CHANGE GIVEN : Rs. 400.00");
    expect(t).toContain("Billed by: Ravi Kumar");
  });

  test("net amount is the bold line, like the online invoice", () => {
    expect(rows.find((r) => r.text.startsWith("NET AMOUNT TO PAY")).bold).toBe(true);
  });

  test("a cart preview prints as an estimate without payment rows", () => {
    const t = text(buildPosReceiptLines({ ...order, _preview: true, paymentMethod: "-" }, bill));
    expect(t).toContain("ESTIMATE");
    expect(t).not.toContain("PAYMENT MODE");
  });
});
