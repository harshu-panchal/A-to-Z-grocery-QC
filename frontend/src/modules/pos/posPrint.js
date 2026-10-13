/**
 * Printing for the POS: thermal receipts, barcode labels (browser print via a
 * hidden iframe, so the app's own layout/CSS can't leak in) and A4 tax
 * invoices (jsPDF).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { round2, rupees, settingText, fmtDateTime, DEFAULT_BARCODE_SETTINGS } from "./posUtils";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Print an HTML document in a hidden iframe. */
export function printHtml(bodyHtml, { css = "", title = "Print" } = {}) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const go = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // wait for images (logo/QR) before printing
  const imgs = [...doc.images];
  if (!imgs.length) setTimeout(go, 50);
  else Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(go);
}

// ------------------------------------------------------------- receipt
const RECEIPT_CSS = (width) => `
  @page { size: ${width}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11px/1.35 "Courier New", monospace; color: #000; width: ${width - 4}mm; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
  .shop { font-size: 15px; font-weight: 700; }
  .line { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 1px 0; vertical-align: top; font-size: 11px; }
  th { text-align: left; border-bottom: 1px dashed #000; }
  .tot td { font-size: 12px; }
  .grand td { font-size: 14px; font-weight: 700; border-top: 1px dashed #000; padding-top: 3px; }
  .muted { font-size: 10px; }
  img.qr { width: 32mm; height: 32mm; }
`;

/** Thermal receipt for a saved bill (or a preview built from the cart). */
export async function printReceipt(order, bill = {}, opts = {}) {
  const width = Number(opts.width) || Number(bill?.paperWidth) || 80;
  const shop = settingText(bill, "shopName");
  const header = ["address", "phone", "gstin", "fssai"]
    .map((k) => {
      const t = settingText(bill, k);
      if (!t) return "";
      const label = { phone: "Ph: ", gstin: "GSTIN: ", fssai: "FSSAI: " }[k] || "";
      return `<div class="c muted">${esc(label + t)}</div>`;
    })
    .join("");
  const rows = (order.items || [])
    .map((it) => {
      const qty = Number(it.quantity);
      const price = Number(it.unitPrice ?? it.price);
      const total = Number(it.total ?? price * qty);
      return `<tr><td colspan="3">${esc(it.name)}${it.variantName ? ` (${esc(it.variantName)})` : ""}</td></tr>
        <tr><td class="muted">${qty} x ${round2(price)}</td><td class="r muted">${it.mrp && it.mrp > price ? `MRP ${round2(it.mrp)}` : ""}</td><td class="r">${round2(total)}</td></tr>`;
    })
    .join("");
  const mrpTotal = (order.items || []).reduce((s, it) => s + Number(it.mrp || it.unitPrice || it.price) * Number(it.quantity), 0);
  const savings = round2(mrpTotal - Number(order.total));
  const upi = settingText(bill, "upiId");
  // UPI QR for unpaid (credit/estimate) bills, generated locally
  let qr = "";
  if (upi && order.paymentStatus !== "Paid") {
    const data = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(shop || "Shop")}&am=${round2(order.total)}&cu=INR`;
    const src = await QRCode.toDataURL(data, { margin: 1, width: 240 }).catch(() => "");
    if (src) qr = `<div class="c"><img class="qr" src="${src}"/><div class="muted">Scan to pay ${rupees(order.total)}</div></div>`;
  }
  const html = `
    ${shop ? `<div class="c shop">${esc(shop)}</div>` : ""}
    ${header}
    <div class="line"></div>
    <div class="c b">${order.paymentMethod === "Credit" ? "CREDIT BILL" : order._preview ? "ESTIMATE" : "TAX INVOICE"}</div>
    <table><tr><td>Bill: ${esc(order.invoiceNumber || "-")}</td><td class="r">${esc(fmtDateTime(order.createdAt || Date.now()))}</td></tr>
    <tr><td colspan="2">Customer: ${esc(order.customerSnapshot?.name || "Walk-in Customer")}${order.customerSnapshot?.phone ? ` (${esc(order.customerSnapshot.phone)})` : ""}</td></tr></table>
    <div class="line"></div>
    <table><tr><th colspan="2">Item</th><th class="r">Amt</th></tr>${rows}</table>
    <div class="line"></div>
    <table class="tot">
      <tr><td>Items</td><td class="r">${round2(order.itemCount ?? (order.items || []).reduce((s, i) => s + Number(i.quantity), 0))}</td></tr>
      <tr><td>Subtotal</td><td class="r">${round2(order.subtotal)}</td></tr>
      ${order.billDiscount ? `<tr><td>Discount</td><td class="r">-${round2(order.billDiscount)}</td></tr>` : ""}
      ${order.roundOff ? `<tr><td>Round off</td><td class="r">${round2(order.roundOff)}</td></tr>` : ""}
      ${order.gstTotal ? `<tr><td class="muted">Incl. GST</td><td class="r muted">${round2(order.gstTotal)}</td></tr>` : ""}
      <tr class="grand"><td>TOTAL</td><td class="r">${rupees(order.total)}</td></tr>
      <tr><td>Paid by</td><td class="r">${esc(order.paymentMethod || "-")}</td></tr>
      ${order.paymentMethod === "Cash" && order.amountReceived ? `<tr><td>Received</td><td class="r">${round2(order.amountReceived)}</td></tr><tr><td>Change</td><td class="r">${round2(order.changeReturned)}</td></tr>` : ""}
    </table>
    ${savings > 0 ? `<div class="line"></div><div class="c b">You saved ${rupees(savings)}!</div>` : ""}
    ${qr}
    ${settingText(bill, "notes") ? `<div class="line"></div><div class="c muted">${esc(settingText(bill, "notes"))}</div>` : ""}
    ${settingText(bill, "terms") ? `<div class="c muted">${esc(settingText(bill, "terms"))}</div>` : ""}
    <div class="line"></div>
    <div class="c muted">${esc(settingText(bill, "footer") || "Thank you! Visit again")}</div>`;
  printHtml(html, { css: RECEIPT_CSS(width), title: order.invoiceNumber || "Receipt" });
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
    .lbl svg { max-width: 100%; height: auto; }
    .nm { font-size: ${s.fontSize}px; font-weight: 700; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pr { font-size: ${s.fontSize}px; display: flex; gap: 6px; }`;
  printHtml(labels, { css, title: "Barcode labels" });
  return true;
}

