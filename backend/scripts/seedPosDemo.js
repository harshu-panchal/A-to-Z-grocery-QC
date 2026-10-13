/**
 * POS demo data for one seller, created through the real POS API so stock,
 * ledgers, udhaar and reports all line up exactly like real use.
 *
 * Needs the backend running (default http://127.0.0.1:5000).
 *
 *   node scripts/seedPosDemo.js                       # seed for "Harsh's Hub"
 *   node scripts/seedPosDemo.js --seller "Indore store"
 *   node scripts/seedPosDemo.js --remove              # undo: put stock back, delete POS demo data
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

dotenv.config();

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const SELLER_NAME = arg("--seller") || "Harsh's Hub";
const API = (process.env.POS_DEMO_API || `http://127.0.0.1:${process.env.PORT || 5000}/api`).replace(/\/$/, "");
const DAY = 86400000;

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const seller = await db.collection("sellers").findOne({ shopName: SELLER_NAME });
if (!seller) {
  console.error(`Seller "${SELLER_NAME}" not found`);
  process.exit(1);
}

// ------------------------------------------------------------------ remove
if (process.argv.includes("--remove")) {
  const owner = seller._id;
  const rows = await db.collection("stockhistories").aggregate([
    { $match: { seller: owner, source: { $in: ["POS", "PURCHASE", "AUDIT"] } } },
    { $group: { _id: { product: "$product", sku: "$variantSku" }, qty: { $sum: "$quantity" } } },
  ]).toArray();
  for (const r of rows) {
    if (!r.qty) continue;
    const filter = r._id.sku ? { _id: r._id.product, "variants.sku": r._id.sku } : { _id: r._id.product };
    await db.collection("products").updateOne(filter, { $inc: r._id.sku ? { stock: -r.qty, "variants.$.stock": -r.qty } : { stock: -r.qty } });
  }
  const out = { stockRowsReversed: rows.length };
  for (const c of ["posorders", "poscustomers", "poscredittransactions", "possuppliers", "possuppliertransactions", "pospurchaseentries", "posgstregisterentries", "pospaymentintents", "posbatches"]) {
    out[c] = (await db.collection(c).deleteMany({ owner })).deletedCount;
  }
  const key = `seller:${owner}`;
  out.state = (await db.collection("posstates").deleteMany({ ownerKey: key })).deletedCount;
  out.settings = (await db.collection("possettings").deleteMany({ ownerKey: key })).deletedCount;
  out.counters = (await db.collection("poscounters").deleteMany({ key: { $regex: key } })).deletedCount;
  out.ledger = (await db.collection("stockhistories").deleteMany({ seller: owner, source: { $in: ["POS", "PURCHASE", "AUDIT"] } })).deletedCount;
  const demoCodes = await db.collection("products").updateMany({ sellerId: owner, barcode: /^29\d{11}$/ }, { $unset: { barcode: "", rackCode: "" } });
  // a product edited in the form after seeding carries the code on its variant
  const variantCodes = await db.collection("products").updateMany(
    { sellerId: owner, "variants.barcode": /^29\d{11}$/ },
    { $unset: { "variants.$[v].barcode": "", "variants.$[v].rackCode": "" } },
    { arrayFilters: [{ "v.barcode": /^29\d{11}$/ }] },
  );
  out.barcodesCleared = demoCodes.modifiedCount + variantCodes.modifiedCount;
  console.log("POS demo data removed:", out);
  await mongoose.disconnect();
  process.exit(0);
}

// -------------------------------------------------------------------- seed
const token = jwt.sign({ id: seller._id, role: "seller", tokenVersion: seller.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "30m" });
async function call(method, path, body) {
  const res = await fetch(`${API}/seller/pos${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${json.message}`);
  return json.result ?? json.results;
}
const step = (msg) => console.log(`• ${msg}`);
const ean13 = (first12) => first12 + ((10 - (first12.split("").reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);
const pick = (arr, i) => arr[i % arr.length];

try {
  await fetch(`${API}/seller/pos/summary`).catch((e) => { throw new Error(`Backend not reachable at ${API} (${e.cause?.code || e.message}) — start it first`); });

  // 1. barcodes + racks on in-stock products without variants
  const products = await db.collection("products")
    .find({ sellerId: seller._id, status: "active", stock: { $gt: 10 }, $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] })
    .sort({ createdAt: -1 }).limit(16).toArray();
  if (products.length < 6) throw new Error("Seller needs at least 6 in-stock products (run scripts/seedDummyProducts.js first)");
  const racks = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2"];
  for (const [i, p] of products.entries()) {
    const set = { rackCode: pick(racks, i) };
    if (!p.barcode) set.barcode = ean13(`29${String(Date.now()).slice(-6)}${String(i).padStart(4, "0")}`);
    if (!p.gstRate) set.gstRate = pick([0, 5, 12, 18], i);
    if (!p.wholesalePrice) set.wholesalePrice = Math.round((p.sellingPrice || p.mrp) * 0.9);
    await db.collection("products").updateOne({ _id: p._id }, { $set: set });
  }
  step(`${products.length} products got a barcode, rack and GST`);
  const rows = (await call("GET", "/products?limit=100")).filter((r) => products.some((p) => String(p._id) === r.productId));
  const line = (i, quantity = 1) => ({ productId: rows[i % rows.length].productId, variantSku: rows[i % rows.length].variantSku, quantity, price: rows[i % rows.length].price });

  // 2. receipt settings
  await call("PUT", "/settings", {
    bill: {
      shopName: { text: SELLER_NAME, enabled: true },
      address: { text: "South Tukoganj, Indore", enabled: true },
      phone: { text: seller.phone || "9876543210", enabled: true },
      gstin: { text: "23ABCDE1234F1Z5", enabled: true },
      fssai: { text: "11423999000123", enabled: true },
      upiId: { text: "harshhub@upi", enabled: true },
      notes: { text: "Goods once sold will be exchanged within 7 days with bill.", enabled: true },
      footer: { text: "Thank you! Visit again 🙏", enabled: true },
      paperWidth: 80,
      scale: { enabled: true, prefix: "21", pluLength: 5, valueType: "weight" },
    },
  });
  step("Receipt header/footer, UPI QR and scale barcodes set in POS Settings");

  // 3. customers
  const people = [
    ["Ramesh Sharma", "9826011111", "Old Palasia, Indore"],
    ["Sunita Verma", "9826022222", "Vijay Nagar, Indore"],
    ["Amit Jain", "9826033333", "Sapna Sangeeta, Indore"],
    ["Priya Kitchen (Cafe)", "9826044444", "MG Road, Indore"],
    ["Deepak Yadav", "9826055555", "Bhawarkua, Indore"],
    ["Neha Gupta", "9826066666", "Rajwada, Indore"],
  ];
  const customers = [];
  for (const [name, phone, address] of people) {
    try { customers.push(await call("POST", "/customers", { name, phone, address, gstin: name.includes("Cafe") ? "23AAACP1234Q1Z9" : undefined })); }
    catch { customers.push((await call("GET", `/customers?search=${phone}`)).items[0]); }
  }
  step(`${customers.length} customers added`);

  // 4. suppliers
  const supplierDefs = [
    ["Malwa Traders", "9425011111", "23AAFCM1111K1Z2", 4200],
    ["Indore Wholesale Mart", "9425022222", "23AAFCI2222K1Z3", 0],
    ["Shree Ganesh Distributors", "9425033333", "23AAFCS3333K1Z4", 1500],
  ];
  const suppliers = [];
  for (const [name, phone, gstin, openingBalance] of supplierDefs) suppliers.push(await call("POST", "/suppliers", { name, phone, gstin, openingBalance }));
  step(`${suppliers.length} suppliers added (with opening balances)`);

  // 5. purchases with batches (one expiring in 4 days, one in 20, one already expired)
  const d = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const purchases = [
    { s: 0, bill: "MT-2291", paid: 2000, lines: [[0, 12, d(4), "B-0410"], [1, 10, d(20), "B-0411"], [2, 8, null, ""]] },
    { s: 1, bill: "IWM-778", paid: 0, lines: [[3, 6, d(-5), "B-OLD"], [4, 15, d(60), "B-0501"]] },
    { s: 2, bill: "SGD-105", paid: 1000, lines: [[5, 10, d(9), "B-0612"], [0, 4, d(45), "B-0613"]] },
  ];
  for (const p of purchases) {
    const entry = await call("POST", "/purchase-entries", {
      type: "purchase",
      supplierId: suppliers[p.s]._id,
      partyName: suppliers[p.s].name,
      billNo: p.bill,
      paidAmount: p.paid,
      paymentMethod: "Cash",
      data: {
        supplierGstin: suppliers[p.s].gstin,
        lines: p.lines.map(([i, q, expiry, batch]) => {
          const r = rows[i % rows.length];
          return { productId: r.productId, variantSku: r.variantSku, name: r.name, quantity: q, purchasePrice: Math.round(r.price * 0.7), gstRate: r.gstRate || 5, gstMode: "exclusive", mrp: r.mrp, sellingPrice: r.price, barcode: r.barcode, batch, expiry };
        }),
      },
    });
    await call("POST", `/purchase-entries/${entry._id}/complete`);
  }
  await call("POST", "/purchase-entries", { type: "purchase", supplierId: suppliers[1]._id, partyName: suppliers[1].name, billNo: "IWM-801 (draft)", data: { lines: [{ ...rows[6 % rows.length], name: rows[6 % rows.length].name, quantity: 20, purchasePrice: 50, gstRate: 5 }] } });
  await call("POST", `/suppliers/${suppliers[0]._id}/pay`, { amount: 1500, method: "UPI", reference: "UPI-88213", note: "Part payment" });
  step("3 completed purchases (stock in, supplier dues, GST register, expiry batches) + 1 draft + a supplier payment");

  // 6. quotations (one will be converted to a bill)
  const q1 = await call("POST", "/purchase-entries", { type: "quotation", customerId: customers[3]._id, partyName: customers[3].name, data: { lines: [0, 1, 2].map((i) => ({ productId: rows[i].productId, variantSku: rows[i].variantSku, name: rows[i].name, quantity: 5, price: rows[i].wholesalePrice || rows[i].price, gstRate: rows[i].gstRate })) } });
  await call("POST", "/purchase-entries", { type: "quotation", customerId: customers[2]._id, partyName: customers[2].name, data: { lines: [3, 4].map((i) => ({ productId: rows[i].productId, variantSku: rows[i].variantSku, name: rows[i].name, quantity: 2, price: rows[i].price, gstRate: rows[i].gstRate })) } });
  step("2 quotations");

  // 7. bills over the last 7 days
  const plans = [
    { c: null, m: "Cash", items: [[0, 2], [1, 1]] },
    { c: null, m: "UPI", items: [[2, 1]] },
    { c: 0, m: "Credit", items: [[3, 2], [4, 1]] },
    { c: 1, m: "Cash", items: [[5, 3]], discount: 20 },
    { c: null, m: "Card", items: [[1, 2], [6, 1]] },
    { c: 4, m: "Credit", items: [[0, 1], [2, 2]] },
    { c: null, m: "Cash", items: [[7, 1]] },
    { c: 5, m: "UPI", items: [[3, 1], [5, 1]] },
    { c: null, m: "Cash", items: [[8, 2]] },
    { c: 0, m: "Credit", items: [[9, 1]] },
    { c: 2, m: "Cash", items: [[4, 2], [10, 1]] },
    { c: null, m: "UPI", items: [[11, 1], [0, 1]] },
    { c: null, m: "Cash", items: [[1, 1]], custom: true },
    { c: 1, m: "Card", items: [[12, 2]] },
  ];
  const bills = [];
  for (const [n, p] of plans.entries()) {
    const items = p.items.map(([i, q]) => line(i, q));
    if (p.custom) items.push({ name: "Carry bag", quantity: 1, price: 5 });
    const total = items.reduce((s, it) => s + it.price * it.quantity, 0) - (p.discount || 0);
    try {
      bills.push(await call("POST", "/orders", {
        customerId: p.c === null ? "walk-in-customer" : customers[p.c]._id,
        paymentMethod: p.m,
        items,
        billDiscount: p.discount || 0,
        amountReceived: p.m === "Cash" ? Math.ceil(total / 100) * 100 : undefined,
      }));
    } catch (err) {
      console.warn(`  skipped bill ${n + 1}: ${err.message}`);
    }
  }
  // the converted quotation
  bills.push(await call("POST", "/orders", { customerId: customers[3]._id, paymentMethod: "Credit", items: (await call("GET", `/purchase-entries/${q1._id}`)).data.lines.map((l) => ({ productId: l.productId, variantSku: l.variantSku, quantity: l.quantity, price: l.price })), quotationId: q1._id }));
  // spread bills across the last 7 days (newest stays today)
  for (const [i, b] of bills.entries()) {
    const daysAgo = Math.max(0, 6 - Math.floor((i * 7) / bills.length));
    const at = new Date(Date.now() - daysAgo * DAY - (i % 5) * 3600e3);
    await db.collection("posorders").updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { createdAt: at } });
  }
  step(`${bills.length} bills (cash, UPI, card, udhaar, discount, custom item, one from a quotation) spread over 7 days`);

  // 8. an edited bill and a cancelled bill
  const editable = bills.find((b) => b.paymentMethod === "Cash" && b.items.length);
  if (editable) await call("PATCH", `/orders/${editable._id}/items`, { items: editable.items.filter((it) => it.product).map((it) => ({ productId: it.product, variantSku: it.variantSku, quantity: it.quantity + 1, price: it.unitPrice })) });
  const toCancel = bills.find((b) => b.paymentMethod === "UPI");
  if (toCancel) await call("DELETE", `/orders/${toCancel._id}?restoreStock=true&reason=Customer changed mind`);
  step("1 bill edited, 1 bill cancelled (stock put back)");

  // 9. udhaar payments / advance / old due
  await call("POST", "/credit/payment", { customerId: customers[0]._id, amount: 300, method: "Cash", note: "Part payment" });
  await call("POST", "/credit/payment", { customerId: customers[4]._id, amount: 200, method: "UPI", reference: "UPI-55120" });
  await call("POST", "/credit/add", { customerId: customers[5]._id, amount: 450, kind: "due", note: "Old khata balance" });
  await call("POST", "/credit/add", { customerId: customers[1]._id, amount: 500, kind: "advance", method: "Cash", note: "Advance for monthly ration" });
  step("Udhaar payments, an old due and an advance recorded");

  // 10. exchange, stock count, manual GST entry
  await call("POST", "/exchange", { returnItems: [line(1, 1)], newItems: [line(2, 1)], note: "Size change" });
  const countRow = (await call("GET", `/products?barcode=${rows[7 % rows.length].barcode}`))[0];
  if (countRow) await call("POST", "/stock-count", { lines: [{ productId: countRow.productId, variantSku: countRow.variantSku, counted: Math.max(0, countRow.stock - 2) }], note: "Monthly shelf count: 2 damaged" });
  await call("POST", "/gst-register", { date: d(-3), invoiceNo: "ELEC-3321", partyName: "MPEB (electricity)", gstin: "", taxableValue: 2000, cgst: 180, sgst: 180 });
  step("1 exchange, 1 stock count correction, 1 manual GST register entry");

  const summary = await call("GET", "/summary");
  console.log(`\nDone. Today ₹${summary.today.sales} (${summary.today.bills} bills) · this month ₹${summary.month.sales} · udhaar due ₹${summary.creditDue.total}`);
  console.log(`Try scanning these barcodes in POS: ${rows.slice(0, 3).map((r) => `${r.barcode} (${r.name})`).join(", ")}`);
  console.log("Remove everything later with: node scripts/seedPosDemo.js --remove");
} catch (err) {
  console.error("Demo seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
