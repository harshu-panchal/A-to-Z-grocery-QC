/**
 * Seed 2 products (each with ≥2 variants) under every subcategory.
 * Safe to re-run: skips existing product slugs / SKUs.
 *
 * Usage: node scripts/seedProducts.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import Seller from "../app/models/seller.js";

dotenv.config();

const PLACEHOLDER_MAIN =
  "https://res.cloudinary.com/dv1l9sb4p/image/upload/v1785266807/products/ufnjc6piqqtzywnq0488.jpg";
const PLACEHOLDER_GALLERY = [
  "https://res.cloudinary.com/dv1l9sb4p/image/upload/v1785266809/products/ixhfizpfgez9i9ylweuj.jpg",
  "https://res.cloudinary.com/dv1l9sb4p/image/upload/v1785266809/products/xdg4ucr5jgor5ma3xh5f.jpg",
];

/** Optional curated product pairs keyed by subcategory slug. */
const PRODUCTS_BY_SUB_SLUG = {
  "electronics-smartphones": [
    { name: "Nova X Smartphone", brand: "Nova", basePrice: 14999, variants: ["64GB", "128GB"] },
    { name: "Pulse Pro Phone", brand: "Pulse", basePrice: 18999, variants: ["128GB", "256GB"] },
  ],
  "electronics-tablets": [
    { name: "TabGo Lite", brand: "TabGo", basePrice: 9999, variants: ["32GB", "64GB"] },
    { name: "TabGo Air", brand: "TabGo", basePrice: 14999, variants: ["64GB", "128GB"] },
  ],
  "electronics-mobile-accessories": [
    { name: "FastCharge Power Bank", brand: "ChargeMax", basePrice: 999, variants: ["10000mAh", "20000mAh"] },
    { name: "Shield Phone Case", brand: "Shield", basePrice: 299, variants: ["Clear", "Matte Black"] },
  ],
  "electronics-laptops": [
    { name: "WorkBook 14", brand: "WorkBook", basePrice: 42999, variants: ["8GB/256GB", "16GB/512GB"] },
    { name: "GameBook 15", brand: "GameBook", basePrice: 62999, variants: ["16GB/512GB", "32GB/1TB"] },
  ],
  "electronics-desktops-monitors": [
    { name: "ViewMax 24 Monitor", brand: "ViewMax", basePrice: 8999, variants: ["24 inch", "27 inch"] },
    { name: "HomePC Tower", brand: "HomePC", basePrice: 34999, variants: ["i5/8GB", "i7/16GB"] },
  ],
  "electronics-computer-accessories": [
    { name: "TypeFast Keyboard", brand: "TypeFast", basePrice: 799, variants: ["Wired", "Wireless"] },
    { name: "Swift Mouse", brand: "Swift", basePrice: 499, variants: ["Black", "White"] },
  ],
  "electronics-headphones-earbuds": [
    { name: "SoundBuds Air", brand: "SoundBuds", basePrice: 1499, variants: ["White", "Black"] },
    { name: "BassOne Over-Ear", brand: "BassOne", basePrice: 2499, variants: ["Standard", "ANC"] },
  ],
  "electronics-speakers": [
    { name: "BoomBox Mini", brand: "BoomBox", basePrice: 1299, variants: ["Blue", "Black"] },
    { name: "HomeBeat Speaker", brand: "HomeBeat", basePrice: 2999, variants: ["10W", "20W"] },
  ],
  "electronics-smartwatches-bands": [
    { name: "FitBand Pulse", brand: "FitBand", basePrice: 1999, variants: ["Black", "Blue"] },
    { name: "Watchly Smart", brand: "Watchly", basePrice: 3499, variants: ["42mm", "46mm"] },
  ],
  "electronics-kitchen-appliances": [
    { name: "MixMaster Blender", brand: "MixMaster", basePrice: 2499, variants: ["500W", "750W"] },
    { name: "QuickCook Kettle", brand: "QuickCook", basePrice: 999, variants: ["1.2L", "1.8L"] },
  ],
  "electronics-cooling-heating": [
    { name: "BreezeFan Pedestal", brand: "BreezeFan", basePrice: 1899, variants: ["16 inch", "18 inch"] },
    { name: "WarmAir Room Heater", brand: "WarmAir", basePrice: 2299, variants: ["1000W", "2000W"] },
  ],
  "electronics-cleaning-appliances": [
    { name: "CleanVac Handheld", brand: "CleanVac", basePrice: 1799, variants: ["Cordless", "Corded"] },
    { name: "SteamIron Pro", brand: "SteamIron", basePrice: 1299, variants: ["Standard", "Ceramic"] },
  ],

  "fasion-men-tshirts": [
    { name: "Everyday Tee", brand: "UrbanWear", basePrice: 499, variants: ["M", "L"] },
    { name: "Graphic Print Tee", brand: "UrbanWear", basePrice: 699, variants: ["M", "XL"] },
  ],
  "fasion-men-shirts": [
    { name: "Formal Oxford Shirt", brand: "FormalCo", basePrice: 999, variants: ["M", "L"] },
    { name: "Casual Linen Shirt", brand: "FormalCo", basePrice: 1199, variants: ["M", "XL"] },
  ],
  "fasion-men-bottomwear": [
    { name: "Classic Denim Jeans", brand: "DenimLab", basePrice: 1299, variants: ["32", "34"] },
    { name: "Chino Trousers", brand: "DenimLab", basePrice: 1099, variants: ["32", "36"] },
  ],
  "fasion-women-tops-kurtis": [
    { name: "Cotton Kurti", brand: "StyleHer", basePrice: 799, variants: ["M", "L"] },
    { name: "Printed Top", brand: "StyleHer", basePrice: 599, variants: ["S", "M"] },
  ],
  "fasion-women-ethnic-wear": [
    { name: "Festive Salwar Set", brand: "EthnicAura", basePrice: 1499, variants: ["M", "L"] },
    { name: "Daily Wear Saree", brand: "EthnicAura", basePrice: 1299, variants: ["Free Size", "With Blouse"] },
  ],
  "fasion-women-western-wear": [
    { name: "A-Line Dress", brand: "WestEnd", basePrice: 1199, variants: ["S", "M"] },
    { name: "Women Slim Jeans", brand: "WestEnd", basePrice: 1099, variants: ["28", "30"] },
  ],
  "fasion-men-footwear": [
    { name: "Casual Sneakers Men", brand: "StepUp", basePrice: 1499, variants: ["8", "9"] },
    { name: "Formal Loafers", brand: "StepUp", basePrice: 1799, variants: ["8", "10"] },
  ],
  "fasion-women-footwear": [
    { name: "Everyday Flats", brand: "StepHer", basePrice: 799, variants: ["6", "7"] },
    { name: "Block Heel Sandals", brand: "StepHer", basePrice: 999, variants: ["6", "8"] },
  ],
  "fasion-sports-shoes": [
    { name: "RunFast Trainer", brand: "RunFast", basePrice: 1999, variants: ["8", "9"] },
    { name: "CourtPro Sports Shoe", brand: "CourtPro", basePrice: 2499, variants: ["8", "10"] },
  ],
  "fasion-bags-wallets": [
    { name: "Daily Backpack", brand: "CarryAll", basePrice: 999, variants: ["Black", "Grey"] },
    { name: "Leather Wallet", brand: "CarryAll", basePrice: 699, variants: ["Brown", "Black"] },
  ],
  "fasion-watches-jewellery": [
    { name: "Analog Wrist Watch", brand: "TimeCraft", basePrice: 1299, variants: ["Silver", "Black"] },
    { name: "Minimal Pendant Set", brand: "ShineOn", basePrice: 899, variants: ["Gold Tone", "Silver Tone"] },
  ],
  "fasion-belts-sunglasses": [
    { name: "Classic Leather Belt", brand: "BeltCo", basePrice: 499, variants: ["32", "34"] },
    { name: "UV Guard Sunglasses", brand: "ShadeOn", basePrice: 699, variants: ["Black", "Brown"] },
  ],

  "grocery-fresh-fruits": [
    { name: "Farm Fresh Apples", brand: "FarmPick", basePrice: 120, variants: ["500g", "1kg"] },
    { name: "Sweet Bananas", brand: "FarmPick", basePrice: 40, variants: ["6 pcs", "12 pcs"] },
  ],
  "grocery-fresh-vegetables": [
    { name: "Fresh Tomatoes", brand: "GreenBasket", basePrice: 30, variants: ["500g", "1kg"] },
    { name: "Onion Pack", brand: "GreenBasket", basePrice: 35, variants: ["500g", "1kg"] },
  ],
  "grocery-exotic-produce": [
    { name: "Avocado Pack", brand: "ExoticFarm", basePrice: 180, variants: ["2 pcs", "4 pcs"] },
    { name: "Broccoli Fresh", brand: "ExoticFarm", basePrice: 90, variants: ["250g", "500g"] },
  ],
  "grocery-milk-curd": [
    { name: "Fresh Toned Milk", brand: "DairyDay", basePrice: 28, variants: ["500ml", "1L"] },
    { name: "Thick Curd", brand: "DairyDay", basePrice: 35, variants: ["200g", "400g"] },
  ],
  "grocery-cheese-butter": [
    { name: "Processed Cheese Cubes", brand: "CheeseBar", basePrice: 110, variants: ["200g", "400g"] },
    { name: "Salted Butter", brand: "CheeseBar", basePrice: 55, variants: ["100g", "200g"] },
  ],
  "grocery-bread-bakery": [
    { name: "Whole Wheat Bread", brand: "BakeHouse", basePrice: 45, variants: ["400g", "800g"] },
    { name: "Burger Buns", brand: "BakeHouse", basePrice: 40, variants: ["4 pcs", "6 pcs"] },
  ],
  "grocery-chips-namkeen": [
    { name: "Classic Potato Chips", brand: "CrunchIt", basePrice: 20, variants: ["50g", "100g"] },
    { name: "Masala Mixture", brand: "CrunchIt", basePrice: 35, variants: ["100g", "200g"] },
  ],
  "grocery-biscuits-cookies": [
    { name: "Butter Cookies", brand: "BakeBite", basePrice: 40, variants: ["100g", "200g"] },
    { name: "Glucose Biscuits", brand: "BakeBite", basePrice: 30, variants: ["150g", "300g"] },
  ],
  "grocery-soft-drinks-juices": [
    { name: "Orange Juice", brand: "FreshSip", basePrice: 60, variants: ["500ml", "1L"] },
    { name: "Cola Soft Drink", brand: "FizzCo", basePrice: 40, variants: ["250ml", "750ml"] },
  ],
  "grocery-rice-atta": [
    { name: "Basmati Rice", brand: "GrainGold", basePrice: 140, variants: ["1kg", "5kg"] },
    { name: "Whole Wheat Atta", brand: "GrainGold", basePrice: 55, variants: ["1kg", "5kg"] },
  ],
  "grocery-dal-pulses": [
    { name: "Toor Dal", brand: "PulsePure", basePrice: 140, variants: ["500g", "1kg"] },
    { name: "Moong Dal", brand: "PulsePure", basePrice: 120, variants: ["500g", "1kg"] },
  ],
  "grocery-oils-spices": [
    { name: "Refined Sunflower Oil", brand: "CookWell", basePrice: 160, variants: ["1L", "5L"] },
    { name: "Turmeric Powder", brand: "CookWell", basePrice: 45, variants: ["100g", "200g"] },
  ],

  "kids-soft-toys": [
    { name: "Cuddle Bear", brand: "ToyLand", basePrice: 499, variants: ["Small", "Large"] },
    { name: "Bunny Soft Toy", brand: "ToyLand", basePrice: 399, variants: ["Pink", "White"] },
  ],
  "kids-educational-toys": [
    { name: "Alphabet Puzzle Set", brand: "LearnPlay", basePrice: 349, variants: ["Basic", "Advanced"] },
    { name: "STEM Building Blocks", brand: "LearnPlay", basePrice: 599, variants: ["50 pcs", "100 pcs"] },
  ],
  "kids-outdoor-play": [
    { name: "Kids Football", brand: "PlayOut", basePrice: 299, variants: ["Size 3", "Size 4"] },
    { name: "Ride-On Scooter", brand: "PlayOut", basePrice: 1499, variants: ["3 Wheel", "2 Wheel"] },
  ],
  "kids-diapers-wipes": [
    { name: "SoftCare Diapers", brand: "SoftCare", basePrice: 499, variants: ["M 40 pcs", "L 36 pcs"] },
    { name: "Baby Wipes Pack", brand: "SoftCare", basePrice: 149, variants: ["72 pcs", "144 pcs"] },
  ],
  "kids-baby-feeding": [
    { name: "Feeding Bottle Set", brand: "BabySip", basePrice: 299, variants: ["150ml", "250ml"] },
    { name: "Baby Cereal", brand: "BabySip", basePrice: 249, variants: ["300g", "500g"] },
  ],
  "kids-baby-bath-skin": [
    { name: "Gentle Baby Shampoo", brand: "SoftSkin", basePrice: 199, variants: ["100ml", "200ml"] },
    { name: "Baby Body Lotion", brand: "SoftSkin", basePrice: 179, variants: ["100ml", "200ml"] },
  ],
  "kids-infant-wear": [
    { name: "Newborn Romper", brand: "TinyWear", basePrice: 399, variants: ["0-3M", "3-6M"] },
    { name: "Infant Cotton Set", brand: "TinyWear", basePrice: 499, variants: ["0-3M", "6-9M"] },
  ],
  "kids-boys-clothing": [
    { name: "Boys Casual Tee", brand: "KidStyle", basePrice: 349, variants: ["5-6Y", "7-8Y"] },
    { name: "Boys Shorts", brand: "KidStyle", basePrice: 399, variants: ["5-6Y", "9-10Y"] },
  ],
  "kids-girls-clothing": [
    { name: "Girls Frock", brand: "PrettyKid", basePrice: 599, variants: ["3-4Y", "5-6Y"] },
    { name: "Girls Top Set", brand: "PrettyKid", basePrice: 449, variants: ["3-4Y", "7-8Y"] },
  ],
  "kids-school-bags": [
    { name: "Junior School Bag", brand: "CarryKid", basePrice: 799, variants: ["Blue", "Red"] },
    { name: "Trolley School Bag", brand: "CarryKid", basePrice: 1499, variants: ["Small", "Medium"] },
  ],
  "kids-stationery": [
    { name: "Notebook Combo", brand: "WriteWell", basePrice: 149, variants: ["4 pcs", "8 pcs"] },
    { name: "Pen & Pencil Kit", brand: "WriteWell", basePrice: 99, variants: ["Basic", "Premium"] },
  ],
  "kids-art-craft": [
    { name: "Crayon Color Set", brand: "ArtJoy", basePrice: 129, variants: ["12 colors", "24 colors"] },
    { name: "Craft Paper Kit", brand: "ArtJoy", basePrice: 199, variants: ["Small", "Large"] },
  ],

  "pets-dog-food": [
    { name: "Adult Dog Dry Food", brand: "PawFeast", basePrice: 499, variants: ["1kg", "3kg"] },
    { name: "Puppy Starter Food", brand: "PawFeast", basePrice: 449, variants: ["1kg", "2kg"] },
  ],
  "pets-dog-treats": [
    { name: "Chicken Dog Treats", brand: "TreatTail", basePrice: 199, variants: ["200g", "400g"] },
    { name: "Dental Chew Sticks", brand: "TreatTail", basePrice: 249, variants: ["7 pcs", "14 pcs"] },
  ],
  "pets-dog-grooming": [
    { name: "Dog Shampoo", brand: "FurCare", basePrice: 299, variants: ["200ml", "500ml"] },
    { name: "Pet Brush Comb", brand: "FurCare", basePrice: 199, variants: ["Soft", "Firm"] },
  ],
  "pets-cat-food": [
    { name: "Adult Cat Dry Food", brand: "MeowMeal", basePrice: 399, variants: ["1kg", "3kg"] },
    { name: "Kitten Wet Food", brand: "MeowMeal", basePrice: 99, variants: ["85g", "170g"] },
  ],
  "pets-cat-litter": [
    { name: "Clumping Cat Litter", brand: "CleanPaw", basePrice: 349, variants: ["5kg", "10kg"] },
    { name: "Lavender Cat Litter", brand: "CleanPaw", basePrice: 399, variants: ["5kg", "10kg"] },
  ],
  "pets-cat-treats": [
    { name: "Tuna Cat Treats", brand: "KittyBite", basePrice: 149, variants: ["60g", "120g"] },
    { name: "Creamy Cat Lick", brand: "KittyBite", basePrice: 179, variants: ["5 pcs", "10 pcs"] },
  ],
  "pets-dry-pet-food": [
    { name: "Multi Pet Dry Mix", brand: "PetFuel", basePrice: 429, variants: ["1kg", "5kg"] },
    { name: "High Protein Dry Food", brand: "PetFuel", basePrice: 549, variants: ["1kg", "3kg"] },
  ],
  "pets-wet-pet-food": [
    { name: "Gravy Wet Food Pack", brand: "PetFuel", basePrice: 89, variants: ["70g", "150g"] },
    { name: "Chunky Wet Meal", brand: "PetFuel", basePrice: 99, variants: ["85g", "170g"] },
  ],
  "pets-food-supplements": [
    { name: "Joint Care Supplement", brand: "VitaPet", basePrice: 399, variants: ["30 tabs", "60 tabs"] },
    { name: "Coat Glow Oil", brand: "VitaPet", basePrice: 299, variants: ["100ml", "200ml"] },
  ],
  "pets-collars-leashes": [
    { name: "Adjustable Pet Collar", brand: "WalkMate", basePrice: 199, variants: ["Small", "Large"] },
    { name: "Nylon Leash", brand: "WalkMate", basePrice: 249, variants: ["1.2m", "1.8m"] },
  ],
  "pets-bowls-feeders": [
    { name: "Stainless Pet Bowl", brand: "FeedRight", basePrice: 179, variants: ["Single", "Double"] },
    { name: "Auto Water Feeder", brand: "FeedRight", basePrice: 499, variants: ["1L", "2L"] },
  ],
  "pets-pet-toys": [
    { name: "Chew Rope Toy", brand: "PlayPaw", basePrice: 149, variants: ["Small", "Medium"] },
    { name: "Interactive Ball", brand: "PlayPaw", basePrice: 199, variants: ["Basic", "With Bell"] },
  ],

  "sports-dumbbells-weights": [
    { name: "Rubber Dumbbell Pair", brand: "FitForge", basePrice: 799, variants: ["2kg", "5kg"] },
    { name: "Adjustable Weight Set", brand: "FitForge", basePrice: 2499, variants: ["10kg", "20kg"] },
  ],
  "sports-yoga-mat-work": [
    { name: "Anti-Slip Yoga Mat", brand: "ZenFit", basePrice: 599, variants: ["4mm", "6mm"] },
    { name: "Resistance Band Set", brand: "ZenFit", basePrice: 399, variants: ["Light", "Heavy"] },
  ],
  "sports-cardio-gear": [
    { name: "Speed Jump Rope", brand: "CardioPro", basePrice: 249, variants: ["Standard", "Weighted"] },
    { name: "Mini Stepper", brand: "CardioPro", basePrice: 1999, variants: ["Basic", "With Bands"] },
  ],
  "sports-cricket": [
    { name: "Kashmir Willow Bat", brand: "PitchPerfect", basePrice: 1499, variants: ["Short Handle", "Full Size"] },
    { name: "Leather Cricket Ball", brand: "PitchPerfect", basePrice: 299, variants: ["Red", "White"] },
  ],
  "sports-football-basketball": [
    { name: "Match Football", brand: "GoalZone", basePrice: 699, variants: ["Size 4", "Size 5"] },
    { name: "Indoor Basketball", brand: "GoalZone", basePrice: 799, variants: ["Size 5", "Size 7"] },
  ],
  "sports-badminton-tennis": [
    { name: "Carbon Badminton Racket", brand: "SmashPro", basePrice: 999, variants: ["Single", "Pair"] },
    { name: "Tennis Ball Can", brand: "SmashPro", basePrice: 349, variants: ["3 pcs", "6 pcs"] },
  ],
  "sports-active-tshirts": [
    { name: "DryFit Training Tee", brand: "ActiveCore", basePrice: 599, variants: ["M", "L"] },
    { name: "Team Jersey", brand: "ActiveCore", basePrice: 799, variants: ["M", "XL"] },
  ],
  "sports-track-pants-shorts": [
    { name: "Running Shorts", brand: "ActiveCore", basePrice: 499, variants: ["M", "L"] },
    { name: "Track Pants", brand: "ActiveCore", basePrice: 899, variants: ["M", "XL"] },
  ],
  "sports-sports-jackets": [
    { name: "Windbreaker Jacket", brand: "TrailFit", basePrice: 1299, variants: ["M", "L"] },
    { name: "Hoodie Sweat Jacket", brand: "TrailFit", basePrice: 1499, variants: ["M", "XL"] },
  ],
  "sports-bicycles": [
    { name: "City Commute Cycle", brand: "RideOn", basePrice: 7999, variants: ["26 inch", "27.5 inch"] },
    { name: "Kids Bicycle", brand: "RideOn", basePrice: 4999, variants: ["16 inch", "20 inch"] },
  ],
  "sports-skates-boards": [
    { name: "Inline Skates", brand: "RollSwift", basePrice: 2499, variants: ["Size 7", "Size 8"] },
    { name: "Beginner Skateboard", brand: "RollSwift", basePrice: 1999, variants: ["Standard", "Pro Deck"] },
  ],
  "sports-cycling-accessories": [
    { name: "Safety Helmet", brand: "RideSafe", basePrice: 899, variants: ["M", "L"] },
    { name: "Bike Light Set", brand: "RideSafe", basePrice: 499, variants: ["Front", "Front+Rear"] },
  ],
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function saleFromPrice(price) {
  return Math.max(1, Math.round(Number(price) * 0.8));
}

function buildVariants(baseSku, basePrice, names) {
  return names.map((name, index) => {
    const multiplier = 1 + index * 0.5;
    const price = Math.round(basePrice * multiplier);
    return {
      name,
      price,
      salePrice: saleFromPrice(price),
      stock: 50 + index * 10,
      sku: `${baseSku}-v${index + 1}`,
    };
  });
}

function fallbackProducts(subcategory) {
  const base = subcategory.name;
  return [
    {
      name: `${base} Essentials`,
      brand: "Appzeto",
      basePrice: 299,
      variants: ["Standard", "Large"],
    },
    {
      name: `${base} Premium`,
      brand: "Appzeto",
      basePrice: 499,
      variants: ["Standard", "Large"],
    },
  ];
}

async function seedProducts() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  let seller =
    (await Seller.findOne({ isVerified: true, isActive: true }).select("_id shopName name").lean()) ||
    (await Seller.findOne({}).select("_id shopName name").lean());

  if (!seller) {
    throw new Error("No seller found. Create/verify a seller before seeding products.");
  }

  console.log(`Using seller: ${seller.shopName || seller.name} (${seller._id})`);

  const subcategories = await Category.find({ type: "subcategory", status: "active" }).lean();
  if (!subcategories.length) {
    throw new Error("No subcategories found. Seed subcategories first.");
  }

  const mains = await Category.find({ type: "category" }).lean();
  const headers = await Category.find({ type: "header" }).lean();
  const mainById = new Map(mains.map((m) => [String(m._id), m]));
  const headerById = new Map(headers.map((h) => [String(h._id), h]));

  let created = 0;
  let skipped = 0;

  for (const sub of subcategories) {
    const main = mainById.get(String(sub.parentId));
    if (!main) {
      console.warn(`Missing main category for subcategory ${sub.name}; skipping.`);
      continue;
    }
    const header = headerById.get(String(main.parentId));
    if (!header) {
      console.warn(`Missing header for subcategory ${sub.name}; skipping.`);
      continue;
    }

    const productDefs = PRODUCTS_BY_SUB_SLUG[sub.slug] || fallbackProducts(sub);
    console.log(`\nSub: ${sub.name}`);

    for (let i = 0; i < Math.min(2, productDefs.length); i += 1) {
      const def = productDefs[i];
      const slugBase = slugify(`${sub.slug}-${def.name}`);
      const slug = slugBase.slice(0, 80);
      const sku = `SEED-${slugify(sub.slug).slice(0, 24)}-${i + 1}`.toUpperCase();

      const existing = await Product.findOne({
        $or: [{ slug }, { sku }],
      }).lean();

      if (existing) {
        console.log(`  · skip  ${def.name}`);
        skipped += 1;
        continue;
      }

      const variants = buildVariants(sku, def.basePrice, def.variants || ["Standard", "Large"]);
      const primary = variants[0];

      await Product.create({
        name: def.name,
        slug,
        sku,
        description: def.description || `${def.name} — quality pick under ${sub.name}.`,
        price: primary.price,
        salePrice: primary.salePrice,
        stock: variants.reduce((sum, v) => sum + Number(v.stock || 0), 0),
        lowStockAlert: 5,
        brand: def.brand || "Appzeto",
        weight: def.weight || "",
        tags: [header.name, main.name, sub.name, def.brand || "Appzeto"].filter(Boolean),
        mainImage: PLACEHOLDER_MAIN,
        galleryImages: PLACEHOLDER_GALLERY,
        headerId: header._id,
        categoryId: main._id,
        subcategoryId: sub._id,
        sellerId: seller._id,
        status: "active",
        approvalStatus: "approved",
        approvalRequestedAt: null,
        approvalReviewedAt: new Date(),
        approvalReviewedBy: null,
        approvalNote: "Seeded product",
        lastSubmittedByRole: "seller",
        variants,
        isFeatured: false,
      });

      console.log(`  ✓ create ${def.name} (${variants.length} variants)`);
      created += 1;
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  await mongoose.disconnect();
}

seedProducts().catch(async (error) => {
  console.error("Seed failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
