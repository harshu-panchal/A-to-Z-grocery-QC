/**
 * Add 2 dummy products (2 variants each) to every level-2 category that has
 * no products yet. Product images use the category's own image.
 *
 * Categories without any subcategory get one "General" subcategory
 * (slug suffix `-seed-general`) because Product.subcategoryId is required.
 *
 * Every product SKU starts with `SEED-` so seeded data is easy to find.
 * Safe to re-run: skips existing SKUs and categories that already have products.
 *
 * Usage:
 *   node scripts/seedEmptyCategories.js            # add dummy data
 *   node scripts/seedEmptyCategories.js --remove   # delete everything this script added
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import Seller from "../app/models/seller.js";

dotenv.config();

const SEED_SKU_PREFIX = "SEED-EMPTY-";
const SEED_SUB_SUFFIX = "-seed-general";
const FALLBACK_IMAGE =
  "https://res.cloudinary.com/dv1l9sb4p/image/upload/v1785266807/products/ufnjc6piqqtzywnq0488.jpg";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildVariants(baseSku, basePrice) {
  return ["Standard", "Large"].map((name, index) => {
    const mrp = Math.round(basePrice * (1 + index * 0.5));
    const sellingPrice = Math.max(1, Math.round(mrp * 0.8));
    return {
      name,
      mrp,
      sellingPrice,
      purchaseRate: Math.round(sellingPrice * 0.75),
      stock: 50 + index * 10,
      sku: `${baseSku}-V${index + 1}`,
    };
  });
}

async function pickSeller() {
  // Seller that already owns the most products is the one customers can see
  const [top] = await Product.aggregate([
    { $group: { _id: "$sellerId", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  if (top?._id) {
    const seller = await Seller.findOne({ _id: top._id, isVerified: true, isActive: true })
      .select("_id shopName")
      .lean();
    if (seller) return seller;
  }
  const fallback = await Seller.findOne({ isVerified: true, isActive: true }).select("_id shopName").lean();
  if (!fallback) throw new Error("No verified, active seller found.");
  return fallback;
}

async function removeSeedData() {
  const products = await Product.deleteMany({ sku: { $regex: `^${SEED_SKU_PREFIX}` } });
  const subs = await Category.deleteMany({
    type: "subcategory",
    slug: { $regex: `${SEED_SUB_SUFFIX}$` },
  });
  console.log(`Removed ${products.deletedCount} products and ${subs.deletedCount} "General" subcategories.`);
}

async function seed() {
  const seller = await pickSeller();
  console.log(`Using seller: ${seller.shopName} (${seller._id})`);

  const headers = await Category.find({ type: "header" }).lean();
  const headerById = new Map(headers.map((h) => [String(h._id), h]));
  const categories = await Category.find({ type: "category", status: "active" }).lean();

  let createdProducts = 0;
  let createdSubs = 0;
  let skipped = 0;

  for (const cat of categories) {
    const hasProducts = await Product.exists({ categoryId: cat._id });
    if (hasProducts) continue;

    const header = headerById.get(String(cat.parentId));
    if (!header) {
      console.warn(`  ! ${cat.name}: no header parent, skipping`);
      continue;
    }

    let sub = await Category.findOne({ type: "subcategory", parentId: cat._id, status: "active" }).lean();
    if (!sub) {
      sub = (
        await Category.create({
          name: "General",
          slug: `${slugify(cat.slug || cat.name)}${SEED_SUB_SUFFIX}`,
          type: "subcategory",
          parentId: cat._id,
          image: cat.image || header.image || "",
          status: "active",
        })
      ).toObject();
      createdSubs += 1;
    }

    const image = cat.image || sub.image || header.image || FALLBACK_IMAGE;
    const defs = [
      { name: `${cat.name} Essentials`, basePrice: 299 },
      { name: `${cat.name} Premium`, basePrice: 499 },
    ];

    console.log(`\n${header.name} › ${cat.name} › ${sub.name}`);
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i];
      const sku = `${SEED_SKU_PREFIX}${slugify(cat.slug || cat.name).slice(0, 30)}-${i + 1}`.toUpperCase();
      const slug = `${slugify(def.name)}-${slugify(cat._id.toString()).slice(-6)}-seed`;
      if (await Product.exists({ $or: [{ sku }, { slug }] })) {
        console.log(`  · skip ${def.name}`);
        skipped += 1;
        continue;
      }
      const variants = buildVariants(sku, def.basePrice);
      const primary = variants[0];
      await Product.create({
        name: def.name,
        slug,
        sku,
        description: `${def.name} — sample product for the ${cat.name} category.`,
        mrp: primary.mrp,
        sellingPrice: primary.sellingPrice,
        purchaseRate: primary.purchaseRate,
        stock: variants.reduce((sum, v) => sum + v.stock, 0),
        lowStockAlert: 5,
        brand: "Sample",
        tags: [header.name, cat.name, sub.name, "sample"],
        mainImage: image,
        galleryImages: [],
        headerId: header._id,
        categoryId: cat._id,
        subcategoryId: sub._id,
        sellerId: seller._id,
        status: "active",
        approvalStatus: "approved",
        approvalReviewedAt: new Date(),
        approvalNote: "Seeded dummy product",
        lastSubmittedByRole: "admin",
        variants,
        isFeatured: false,
      });
      console.log(`  ✓ ${def.name}`);
      createdProducts += 1;
    }
  }

  console.log(`\nDone. Products created: ${createdProducts}, "General" subcategories created: ${createdSubs}, skipped: ${skipped}`);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  try {
    if (process.argv.includes("--remove")) await removeSeedData();
    else await seed();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
