/**
 * Seed ~50 in-stock dummy products across existing categories, owned by one seller,
 * so the customer home shelves / offer sections have data to show.
 * Every product is tagged "dummy-seed" (SKU prefix DUMMY-) so they can be removed in one go.
 *
 * Usage:
 *   node scripts/seedDummyProducts.js                    # add (skips ones that already exist)
 *   node scripts/seedDummyProducts.js --seller "Indore store"
 *   node scripts/seedDummyProducts.js --remove           # delete every dummy product
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import Seller from "../app/models/seller.js";
import { buildKey, invalidate } from "../app/services/cacheService.js";

dotenv.config();

const TAG = "dummy-seed";
const PLACEHOLDER_IMAGE =
  "https://res.cloudinary.com/dv1l9sb4p/image/upload/v1785266807/products/ufnjc6piqqtzywnq0488.jpg";

// category name (as in the DB) -> [name, brand, weight, mrp, sellingPrice]
const PRODUCTS = {
  "Fruits & Vegetables": [
    ["Fresh Banana Robusta", "FarmFresh", "1 dozen", 70, 55],
    ["Shimla Apple", "FarmFresh", "1 kg", 220, 179],
    ["Desi Tomato", "FarmFresh", "1 kg", 50, 39],
    ["Onion", "FarmFresh", "1 kg", 45, 35],
    ["Potato", "FarmFresh", "1 kg", 40, 32],
    ["Green Capsicum", "FarmFresh", "500 g", 60, 48],
  ],
  "Dairy & Breads": [
    ["Toned Milk", "Amul", "1 L", 68, 66],
    ["Fresh Paneer", "Amul", "200 g", 95, 85],
    ["Brown Bread", "Britannia", "400 g", 55, 50],
    ["Salted Butter", "Amul", "100 g", 60, 58],
    ["Farm Eggs", "EggsFresh", "6 pcs", 60, 54],
  ],
  "Aata, Dal & Rice": [
    ["Chakki Fresh Atta", "Aashirvaad", "5 kg", 295, 259],
    ["Basmati Rice Classic", "India Gate", "1 kg", 180, 149],
    ["Toor Dal", "Tata Sampann", "1 kg", 199, 172],
    ["Moong Dal", "Tata Sampann", "500 g", 99, 89],
    ["Sona Masoori Rice", "Daawat", "5 kg", 450, 389],
  ],
  "Masala & Spices": [
    ["Turmeric Powder", "Everest", "200 g", 70, 62],
    ["Red Chilli Powder", "MDH", "200 g", 95, 84],
    ["Garam Masala", "Everest", "100 g", 82, 74],
    ["Jeera Whole", "Catch", "200 g", 140, 119],
  ],
  "Kids Food": [
    ["Choco Fills Cereal", "Kellogg's", "250 g", 160, 139],
    ["Fruit Puree Pouch", "Little Joy", "100 g", 60, 55],
    ["Cerelac Wheat Apple", "Nestle", "300 g", 275, 259],
  ],
  Toys: [
    ["Building Blocks Set", "BrickFun", "60 pcs", 799, 549],
    ["Remote Control Car", "SpeedKid", "1 unit", 1299, 899],
  ],
  "Kids Essentials": [
    ["Baby Wipes", "Mamy Soft", "72 pcs", 199, 149],
    ["Kids Toothpaste Strawberry", "Colgate", "80 g", 85, 78],
  ],
  "Coolers & Fans": [
    ["Personal Air Cooler", "Bajaj", "20 L", 7499, 5999],
    ["High Speed Table Fan", "Usha", "400 mm", 2499, 1899],
  ],
  "TV & Mobiles": [
    ["Smart LED TV 32 inch", "Mi", "1 unit", 18999, 13999],
    ["Fast Charging Cable Type-C", "boAt", "1 m", 499, 249],
  ],
  "Cleaning Gadgets": [
    ["Spin Mop Bucket", "Gala", "1 set", 1499, 999],
    ["Handheld Vacuum Cleaner", "Agaro", "1 unit", 2999, 2199],
  ],
  "Wipe & Dry Essentials": [
    ["Kitchen Towel Roll", "Origami", "2 rolls", 160, 135],
    ["Microfibre Cleaning Cloth", "Scotch-Brite", "3 pcs", 249, 199],
  ],
  "Iron & More": [["Dry Iron 1000W", "Philips", "1 unit", 1095, 849]],
  Cookware: [
    ["Non-Stick Tawa", "Prestige", "28 cm", 1250, 899],
    ["Pressure Cooker", "Hawkins", "3 L", 2100, 1799],
    ["Stainless Steel Kadai", "Vinod", "2.5 L", 1450, 1099],
  ],
  "Dog Food": [
    ["Adult Dog Food Chicken", "Pedigree", "1.2 kg", 450, 399],
    ["Puppy Dog Food Milk", "Drools", "1 kg", 380, 335],
  ],
  "Cat Food": [
    ["Adult Cat Food Tuna", "Whiskas", "1.2 kg", 520, 465],
    ["Kitten Wet Food Pouch", "Me-O", "80 g", 55, 49],
  ],
  "Pet Grooming": [["Pet Shampoo Anti-Tick", "Himalaya", "200 ml", 245, 219]],
  "Pet Toys": [["Rubber Chew Bone", "PetPlay", "1 unit", 299, 199]],
  "Mosturiser & Creams": [
    ["Soft Light Moisturising Cream", "Nivea", "100 ml", 299, 249],
    ["Aloe Vera Gel", "Mamaearth", "150 ml", 349, 279],
    ["Daily Face Moisturiser SPF 30", "Ponds", "50 g", 225, 199],
  ],
  Cricket: [
    ["Kashmir Willow Cricket Bat", "SG", "Size 6", 1999, 1499],
    ["Leather Cricket Ball", "SS", "1 unit", 499, 399],
  ],
  Fitness: [
    ["Yoga Mat 6mm", "Boldfit", "1 unit", 999, 599],
    ["Adjustable Dumbbells", "Kore", "2 x 5 kg", 2499, 1799],
  ],
  Swimming: [["Anti-Fog Swimming Goggles", "Speedo", "1 unit", 899, 699]],
  Basketball: [["Basketball Size 7", "Nivia", "1 unit", 1199, 849]],
};

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const clearCaches = async () => {
  await invalidate(buildKey("catalog", "productList", "*")).catch(() => {});
  await invalidate("cache:offersections:public:*").catch(() => {});
};

async function remove() {
  const { deletedCount } = await Product.deleteMany({ tags: TAG });
  await clearCaches();
  console.log(`Removed ${deletedCount} dummy products.`);
}

async function seed() {
  const sellerName = argValue("--seller") || "Harsh's Hub";
  const seller = await Seller.findOne({ shopName: sellerName, isActive: true });
  if (!seller) throw new Error(`Active seller "${sellerName}" not found`);

  const categories = await Category.find({ type: { $in: ["category", "subcategory"] } }).lean();
  let created = 0;
  let skipped = 0;

  for (const [categoryName, items] of Object.entries(PRODUCTS)) {
    const category = categories.find((c) => c.type === "category" && c.name === categoryName);
    const sub = category && categories.find((c) => c.type === "subcategory" && String(c.parentId) === String(category._id));
    if (!category || !sub || !category.parentId) {
      console.warn(`! Skipping "${categoryName}": category, subcategory or header missing`);
      continue;
    }
    // reuse a real image from this category when there is one
    const sample = await Product.findOne({ categoryId: category._id, mainImage: { $nin: [null, ""] } }, { mainImage: 1 }).lean();

    for (const [name, brand, weight, mrp, sellingPrice] of items) {
      const slug = `${slugify(name)}-dummy`;
      if (await Product.exists({ slug })) {
        skipped += 1;
        continue;
      }
      await Product.create({
        name,
        slug,
        sku: `DUMMY-${slugify(name).toUpperCase()}`.slice(0, 40),
        description: `${brand} ${name} (${weight}). Dummy product for testing.`,
        mrp,
        sellingPrice,
        purchaseRate: Math.round(sellingPrice * 0.8),
        stock: 20 + Math.floor(Math.random() * 130),
        brand,
        weight,
        tags: [TAG],
        mainImage: sample?.mainImage || PLACEHOLDER_IMAGE,
        headerId: category.parentId,
        categoryId: category._id,
        subcategoryId: sub._id,
        sellerId: seller._id,
        status: "active",
        approvalStatus: "approved",
        lastSubmittedByRole: "admin",
      });
      created += 1;
    }
  }

  await clearCaches();
  console.log(`Seller: ${seller.shopName}. Created ${created}, skipped ${skipped} existing.`);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  await (process.argv.includes("--remove") ? remove() : seed());
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  process.exit();
}
