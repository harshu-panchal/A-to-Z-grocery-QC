/**
 * Seed 3 subcategories (type: "subcategory") under each main category.
 * Safe to re-run: skips existing slugs / same name under the same parent.
 *
 * Usage: node scripts/seedSubCategories.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../app/models/category.js";

dotenv.config();

const SUBS_BY_MAIN_SLUG = {
  "electronics-mobiles-tablets": [
    { name: "Smartphones", slug: "electronics-smartphones", description: "Android and iOS smartphones" },
    { name: "Tablets", slug: "electronics-tablets", description: "Tablets and iPads" },
    { name: "Mobile Accessories", slug: "electronics-mobile-accessories", description: "Cases, chargers, power banks and cables" },
  ],
  "electronics-laptops-computers": [
    { name: "Laptops", slug: "electronics-laptops", description: "Notebooks and gaming laptops" },
    { name: "Desktops & Monitors", slug: "electronics-desktops-monitors", description: "PCs, all-in-ones and monitors" },
    { name: "Computer Accessories", slug: "electronics-computer-accessories", description: "Keyboards, mice, SSDs and peripherals" },
  ],
  "electronics-audio-wearables": [
    { name: "Headphones & Earbuds", slug: "electronics-headphones-earbuds", description: "Wired and wireless audio" },
    { name: "Speakers", slug: "electronics-speakers", description: "Bluetooth and home speakers" },
    { name: "Smartwatches & Bands", slug: "electronics-smartwatches-bands", description: "Wearable fitness and smart devices" },
  ],
  "electronics-home-appliances": [
    { name: "Kitchen Appliances", slug: "electronics-kitchen-appliances", description: "Mixers, microwave and kitchen gadgets" },
    { name: "Cooling & Heating", slug: "electronics-cooling-heating", description: "Fans, ACs and heaters" },
    { name: "Cleaning Appliances", slug: "electronics-cleaning-appliances", description: "Vacuum cleaners and irons" },
  ],

  "fasion-men": [
    { name: "Men T-Shirts", slug: "fasion-men-tshirts", description: "Casual and graphic tees for men" },
    { name: "Men Shirts", slug: "fasion-men-shirts", description: "Formal and casual shirts" },
    { name: "Men Bottomwear", slug: "fasion-men-bottomwear", description: "Jeans, trousers and shorts" },
  ],
  "fasion-women": [
    { name: "Women Tops & Kurtis", slug: "fasion-women-tops-kurtis", description: "Tops, tunics and kurtis" },
    { name: "Women Ethnic Wear", slug: "fasion-women-ethnic-wear", description: "Sarees, salwar suits and ethnic sets" },
    { name: "Women Western Wear", slug: "fasion-women-western-wear", description: "Dresses, jeans and western outfits" },
  ],
  "fasion-footwear": [
    { name: "Men Footwear", slug: "fasion-men-footwear", description: "Casual shoes, formal shoes and sandals for men" },
    { name: "Women Footwear", slug: "fasion-women-footwear", description: "Heels, flats and sneakers for women" },
    { name: "Sports Shoes", slug: "fasion-sports-shoes", description: "Running and training shoes" },
  ],
  "fasion-accessories": [
    { name: "Bags & Wallets", slug: "fasion-bags-wallets", description: "Handbags, backpacks and wallets" },
    { name: "Watches & Jewellery", slug: "fasion-watches-jewellery", description: "Fashion watches and jewellery" },
    { name: "Belts & Sunglasses", slug: "fasion-belts-sunglasses", description: "Belts, caps and eyewear" },
  ],

  "grocery-fruits-vegetables": [
    { name: "Fresh Fruits", slug: "grocery-fresh-fruits", description: "Seasonal and everyday fruits" },
    { name: "Fresh Vegetables", slug: "grocery-fresh-vegetables", description: "Leafy greens and daily vegetables" },
    { name: "Exotic Produce", slug: "grocery-exotic-produce", description: "Imported and specialty produce" },
  ],
  "grocery-dairy-bakery": [
    { name: "Milk & Curd", slug: "grocery-milk-curd", description: "Milk, curd and buttermilk" },
    { name: "Cheese & Butter", slug: "grocery-cheese-butter", description: "Cheese, butter and paneer" },
    { name: "Bread & Bakery", slug: "grocery-bread-bakery", description: "Bread, buns and bakery snacks" },
  ],
  "grocery-snacks-beverages": [
    { name: "Chips & Namkeen", slug: "grocery-chips-namkeen", description: "Chips, mixtures and namkeen" },
    { name: "Biscuits & Cookies", slug: "grocery-biscuits-cookies", description: "Biscuits, cookies and wafers" },
    { name: "Soft Drinks & Juices", slug: "grocery-soft-drinks-juices", description: "Cold drinks, juices and energy drinks" },
  ],
  "grocery-staples-cooking": [
    { name: "Rice & Atta", slug: "grocery-rice-atta", description: "Rice, flour and grains" },
    { name: "Dal & Pulses", slug: "grocery-dal-pulses", description: "Lentils and pulses" },
    { name: "Oils & Spices", slug: "grocery-oils-spices", description: "Cooking oils, masalas and spices" },
  ],

  "kids-toys-games": [
    { name: "Soft Toys", slug: "kids-soft-toys", description: "Plush and cuddly toys" },
    { name: "Educational Toys", slug: "kids-educational-toys", description: "Learning and STEM toys" },
    { name: "Outdoor Play", slug: "kids-outdoor-play", description: "Balls, ride-ons and outdoor toys" },
  ],
  "kids-baby-care": [
    { name: "Diapers & Wipes", slug: "kids-diapers-wipes", description: "Diapers, pants and baby wipes" },
    { name: "Baby Feeding", slug: "kids-baby-feeding", description: "Bottles, formula and feeding accessories" },
    { name: "Baby Bath & Skin", slug: "kids-baby-bath-skin", description: "Baby shampoo, lotion and skincare" },
  ],
  "kids-clothing": [
    { name: "Infant Wear", slug: "kids-infant-wear", description: "Clothes for newborns and infants" },
    { name: "Boys Clothing", slug: "kids-boys-clothing", description: "Tops, bottoms and sets for boys" },
    { name: "Girls Clothing", slug: "kids-girls-clothing", description: "Dresses, tops and sets for girls" },
  ],
  "kids-school-supplies": [
    { name: "School Bags", slug: "kids-school-bags", description: "Backpacks and school bags" },
    { name: "Stationery", slug: "kids-stationery", description: "Pens, notebooks and stationery kits" },
    { name: "Art & Craft", slug: "kids-art-craft", description: "Colors, craft kits and drawing supplies" },
  ],

  "pets-dog-care": [
    { name: "Dog Food", slug: "pets-dog-food", description: "Dry and wet food for dogs" },
    { name: "Dog Treats", slug: "pets-dog-treats", description: "Treats and chews for dogs" },
    { name: "Dog Grooming", slug: "pets-dog-grooming", description: "Shampoo, brushes and grooming tools" },
  ],
  "pets-cat-care": [
    { name: "Cat Food", slug: "pets-cat-food", description: "Dry and wet food for cats" },
    { name: "Cat Litter", slug: "pets-cat-litter", description: "Litter and litter accessories" },
    { name: "Cat Treats", slug: "pets-cat-treats", description: "Treats and snacks for cats" },
  ],
  "pets-pet-food": [
    { name: "Dry Pet Food", slug: "pets-dry-pet-food", description: "Everyday dry pet nutrition" },
    { name: "Wet Pet Food", slug: "pets-wet-pet-food", description: "Canned and pouch wet food" },
    { name: "Supplements", slug: "pets-food-supplements", description: "Vitamins and nutrition supplements" },
  ],
  "pets-pet-accessories": [
    { name: "Collars & Leashes", slug: "pets-collars-leashes", description: "Collars, harnesses and leashes" },
    { name: "Bowls & Feeders", slug: "pets-bowls-feeders", description: "Food and water bowls" },
    { name: "Pet Toys", slug: "pets-pet-toys", description: "Toys and enrichment for pets" },
  ],

  "sports-fitness-equipment": [
    { name: "Dumbbells & Weights", slug: "sports-dumbbells-weights", description: "Free weights and strength gear" },
    { name: "Yoga & Mat Work", slug: "sports-yoga-mat-work", description: "Yoga mats, blocks and stretch bands" },
    { name: "Cardio Gear", slug: "sports-cardio-gear", description: "Jump ropes, steppers and cardio accessories" },
  ],
  "sports-outdoor-sports": [
    { name: "Cricket", slug: "sports-cricket", description: "Bats, balls and cricket kits" },
    { name: "Football & Basketball", slug: "sports-football-basketball", description: "Balls and outdoor court sports" },
    { name: "Badminton & Tennis", slug: "sports-badminton-tennis", description: "Rackets, shuttles and tennis gear" },
  ],
  "sports-sportswear": [
    { name: "Active T-Shirts", slug: "sports-active-tshirts", description: "Training tees and jerseys" },
    { name: "Track Pants & Shorts", slug: "sports-track-pants-shorts", description: "Athletic bottoms" },
    { name: "Sports Jackets", slug: "sports-sports-jackets", description: "Hoodies and track jackets" },
  ],
  "sports-cycling-skates": [
    { name: "Bicycles", slug: "sports-bicycles", description: "Cycles for kids and adults" },
    { name: "Skates & Boards", slug: "sports-skates-boards", description: "Inline skates, skateboards and scooters" },
    { name: "Cycling Accessories", slug: "sports-cycling-accessories", description: "Helmets, lights and bike accessories" },
  ],
};

async function seedSubCategories() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const mains = await Category.find({ type: "category" }).lean();
  if (!mains.length) {
    throw new Error("No main categories found. Seed main categories first.");
  }

  let created = 0;
  let skipped = 0;

  for (const main of mains) {
    const subs = SUBS_BY_MAIN_SLUG[main.slug];
    if (!subs) {
      console.warn(`No seed mapping for main "${main.name}" (${main.slug}); skipping.`);
      continue;
    }

    console.log(`\nMain: ${main.name}`);

    for (const sub of subs) {
      const existing = await Category.findOne({
        $or: [
          { slug: sub.slug },
          { name: sub.name, parentId: main._id, type: "subcategory" },
        ],
      }).lean();

      if (existing) {
        console.log(`  · skip  ${sub.name}`);
        skipped += 1;
        continue;
      }

      await Category.create({
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        type: "subcategory",
        parentId: main._id,
        status: "active",
        adminCommission: 0,
        adminCommissionType: "percentage",
        adminCommissionValue: 0,
        handlingFees: 0,
        handlingFeeType: "fixed",
        handlingFeeValue: 0,
      });

      console.log(`  ✓ create ${sub.name}`);
      created += 1;
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);

  await mongoose.disconnect();
}

seedSubCategories().catch(async (error) => {
  console.error("Seed failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
