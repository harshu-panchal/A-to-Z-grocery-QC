/**
 * POS (in-store billing) models, shared by the Admin and Seller POS.
 *
 * Ownership: every POS record has `owner` = the seller's id for the Seller
 * POS, or null for the Admin POS. Customers, suppliers, drafts and settings
 * of one owner are never visible to another.
 *
 * POS sales are kept in their own `PosOrder` collection instead of the
 * online `Order` model: online orders drive delivery, rider payouts, seller
 * settlement and commission, none of which apply to a counter sale.
 */
import mongoose from "mongoose";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const owner = { type: ObjectId, ref: "Seller", default: null, index: true };
const money = { type: Number, default: 0 };

// ---------------------------------------------------------------- counters
const posCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});
export const PosCounter = mongoose.model("PosCounter", posCounterSchema);

/** Next running number for a key, e.g. invoice numbers per owner. */
export async function nextPosNumber(key, session) {
  const doc = await PosCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return doc.seq;
}

// --------------------------------------------------------------- customers
const posCustomerSchema = new Schema(
  {
    owner,
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    notes: { type: String, trim: true },
    // Positive = customer owes us (due), negative = advance paid
    creditBalance: money,
    creditLimit: { type: Number, default: 0 },
  },
  { timestamps: true },
);
posCustomerSchema.index(
  { owner: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } },
);
posCustomerSchema.index({ owner: 1, name: 1 });
export const PosCustomer = mongoose.model("PosCustomer", posCustomerSchema);

// ------------------------------------------------------------------ orders
const posOrderItemSchema = new Schema(
  {
    product: { type: ObjectId, ref: "Product", default: null }, // null = custom/quick item
    seller: { type: ObjectId, ref: "Seller", default: null }, // whose stock was used
    variantSku: { type: String, trim: true, default: "" },
    variantName: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    hsnCode: { type: String, trim: true },
    gstRate: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 0.001 },
    mrp: money,
    unitPrice: { type: Number, required: true, min: 0 }, // GST inclusive
    purchaseRate: money,
    priceType: { type: String, enum: ["retail", "wholesale", "custom"], default: "retail" },
    lineDiscount: money,
    total: money, // unitPrice * qty - lineDiscount
    gstAmount: money, // GST portion inside `total`
    warrantyType: { type: String, trim: true },
    warrantyDuration: { type: String, trim: true },
    stockDeducted: { type: Boolean, default: false },
  },
  { _id: true },
);

const posOrderSchema = new Schema(
  {
    owner,
    channel: { type: String, enum: ["admin", "seller"], required: true, index: true },
    invoiceNumber: { type: String, required: true },
    createdBy: { type: ObjectId, required: true },
    createdByName: { type: String, trim: true, default: "" }, // staff who made the bill (blank = the owner)
    customer: { type: ObjectId, ref: "PosCustomer", default: null },
    customerSnapshot: {
      name: { type: String, default: "Walk-in Customer" },
      phone: String,
      gstin: String,
      address: String,
    },
    items: [posOrderItemSchema],
    itemCount: { type: Number, default: 0 },
    subtotal: money, // sum of line totals (GST inclusive)
    billDiscount: money,
    roundOff: money,
    gstTotal: money,
    total: money, // payable
    paymentMethod: { type: String, enum: ["Cash", "Credit", "Online", "UPI", "Card"], required: true },
    paymentStatus: { type: String, enum: ["Paid", "Pending", "Failed", "Refunded"], default: "Paid", index: true },
    amountReceived: money,
    changeReturned: money,
    status: {
      type: String,
      enum: ["completed", "pending_payment", "cancelled"],
      default: "completed",
      index: true,
    },
    notes: { type: String, trim: true },
    quotation: { type: ObjectId, ref: "PosPurchaseEntry", default: null },
    phonepe: {
      merchantOrderId: String,
      transactionId: String,
      state: String,
    },
    editCount: { type: Number, default: 0 },
    // Offline billing: id made on the device so a re-sent bill isn't saved twice
    clientRef: { type: String, trim: true },
    billedOffline: { type: Boolean, default: false },
    billedAt: Date, // device time for offline bills (createdAt = upload time)
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true },
);
posOrderSchema.index({ owner: 1, channel: 1, createdAt: -1 });
posOrderSchema.index({ owner: 1, invoiceNumber: 1 }, { unique: true });
posOrderSchema.index({ customer: 1, createdAt: -1 });
posOrderSchema.index({ "phonepe.merchantOrderId": 1 }, { sparse: true });
posOrderSchema.index(
  { owner: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } },
);
export const PosOrder = mongoose.model("PosOrder", posOrderSchema);

