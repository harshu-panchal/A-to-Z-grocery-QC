import Brand from "../models/brand.js";
import mongoose from "mongoose";
import Product from "../models/product.js";

/**
 * Brand list: clean names, one entry per brand, near-duplicate warnings,
 * a first-time import from the brands already typed on products, and the
 * admin's merge / rename (which update every product using the brand).
 */

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { statusCode: status, ...extra });
const checkId = (id) => { if (!mongoose.isValidObjectId(String(id || ""))) throw httpError(400, "Invalid brand"); };
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "  amul  dairy " -> "Amul Dairy" (keeps a name the seller already capitalised) */
export function cleanBrandName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return "";
  return name === name.toLowerCase() ? name.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : name;
}
export const brandKey = (raw) => String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Existing brands that look like `name` (typo, extra word, spacing). */
export function similarBrands(name, brands, limit = 3) {
  const k = brandKey(name).replace(/[^a-z0-9]/g, "");
  if (k.length < 3) return [];
  return brands
    .map((b) => {
      const bk = b.key.replace(/[^a-z0-9]/g, "");
      const close = bk === k || (k.length >= 4 && distance(k, bk) <= (k.length >= 7 ? 2 : 1)) || (bk.length >= 4 && (bk.startsWith(k) || k.startsWith(bk)));
      return close ? b : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Once per server start: add every brand already typed on products that is
 * not in the list yet (most used spelling wins) and tidy those products to
 * that spelling. Brands the admin deleted or merged have no products left,
 * so they don't come back.
 */
let importDone = null;
export function ensureBrandsSeeded() {
  if (!importDone) importDone = importProductBrands().catch((err) => { importDone = null; throw err; });
  return importDone;
}

async function importProductBrands() {
  const rows = await Product.aggregate([
    { $match: { brand: { $type: "string", $ne: "" } } },
    { $group: { _id: "$brand", n: { $sum: 1 } } },
  ]);
  const byKey = new Map();
  for (const r of rows) {
    const key = brandKey(r._id);
    if (!key) continue;
    const g = byKey.get(key) || { spellings: [], n: 0, best: null };
    g.spellings.push(r._id);
    if (!g.best || r.n > g.n) { g.best = r._id; g.n = r.n; }
    byKey.set(key, g);
  }
  if (!byKey.size) return;
  const known = new Map((await Brand.find({ key: { $in: [...byKey.keys()] } }).select("key name").lean()).map((b) => [b.key, b.name]));
  const docs = [...byKey].filter(([key]) => !known.has(key)).map(([key, g]) => ({ key, name: cleanBrandName(g.best), status: "approved" }));
  if (docs.length) await Brand.insertMany(docs, { ordered: false }).catch(() => {}); // a parallel import may have added some
  for (const [key, g] of byKey) {
    const name = known.get(key) || cleanBrandName(g.best);
    const others = g.spellings.filter((s) => s !== name);
    // raw collection: the model would trim "Amul " in the filter and miss it
    if (others.length) await Product.collection.updateMany({ brand: { $in: others } }, { $set: { brand: name } });
  }
}

/** Brands a seller / admin can pick: approved ones, plus this seller's own pending ones. */
export async function listBrandsFor({ role, userId, search = "" }) {
  await ensureBrandsSeeded();
  const filter = role === "admin" ? {} : { $or: [{ status: "approved" }, { status: "pending", "requestedBy.id": userId }] };
  const term = String(search || "").trim();
  if (term) filter.key = { $regex: escapeRegex(brandKey(term)) };
  return Brand.find(filter).sort({ name: 1 }).limit(term ? 50 : 1000).select("name status").lean();
}

/**
 * Add a brand from the product form. Same name (any case/spacing) -> that brand.
 * Looks like an existing one -> 409 with suggestions, unless `force`.
 * Seller -> pending (admin approves); admin -> approved.
 */
export async function createBrand({ name, role, userId, userName, force = false }) {
  await ensureBrandsSeeded();
  const clean = cleanBrandName(name);
  if (!clean) throw httpError(400, "Enter a brand name");
  const key = brandKey(clean);
  const same = await Brand.findOne({ key }).lean();
  if (same) return { brand: same, existed: true };
  if (!force) {
    const all = await Brand.find({ $or: [{ status: "approved" }, { "requestedBy.id": userId }] }).select("name key status").lean();
    const like = similarBrands(clean, all);
    if (like.length) {
      throw httpError(409, `Did you mean ${like.map((b) => b.name).join(" / ")}?`, { suggestions: like.map((b) => ({ _id: b._id, name: b.name, status: b.status })) });
    }
  }
  const brand = await Brand.create({
    name: clean,
    key,
    status: role === "admin" ? "approved" : "pending",
    requestedBy: { role, id: userId, name: userName || "" },
  });
  return { brand: brand.toObject(), existed: false };
}

/**
 * The brand text a product is saved with: an existing brand's exact name,
 * or (from an API call that skipped the picker) a new pending brand.
 */
export async function resolveProductBrand(raw, { role, userId, userName }) {
  const clean = cleanBrandName(raw);
  if (!clean) return "";
  const found = await Brand.findOne({ key: brandKey(clean) }).select("name").lean();
  if (found) return found.name;
  const { brand } = await createBrand({ name: clean, role, userId, userName, force: true });
  return brand.name;
}

// ---------------------------------------------------------------- admin
export async function adminList({ status = "", search = "" } = {}) {
  await ensureBrandsSeeded();
  const filter = {};
  if (["approved", "pending"].includes(status)) filter.status = status;
  if (String(search).trim()) filter.key = { $regex: escapeRegex(brandKey(search)) };
  const brands = await Brand.find(filter).sort({ status: -1, name: 1 }).lean();
  const counts = await Product.aggregate([
    { $match: { brand: { $in: brands.map((b) => b.name) } } },
    { $group: { _id: "$brand", n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [c._id, c.n]));
  return brands.map((b) => ({ ...b, productCount: countOf.get(b.name) || 0 }));
}

export async function adminUpdate(id, { name, status }) {
  checkId(id);
  const brand = await Brand.findById(id);
  if (!brand) throw httpError(404, "Brand not found");
  if (name !== undefined) {
    const clean = cleanBrandName(name);
    if (!clean) throw httpError(400, "Enter a brand name");
    const key = brandKey(clean);
    const clash = await Brand.findOne({ key, _id: { $ne: brand._id } }).lean();
    if (clash) throw httpError(409, `"${clash.name}" already exists. Use Merge instead.`);
    if (clean !== brand.name) await Product.updateMany({ brand: brand.name }, { $set: { brand: clean } });
    brand.name = clean;
    brand.key = key;
  }
  if (status !== undefined) {
    if (!["approved", "pending"].includes(status)) throw httpError(400, "Invalid status");
    brand.status = status;
  }
  await brand.save();
  return brand.toObject();
}

/** Move every product of `fromId` to `intoId`, then remove `fromId`. */
export async function adminMerge(fromId, intoId) {
  checkId(fromId); checkId(intoId);
  if (String(fromId) === String(intoId)) throw httpError(400, "Pick a different brand to merge into");
  const [from, into] = await Promise.all([Brand.findById(fromId), Brand.findById(intoId)]);
  if (!from || !into) throw httpError(404, "Brand not found");
  const res = await Product.updateMany(
    { brand: { $regex: `^\\s*${escapeRegex(from.name)}\\s*$`, $options: "i" } },
    { $set: { brand: into.name } },
  );
  if (into.status !== "approved") into.status = "approved";
  await into.save();
  await from.deleteOne();
  return { into: into.toObject(), productsMoved: res.modifiedCount || 0 };
}

/** Delete a brand; products that used it become "Unbranded". */
export async function adminDelete(id) {
  checkId(id);
  const brand = await Brand.findById(id);
  if (!brand) throw httpError(404, "Brand not found");
  const res = await Product.collection.updateMany(
    { brand: { $regex: `^\\s*${escapeRegex(brand.name)}\\s*$`, $options: "i" } },
    { $set: { brand: "" } },
  );
  await brand.deleteOne();
  return { productsCleared: res.modifiedCount || 0, name: brand.name };
}
