/**
 * Repair product stock data so it matches the rules enforced on save:
 *   - every variant stock is a whole number >= 0 (decimals rounded down, null -> 0)
 *   - for products with variants, master `stock` = sum of variant stocks
 *   - products without variants: master stock rounded down, never negative
 *
 * Usage (from backend/):
 *   node scripts/fixStockConsistency.js            # dry run: prints what would change
 *   node scripts/fixStockConsistency.js --apply    # writes changes (backup JSON saved first)
 */
import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const products = mongoose.connection.db.collection("products");

  const all = await products.find({}).project({ name: 1, stock: 1, variants: 1 }).toArray();
  const changes = [];

  for (const p of all) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const set = {};
    if (variants.length) {
      let total = 0;
      variants.forEach((v, i) => {
        const fixed = whole(v?.stock);
        total += fixed;
        if (v?.stock !== fixed) set[`variants.${i}.stock`] = fixed;
      });
      if (p.stock !== total) set.stock = total;
    } else if (p.stock !== whole(p.stock)) {
      set.stock = whole(p.stock);
    }
    if (Object.keys(set).length) {
      changes.push({
        _id: p._id,
        name: p.name,
        before: { stock: p.stock, variants: variants.map((v) => v?.stock) },
        set,
      });
    }
  }

  changes.forEach((c) =>
    console.log(`${c.name}: stock ${c.before.stock} -> ${c.set.stock ?? c.before.stock}` +
      (c.before.variants.length ? ` | variants ${c.before.variants.join("/")}` : "")),
  );
  console.log(`\n${changes.length} product(s) ${APPLY ? "to update" : "would change (dry run)"}`);

  if (APPLY && changes.length) {
    const backup = `stock-fix-backup-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify(changes.map(({ _id, name, before }) => ({ _id: String(_id), name, before })), null, 2));
    console.log(`Backup of previous values: ${backup}`);
    for (const c of changes) await products.updateOne({ _id: c._id }, { $set: c.set });
    console.log("Applied.");
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Failed:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
