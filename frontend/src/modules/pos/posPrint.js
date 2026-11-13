/**
 * Printing for the POS: thermal receipts, barcode labels (browser print via a
 * hidden iframe, so the app's own layout/CSS can't leak in) and A4 tax
 * invoices (jsPDF).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { round2, settingText, DEFAULT_BARCODE_SETTINGS } from "./posUtils";
import { receiptFormat } from "../customer/utils/orderInvoicePdf";
import { printHtml, printReceiptRows, escHtml as esc } from "../../shared/utils/printHtml.js";

export { printHtml };

// ------------------------------------------------------------- receipt
// Same look as the customer's online invoice (Courier, 48 columns,
// "====" / "----" dividers), built with the same helpers.
const F = receiptFormat;

const PAY_LABEL = { Cash: "CASH", UPI: "UPI", Card: "CARD", Credit: "CREDIT (UDHAAR)", Online: "ONLINE (PHONEPE)" };

/** The POS bill as `{ text, bold }` rows, each at most 48 characters. */
export function buildPosReceiptLines(order, bill = {}) {
  const out = [];
  const add = (text, bold = false) => out.push({ text, bold });
  const items = (order.items || []).map((it) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unitPrice ?? it.price) || 0;
    return {
      name: `${it.name || "Item"}${it.variantName ? ` ${it.variantName}` : ""}`,
      rack: it.rackCode || "",
      qty,
      mrp: Math.max(rate, Number(it.mrp) || 0),
      rate,
      amount: Number(it.total ?? rate * qty),
      gstRate: Number(it.gstRate) || 0,
    };
  });
  const { date, time } = F.formatDateTime(order.createdAt || Date.now());

  // header
  add(F.DOUBLE);
  add(F.center(String(settingText(bill, "shopName") || "INVOICE").toUpperCase()), true);
  add(F.center(F.TAGLINE));
  for (const [k, label] of [["address", ""], ["phone", "Ph: "], ["gstin", "GSTIN: "], ["fssai", "FSSAI: "]]) {
    const t = settingText(bill, k);
    if (t) F.wrapWords(label + t, F.WIDTH).forEach((row) => add(F.center(row)));
  }
  add(F.DOUBLE);
  add(F.center(order.paymentMethod === "Credit" ? "CREDIT BILL" : order._preview ? "ESTIMATE" : "TAX INVOICE"), true);
  add(F.SINGLE);
  add(F.leftRight(`Bill No: #${order.invoiceNumber || "-"}`, `Date: ${date}`));
  add(F.leftRight(`Time: ${time}`, order.createdByName ? `Billed by: ${order.createdByName}`.slice(0, 26) : ""));
  const cust = order.customerSnapshot || {};
  add(`Customer: ${cust.name || "Walk-in Customer"}`.slice(0, F.WIDTH));
  if (cust.phone) add(`Cust Ph: ${cust.phone}`);
  add(F.DOUBLE);

  // items
  add(F.padR("ITEM NAME [RACK]", F.COL.name) + F.padL("QTY", F.COL.qty) + F.padL("MRP", F.COL.mrp) + F.padL("SALE RATE", F.COL.rate) + F.padL("AMT", F.COL.amt));
  add(F.SINGLE);
  items.forEach((l) => F.itemRows(l).forEach((row) => add(row)));
  add(F.SINGLE);
  const totalQty = F.round2(items.reduce((s, l) => s + l.qty, 0));
  add(F.leftRight(`TOTAL ITEMS: ${items.length}`, `TOTAL QTY: ${F.fmtNum(totalQty)}   `));
  add(F.SINGLE);

  // amounts
  const totalMrp = items.reduce((s, l) => s + l.mrp * l.qty, 0);
  const subtotal = Number(order.subtotal ?? items.reduce((s, l) => s + l.amount, 0));
  const itemDiscount = Math.max(0, totalMrp - subtotal);
  const billDiscount = Number(order.billDiscount) || 0;
  add(F.amountRow("TOTAL MRP AMOUNT", totalMrp));
  add(F.amountRow("LESS: ITEM DISCOUNT", itemDiscount));
  add(F.SINGLE);
  add(F.amountRow("SUBTOTAL", subtotal));
  if (billDiscount) add(F.amountRow("LESS: BILL DISCOUNT", billDiscount));
  if (Number(order.roundOff)) add(F.amountRow("ROUND OFF", order.roundOff));

  // GST is inside the prices: back it out per rate, after the bill discount
  const share = subtotal > 0 ? Math.min(billDiscount, subtotal) / subtotal : 0;
  const byRate = new Map();
  let taxable = 0;
  for (const l of items) {
    const net = l.amount * (1 - share);
    const tax = l.gstRate > 0 ? net - net / (1 + l.gstRate / 100) : 0;
    taxable += net - tax;
    if (tax) byRate.set(l.gstRate, (byRate.get(l.gstRate) || 0) + tax);
  }
  if (byRate.size) {
    add(F.SINGLE);
    add(F.amountRow("TAXABLE VALUE", taxable));
    let gstTotal = 0;
    for (const [rate, tax] of [...byRate.entries()].sort((x, y) => x[0] - y[0])) {
      gstTotal += tax;
      add(F.amountRow(`CGST @ ${rate / 2}%`, tax / 2));
      add(F.amountRow(`SGST @ ${rate / 2}%`, tax / 2));
    }
    add(F.SINGLE);
    add(F.amountRow("TOTAL GST INCLUDED", gstTotal));
  }
  add(F.SINGLE);
  add(F.amountRow("NET AMOUNT TO PAY", order.total ?? subtotal - billDiscount), true);
  add(F.DOUBLE);

  // savings
  const saved = itemDiscount + billDiscount;
  if (saved > 0) {
    add(F.center(`*** TOTAL SAVED: Rs. ${F.fmt2(saved)} ***`), true);
    add(F.center(`(MRP Savings: ${F.fmtNum(itemDiscount)} + Discount: ${F.fmtNum(billDiscount)})`));
    add(F.DOUBLE);
  }

  // payment
  if (order.paymentMethod && order.paymentMethod !== "-") {
    add(`PAYMENT MODE : ${PAY_LABEL[order.paymentMethod] || String(order.paymentMethod).toUpperCase()}`);
    if (order.paymentStatus) add(`PAYMENT STATUS: ${String(order.paymentStatus).toUpperCase()}`);
    if (order.paymentMethod === "Cash" && Number(order.amountReceived)) {
      add(`CASH RECEIVED: Rs. ${F.fmt2(order.amountReceived)}`);
      add(`CHANGE GIVEN : Rs. ${F.fmt2(order.changeReturned)}`);
    }
    add(F.DOUBLE);
  }
  return out;
}