// -------------------------------------------------------------- A4 invoice
/** Download an A4 GST tax invoice PDF for a saved bill. */
export function downloadInvoicePdf(order, bill = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 14;
  doc.setFont("helvetica", "bold").setFontSize(16).text(settingText(bill, "shopName") || "Tax Invoice", W / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const [k, label] of [["address", ""], ["phone", "Phone: "], ["gstin", "GSTIN: "], ["fssai", "FSSAI: "]]) {
    const t = settingText(bill, k);
    if (t) { y += 5; doc.text(label + t, W / 2, y, { align: "center" }); }
  }
  y += 8;
  doc.setFont("helvetica", "bold").setFontSize(12).text(order.paymentMethod === "Credit" ? "CREDIT INVOICE" : "TAX INVOICE", W / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Invoice No: ${order.invoiceNumber || "-"}`, 14, y);
  doc.text(`Date: ${fmtDateTime(order.createdAt)}`, W - 14, y, { align: "right" });
  y += 5;
  doc.text(`Bill to: ${order.customerSnapshot?.name || "Walk-in Customer"}${order.customerSnapshot?.phone ? `, ${order.customerSnapshot.phone}` : ""}`, 14, y);
  if (order.customerSnapshot?.gstin) { y += 5; doc.text(`Customer GSTIN: ${order.customerSnapshot.gstin}`, 14, y); }

  const body = (order.items || []).map((it, i) => {
    const total = Number(it.total);
    const gst = Number(it.gstAmount) || 0;
    return [i + 1, `${it.name}${it.variantName ? ` (${it.variantName})` : ""}`, it.hsnCode || "-", it.quantity, round2(it.unitPrice).toFixed(2), `${it.gstRate || 0}%`, round2(total - gst).toFixed(2), round2(gst).toFixed(2), round2(total).toFixed(2)];
  });
  autoTable(doc, {
    startY: y + 5,
    head: [["#", "Item", "HSN", "Qty", "Rate", "GST", "Taxable", "GST Amt", "Amount"]],
    body,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [4, 117, 49] },
    columnStyles: { 0: { cellWidth: 8 }, 3: { halign: "right" }, 4: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
  });
  let ty = doc.lastAutoTable.finalY + 6;
  const line = (label, value, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 11 : 9);
    doc.text(label, W - 60, ty);
    doc.text(value, W - 14, ty, { align: "right" });
    ty += bold ? 7 : 5;
  };
  line("Subtotal", round2(order.subtotal).toFixed(2));
  if (order.billDiscount) line("Discount", `-${round2(order.billDiscount).toFixed(2)}`);
  if (order.roundOff) line("Round off", round2(order.roundOff).toFixed(2));
  const gst = round2(order.gstTotal);
  if (gst) { line("CGST", round2(gst / 2).toFixed(2)); line("SGST", round2(gst / 2).toFixed(2)); }
  line("Total (Rs.)", round2(order.total).toFixed(2), true);
  line("Payment", `${order.paymentMethod} (${order.paymentStatus})`);
  ty += 4;
  doc.setFont("helvetica", "normal").setFontSize(8);
  for (const k of ["notes", "terms"]) {
    const t = settingText(bill, k);
    if (t) { doc.text(doc.splitTextToSize(t, W - 28), 14, ty); ty += 10; }
  }
  doc.text("This is a computer generated invoice.", W / 2, 287, { align: "center" });
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