// ------------------------------------------------------ credit (udhaar)
const posCreditTransactionSchema = new Schema(
  {
    owner,
    customer: { type: ObjectId, ref: "PosCustomer", required: true, index: true },
    // sale: credit bill (+), payment: customer paid (-), add: manual due (+),
    // advance: advance received (-), adjust: correction (+/-), reversal: cancelled bill (-)
    type: { type: String, enum: ["sale", "payment", "add", "advance", "adjust", "reversal"], required: true },
    amount: { type: Number, required: true }, // signed effect on creditBalance
    balanceAfter: money,
    method: { type: String, trim: true }, // Cash / Online / UPI ...
    order: { type: ObjectId, ref: "PosOrder", default: null },
    reference: { type: String, trim: true },
    note: { type: String, trim: true },
    createdBy: { type: ObjectId },
  },
  { timestamps: true },
);
posCreditTransactionSchema.index({ customer: 1, createdAt: -1 });
export const PosCreditTransaction = mongoose.model("PosCreditTransaction", posCreditTransactionSchema);

// --------------------------------------------------------------- suppliers
const supplierSchema = new Schema(
  {
    owner,
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    notes: { type: String, trim: true },
    // Positive = we owe the supplier, negative = advance paid to supplier
    balance: money,
  },
  { timestamps: true },
);
supplierSchema.index({ owner: 1, name: 1 });
export const PosSupplier = mongoose.model("PosSupplier", supplierSchema);

const supplierTransactionSchema = new Schema(
  {
    owner,
    supplier: { type: ObjectId, ref: "PosSupplier", required: true, index: true },
    type: { type: String, enum: ["purchase", "debt", "payment", "adjust"], required: true },
    amount: { type: Number, required: true }, // signed effect on balance
    balanceAfter: money,
    method: { type: String, trim: true },
    reference: { type: String, trim: true },
    note: { type: String, trim: true },
    purchaseEntry: { type: ObjectId, ref: "PosPurchaseEntry", default: null },
    date: { type: Date, default: Date.now },
    createdBy: { type: ObjectId },
    // a manual row entered by mistake is undone by an opposite "adjust" row
    reversedBy: { type: ObjectId, ref: "PosSupplierTransaction", default: null },
    reverses: { type: ObjectId, ref: "PosSupplierTransaction", default: null },
  },
  { timestamps: true },
);
supplierTransactionSchema.index({ supplier: 1, date: -1 });
export const PosSupplierTransaction = mongoose.model("PosSupplierTransaction", supplierTransactionSchema);

