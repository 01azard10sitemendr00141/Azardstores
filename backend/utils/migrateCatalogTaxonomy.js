require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Category = require("../models/Category");
const Product = require("../models/Product");

function findName(items, name) {
  const normalized = String(name || "").trim().toLocaleLowerCase();
  return items.find((item) => item.name.trim().toLocaleLowerCase() === normalized) || null;
}

async function migrateCatalogTaxonomy({ apply = false } = {}) {
  const [categories, products] = await Promise.all([
    Category.find().select("name subcategories").lean(),
    Product.find().select("categoryId subcategoryId category subcategory").lean(),
  ]);
  const operations = [];
  const unmatched = [];
  let alreadyLinked = 0;

  for (const product of products) {
    let category = product.categoryId
      ? categories.find((entry) => String(entry._id) === String(product.categoryId))
      : findName(categories, product.category);
    if (!category) {
      if (product.categoryId || product.category || product.subcategory) {
        unmatched.push({ productId: String(product._id), reason: "Category reference or name has no managed-list match." });
      }
      continue;
    }

    let subcategory = product.subcategoryId
      ? category.subcategories.find((entry) => String(entry._id) === String(product.subcategoryId))
      : findName(category.subcategories, product.subcategory);
    if (product.subcategoryId && !subcategory) {
      unmatched.push({ productId: String(product._id), reason: "Stored subcategory reference is not part of the linked category." });
      continue;
    }
    if (product.subcategory && !subcategory) {
      unmatched.push({ productId: String(product._id), reason: `Subcategory "${product.subcategory}" has no match within "${category.name}".` });
    }

    const set = {};
    if (!product.categoryId) set.categoryId = category._id;
    if (!product.subcategoryId && subcategory) set.subcategoryId = subcategory._id;
    if (Object.keys(set).length === 0) {
      alreadyLinked += 1;
      continue;
    }
    operations.push({ updateOne: { filter: { _id: product._id }, update: { $set: set } } });
  }

  if (apply && operations.length) await Product.bulkWrite(operations, { ordered: false });
  return { apply, scanned: products.length, linked: operations.length, alreadyLinked, unmatched };
}

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const result = await migrateCatalogTaxonomy({ apply });
  console.log(`${result.apply ? "Applied" : "Dry run"}: scanned ${result.scanned} products; ${result.linked} products to update; ${result.alreadyLinked} already linked; ${result.unmatched.length} need review.`);
  for (const item of result.unmatched.slice(0, 20)) {
    console.log(`Unmatched product ${item.productId}: ${item.reason}`);
  }
  if (result.unmatched.length > 20) console.log(`${result.unmatched.length - 20} additional unmatched products omitted.`);
  if (!apply) console.log("No changes were made. Run with --apply to write the managed category references.");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("Catalog taxonomy migration failed:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { findName, migrateCatalogTaxonomy };
