require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Floor = require("../models/Floor");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const User = require("../models/User");
const Category = require("../models/Category");
const Brand = require("../models/Brand");

const BADGES = ["new-arrival", "trending", "hot-deal", "best-seller", "exclusive", "limited-stock"];

function badge(i) { return BADGES[i % BADGES.length]; }
function r(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function fs(days) { return new Date(Date.now() + 1000 * 60 * 60 * days); }

const FLOORS = [
  { floorNumber: 1,  name: "Fashion & Clothing",  order: 1,  icon: "👗", image: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=800&auto=format&fit=crop" },
  { floorNumber: 2,  name: "Electronics & Tech",  order: 2,  icon: "📱", image: "https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=800&auto=format&fit=crop" },
  { floorNumber: 3,  name: "Beauty & Wellness",   order: 3,  icon: "💄", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop" },
  { floorNumber: 4,  name: "Home & Living",      order: 4,  icon: "🛋️", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&auto=format&fit=crop" },
  { floorNumber: 5,  name: "Food & Groceries",   order: 5,  icon: "🛒", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop" },
  { floorNumber: 6,  name: "Sports & Fitness",   order: 6,  icon: "🏋️", image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop" },
  { floorNumber: 7,  name: "Toys, Kids & Baby",  order: 7,  icon: "🧸", image: "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=800&auto=format&fit=crop" },
  { floorNumber: 8,  name: "Jewellery & Accessories", order: 8, icon: "💎", image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&auto=format&fit=crop" },
  { floorNumber: 9,  name: "Books, Stationery & Hobbies", order: 9, icon: "📚", image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&auto=format&fit=crop" },
  { floorNumber: 10, name: "Services & Experiences", order: 10, icon: "🛠️", image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&auto=format&fit=crop" },
];

const SHOPS = [
  // FLOOR 1 - Fashion & Clothing
  { shopNumber: 1, name: "Men's Wear", floor: 1, description: "Shirts, tees, jeans and jackets for the modern man.", banner: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Women's Wear", floor: 1, description: "Dresses, blouses, skirts and denim for every occasion.", banner: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Footwear & Bags", floor: 1, description: "Shoes for every step and bags for every plan.", banner: "https://images.unsplash.com/photo-1542272604-787c38355a5d?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 2 - Electronics & Tech
  { shopNumber: 1, name: "Mobile Zone", floor: 2, description: "Smartphones, cases, power banks and everything for your phone.", banner: "https://images.unsplash.com/photo-1580974928064-f0aeef70895a?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Laptops & Computing", floor: 2, description: "Laptops, monitors and computing accessories for work and play.", banner: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "TV & Audio", floor: 2, description: "Televisions, soundbars, headphones and home audio.", banner: "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&auto=format&fit=crop", status: "new" },
  { shopNumber: 4, name: "Smart Home & Accessories", floor: 2, description: "Smart plugs, cameras, watches, chargers and cables.", banner: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop", status: "open" },
  // FLOOR 3 - Beauty & Wellness
  { shopNumber: 1, name: "Skincare & Hair", floor: 3, description: "Face care, hair care and the tools to go with it.", banner: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Fragrance & Cosmetics", floor: 3, description: "Perfumes, makeup and beauty appliances.", banner: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Personal Care", floor: 3, description: "Electric toothbrushes, shavers, massagers and wellness.", banner: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 4 - Home & Living
  { shopNumber: 1, name: "Furniture", floor: 4, description: "Sofas, beds, mattresses and dining sets.", banner: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Kitchen & Appliances", floor: 4, description: "Cookers, blenders, kettles and kitchen storage.", banner: "https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Home Decor & Bedding", floor: 4, description: "Curtains, rugs, bedding sets and lighting.", banner: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 5 - Food & Groceries
  { shopNumber: 1, name: "Pantry Staples", floor: 5, description: "Cooking oil, tea, coffee and packaged foods.", banner: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Fresh & Dairy", floor: 5, description: "Produce, milk, yogurt and bakery fresh daily.", banner: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Drinks & Snacks", floor: 5, description: "Soft drinks, water, chips and biscuits.", banner: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop", status: "open" },
  // FLOOR 6 - Sports, Fitness & Outdoors
  { shopNumber: 1, name: "Fitness Gear", floor: 6, description: "Dumbbells, yoga mats, resistance bands and home gym.", banner: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Sports & Camping", floor: 6, description: "Team sports kits, tents, flashlights and outdoor gear.", banner: "https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Cycling & Activewear", floor: 6, description: "Bicycles, helmets and performance running gear.", banner: "https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 7 - Toys, Kids & Baby
  { shopNumber: 1, name: "Toys", floor: 7, description: "Educational toys, board games and action figures.", banner: "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Baby & Nursery", floor: 7, description: "Baby bottles, strollers and gentle baby care.", banner: "https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Kids Furniture & Learning", floor: 7, description: "Kids desks, school bags and learning tablets.", banner: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 8 - Jewellery & Accessories
  { shopNumber: 1, name: "Jewellery", floor: 8, description: "Rings, necklaces, earrings and bracelets.", banner: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Watches & Sunglasses", floor: 8, description: "Wristwatches, sunglasses, belts and hats.", banner: "https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop", status: "open" },
  // FLOOR 9 - Books, Stationery & Hobbies
  { shopNumber: 1, name: "Books & Stationery", floor: 9, description: "Novels, notebooks, pens and school supplies.", banner: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Hobbies & Gaming", floor: 9, description: "Musical instruments, craft kits and gaming gear.", banner: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop", status: "new" },
  // FLOOR 10 - Services & Experiences
  { shopNumber: 1, name: "Gift Cards & Gift Wrap", floor: 10, description: "E-gift cards and a gift wrapping service.", banner: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 2, name: "Repairs & Installation", floor: 10, description: "Device repair and home appliance installation.", banner: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop", status: "open" },
  { shopNumber: 3, name: "Trade-in & Subscriptions", floor: 10, description: "Device trade-in and device care subscriptions.", banner: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop", status: "new" },
];

const CATEGORY_TREE = [
  { name: "Men's Clothing", subcategories: ["Men's Shirts", "Men's T-Shirts", "Men's Jeans", "Men's Jackets", "Men's Shorts"] },
  { name: "Women's Clothing", subcategories: ["Dresses", "Tops & Blouses", "Skirts", "Women's Jeans", "Women's Shorts"] },
  { name: "Footwear", subcategories: ["Men's Shoes", "Women's Shoes", "Sneakers", "Sandals", "Boots"] },
  { name: "Bags & Luggage", subcategories: ["Backpacks", "Handbags", "Travel Bags", "Waist Bags"] },
  { name: "Smartphones", subcategories: ["Smartphones", "Phone Cases", "Power Banks"] },
  { name: "Laptops & Computers", subcategories: ["Laptops", "Monitors", "Keyboards", "Mice & Mice Pads"] },
  { name: "TV & Audio", subcategories: ["Televisions", "Soundbars", "Headphones", "Bluetooth Speakers"] },
  { name: "Smart Home & Accessories", subcategories: ["Smart Plugs & Bulbs", "Security Cameras", "Smartwatches", "Chargers & Cables"] },
  { name: "Skincare", subcategories: ["Face Cream & Oil", "Face Wash", "Sunscreen"] },
  { name: "Hair Care", subcategories: ["Hair Shampoo", "Hair Conditioner", "Hair Dryers"] },
  { name: "Fragrance", subcategories: ["Perfume", "Cologne", "Body Mist"] },
  { name: "Makeup & Cosmetics", subcategories: ["Foundation", "Lipstick", "Eyeshadow Palettes"] },
  { name: "Personal Care Appliances", subcategories: ["Electric Toothbrushes", "Shavers & Trimmers", "Massagers"] },
  { name: "Furniture", subcategories: ["Sofas", "Beds & Mattresses", "Dining Sets", "Office Chairs"] },
  { name: "Kitchen Appliances", subcategories: ["Cookers", "Blenders", "Kettles", "Food Storage"] },
  { name: "Home Decor & Bedding", subcategories: ["Curtains & Blinds", "Rugs & Carpets", "Bedding Sets", "Lighting"] },
  { name: "Pantry Staples", subcategories: ["Cooking Oil", "Tea & Coffee", "Packaged Foods", "Pasta & Rice"] },
  { name: "Fresh & Dairy", subcategories: ["Fresh Fruits", "Fresh Vegetables", "Milk & Yogurt", "Bread & Bakery"] },
  { name: "Drinks & Snacks", subcategories: ["Soft Drinks", "Bottled Water", "Chips & Crisps", "Biscuits & Cookies"] },
  { name: "Fitness Equipment", subcategories: ["Dumbbells & Weights", "Yoga Mats", "Resistance Bands", "Treadmills"] },
  { name: "Sports & Outdoor Gear", subcategories: ["Team Sports Kits", "Camping Tents", "Flashlights", "Sports Balls"] },
  { name: "Cycling & Activewear", subcategories: ["Bicycles", "Helmets", "Running Shoes", "Activewear"] },
  { name: "Toys", subcategories: ["Educational Toys", "Board Games", "Action Figures", "Plush Toys"] },
  { name: "Baby & Nursery", subcategories: ["Baby Bottles & Feeding", "Strollers & Car Seats", "Baby Care", "Nursery Furniture"] },
  { name: "Kids Furniture & Learning", subcategories: ["Kids Desks & Chairs", "School Bags", "Learning Tablets", "Kids Books"] },
  { name: "Jewellery", subcategories: ["Rings", "Necklaces", "Earrings", "Bracelets"] },
  { name: "Watches & Accessories", subcategories: ["Wristwatches", "Sunglasses", "Belts", "Hats"] },
  { name: "Books", subcategories: ["Novels", "Non-Fiction", "Children's Books"] },
  { name: "Stationery & Supplies", subcategories: ["Notebooks", "Pens & Pencils", "School Supplies", "Art & Craft"] },
  { name: "Hobbies & Gaming", subcategories: ["Musical Instruments", "Board Games", "Gaming Gear", "Craft Kits"] },
  { name: "Gift Cards & Gift Wrap", subcategories: ["E-Gift Cards", "Gift Wrapping Service"] },
  { name: "Repairs & Installation", subcategories: ["Device Repair", "Home Appliance Installation", "Tech Support"] },
  { name: "Trade-in & Subscriptions", subcategories: ["Device Trade-In", "Device Care Subscriptions", "Experience Vouchers"] },
];

const PRODUCTS = [
  // Men's Wear (Floor 1)
  { i: 0,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's Shirts", brand: "Urban Threads", sku: "UT-MSHIRT-001", stock: 40, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1596783131211-8d5d8b3b10d5?w=600&auto=format&fit=crop"], description: "Slim-fit cotton shirt in classic colours." },
  { i: 1,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's T-Shirts", brand: "Urban Threads", sku: "UT-MTSHIRT-002", stock: 60, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1583512191768-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Premium cotton crew neck tee." },
  { i: 2,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's Jeans", brand: "DenimCo", sku: "UT-MJEANS-003", stock: 35, price: 2499, compareAtPrice: 3200, tags: ["home"], images: ["https://images.unsplash.com/photo-1542272604-787c38355a5d?w=600&auto=format&fit=crop"], description: "Stretch denim slim fit jeans." },
  { i: 3,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's Jackets", brand: "Urban Threads", sku: "UT-MJACKET-004", stock: 18, price: 4499, compareAtPrice: 5500, tags: ["home"], images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop"], description: "Water-resistant bomber jacket." },
  { i: 4,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's Shorts", brand: "Urban Threads", sku: "UT-MSHORTS-005", stock: 45, price: 1299, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Chino shorts for weekend wear." },
  { i: 5,  shop: "Men's Wear", category: "Men's Clothing", subcategory: "Men's Jackets", brand: "Adidas", sku: "UT-MJACKET-006", stock: 12, price: 5999, compareAtPrice: 7500, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop"], description: "Classic track jacket with 3-stripe detailing.", flash: true },
  // Women's Wear (Floor 1)
  { i: 6,  shop: "Women's Wear", category: "Women's Clothing", subcategory: "Dresses", brand: "Urban Threads", sku: "UT-WDRESS-007", stock: 30, price: 2299, compareAtPrice: 2999, tags: ["home"], images: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop"], description: "Elegant midi dress for any occasion." },
  { i: 7,  shop: "Women's Wear", category: "Women's Clothing", subcategory: "Tops & Blouses", brand: "Urban Threads", sku: "UT-WBLOUSE-008", stock: 50, price: 1199, tags: ["home"], images: ["https://images.unsplash.com/photo-1490482218030-0c8f3e6d8b6d?w=600&auto=format&fit=crop"], description: "Silk-blend blouse with tie neckline." },
  { i: 8,  shop: "Women's Wear", category: "Women's Clothing", subcategory: "Skirts", brand: "Urban Threads", sku: "UT-WSKIRT-009", stock: 28, price: 1799, compareAtPrice: 2299, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "A-line midi skirt in seasonal print." },
  { i: 9,  shop: "Women's Wear", category: "Women's Clothing", subcategory: "Women's Jeans", brand: "DenimCo", sku: "UT-WJEANS-010", stock: 32, price: 2699, compareAtPrice: 3400, tags: ["home"], images: ["https://images.unsplash.com/photo-1542272604-787c38355a5d?w=600&auto=format&fit=crop"], description: "High-waist skinny jeans." },
  { i: 10, shop: "Women's Wear", category: "Women's Clothing", subcategory: "Women's Shorts", brand: "Urban Threads", sku: "UT-WSHORTS-011", stock: 40, price: 1099, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Linen shorts for warm days." },
  { i: 11, shop: "Women's Wear", category: "Women's Clothing", subcategory: "Dresses", brand: "Urban Threads", sku: "UT-WDRESS-012", stock: 15, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop"], description: "Cocktail dress in premium fabric.", flash: true },
  // Footwear & Bags (Floor 1)
  { i: 12, shop: "Footwear & Bags", category: "Footwear", subcategory: "Men's Shoes", brand: "Urban Threads", sku: "UT-MSHOES-013", stock: 35, price: 2499, compareAtPrice: 3200, tags: ["home"], images: ["https://images.unsplash.com/photo-1542272604-787c38355a5d?w=600&auto=format&fit=crop"], description: "Classic leather dress shoe." },
  { i: 13, shop: "Footwear & Bags", category: "Footwear", subcategory: "Women's Shoes", brand: "Urban Threads", sku: "UT-WSHOES-014", stock: 30, price: 2299, compareAtPrice: 2999, tags: ["home"], images: ["https://images.unsplash.com/photo-1542272604-787c38355a5d?w=600&auto=format&fit=crop"], description: "Elegant heel for work or evening." },
  { i: 14, shop: "Footwear & Bags", category: "Footwear", subcategory: "Sneakers", brand: "Nike", sku: "UT-SNEAKER-015", stock: 25, price: 4999, compareAtPrice: 6000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop"], description: "Everyday low-top sneaker." },
  { i: 15, shop: "Footwear & Bags", category: "Footwear", subcategory: "Sandals", brand: "Urban Threads", sku: "UT-SANDAL-016", stock: 50, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Comfortable slide sandal." },
  { i: 16, shop: "Footwear & Bags", category: "Bags & Luggage", subcategory: "Backpacks", brand: "Urban Threads", sku: "UT-BACKPACK-017", stock: 40, price: 1999, compareAtPrice: 2500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop"], description: "Durable 25L laptop backpack." },
  { i: 17, shop: "Footwear & Bags", category: "Bags & Luggage", subcategory: "Handbags", brand: "Urban Threads", sku: "UT-HANDBAG-018", stock: 22, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Structured tote for daily use." },
  // Mobile Zone (Floor 2)
  { i: 18, shop: "Mobile Zone", category: "Smartphones", subcategory: "Smartphones", brand: "Samsung", sku: "PH-SMART-019", stock: 12, price: 24999, compareAtPrice: 29999, tags: ["home"], images: ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop"], description: "Latest smartphone with triple camera." },
  { i: 19, shop: "Mobile Zone", category: "Smartphones", subcategory: "Phone Cases", brand: "Generic", sku: "PH-CASE-020", stock: 80, price: 699, tags: ["home"], images: ["https://images.unsplash.com/photo-1580974928064-f0aeef70895a?w=600&auto=format&fit=crop"], description: "Protective case with rugged design." },
  { i: 20, shop: "Mobile Zone", category: "Smartphones", subcategory: "Power Banks", brand: "Anker", sku: "PH-PWRBANK-021", stock: 60, price: 2999, compareAtPrice: 3800, tags: ["travel"], images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop"], description: "20000mAh power bank dual output." },
  { i: 21, shop: "Mobile Zone", category: "Smartphones", subcategory: "Smartphones", brand: "Apple", sku: "PH-IPHONE-022", stock: 8, price: 89999, compareAtPrice: 99999, tags: ["home"], images: ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop"], description: "Flagship phone with pro camera system." },
  { i: 22, shop: "Mobile Zone", category: "Smartphones", subcategory: "Phone Cases", brand: "Generic", sku: "PH-CASE-023", stock: 70, price: 499, tags: ["home"], images: ["https://images.unsplash.com/photo-1580974928064-f0aeef70895a?w=600&auto=format&fit=crop"], description: "Slim silicone case in multiple colours." },
  { i: 23, shop: "Mobile Zone", category: "Smartphones", subcategory: "Power Banks", brand: "Oraimo", sku: "PH-PWRBANK-024", stock: 45, price: 1999, compareAtPrice: 2500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop"], description: "Compact 10000mAh power bank.", flash: true },
  // Laptops & Computing (Floor 2)
  { i: 24, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Laptops", brand: "Apple", sku: "LP-LAPTOP-025", stock: 5, price: 134999, tags: ["work"], images: ["https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop"], description: "MacBook Air M2 13 inch all-day battery." },
  { i: 25, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Laptops", brand: "Dell", sku: "LP-LAPTOP-026", stock: 8, price: 89999, compareAtPrice: 105000, tags: ["work"], images: ["https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop"], description: "Latitude 5440 i7 business laptop." },
  { i: 26, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Monitors", brand: "Samsung", sku: "LP-MONITOR-027", stock: 10, price: 34999, compareAtPrice: 42000, tags: ["work"], images: ["https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&auto=format&fit=crop"], description: "27 inch 4K IPS monitor USB-C." },
  { i: 27, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Keyboards", brand: "Logitech", sku: "LP-KB-028", stock: 25, price: 6999, compareAtPrice: 8500, tags: ["work"], images: ["https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop"], description: "Mechanical keyboard RGB switches." },
  { i: 28, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Mice & Mice Pads", brand: "Logitech", sku: "LP-MOUSE-029", stock: 30, price: 8999, compareAtPrice: 11000, tags: ["work"], images: ["https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&auto=format&fit=crop"], description: "Wireless mouse 8K DPI silent clicks." },
  { i: 29, shop: "Laptops & Computing", category: "Laptops & Computers", subcategory: "Laptops", brand: "HP", sku: "LP-LAPTOP-030", stock: 6, price: 74999, compareAtPrice: 89999, tags: ["gaming"], images: ["https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&auto=format&fit=crop"], description: "Gaming laptop RTX 3050 16GB.", flash: true },
  // TV & Audio (Floor 2)
  { i: 30, shop: "TV & Audio", category: "TV & Audio", subcategory: "Televisions", brand: "Samsung", sku: "TV-TV-031", stock: 12, price: 64999, compareAtPrice: 79999, tags: ["home"], images: ["https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&auto=format&fit=crop"], description: "55 inch 4K smart TV." },
  { i: 31, shop: "TV & Audio", category: "TV & Audio", subcategory: "Televisions", brand: "LG", sku: "TV-TV-032", stock: 3, price: 189999, compareAtPrice: 220000, tags: ["home"], images: ["https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&auto=format&fit=crop"], description: "65 inch OLED C3 Dolby Vision." },
  { i: 32, shop: "TV & Audio", category: "TV & Audio", subcategory: "Soundbars", brand: "Sony", sku: "TV-SOUNDBAR-033", stock: 14, price: 18999, compareAtPrice: 24000, tags: ["home"], images: ["https://images.unsplash.com/photo-1461151304267-38535e780c79?w=600&auto=format&fit=crop"], description: "Compact soundbar with wireless sub." },
  { i: 33, shop: "TV & Audio", category: "TV & Audio", subcategory: "Headphones", brand: "Sony", sku: "TV-HEADPHONES-034", stock: 10, price: 22999, compareAtPrice: 28000, tags: ["work"], images: ["https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=600&auto=format&fit=crop"], description: "WH-1000XM5 noise cancelling." },
  { i: 34, shop: "TV & Audio", category: "TV & Audio", subcategory: "Bluetooth Speakers", brand: "JBL", sku: "TV-SPEAKER-035", stock: 18, price: 9999, compareAtPrice: 12500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&auto=format&fit=crop"], description: "Charge 5 portable speaker 20hr." },
  { i: 35, shop: "TV & Audio", category: "TV & Audio", subcategory: "Headphones", brand: "Bose", sku: "TV-HEADPHONES-036", stock: 7, price: 18999, compareAtPrice: 22000, tags: ["work"], images: ["https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop"], description: "QuietComfort 45 ANC headphones." },
  // Smart Home & Accessories (Floor 2)
  { i: 36, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Smart Plugs & Bulbs", brand: "Philips", sku: "SH-BULB-037", stock: 15, price: 12999, compareAtPrice: 15000, tags: ["home"], images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop"], description: "Hue starter kit 4 bulbs with bridge." },
  { i: 37, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Security Cameras", brand: "Xiaomi", sku: "SH-CAMERA-038", stock: 30, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop"], description: "360 home security camera night vision." },
  { i: 38, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Smart Plugs & Bulbs", brand: "Generic", sku: "SH-PLUG-039", stock: 40, price: 2999, compareAtPrice: 4000, tags: ["home"], images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop"], description: "WiFi smart plugs 4-pack energy monitor." },
  { i: 39, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Smartwatches", brand: "Samsung", sku: "SH-WATCH-040", stock: 12, price: 9999, compareAtPrice: 12000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&auto=format&fit=crop"], description: "Galaxy Watch fitness tracking." },
  { i: 40, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Chargers & Cables", brand: "Anker", sku: "SH-CHARGER-041", stock: 60, price: 2499, compareAtPrice: 3200, tags: ["travel"], images: ["https://images.unsplash.com/photo-1605464315542-bda3e2f4e605?w=600&auto=format&fit=crop"], description: "65W GaN charger 3-port compact." },
  { i: 41, shop: "Smart Home & Accessories", category: "Smart Home & Accessories", subcategory: "Chargers & Cables", brand: "Oraimo", sku: "SH-CABLE-042", stock: 70, price: 1299, tags: ["home"], images: ["https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop"], description: "15W wireless charging pad Qi." },
  // Skincare & Hair (Floor 3)
  { i: 42, shop: "Skincare & Hair", category: "Skincare", subcategory: "Face Cream & Oil", brand: "Generic", sku: "SK-FACE-043", stock: 40, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "Moisturising face cream SPF 30." },
  { i: 43, shop: "Skincare & Hair", category: "Skincare", subcategory: "Face Wash", brand: "Generic", sku: "SK-FACE-044", stock: 55, price: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "Gentle daily face wash." },
  { i: 44, shop: "Skincare & Hair", category: "Hair Care", subcategory: "Hair Shampoo", brand: "Generic", sku: "SK-SHAMPOO-045", stock: 45, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "Nourishing shampoo for all hair types." },
  { i: 45, shop: "Skincare & Hair", category: "Hair Care", subcategory: "Hair Conditioner", brand: "Generic", sku: "SK-COND-046", stock: 40, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "Smooth finish conditioner." },
  { i: 46, shop: "Skincare & Hair", category: "Hair Care", subcategory: "Hair Dryers", brand: "Generic", sku: "SK-DRYER-047", stock: 15, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "Ionic hair dryer with diffuser." },
  { i: 47, shop: "Skincare & Hair", category: "Skincare", subcategory: "Sunscreen", brand: "Generic", sku: "SK-SUN-048", stock: 60, price: 699, tags: ["travel"], images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop"], description: "SPF 50 lightweight sunscreen." },
  // Fragrance & Cosmetics (Floor 3)
  { i: 48, shop: "Fragrance & Cosmetics", category: "Fragrance", subcategory: "Perfume", brand: "Generic", sku: "FR-PERFUME-049", stock: 25, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Eau de parfum 50ml for her." },
  { i: 49, shop: "Fragrance & Cosmetics", category: "Fragrance", subcategory: "Cologne", brand: "Generic", sku: "FR-COLOGNE-050", stock: 22, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Fresh cologne 100ml for him." },
  { i: 50, shop: "Fragrance & Cosmetics", category: "Fragrance", subcategory: "Body Mist", brand: "Generic", sku: "FR-MIST-051", stock: 50, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Daily body mist tropical scent." },
  { i: 51, shop: "Fragrance & Cosmetics", category: "Makeup & Cosmetics", subcategory: "Foundation", brand: "Generic", sku: "MX-FOUND-052", stock: 35, price: 1299, compareAtPrice: 1700, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Long wear liquid foundation." },
  { i: 52, shop: "Fragrance & Cosmetics", category: "Makeup & Cosmetics", subcategory: "Lipstick", brand: "Generic", sku: "MX-LIP-053", stock: 45, price: 899, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "Creamy matte lipstick." },
  { i: 53, shop: "Fragrance & Cosmetics", category: "Makeup & Cosmetics", subcategory: "Eyeshadow Palettes", brand: "Generic", sku: "MX-EYESHADOW-054", stock: 28, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&auto=format&fit=crop"], description: "12 shade eyeshadow palette." },
  // Personal Care (Floor 3)
  { i: 54, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Electric Toothbrushes", brand: "Generic", sku: "PC-TOOTH-055", stock: 30, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Sonic electric toothbrush 2 heads." },
  { i: 55, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Shavers & Trimmers", brand: "Generic", sku: "PC-SHAVER-056", stock: 25, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Men rechargeable shaver trimmer." },
  { i: 56, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Massagers", brand: "Generic", sku: "PC-MASSAGE-057", stock: 18, price: 2499, compareAtPrice: 3200, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Handheld massager 5 speeds." },
  { i: 57, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Electric Toothbrushes", brand: "Generic", sku: "PC-TOOTH-058", stock: 35, price: 1299, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Basic electric toothbrush travel." },
  { i: 58, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Shavers & Trimmers", brand: "Generic", sku: "PC-TRIMMER-059", stock: 40, price: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Precision facial trimmer kit." },
  { i: 59, shop: "Personal Care", category: "Personal Care Appliances", subcategory: "Massagers", brand: "Generic", sku: "PC-MASSAGE-060", stock: 12, price: 3999, compareAtPrice: 5000, tags: ["home"], images: ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop"], description: "Full body percussion massager.", flash: true },
  // Furniture (Floor 4)
  { i: 60, shop: "Furniture", category: "Furniture", subcategory: "Sofas", brand: "Generic", sku: "FN-SOFA-061", stock: 6, price: 24999, compareAtPrice: 32000, tags: ["home"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "3 seater fabric sofa with chaise." },
  { i: 61, shop: "Furniture", category: "Furniture", subcategory: "Beds & Mattresses", brand: "Generic", sku: "FN-BED-062", stock: 5, price: 18999, compareAtPrice: 24000, tags: ["home"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "King size bed frame with headboard." },
  { i: 62, shop: "Furniture", category: "Furniture", subcategory: "Dining Sets", brand: "Generic", sku: "FN-DINING-063", stock: 4, price: 14999, compareAtPrice: 19000, tags: ["home"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "6 seater dining table and chairs." },
  { i: 63, shop: "Furniture", category: "Furniture", subcategory: "Office Chairs", brand: "Generic", sku: "FN-CHAIR-064", stock: 10, price: 8999, compareAtPrice: 11000, tags: ["work"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "Ergonomic office chair lumbar support." },
  { i: 64, shop: "Furniture", category: "Furniture", subcategory: "Sofas", brand: "Generic", sku: "FN-SOFA-065", stock: 8, price: 12999, compareAtPrice: 16000, tags: ["home"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "2 seater loveseat compact." },
  { i: 65, shop: "Furniture", category: "Furniture", subcategory: "Beds & Mattresses", brand: "Generic", sku: "FN-MATTRESS-066", stock: 12, price: 9999, compareAtPrice: 12000, tags: ["home"], images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop"], description: "Memory foam mattress queen." },
  // Kitchen & Appliances (Floor 4)
  { i: 66, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Cookers", brand: "Generic", sku: "KT-COOKER-067", stock: 10, price: 4999, compareAtPrice: 6500, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Electric pressure cooker 6L." },
  { i: 67, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Blenders", brand: "Generic", sku: "KT-BLENDER-068", stock: 15, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "High speed blender 1.5L." },
  { i: 68, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Kettles", brand: "Generic", sku: "KT-KETTLE-069", stock: 25, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Electric kettle 1.7L boil dry safe." },
  { i: 69, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Food Storage", brand: "Generic", sku: "KT-STORAGE-070", stock: 40, price: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Airtight food storage set 6 piece." },
  { i: 70, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Cookers", brand: "Generic", sku: "KT-COOKER-071", stock: 8, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Mini rice cooker 3L single serve." },
  { i: 71, shop: "Kitchen & Appliances", category: "Kitchen Appliances", subcategory: "Blenders", brand: "Generic", sku: "KT-BLENDER-072", stock: 12, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Personal blender smoothie maker." },
  // Home Decor & Bedding (Floor 4)
  { i: 72, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Curtains & Blinds", brand: "Generic", sku: "HD-CURTAIN-073", stock: 20, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Blackout curtain pair 2 panels." },
  { i: 73, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Rugs & Carpets", brand: "Generic", sku: "HD-RUG-074", stock: 15, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Soft area rug 160x230cm." },
  { i: 74, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Bedding Sets", brand: "Generic", sku: "HD-BEDDING-075", stock: 25, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Cotton bedding set 4 piece." },
  { i: 75, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Lighting", brand: "Generic", sku: "HD-LIGHT-076", stock: 18, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Modern LED floor lamp." },
  { i: 76, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Rugs & Carpets", brand: "Generic", sku: "HD-RUG-077", stock: 30, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Door mat set of 2." },
  { i: 77, shop: "Home Decor & Bedding", category: "Home Decor & Bedding", subcategory: "Bedding Sets", brand: "Generic", sku: "HD-BEDDING-078", stock: 22, price: 1799, compareAtPrice: 2299, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Duvet cover set 3 piece." },
  // Pantry Staples (Floor 5)
  { i: 78, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Cooking Oil", brand: "Generic", sku: "FD-OIL-079", stock: 40, price: 499, compareAtPrice: 650, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Vegetable cooking oil 2L." },
  { i: 79, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Tea & Coffee", brand: "Generic", sku: "FD-TEA-080", stock: 50, price: 399, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Black tea 500g pack." },
  { i: 80, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Packaged Foods", brand: "Generic", sku: "FD-PACK-081", stock: 45, price: 299, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Instant noodles 4 pack." },
  { i: 81, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Pasta & Rice", brand: "Generic", sku: "FD-PASTA-082", stock: 35, price: 199, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Pasta mix 500g." },
  { i: 82, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Tea & Coffee", brand: "Generic", sku: "FD-COFFEE-083", stock: 30, price: 599, compareAtPrice: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Ground coffee 250g." },
  { i: 83, shop: "Pantry Staples", category: "Pantry Staples", subcategory: "Cooking Oil", brand: "Generic", sku: "FD-OIL-084", stock: 25, price: 299, tags: ["home"], images: ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop"], description: "Sunflower oil 1L." },
  // Fresh & Dairy (Floor 5)
  { i: 84, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Fresh Fruits", brand: "Generic", sku: "FD-FRUIT-085", stock: 30, price: 399, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Fresh banana bunch." },
  { i: 85, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Fresh Vegetables", brand: "Generic", sku: "FD-VEG-086", stock: 35, price: 299, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Mixed vegetables 1kg." },
  { i: 86, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Milk & Yogurt", brand: "Generic", sku: "FD-MILK-087", stock: 40, price: 199, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Fresh milk 1L." },
  { i: 87, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Bread & Bakery", brand: "Generic", sku: "FD-BREAD-088", stock: 25, price: 99, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Fresh bread loaf." },
  { i: 88, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Milk & Yogurt", brand: "Generic", sku: "FD-YOGURT-089", stock: 30, price: 149, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Plain yogurt 500g." },
  { i: 89, shop: "Fresh & Dairy", category: "Fresh & Dairy", subcategory: "Fresh Fruits", brand: "Generic", sku: "FD-FRUIT-090", stock: 28, price: 499, compareAtPrice: 650, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Seasonal fruit basket." },
  // Drinks & Snacks (Floor 5)
  { i: 90, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Soft Drinks", brand: "Generic", sku: "DR-SOFT-091", stock: 60, price: 99, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Cola 500ml bottle." },
  { i: 91, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Bottled Water", brand: "Generic", sku: "DR-WATER-092", stock: 80, price: 59, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Pure water 500ml pack of 6." },
  { i: 92, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Chips & Crisps", brand: "Generic", sku: "DR-CHIPS-093", stock: 45, price: 149, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Potato crisps 150g." },
  { i: 93, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Biscuits & Cookies", brand: "Generic", sku: "DR-BISCUIT-094", stock: 40, price: 99, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Cream biscuits 200g." },
  { i: 94, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Soft Drinks", brand: "Generic", sku: "DR-SOFT-095", stock: 50, price: 89, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Lemon soda 330ml." },
  { i: 95, shop: "Drinks & Snacks", category: "Drinks & Snacks", subcategory: "Chips & Crisps", brand: "Generic", sku: "DR-CHIPS-096", stock: 35, price: 199, compareAtPrice: 250, tags: ["home"], images: ["https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=600&auto=format&fit=crop"], description: "Maize snacks 200g." },
  // Fitness Gear (Floor 6)
  { i: 96, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Dumbbells & Weights", brand: "Generic", sku: "SP-DUMBBELL-097", stock: 10, price: 8999, compareAtPrice: 11000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Adjustable dumbbells 24kg." },
  { i: 97, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Yoga Mats", brand: "Generic", sku: "SP-YOGA-098", stock: 50, price: 999, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Non slip yoga mat 6mm." },
  { i: 98, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Resistance Bands", brand: "Generic", sku: "SP-BANDS-099", stock: 60, price: 1499, compareAtPrice: 2000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Resistance bands 5 level set." },
  { i: 99, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Treadmills", brand: "Generic", sku: "SP-TREAD-100", stock: 4, price: 24999, compareAtPrice: 32000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Folding treadmill home gym." },
  { i: 100, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Dumbbells & Weights", brand: "Generic", sku: "SP-DUMBBELL-101", stock: 30, price: 1999, compareAtPrice: 2500, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Neoprene dumbbell pair 5kg." },
  { i: 101, shop: "Fitness Gear", category: "Fitness Equipment", subcategory: "Yoga Mats", brand: "Generic", sku: "SP-YOGA-102", stock: 40, price: 1299, compareAtPrice: 1700, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop"], description: "Yoga mat with carrying strap." },
  // Sports & Camping (Floor 6)
  { i: 102, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Team Sports Kits", brand: "Generic", sku: "SP-KIT-103", stock: 20, price: 1999, compareAtPrice: 2500, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "Football kit jersey and shorts." },
  { i: 103, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Camping Tents", brand: "Generic", sku: "SP-TENT-104", stock: 6, price: 8999, compareAtPrice: 11000, tags: ["travel"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "4 person camping tent." },
  { i: 104, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Flashlights", brand: "Generic", sku: "SP-LIGHT-105", stock: 40, price: 799, tags: ["travel"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "LED rechargeable flashlight." },
  { i: 105, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Sports Balls", brand: "Generic", sku: "SP-BALL-106", stock: 35, price: 999, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "Official size football." },
  { i: 106, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Camping Tents", brand: "Generic", sku: "SP-TENT-107", stock: 5, price: 5999, compareAtPrice: 7500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "2 person backpacking tent." },
  { i: 107, shop: "Sports & Camping", category: "Sports & Outdoor Gear", subcategory: "Flashlights", brand: "Generic", sku: "SP-LIGHT-108", stock: 30, price: 499, tags: ["travel"], images: ["https://images.unsplash.com/photo-1551524164-6ca5c37b8b48?w=600&auto=format&fit=crop"], description: "Keychain LED torch." },
  // Cycling & Activewear (Floor 6)
  { i: 108, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Bicycles", brand: "Generic", sku: "CY-BIKE-109", stock: 4, price: 14999, compareAtPrice: 19000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop"], description: "Adult mountain bicycle 26 inch." },
  { i: 109, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Helmets", brand: "Generic", sku: "CY-HELMET-110", stock: 25, price: 1499, compareAtPrice: 1999, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop"], description: "Bicycle helmet adjustable." },
  { i: 110, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Running Shoes", brand: "Nike", sku: "CY-RUNNING-111", stock: 15, price: 12999, compareAtPrice: 16000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop"], description: "Air Max running shoes." },
  { i: 111, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Activewear", brand: "Adidas", sku: "CY-ACTIVE-112", stock: 20, price: 1999, compareAtPrice: 2500, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop"], description: "Men running shorts quick dry." },
  { i: 112, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Bicycles", brand: "Generic", sku: "CY-BIKE-113", stock: 3, price: 9999, compareAtPrice: 12000, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop"], description: "Kids bicycle 20 inch." },
  { i: 113, shop: "Cycling & Activewear", category: "Cycling & Activewear", subcategory: "Helmets", brand: "Generic", sku: "CY-HELMET-114", stock: 30, price: 999, tags: ["fitness"], images: ["https://images.unsplash.com/photo-1558326567-98ae2405596b?w=600&auto=format&fit=crop"], description: "Kids safety helmet." },
  // Toys (Floor 7)
  { i: 114, shop: "Toys", category: "Toys", subcategory: "Educational Toys", brand: "Generic", sku: "TY-EDU-115", stock: 30, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "Building block learning set." },
  { i: 115, shop: "Toys", category: "Toys", subcategory: "Board Games", brand: "Generic", sku: "TY-GAME-116", stock: 25, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "Family board game night." },
  { i: 116, shop: "Toys", category: "Toys", subcategory: "Action Figures", brand: "Generic", sku: "TY-ACTION-117", stock: 40, price: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "Superhero action figure pack." },
  { i: 117, shop: "Toys", category: "Toys", subcategory: "Plush Toys", brand: "Generic", sku: "TY-PLUSH-118", stock: 50, price: 699, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "Soft teddy bear 30cm." },
  { i: 118, shop: "Toys", category: "Toys", subcategory: "Educational Toys", brand: "Generic", sku: "TY-EDU-119", stock: 22, price: 2499, compareAtPrice: 3200, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "STEM science kit." },
  { i: 119, shop: "Toys", category: "Toys", subcategory: "Board Games", brand: "Generic", sku: "TY-GAME-120", stock: 18, price: 1299, compareAtPrice: 1700, tags: ["home"], images: ["https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop"], description: "Strategy board game 2 players." },
  // Baby & Nursery (Floor 7)
  { i: 120, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Baby Bottles & Feeding", brand: "Generic", sku: "BB-BOTTLE-121", stock: 40, price: 499, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Anti colic baby bottle 250ml." },
  { i: 121, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Strollers & Car Seats", brand: "Generic", sku: "BB-STROLLER-122", stock: 6, price: 8999, compareAtPrice: 11000, tags: ["travel"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Umbrella stroller lightweight." },
  { i: 122, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Baby Care", brand: "Generic", sku: "BB-CARE-123", stock: 35, price: 399, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Baby wipes 80 pack." },
  { i: 123, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Nursery Furniture", brand: "Generic", sku: "BB-NURSERY-124", stock: 5, price: 6999, compareAtPrice: 8500, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Baby crib with mattress." },
  { i: 124, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Baby Bottles & Feeding", brand: "Generic", sku: "BB-BOTTLE-125", stock: 30, price: 299, tags: ["home"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Baby bottle steriliser." },
  { i: 125, shop: "Baby & Nursery", category: "Baby & Nursery", subcategory: "Strollers & Car Seats", brand: "Generic", sku: "BB-STROLLER-126", stock: 4, price: 14999, compareAtPrice: 19000, tags: ["travel"], images: ["https://images.unsplash.com/photo-1556911220-bff91886a562?w=600&auto=format&fit=crop"], description: "Travel system stroller car seat." },
  // Kids Furniture & Learning (Floor 7)
  { i: 126, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "Kids Desks & Chairs", brand: "Generic", sku: "KD-DESK-127", stock: 8, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Adjustable kids study desk." },
  { i: 127, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "School Bags", brand: "Generic", sku: "KD-BAG-128", stock: 30, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Ergonomic school backpack." },
  { i: 128, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "Learning Tablets", brand: "Generic", sku: "KD-TABLET-129", stock: 10, price: 4999, compareAtPrice: 6500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Kids educational tablet 7 inch." },
  { i: 129, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "Kids Books", brand: "Generic", sku: "KD-BOOK-130", stock: 40, price: 399, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Children picture book." },
  { i: 130, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "Kids Desks & Chairs", brand: "Generic", sku: "KD-CHAIR-131", stock: 12, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Kids study chair height adjust." },
  { i: 131, shop: "Kids Furniture & Learning", category: "Kids Furniture & Learning", subcategory: "School Bags", brand: "Generic", sku: "KD-BAG-132", stock: 25, price: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Primary school bag cartoon print." },
  // Jewellery (Floor 8)
  { i: 132, shop: "Jewellery", category: "Jewellery", subcategory: "Rings", brand: "Generic", sku: "JW-RING-133", stock: 15, price: 2999, compareAtPrice: 3800, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Sterling silver band ring." },
  { i: 133, shop: "Jewellery", category: "Jewellery", subcategory: "Necklaces", brand: "Generic", sku: "JW-NECK-134", stock: 12, price: 2499, compareAtPrice: 3200, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Delicate pendant necklace." },
  { i: 134, shop: "Jewellery", category: "Jewellery", subcategory: "Earrings", brand: "Generic", sku: "JW-EARRING-135", stock: 30, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Hoop earrings pair." },
  { i: 135, shop: "Jewellery", category: "Jewellery", subcategory: "Bracelets", brand: "Generic", sku: "JW-BRACELET-136", stock: 18, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Chain bracelet charm." },
  { i: 136, shop: "Jewellery", category: "Jewellery", subcategory: "Rings", brand: "Generic", sku: "JW-RING-137", stock: 8, price: 4999, compareAtPrice: 6500, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Gold plated statement ring." },
  { i: 137, shop: "Jewellery", category: "Jewellery", subcategory: "Necklaces", brand: "Generic", sku: "JW-NECK-138", stock: 10, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop"], description: "Layered necklace set." },
  // Watches & Sunglasses (Floor 8)
  { i: 138, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Wristwatches", brand: "Generic", sku: "WS-WATCH-139", stock: 12, price: 4999, compareAtPrice: 6500, tags: ["home"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "Analog wristwatch leather strap." },
  { i: 139, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Sunglasses", brand: "Generic", sku: "WS-SUNGLASSES-140", stock: 25, price: 1499, compareAtPrice: 1999, tags: ["travel"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "UV400 polarised sunglasses." },
  { i: 140, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Belts", brand: "Generic", sku: "WS-BELT-141", stock: 30, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "Genuine leather belt." },
  { i: 141, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Hats", brand: "Generic", sku: "WS-HAT-142", stock: 20, price: 799, tags: ["travel"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "Baseball cap cotton." },
  { i: 142, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Wristwatches", brand: "Generic", sku: "WS-WATCH-143", stock: 6, price: 3499, compareAtPrice: 4500, tags: ["home"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "Sport digital wristwatch." },
  { i: 143, shop: "Watches & Sunglasses", category: "Watches & Accessories", subcategory: "Sunglasses", brand: "Generic", sku: "WS-SUNGLASSES-144", stock: 18, price: 1999, compareAtPrice: 2500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1524538535462-2f1bce0d8d4e?w=600&auto=format&fit=crop"], description: "Aviator sunglasses." },
  // Books & Stationery (Floor 9)
  { i: 144, shop: "Books & Stationery", category: "Books", subcategory: "Novels", brand: "Generic", sku: "BK-NOVEL-145", stock: 40, price: 499, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "Bestselling novel paperback." },
  { i: 145, shop: "Books & Stationery", category: "Stationery & Supplies", subcategory: "Notebooks", brand: "Generic", sku: "ST-NOTEBOOK-146", stock: 50, price: 399, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "A5 hardcover notebook 200 pages." },
  { i: 146, shop: "Books & Stationery", category: "Stationery & Supplies", subcategory: "Pens & Pencils", brand: "Generic", sku: "ST-PEN-147", stock: 60, price: 299, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "Ballpoint pen 12 pack." },
  { i: 147, shop: "Books & Stationery", category: "Stationery & Supplies", subcategory: "School Supplies", brand: "Generic", sku: "ST-SCHOOL-148", stock: 35, price: 599, compareAtPrice: 799, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "School supply starter set." },
  { i: 148, shop: "Books & Stationery", category: "Books", subcategory: "Non-Fiction", brand: "Generic", sku: "BK-NONFICTION-149", stock: 25, price: 699, compareAtPrice: 899, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "Personal development hardcover." },
  { i: 149, shop: "Books & Stationery", category: "Books", subcategory: "Children's Books", brand: "Generic", sku: "BK-KIDS-150", stock: 30, price: 349, tags: ["home"], images: ["https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop"], description: "Illustrated children story book." },
  // Hobbies & Gaming (Floor 9)
  { i: 150, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Musical Instruments", brand: "Generic", sku: "HO-GUITAR-151", stock: 6, price: 4999, compareAtPrice: 6500, tags: ["home"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "Acoustic guitar beginner 41 inch." },
  { i: 151, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Board Games", brand: "Generic", sku: "HO-GAME-152", stock: 20, price: 1499, compareAtPrice: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "Family trivia board game." },
  { i: 152, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Gaming Gear", brand: "Generic", sku: "HO-GAMING-153", stock: 15, price: 2499, compareAtPrice: 3200, tags: ["gaming"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "Wireless gaming mouse RGB." },
  { i: 153, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Craft Kits", brand: "Generic", sku: "HO-CRAFT-154", stock: 25, price: 699, tags: ["home"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "DIY craft kit set." },
  { i: 154, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Musical Instruments", brand: "Generic", sku: "HO-UKULELE-155", stock: 12, price: 1999, compareAtPrice: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "Ukulele 23 inch with strap." },
  { i: 155, shop: "Hobbies & Gaming", category: "Hobbies & Gaming", subcategory: "Gaming Gear", brand: "Generic", sku: "HO-GAMING-156", stock: 10, price: 3999, compareAtPrice: 5000, tags: ["gaming"], images: ["https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop"], description: "Mechanical gaming keyboard RGB." },
  // Gift Cards & Gift Wrap (Floor 10)
  { i: 156, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "E-Gift Cards", brand: "Azard Stores", sku: "GV-GIFT-157", stock: 999, price: 1000, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "1000 KSh e-gift card delivered by email." },
  { i: 157, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "E-Gift Cards", brand: "Azard Stores", sku: "GV-GIFT-158", stock: 999, price: 2500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "2500 KSh e-gift card delivered by email." },
  { i: 158, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "Gift Wrapping Service", brand: "Azard Stores", sku: "GV-WRAP-159", stock: 999, price: 500, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Premium gift wrapping service per item." },
  { i: 159, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "E-Gift Cards", brand: "Azard Stores", sku: "GV-GIFT-160", stock: 999, price: 5000, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "5000 KSh e-gift card delivered by email." },
  { i: 160, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "E-Gift Cards", brand: "Azard Stores", sku: "GV-GIFT-161", stock: 999, price: 10000, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "10000 KSh e-gift card delivered by email." },
  { i: 161, shop: "Gift Cards & Gift Wrap", category: "Gift Cards & Gift Wrap", subcategory: "Gift Wrapping Service", brand: "Azard Stores", sku: "GV-WRAP-162", stock: 999, price: 300, tags: ["home"], images: ["https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop"], description: "Standard gift wrapping service per item." },
  // Repairs & Installation (Floor 10)
  { i: 162, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Device Repair", brand: "Azard Stores", sku: "SV-REPAIR-163", stock: 999, price: 1500, tags: ["work"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "Smartphone screen repair service." },
  { i: 163, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Device Repair", brand: "Azard Stores", sku: "SV-REPAIR-164", stock: 999, price: 2500, tags: ["work"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "Laptop repair diagnostic service." },
  { i: 164, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Home Appliance Installation", brand: "Azard Stores", sku: "SV-INSTALL-165", stock: 999, price: 2000, tags: ["home"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "TV wall mount installation service." },
  { i: 165, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Tech Support", brand: "Azard Stores", sku: "SV-SUPPORT-166", stock: 999, price: 1000, tags: ["work"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "In-home tech setup support hourly." },
  { i: 166, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Device Repair", brand: "Azard Stores", sku: "SV-REPAIR-167", stock: 999, price: 3500, tags: ["work"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "Tablet repair service." },
  { i: 167, shop: "Repairs & Installation", category: "Repairs & Installation", subcategory: "Home Appliance Installation", brand: "Azard Stores", sku: "SV-INSTALL-168", stock: 999, price: 1500, tags: ["home"], images: ["https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop"], description: "Air conditioner installation service." },
  // Trade-in & Subscriptions (Floor 10)
  { i: 168, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Device Trade-In", brand: "Azard Stores", sku: "SV-TRADE-169", stock: 999, price: 1, tags: ["home"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Smartphone trade-in valuation service." },
  { i: 169, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Device Care Subscriptions", brand: "Azard Stores", sku: "SV-SUB-170", stock: 999, price: 999, tags: ["home"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Phone care subscription monthly." },
  { i: 170, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Experience Vouchers", brand: "Azard Stores", sku: "SV-VOUCHER-171", stock: 999, price: 1500, tags: ["travel"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Experience voucher 1500 KSh." },
  { i: 171, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Device Trade-In", brand: "Azard Stores", sku: "SV-TRADE-172", stock: 999, price: 1, tags: ["work"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Laptop trade-in valuation service." },
  { i: 172, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Device Care Subscriptions", brand: "Azard Stores", sku: "SV-SUB-173", stock: 999, price: 1999, tags: ["home"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Laptop care subscription monthly." },
  { i: 173, shop: "Trade-in & Subscriptions", category: "Trade-in & Subscriptions", subcategory: "Experience Vouchers", brand: "Azard Stores", sku: "SV-VOUCHER-174", stock: 999, price: 3000, tags: ["travel"], images: ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop"], description: "Experience voucher 3000 KSh." },
];

async function seed() {
  if (!process.argv.includes("--confirm-reset")) {
    throw new Error("This seed script deletes existing floors, shops, products and categories. Re-run with --confirm-reset only if you intend to replace that catalog.");
  }
  await connectDB();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@azardstores.co.ke").trim().toLowerCase();
  let owner = await User.findOne({ email: adminEmail });
  if (!owner && (!process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD.length < 12)) {
    throw new Error("Set SEED_ADMIN_PASSWORD to a unique password of at least 12 characters before creating the seeded admin.");
  }

  console.log("Clearing existing mall data...");
  await Promise.all([Floor.deleteMany(), Shop.deleteMany(), Product.deleteMany(), Category.deleteMany()]);

  console.log("Creating mall owner/admin...");
  if (!owner) {
    owner = await User.create({
      name: "Azard Stores Owner",
      email: adminEmail,
      password: process.env.SEED_ADMIN_PASSWORD,
      role: "admin",
    });
  }

  console.log("Creating managed category taxonomy...");
  const categories = await Category.insertMany(CATEGORY_TREE.map((c) => ({
    name: c.name,
    subcategories: c.subcategories.map((s) => ({ name: s })),
  })));

  console.log("Resolving managed brands...");
  const brands = await Brand.find().select("_id name");
  const brandsByName = new Map();
  for (const brand of brands) {
    const key = brand.name.trim().toLocaleLowerCase();
    const matches = brandsByName.get(key) || [];
    matches.push(brand);
    brandsByName.set(key, matches);
  }
  const seedBrandNames = [...new Set(PRODUCTS.map((product) => String(product.brand || "").trim()).filter(Boolean))];
  for (const name of seedBrandNames) {
    const key = name.toLocaleLowerCase();
    const matches = brandsByName.get(key) || [];
    if (matches.length > 1) throw new Error(`Seed brand "${name}" matches multiple managed records.`);
    if (!matches.length) {
      const brand = await Brand.create({ name });
      brandsByName.set(key, [brand]);
    }
  }

  console.log("Creating floors...");
  const floors = await Floor.insertMany(FLOORS);
  const f = Object.fromEntries(floors.map((fl) => [fl.floorNumber, fl]));

  console.log("Creating shops...");
  const shops = await Shop.insertMany(SHOPS.map((sh) => ({
    shopNumber: sh.shopNumber,
    name: sh.name,
    floor: f[sh.floor]._id,
    description: sh.description,
    banner: sh.banner,
    owner: owner._id,
    status: sh.status,
  })));
  const s = Object.fromEntries(shops.map((sh) => [sh.name, sh]));

  console.log("Creating products...");
  const docs = PRODUCTS.map((p) => {
    const category = categories.find((entry) => entry.name.toLowerCase() === p.category.toLowerCase());
    const subcategory = category?.subcategories.find((entry) => entry.name.toLowerCase() === p.subcategory.toLowerCase());
    if (!category || !subcategory) {
      throw new Error(`Seed product taxonomy is not managed: ${p.category} / ${p.subcategory}`);
    }
    // Products in the seed array are described by category/subcategory and a
    // human description; build a customer-facing name from brand + subcategory
    // when one is not explicitly supplied, dropping the placeholder "Generic"
    // brand so names read naturally (e.g. "Samsung smartphones").
    let name = String(p.name || "").trim();
    if (!name) {
      const sub = String(p.subcategory || "").trim();
      const brand = String(p.brand || "").trim();
      name = brand && brand !== "Generic" ? `${brand} ${sub}` : sub;
    }
    const shortName = name.length > 72 ? name.slice(0, 69).trimEnd() + "..." : name;
    return {
      name: shortName,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice || null,
      shop: s[p.shop]._id,
      categoryId: category._id,
      subcategoryId: subcategory._id,
      category: p.category,
      subcategory: p.subcategory,
      brandId: brandsByName.get(String(p.brand || "").trim().toLocaleLowerCase())?.[0]?._id || null,
      brand: brandsByName.get(String(p.brand || "").trim().toLocaleLowerCase())?.[0]?.name || "",
      stock: p.stock,
      sku: p.sku,
      badge: badge(p.i),
      isFlashSale: p.flash,
      flashSaleEndsAt: p.flash ? fs(r(12, 48)) : undefined,
      purposeTags: p.tags,
      images: p.images,
    };
  });
  await Product.insertMany(docs);

  console.log("Mall seed complete!");
  console.log(`   Floors: ${floors.length} | Shops: ${shops.length} | Products: ${docs.length} | Categories: ${CATEGORY_TREE.length}`);
  console.log(`   Admin account: ${adminEmail}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });