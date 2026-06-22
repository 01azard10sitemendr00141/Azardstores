// Run with: npm run seed
// Wipes and repopulates the mall: Floors -> Shops -> Products, plus the admin/owner account.

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Floor = require("../models/Floor");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const User = require("../models/User");

async function seed() {
  await connectDB();

  console.log("Clearing existing mall data...");
  await Promise.all([Floor.deleteMany(), Shop.deleteMany(), Product.deleteMany()]);

  console.log("Creating mall owner/admin...");
  let owner = await User.findOne({ email: "admin@shopright.co.ke" });
  if (!owner) {
    owner = await User.create({
      name: "ShopRight Mall Owner",
      email: "admin@shopright.co.ke",
      password: "Admin123!",
      role: "admin",
    });
  }

  console.log("Creating floors...");
  const floors = await Floor.insertMany([
    { floorNumber: 1, name: "Fashion & Clothing", order: 1, icon: "👗" },
    { floorNumber: 2, name: "Electronics & Tech", order: 2, icon: "📱" },
    { floorNumber: 3, name: "Beauty & Wellness", order: 3, icon: "💄" },
    { floorNumber: 4, name: "Food & Groceries", order: 4, icon: "🛒" },
    { floorNumber: 5, name: "Home & Furniture", order: 5, icon: "🛋️" },
    { floorNumber: 6, name: "Sports & Fitness", order: 6, icon: "🏋️" },
    { floorNumber: 7, name: "Toys & Kids", order: 7, icon: "🧸" },
    { floorNumber: 8, name: "Jewelry & Accessories", order: 8, icon: "💎" },
    { floorNumber: 9, name: "Books & Stationery", order: 9, icon: "📚" },
    { floorNumber: 10, name: "Services", order: 10, icon: "🛠️" },
  ]);

  const floorByNumber = Object.fromEntries(floors.map((f) => [f.floorNumber, f]));

  console.log("Creating shops...");
  const shops = await Shop.insertMany([
    {
      shopNumber: 1,
      name: "Phone Accessories Hub",
      floor: floorByNumber[2]._id,
      description: "Cases, chargers, earbuds, power banks and everything for your phone.",
      owner: owner._id,
      status: "open",
    },
    {
      shopNumber: 2,
      name: "Laptop & Computing Corner",
      floor: floorByNumber[2]._id,
      description: "Laptops, desktops, and computing accessories for work and play.",
      owner: owner._id,
      status: "open",
    },
    {
      shopNumber: 3,
      name: "Sound & Audio Store",
      floor: floorByNumber[2]._id,
      description: "Headphones, speakers, earbuds and home audio systems.",
      owner: owner._id,
      status: "open",
    },
    {
      shopNumber: 4,
      name: "TV & Home Entertainment",
      floor: floorByNumber[2]._id,
      description: "Smart TVs, projectors and entertainment systems.",
      owner: owner._id,
      status: "new",
    },
    {
      shopNumber: 1,
      name: "Power & Charging Station",
      floor: floorByNumber[5]._id,
      description: "Power banks, solar chargers, UPS and surge protectors.",
      owner: owner._id,
      status: "open",
    },
  ]);

  const shopByName = Object.fromEntries(shops.map((s) => [s.name, s]));

  console.log("Creating products...");
  await Product.insertMany([
    {
      name: "Oraimo AirBuds Pro 340",
      description: "True wireless earbuds with active noise cancellation and touch controls.",
      price: 3499,
      compareAtPrice: 4500,
      shop: shopByName["Phone Accessories Hub"]._id,
      subcategory: "Wireless Earbuds",
      brand: "Oraimo",
      stock: 40,
      badge: "hot-deal",
      isFlashSale: true,
      flashSaleEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 33),
      purposeTags: ["fitness", "travel"],
      images: [],
    },
    {
      name: "Oraimo BoomBass 930N",
      description: "Deep bass wireless headphones with active noise cancellation and 50 hours of battery life.",
      price: 4999,
      compareAtPrice: 6999,
      shop: shopByName["Sound & Audio Store"]._id,
      subcategory: "Over-Ear Headphones",
      brand: "Oraimo",
      stock: 25,
      badge: "best-seller",
      purposeTags: ["work", "travel"],
      images: [],
    },
    {
      name: "Dell Latitude 5440",
      description: "Reliable business laptop with Intel i7, 16GB RAM, 512GB SSD.",
      price: 89999,
      shop: shopByName["Laptop & Computing Corner"]._id,
      subcategory: "Business Laptops",
      brand: "Dell",
      stock: 8,
      badge: "trending",
      purposeTags: ["work"],
      images: [],
    },
    {
      name: "MacBook Air M2",
      description: "Apple M2 chip, 8GB RAM, 256GB SSD, all-day battery life.",
      price: 134999,
      shop: shopByName["Laptop & Computing Corner"]._id,
      subcategory: "MacBooks",
      brand: "Apple",
      stock: 5,
      badge: "exclusive",
      purposeTags: ["work", "travel"],
      images: [],
    },
    {
      name: "Samsung Smart TV 55-inch 4K",
      description: "Crystal-clear 4K UHD display with built-in smart apps.",
      price: 64999,
      compareAtPrice: 79999,
      shop: shopByName["TV & Home Entertainment"]._id,
      subcategory: "Smart TVs",
      brand: "Samsung",
      stock: 12,
      badge: "limited-stock",
      purposeTags: ["home"],
      images: [],
    },
    {
      name: "Anker 20000mAh Power Bank",
      description: "Fast-charging power bank with dual USB output, ideal for travel.",
      price: 2999,
      shop: shopByName["Power & Charging Station"]._id,
      subcategory: "Power Banks",
      brand: "Anker",
      stock: 60,
      badge: "new-arrival",
      purposeTags: ["travel", "fitness"],
      images: [],
    },
  ]);

  console.log("✅ Mall seed complete: 10 floors, 5 shops, 6 products");
  console.log("   Admin login: admin@shopright.co.ke / Admin123!");
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
