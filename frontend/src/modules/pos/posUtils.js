/** Shared POS helpers (money, GST, cart lines, dates, local storage). */

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const rupees = (n) => `₹${round2(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const WALK_IN = "walk-in-customer";

/** GST portion of a GST-inclusive amount (matches the backend). */
export const inclusiveGst = (amount, rate) => {
  const r = Number(rate) || 0;
  return r > 0 ? round2((Number(amount) * r) / (100 + r)) : 0;
};

/** Stable id for a cart line: same product + variant + price type merges. */
export const cartLineId = (row, priceType = "retail") =>
  row.productId ? `${row.productId}::${row.variantSku || ""}::${priceType}` : `custom::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`;

/** Build a cart line from a catalogue row. */
export function lineFromRow(row, { priceType = "retail", quantity = 1 } = {}) {
  const wholesale = priceType === "wholesale" && Number(row.wholesalePrice) > 0;
  return {
    id: cartLineId(row, wholesale ? "wholesale" : "retail"),
    productId: row.productId || null,
    variantSku: row.variantSku || "",
    variantName: row.variantName || "",
    name: row.name,
    image: row.image || "",
    sku: row.sku || "",
    barcode: row.barcode || "",
    hsnCode: row.hsnCode || "",
    gstRate: Number(row.gstRate) || 0,
    mrp: Number(row.mrp) || Number(row.price) || 0,
    retailPrice: Number(row.price) || 0,
    wholesalePrice: Number(row.wholesalePrice) || 0,
    purchaseRate: Number(row.purchaseRate) || 0,
    price: wholesale ? Number(row.wholesalePrice) : Number(row.price) || 0,
    priceType: wholesale ? "wholesale" : "retail",
    quantity,
    stock: row.stock ?? null,
    sellerName: row.sellerName,
  };
}

export const lineTotal = (l) => round2(Number(l.price) * Number(l.quantity) - Number(l.lineDiscount || 0));

/** Bill totals (same rules as the backend: inclusive GST, rounded total). */
export function billTotals(items, billDiscount = 0) {
  const subtotal = round2(items.reduce((s, l) => s + lineTotal(l), 0));
  const discount = Math.min(Math.max(0, round2(billDiscount)), subtotal);
  const afterDiscount = round2(subtotal - discount);
  const total = Math.round(afterDiscount);
  const ratio = subtotal > 0 ? afterDiscount / subtotal : 0;
  const gstTotal = round2(items.reduce((s, l) => s + inclusiveGst(lineTotal(l), l.gstRate), 0) * ratio);
  const mrpTotal = round2(items.reduce((s, l) => s + Number(l.mrp || l.price) * Number(l.quantity), 0));
  const profit = round2(afterDiscount - items.reduce((s, l) => s + Number(l.purchaseRate || 0) * Number(l.quantity), 0));
  return {
    subtotal,
    discount,
    roundOff: round2(total - afterDiscount),
    total,
    gstTotal,
    itemCount: items.reduce((s, l) => s + Number(l.quantity || 0), 0),
    savings: Math.max(0, round2(mrpTotal - afterDiscount)),
    profit,
  };
}

/** API payload line from a cart line. */
export const toApiLine = (l) => ({
  productId: l.productId || undefined,
  variantSku: l.variantSku || undefined,
  name: l.name,
  sku: l.sku,
  barcode: l.barcode,
  quantity: Number(l.quantity),
  price: Number(l.price),
  mrp: Number(l.mrp) || undefined,
  hsnCode: l.hsnCode,
  gstRate: Number(l.gstRate) || 0,
  priceType: l.priceType,
  lineDiscount: Number(l.lineDiscount) || 0,
  warrantyType: l.warrantyType,
  warrantyDuration: l.warrantyDuration,
});

/** Cart lines from a saved bill (edit mode / reprint). */
export const linesFromOrder = (order) =>
  (order.items || []).map((it) => ({
    id: it.product ? `${it.product}::${it.variantSku || ""}::${it.priceType || "retail"}` : `custom::${it._id}`,
    productId: it.product || null,
    variantSku: it.variantSku || "",
    variantName: it.variantName || "",
    name: it.name,
    sku: it.sku || "",
    barcode: it.barcode || "",
    hsnCode: it.hsnCode || "",
    gstRate: Number(it.gstRate) || 0,
    mrp: Number(it.mrp) || 0,
    retailPrice: Number(it.unitPrice) || 0,
    wholesalePrice: 0,
    purchaseRate: Number(it.purchaseRate) || 0,
    price: Number(it.unitPrice) || 0,
    priceType: it.priceType || "retail",
    quantity: Number(it.quantity) || 1,
    lineDiscount: Number(it.lineDiscount) || 0,
    stock: null,
  }));

// ------------------------------------------------------------------ dates
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");
export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

// ---------------------------------------------------------- local storage
export const storageKey = (portal, name) => `${portal}_pos_${name}`;
export function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

/** Bill-setting value helper: settings fields are { text, enabled }. */
export const settingText = (bill, key) => (bill?.[key]?.enabled !== false ? String(bill?.[key]?.text || "").trim() : "");

export const DEFAULT_BARCODE_SETTINGS = {
  width: 50, // mm
  height: 25, // mm
  fontSize: 9,
  barcodeHeight: 30,
  barcodeWidth: 1.4,
  showName: true,
  showPrice: true,
  showMrp: true,
  mrpLabel: "MRP",
  spLabel: "Our Price",
};