/** Notes, terms and the thank-you line at the bottom of the bill. */
function receiptTail(bill) {
  const notes = ["notes", "terms"]
    .map((k) => settingText(bill, k))
    .filter(Boolean)
    .flatMap((t) => F.wrapWords(t, F.WIDTH).map((row) => ({ text: F.center(row) })));
  return [...notes, { text: F.center(settingText(bill, "footer") || "Thank You! Visit Again!") }, { text: F.DOUBLE }];
}

/** Thermal receipt for a saved bill (or a preview built from the cart). */
export async function printReceipt(order, bill = {}, opts = {}) {
  const width = Number(opts.width) || Number(bill?.paperWidth) || 80;

  const shop = settingText(bill, "shopName");
  const upi = settingText(bill, "upiId");
  let qr = "";
  if (upi && order.paymentStatus !== "Paid") {
    const data = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(shop || "Shop")}&am=${round2(order.total)}&cu=INR`;
    const src = await QRCode.toDataURL(data, { margin: 1, width: 240 }).catch(() => "");
    if (src) qr = `<div class="c"><img class="qr" src="${src}"/><div>Scan to pay Rs. ${round2(order.total).toFixed(2)}</div></div>`;
  }
  const tail = receiptTail(bill).map((r) => esc(r.text)).join("\n");
  // printed on paper exactly as long as the bill
  printReceiptRows(buildPosReceiptLines(order, bill), {
    widthMm: width,
    columns: F.WIDTH,
    title: order.invoiceNumber || "Receipt",
    afterHtml: `${qr}<pre>${tail}</pre>`,
  });
}

// ---------------------------------------------------------- barcode labels
function barcodeSvg(code, s) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, String(code), { format: "CODE128", width: s.barcodeWidth, height: s.barcodeHeight, displayValue: true, fontSize: s.fontSize, margin: 0 });
  } catch {
    return `<div>${esc(code)}</div>`;
  }
  return svg.outerHTML;
}

/** Print labels: items = [{ name, barcode, mrp, price, copies }]. */
export function printBarcodeLabels(items, settings = {}) {
  const s = { ...DEFAULT_BARCODE_SETTINGS, ...settings };
  const labels = items
    .filter((i) => i.barcode)
    .flatMap((i) => Array.from({ length: Math.max(1, Math.min(500, Number(i.copies) || 1)) }, () => i))
    .map((i) => `<div class="lbl">
        ${s.showName ? `<div class="nm">${esc(i.name)}</div>` : ""}
        ${barcodeSvg(i.barcode, s)}
        <div class="pr">${s.showMrp && i.mrp ? `<span>${esc(s.mrpLabel)}: <s>${round2(i.mrp)}</s></span>` : ""}${s.showPrice && i.price ? `<b>${esc(s.spLabel)}: ${round2(i.price)}</b>` : ""}</div>
      </div>`)
    .join("");
  if (!labels) return false;
  const css = `
    @page { size: ${s.width}mm ${s.height}mm; margin: 0; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .lbl { width: ${s.width}mm; height: ${s.height}mm; padding: 1mm 1.5mm; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .lbl:last-child { page-break-after: auto; }
    .lbl svg { max-width: 100%; height: auto; }
    .nm { font-size: ${s.fontSize}px; font-weight: 700; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pr { font-size: ${s.fontSize}px; display: flex; gap: 6px; }`;
  printHtml(labels, { css, title: "Barcode labels" });
  return true;
}

// ------------------------------------------------------------- PDF invoice
// The bill as a PDF the size of the bill (80mm wide, as tall as its lines),
// same layout as the printed receipt and the customer's online invoice.
export function downloadInvoicePdf(order, bill = {}) {
  const rows = [...buildPosReceiptLines(order, bill), ...receiptTail(bill)];
  const PAGE_W = 80; const FONT_PT = 7; const LINE_H = 3.6; const MARGIN = 4.4;
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, MARGIN * 2 + 4 + rows.length * LINE_H] });
  doc.setFontSize(FONT_PT).setTextColor(20);
  rows.forEach((row, i) => {
    doc.setFont("courier", row.bold ? "bold" : "normal");
    doc.text(row.text, MARGIN, MARGIN + 4 + i * LINE_H);
  });
  doc.save(`${order.invoiceNumber || "invoice"}.pdf`);
}

/** Generic table PDF (reports / ledgers). */
export function downloadTablePdf({ title, subtitle, head, body, fileName }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: head.length > 7 ? "landscape" : "portrait" });
  doc.setFont("helvetica", "bold").setFontSize(14).text(title, 14, 14);
  if (subtitle) doc.setFont("helvetica", "normal").setFontSize(9).text(subtitle, 14, 20);
  autoTable(doc, { startY: subtitle ? 25 : 20, head: [head], body, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [4, 117, 49] } });
  doc.save(fileName || `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

/** CSV download helper. */
export function downloadCsv(fileName, head, rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  // BOM so Excel reads ₹ and Hindi text as UTF-8
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
