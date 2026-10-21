// Customer order invoice in thermal-receipt format: fixed-width (Courier)
// text, 48 columns, "====" / "----" dividers. The same lines feed both the
// on-screen preview (InvoiceModal) and the 80mm-wide PDF, so they always match.
//
// jsPDF is imported lazily so it only loads when an invoice is downloaded.
// Its built-in fonts have no "₹" glyph, so amounts use "Rs.".

export const RECEIPT_WIDTH = 48;
const STORE_TAGLINE = "* OFFLINE & ONLINE STORE *";

const COL = { name: 20, qty: 4, mrp: 6, rate: 10, amt: 8 }; // = 48

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt2 = (n) => round2(n).toFixed(2);
// Item columns: whole numbers stay whole (250), fractions get 2 decimals.
const fmtNum = (n) => (Number.isInteger(round2(n)) ? String(round2(n)) : fmt2(n));

const padR = (s, w) => String(s).slice(0, w).padEnd(w);
const padL = (s, w) => String(s).slice(-w).padStart(w);
const center = (s) => {
  const t = String(s).slice(0, RECEIPT_WIDTH);
  return " ".repeat(Math.floor((RECEIPT_WIDTH - t.length) / 2)) + t;
};
const DOUBLE = "=".repeat(RECEIPT_WIDTH);
const SINGLE = "-".repeat(RECEIPT_WIDTH);
// "LABEL                         : Rs.  660.00"
const amountRow = (label, value) => `${padR(label, 30)}: Rs. ${padL(fmt2(value), 7)}`;
const leftRight = (left, right) =>
  left + " ".repeat(Math.max(1, RECEIPT_WIDTH - left.length - right.length)) + right;

export const getInvoiceNumber = (order) => order?.orderId || order?._id || order?.id || "";

function findVariant(product, item) {
  const key = String(item.variantSlot || item.variantSku || item.variantName || "").trim();
  if (!key || !Array.isArray(product?.variants)) return null;
  return product.variants.find((v) => String(v?.sku || "").trim() === key)
    || product.variants.find((v) => String(v?.name || "").trim() === key)
    || null;
}

/** Per-line figures. `rate` is what the customer paid per unit. */
export function getInvoiceLines(order) {
  return (order?.items || []).map((item) => {
    const product = item.product && typeof item.product === "object" ? item.product : {};
    const variant = findVariant(product, item);
    const qty = Number(item.quantity ?? item.qty) || 0;
    const rate = Number(item.price) || 0;
    const mrp = Math.max(rate, Number(variant?.mrp || product.mrp) || 0);
    const baseName = item.name || product.name || "Item";
    const variantLabel = item.variantName || item.variantSlot || "";
    const rack = variant?.rackCode || product.rackCode || "";
    return {
      name: variantLabel ? `${baseName} ${variantLabel}` : baseName,
      rack,
      qty,
      mrp,
      rate,
      amount: rate * qty,
      gstRate: Number(product.gstRate) || 0,
    };
  });
}

// Greedy word wrap; a word longer than the column is hard-split.
function wrapWords(text, width) {
  const rows = [];
  let current = "";
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (current) { rows.push(current); current = ""; }
      rows.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else { rows.push(current); current = word; }
  }
  if (current) rows.push(current);
  return rows;
}

function itemRows(line) {
  const label = line.rack ? `${line.name} [${line.rack}]` : line.name;
  // The name may use the full column: QTY is right-aligned, so its own
  // padding keeps a gap before the number.
  const chunks = wrapWords(label, COL.name);
  const numbers =
    padL(line.qty, COL.qty) + padL(fmtNum(line.mrp), COL.mrp) +
    padL(fmtNum(line.rate), COL.rate) + padL(fmtNum(line.amount), COL.amt);
  return [padR(chunks[0] || "", COL.name) + numbers, ...chunks.slice(1)];
}

function formatDateTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "-", time: "-" };
  const date = d.toLocaleDateString("en-GB"); // 24/10/2026
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); // 02:30 PM
  return { date, time };
}

