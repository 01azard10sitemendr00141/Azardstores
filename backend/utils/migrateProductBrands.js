require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Brand = require("../models/Brand");
const Product = require("../models/Product");

function findName(brands, name) {
  const normalized = String(name || "").trim().toLocaleLowerCase();
  const matches = brands.filter((brand) => brand.name.trim().toLocaleLowerCase() === normalized);
  return matches.length === 1 ? matches[0] : null;
}

async function migrateProductBrands({ apply = false } = {}) {
  const [brands, products] = await Promise.all([
    Brand.find().select("name").lean(),
    Product.find().select("brandId brand").lean(),
  ]);
  const brandsById = new Map(brands.map((brand) => [String(brand._id), brand]));
  const brandsByName = new Map();
  for (const brand of brands) {
    const key = brand.name.trim().toLocaleLowerCase();
    brandsByName.set(key, [...(brandsByName.get(key) || []), brand]);
  }
  const brandsToCreate = new Map();
  const planned = [];
  const unmatched = [];
  let alreadyLinked = 0;
  let unbranded = 0;

  for (const product of products) {
    let brand = product.brandId ? brandsById.get(String(product.brandId)) : null;
    if (!product.brand && !product.brandId) {
      unbranded += 1;
      continue;
    }
    if (!brand && product.brand) {
      const key = product.brand.trim().toLocaleLowerCase();
      const matches = brandsByName.get(key) || [];
      if (matches.length > 1) {
        unmatched.push({ productId: String(product._id), brand: product.brand, reason: "Brand name matches multiple managed records." });
        continue;
      }
      if (matches.length === 1) brand = matches[0];
      else if (product.brand.trim().length <= 100) {
        if (!brandsToCreate.has(key)) brandsToCreate.set(key, product.brand.trim());
        planned.push({ product, brandNameKey: key });
        continue;
      } else {
        unmatched.push({ productId: String(product._id), brand: product.brand, reason: "Brand name exceeds the 100-character managed-brand limit." });
        continue;
      }
    }
    if (!brand) {
      unmatched.push({ productId: String(product._id), brand: product.brand || "", reason: "Brand reference has no managed-list match." });
      continue;
    }

    planned.push({ product, brand });
  }

  if (apply) {
    for (const [key, name] of brandsToCreate) {
      const created = await Brand.create({ name });
      brandsByName.set(key, [created]);
    }
  }

  const operations = [];
  for (const entry of planned) {
    const brand = entry.brand || brandsByName.get(entry.brandNameKey)?.[0] || {
      _id: null,
      name: brandsToCreate.get(entry.brandNameKey),
    };
    const set = {};
    if (!entry.product.brandId || String(entry.product.brandId) !== String(brand._id)) set.brandId = brand._id;
    if (entry.product.brand !== brand.name) set.brand = brand.name;
    if (!Object.keys(set).length) {
      alreadyLinked += 1;
      continue;
    }
    operations.push({ updateOne: { filter: { _id: entry.product._id }, update: { $set: set } } });
  }

  if (apply && operations.length) await Product.bulkWrite(operations, { ordered: false });
  return { apply, scanned: products.length, linked: operations.length, alreadyLinked, unbranded, createdBrands: brandsToCreate.size, brandsToCreate: [...brandsToCreate.values()], unmatched };
}

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const result = await migrateProductBrands({ apply });
  console.log(`${result.apply ? "Applied" : "Dry run"}: scanned ${result.scanned} products; ${result.linked} product references to update; ${result.alreadyLinked} already linked; ${result.unbranded} unbranded; ${result.createdBrands} managed brands to create; ${result.unmatched.length} need review.`);
  for (const name of result.brandsToCreate.slice(0, 20)) console.log(`Managed brand to create from existing product data: ${name}`);
  if (result.brandsToCreate.length > 20) console.log(`${result.brandsToCreate.length - 20} additional managed brand names omitted.`);
  for (const item of result.unmatched.slice(0, 20)) {
    console.log(`Unmatched product ${item.productId} (${item.brand || "no brand"}): ${item.reason}`);
  }
  if (result.unmatched.length > 20) console.log(`${result.unmatched.length - 20} additional unmatched products omitted.`);
  if (!apply) console.log("No changes were made. Run with --apply to write the managed brand references.");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("Product brand migration failed:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { findName, migrateProductBrands };