// ---------------------------------------------- purchase / quotation drafts
const posPurchaseEntrySchema = new Schema(
  {
    owner,
    type: { type: String, enum: ["purchase", "quotation"], required: true, index: true },
    number: { type: String, required: true },
    status: { type: String, enum: ["draft", "completed", "converted"], default: "draft", index: true },
    supplier: { type: ObjectId, ref: "PosSupplier", default: null },
    customer: { type: ObjectId, ref: "PosCustomer", default: null },
    partyName: { type: String, trim: true },
    billNo: { type: String, trim: true }, // supplier's invoice number
    date: { type: Date, default: Date.now },
    total: money,
    taxableTotal: money,
    gstTotal: money,
    paidAmount: money,
    paymentMethod: { type: String, trim: true },
    // Full editor payload (lines, toggles...) kept as-is
    data: { type: Schema.Types.Mixed, default: {} },
    completedAt: Date,
    convertedOrder: { type: ObjectId, ref: "PosOrder", default: null },
    createdBy: { type: ObjectId },
  },
  { timestamps: true, minimize: false },
);
posPurchaseEntrySchema.index({ owner: 1, type: 1, createdAt: -1 });
export const PosPurchaseEntry = mongoose.model("PosPurchaseEntry", posPurchaseEntrySchema);

// -------------------------------------------------- purchase GST register
const gstRegisterEntrySchema = new Schema(
  {
    owner,
    date: { type: Date, required: true },
    invoiceNo: { type: String, trim: true },
    partyName: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    taxableValue: money,
    cgst: money,
    sgst: money,
    igst: money,
    total: money,
    purchaseEntry: { type: ObjectId, ref: "PosPurchaseEntry", default: null },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
gstRegisterEntrySchema.index({ owner: 1, date: -1 });
export const PosGstRegisterEntry = mongoose.model("PosGstRegisterEntry", gstRegisterEntrySchema);

// ------------------------------------- terminal state + per-owner settings
const posStateSchema = new Schema(
  {
    ownerKey: { type: String, required: true, unique: true }, // "admin" | "seller:<id>"
    bills: { type: Schema.Types.Mixed, default: [] },
    activeBillId: String,
  },
  { timestamps: true, minimize: false },
);
export const PosState = mongoose.model("PosState", posStateSchema);

const posSettingsSchema = new Schema(
  {
    ownerKey: { type: String, required: true, unique: true },
    // Receipt header/footer: { shopName, address, phone, gstin, fssai, notes, terms, upiId, footer } each { text, enabled }
    bill: { type: Schema.Types.Mixed, default: {} },
    // Barcode label: { width, height, fontSize, barcodeHeight, barcodeWidth, showPrice, showName, mrpLabel, spLabel }
    barcode: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);
export const PosSettings = mongoose.model("PosSettings", posSettingsSchema);

// ------------------------------------------------- stock batches (expiry)
/**
 * One row per batch received through a purchase entry. Remaining quantity
 * per batch is derived at read time (current stock is assumed to be the most
 * recently received units; older batches sell first), so sales never need
 * to touch this collection.
 */
const posBatchSchema = new Schema(
  {
    seller: { type: ObjectId, ref: "Seller", required: true, index: true },
    product: { type: ObjectId, ref: "Product", required: true },
    variantSku: { type: String, trim: true, default: "" },
    batchNo: { type: String, trim: true },
    expiry: { type: Date, default: null },
    mfgDate: { type: Date, default: null },
    quantity: { type: Number, required: true },
    receivedAt: { type: Date, default: Date.now },
    purchaseEntry: { type: ObjectId, ref: "PosPurchaseEntry", default: null },
    owner,
  },
  { timestamps: true },
);
posBatchSchema.index({ product: 1, variantSku: 1, receivedAt: -1 });
posBatchSchema.index({ seller: 1, expiry: 1 });
export const PosBatch = mongoose.model("PosBatch", posBatchSchema);

// -------------------------------------------------- PhonePe payment intents
const posPaymentIntentSchema = new Schema(
  {
    owner,
    kind: { type: String, enum: ["sale", "credit"], required: true },
    merchantOrderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true }, // rupees
    posOrder: { type: ObjectId, ref: "PosOrder", default: null },
    customer: { type: ObjectId, ref: "PosCustomer", default: null },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    transactionId: String,
    createdBy: { type: ObjectId },
  },
  { timestamps: true },
);
export const PosPaymentIntent = mongoose.model("PosPaymentIntent", posPaymentIntentSchema);