function paymentLabel(order) {
  const mode = String(order.paymentMode || order.payment?.method || "").toLowerCase();
  if (mode === "cod" || mode === "cash") return "CASH ON DELIVERY";
  if (mode) return `ONLINE (${mode.toUpperCase()})`;
  return "-";
}

/**
 * The receipt as an array of `{ text, bold }` rows, each at most 48 chars.
 */
/**
 * Totals for the on-screen invoice card. Same figures as the receipt; every
 * charge is listed, so the rows add up to the total (the old card showed only
 * Subtotal + Tax, e.g. 599 + 0 with "Total Paid 609").
 */
export function getInvoiceSummary(order) {
  const p = order?.pricing || {};
  const lines = getInvoiceLines(order);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const rows = [["Item Total", subtotal]];
  const couponCode = order?.couponSnapshot?.code;
  if (Number(p.discount)) rows.push([`Coupon${couponCode ? ` (${String(couponCode).toUpperCase()})` : ""}`, -Math.abs(p.discount)]);
  if (Number(p.deliveryFee)) rows.push(["Delivery Fee", p.deliveryFee]);
  if (Number(p.platformFee)) rows.push(["Handling Fee", p.platformFee]);
  if (Number(p.gst)) rows.push(["GST", p.gst]);
  if (Number(p.tip)) rows.push(["Tip", p.tip]);
  const total = p.total ?? rows.reduce((s, [, v]) => s + Number(v || 0), 0);
  const walletUsed = Number(p.walletAmount) || 0;
  const saved = lines.reduce((s, l) => s + (l.mrp - l.rate) * l.qty, 0) + (Number(p.discount) || 0);
  return { lines, rows, total, walletUsed, saved };
}

export function buildReceiptLines(order, settings = {}) {
  const out = [];
  const add = (text, bold = false) => out.push({ text, bold });
  const p = order?.pricing || {};
  const lines = getInvoiceLines(order);
  const { date, time } = formatDateTime(order?.createdAt);

  // Header
  add(DOUBLE);
  add(center(String(settings.appName || "INVOICE").toUpperCase()), true);
  add(center(STORE_TAGLINE));
  if (settings.address) add(center(settings.address));
  if (settings.taxId) add(center(`GSTIN: ${settings.taxId}`));
  const shop = order?.seller?.shopName;
  if (shop && shop.toLowerCase() !== String(settings.appName || "").toLowerCase()) add(center(`Sold by: ${shop}`));
  add(DOUBLE);

  const phone = order?.address?.phone || order?.customer?.phone || "-";
  add(leftRight(`Bill No: #${getInvoiceNumber(order)}`, `Date: ${date}`));
  add(leftRight(`Cust Ph: ${phone}`, `Time: ${time}`));
  add(DOUBLE);

  // Items
  add(padR("ITEM NAME [RACK]", COL.name) + padL("QTY", COL.qty) + padL("MRP", COL.mrp) +
    padL("SALE RATE", COL.rate) + padL("AMT", COL.amt));
  add(SINGLE);
  for (const line of lines) itemRows(line).forEach((row) => add(row));
  add(SINGLE);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  add(leftRight(`TOTAL ITEMS: ${lines.length}`, `TOTAL QTY: ${totalQty}   `));
  add(SINGLE);

  // Amounts
  const totalMrp = lines.reduce((s, l) => s + l.mrp * l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const itemDiscount = totalMrp - subtotal;
  add(amountRow("TOTAL MRP AMOUNT", totalMrp));
  add(amountRow("LESS: ITEM DISCOUNT", itemDiscount));
  add(SINGLE);
  add(amountRow("SUBTOTAL", subtotal));
  const coupon = Number(p.discount) || 0;
  if (coupon) {
    const code = order?.couponSnapshot?.code;
    add(amountRow(`LESS: COUPON${code ? ` [${String(code).toUpperCase()}]` : ""}`, coupon));
  }
  const charges = [
    ["ADD: DELIVERY FEE", p.deliveryFee],
    ["ADD: HANDLING FEE", p.platformFee],
    ["ADD: TIP", p.tip],
  ].filter(([, v]) => Number(v));
  if (charges.length) {
    add(SINGLE);
    charges.forEach(([label, value]) => add(amountRow(label, value)));
  }

  // GST: item prices are GST-inclusive. Back the tax out per rate, after
  // spreading the coupon across items proportionally.
  const separateGst = Number(p.gst) || 0;
  const couponShare = subtotal > 0 ? Math.min(coupon, subtotal) / subtotal : 0;
  const byRate = new Map();
  let taxable = 0;
  for (const l of lines) {
    const net = l.amount * (1 - couponShare);
    const tax = l.gstRate > 0 ? net - net / (1 + l.gstRate / 100) : 0;
    taxable += net - tax;
    if (tax) byRate.set(l.gstRate, (byRate.get(l.gstRate) || 0) + tax);
  }
  if (byRate.size && !separateGst) {
    add(SINGLE);
    add(amountRow("TAXABLE VALUE", taxable));
    let gstTotal = 0;
    for (const [rate, tax] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      gstTotal += tax;
      add(amountRow(`CGST @ ${rate / 2}%`, tax / 2));
      add(amountRow(`SGST @ ${rate / 2}%`, tax / 2));
    }
    add(SINGLE);
    add(amountRow("TOTAL GST INCLUDED", gstTotal));
  } else if (separateGst) {
    add(SINGLE);
    add(amountRow("ADD: CGST", separateGst / 2));
    add(amountRow("ADD: SGST", separateGst / 2));
  }
  add(SINGLE);
  add(amountRow("NET AMOUNT TO PAY", p.total ?? subtotal - coupon), true);
  add(DOUBLE);

  // Savings
  const saved = itemDiscount + coupon;
  if (saved > 0) {
    add(center(`*** TOTAL SAVED: Rs. ${fmt2(saved)} ***`), true);
    add(center(`(MRP Savings: ${fmtNum(itemDiscount)} + Coupon: ${fmtNum(coupon)})`));
    add(DOUBLE);
  }

  // Payment
  add(`PAYMENT MODE : ${paymentLabel(order)}`);
  if (order?.paymentStatus) add(`PAYMENT STATUS: ${String(order.paymentStatus).toUpperCase()}`);
  if (Number(p.walletAmount)) add(`WALLET USED  : Rs. ${fmt2(p.walletAmount)}`);
  add(DOUBLE);
  add(center("Thank You! Visit Again!"));
  add(DOUBLE);
  return out;
}

// ---------------------------------------------------------------- PDF

const PAGE_W = 80; // mm, standard thermal roll
const FONT_PT = 7.5; // 48 Courier chars ≈ 76mm
const LINE_H = 3.6; // mm
const MARGIN = 2; // mm

export function buildInvoicePdf(order, settings, { jsPDF }) {
  const rows = buildReceiptLines(order, settings);
  const height = MARGIN * 2 + 4 + rows.length * LINE_H;
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, height] });
  doc.setFontSize(FONT_PT).setTextColor(20);
  rows.forEach((row, i) => {
    doc.setFont("courier", row.bold ? "bold" : "normal");
    doc.text(row.text, MARGIN, MARGIN + 4 + i * LINE_H);
  });
  return { doc, fileName: `Invoice-${getInvoiceNumber(order) || "order"}.pdf` };
}

export async function loadPdfLibs() {
  const { jsPDF } = await import("jspdf");
  return { jsPDF };
}

/**
 * Download the invoice. In the Flutter app WebView, where <a download> blobs
 * are usually ignored, the native share sheet is used instead (save / send).
 */
export async function downloadOrderInvoicePdf(order, settings) {
  const { doc, fileName } = buildInvoicePdf(order, settings, await loadPdfLibs());

  if (typeof window !== "undefined" && window.Flutter && typeof navigator.canShare === "function") {
    const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return;
    }
  }
  doc.save(fileName);
}

/** Open the same PDF in a new tab, where the browser's own print works reliably. */
export async function openOrderInvoicePdf(order, settings) {
  // Open the tab synchronously (inside the click) so popup blockers allow it.
  const tab = window.open("", "_blank");
  const { doc, fileName } = buildInvoicePdf(order, settings, await loadPdfLibs());
  const url = doc.output("bloburl");
  if (tab) {
    tab.location.href = url;
  } else {
    doc.save(fileName);
  }
}
