/**
 * Seed 4 main categories (type: "category") under each header category.
 * Safe to re-run: skips existing slugs / same name under the same parent.
 *
 * Usage: node scripts/seedMainCategories.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../app/models/category.js";

dotenv.config();

const MAIN_BY_HEADER_SLUG = {
  electronics: [
    {
      name: "Mobiles & Tablets",
      slug: "electronics-mobiles-tablets",
      description: "Smartphones, tablets and mobile accessories",
    },
    {
      name: "Laptops & Computers",
      slug: "electronics-laptops-computers",
      description: "Laptops, desktops and computer peripherals",
    },
    {
      name: "Audio & Wearables",
      slug: "electronics-audio-wearables",
      description: "Headphones, speakers, smartwatches and bands",
    },
    {
      name: "Home Appliances",
      slug: "electronics-home-appliances",
      description: "Kitchen and home electronic appliances",
    },
  ],
  fasion: [
    {
      name: "Men",
      slug: "fasion-men",
      description: "Men clothing and fashion essentials",
    },
    {
      name: "Women",
      slug: "fasion-women",
      description: "Women clothing and fashion essentials",
    },
    {
      name: "Footwear",
      slug: "fasion-footwear",
      description: "Shoes, sandals and slippers",
    },
    {
      name: "Accessories",
      slug: "fasion-accessories",
      description: "Bags, belts, watches and fashion accessories",
    },
  ],
  grocery: [
    {
      name: "Fruits & Vegetables",
      slug: "grocery-fruits-vegetables",
      description: "Fresh fruits and vegetables",
    },
    {
      name: "Dairy & Bakery",
      slug: "grocery-dairy-bakery",
      description: "Milk, curd, cheese, bread and bakery items",
    },
    {
      name: "Snacks & Beverages",
      slug: "grocery-snacks-beverages",
      description: "Chips, biscuits, soft drinks and juices",
    },
    {
      name: "Staples & Cooking",
      slug: "grocery-staples-cooking",
      description: "Rice, dal, oil, spices and cooking essentials",
    },
  ],
  kids: [
    {
      name: "Toys & Games",
      slug: "kids-toys-games",
      description: "Toys, puzzles and indoor games for kids",
    },
    {
      name: "Baby Care",
      slug: "kids-baby-care",
      description: "Diapers, wipes and baby care essentials",
    },
    {
      name: "Kids Clothing",
      slug: "kids-clothing",
      description: "Clothes and wear for infants and kids",
    },
    {
      name: "School Supplies",
      slug: "kids-school-supplies",
      description: "Bags, stationery and school essentials",
    },
  ],
  pets: [
    {
      name: "Dog Care",
      slug: "pets-dog-care",
      description: "Food, treats and care products for dogs",
    },
    {
      name: "Cat Care",
      slug: "pets-cat-care",
      description: "Food, litter and care products for cats",
    },
    {
      name: "Pet Food",
      slug: "pets-pet-food",
      description: "Everyday pet food and nutrition",
    },
    {
      name: "Pet Accessories",
      slug: "pets-pet-accessories",
      description: "Collars, bowls, toys and pet accessories",
    },
  ],
  sports: [
    {
      name: "Fitness Equipment",
      slug: "sports-fitness-equipment",
      description: "Dumbbells, yoga mats and home gym gear",
    },
    {
      name: "Outdoor Sports",
      slug: "sports-outdoor-sports",
      description: "Cricket, football, badminton and outdoor gear",
    },
    {
      name: "Sportswear",
      slug: "sports-sportswear",
      description: "Activewear, shoes and sports apparel",
    },
    {
      name: "Cycling & Skates",
      slug: "sports-cycling-skates",
      description: "Cycles, skates and related accessories",
    },
  ],
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedMainCategories() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const headers = await Category.find({ type: "header" }).lean();
  if (!headers.length) {
    throw new Error("No header categories found. Create headers first.");
  }

  let created = 0;
  let skipped = 0;

  for (const header of headers) {
    const headerSlug = slugify(header.slug || header.name);
    const mains = MAIN_BY_HEADER_SLUG[headerSlug];

    if (!mains) {
      console.warn(
        `No seed mapping for header "${header.name}" (slug: ${headerSlug}); skipping.`,
      );
      continue;
    }

    console.log(`\nHeader: ${header.name}`);

    for (const main of mains) {
      const existing = await Category.findOne({
        $or: [
          { slug: main.slug },
          { name: main.name, parentId: header._id, type: "category" },
        ],
      }).lean();

      if (existing) {
        console.log(`  · skip  ${main.name}`);
        skipped += 1;
        continue;
      }

      await Category.create({
        name: main.name,
        slug: main.slug,
        description: main.description,
        type: "category",
        parentId: header._id,
        status: "active",
        adminCommission: 0,
        adminCommissionType: "percentage",
        adminCommissionValue: 0,
        handlingFees: 0,
        handlingFeeType: "fixed",
        handlingFeeValue: 0,
      });

      console.log(`  ✓ create ${main.name}`);
      created += 1;
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);

  await mongoose.disconnect();
}

seedMainCategories().catch(async (error) => {
  console.error("Seed failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
