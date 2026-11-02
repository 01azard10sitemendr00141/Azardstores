const Product = require("../models/Product");
const Category = require("../models/Category");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function normalizeProductTaxonomy(product, { requireComplete = true } = {}) {
  const categoryName = String(product.category || "").trim();
  const subcategoryName = String(product.subcategory || "").trim();
  const categoryId = String(product.categoryId || "").trim();
  const subcategoryId = String(product.subcategoryId || "").trim();
  const issues = [];
  if (!categoryName && !categoryId) {
    if (requireComplete) issues.push("Choose a managed product category.");
    return { category: categoryName, subcategory: subcategoryName, categoryId: null, subcategoryId: null, issues };
  }

  let category;
  if (categoryId) {
    if (!/^[a-f\d]{24}$/i.test(categoryId)) {
      return { category: categoryName, subcategory: subcategoryName, categoryId: null, subcategoryId: null, issues: ["Choose a valid managed product category."] };
    }
    category = await Category.findById(categoryId);
  } else {
    category = await Category.findOne({ name: new RegExp(`^${escapeRegex(categoryName)}$`, "i") });
  }
  if (!category) {
    return { category: categoryName, subcategory: subcategoryName, categoryId: null, subcategoryId: null, issues: ["Choose a category from the managed category list."] };
  }
  if (!subcategoryName && !subcategoryId) {
    if (requireComplete) issues.push("Choose a subcategory from the selected category.");
    return { category: category.name, subcategory: "", categoryId: category._id, subcategoryId: null, issues };
  }
  let subcategory;
  if (subcategoryId) {
    if (!/^[a-f\d]{24}$/i.test(subcategoryId)) {
      return { category: category.name, subcategory: subcategoryName, categoryId: category._id, subcategoryId: null, issues: ["Choose a valid subcategory from the selected category."] };
    }
    subcategory = category.subcategories.id(subcategoryId);
  } else {
    subcategory = category.subcategories.find((entry) => entry.name.toLowerCase() === subcategoryName.toLowerCase());
  }
  if (!subcategory) {
    return { category: category.name, subcategory: subcategoryName, categoryId: category._id, subcategoryId: null, issues: [`Choose a subcategory that belongs to ${category.name}.`] };
  }
  return { category: category.name, subcategory: subcategory.name, categoryId: category._id, subcategoryId: subcategory._id, issues: [] };
}

function isValidProductImageUrl(image) {
  try {
    const url = new URL(String(image));
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function productStatus(product) {
  return product.status || (product.isActive === false ? "draft" : "published");
}

function validatePublishable(product) {
  const issues = [];
  if (!String(product.name || "").trim()) issues.push("Add a product name.");
  if (!String(product.shop || "").trim()) issues.push("Choose a shop.");
  if (!String(product.category || "").trim()) issues.push("Choose a category.");
  if (!String(product.subcategory || "").trim()) issues.push("Choose a subcategory.");
  if (!Array.isArray(product.images) || !product.images.some(isValidProductImageUrl)) issues.push("Add at least one valid HTTPS product image URL.");

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    variants.forEach((variant, index) => {
      const label = variant.name?.trim() || `Option ${index + 1}`;
      if (!String(variant.name || "").trim() || /^unnamed option$|^option\s*\(/i.test(String(variant.name || "").trim())) issues.push(`${label}: add a customer-facing option name.`);
      if (!String(variant.sku || "").trim()) issues.push(`${label}: add a unique SKU.`);
      const price = variant.price ?? product.price;
      if (!Number.isFinite(Number(price)) || Number(price) <= 0) issues.push(`${label}: add a price greater than zero.`);
      if (variant.stock === undefined || variant.stock === null || !Number.isInteger(Number(variant.stock)) || Number(variant.stock) < 0) issues.push(`${label}: confirm a whole-number stock quantity.`);
      const compareAtPrice = variant.compareAtPrice ?? product.compareAtPrice;
      if (compareAtPrice != null && Number(compareAtPrice) > 0 && Number(compareAtPrice) <= Number(price)) {
        issues.push(`${label}: compare-at price must be higher than its selling price.`);
      }
    });
  } else {
    if (!String(product.sku || "").trim()) issues.push("Add a unique product SKU.");
    if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) issues.push("Add a price greater than zero.");
    if (product.stock === undefined || product.stock === null || !Number.isInteger(Number(product.stock)) || Number(product.stock) < 0) issues.push("Confirm a whole-number stock quantity (zero is allowed).");
    if (product.compareAtPrice != null && Number(product.compareAtPrice) > 0 && Number(product.compareAtPrice) <= Number(product.price)) {
      issues.push("Compare-at price must be higher than the selling price.");
    }
  }
  return issues;
}

function productSkus(product) {
  return [...new Set([product.sku, ...(product.variants || []).map((variant) => variant.sku)]
    .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean))];
}

async function assertUniqueProductSkus(product, excludeId = null) {
  const skus = productSkus(product);
  if (!skus.length) return;
  const duplicatesInProduct = [product.sku, ...(product.variants || []).map((variant) => variant.sku)]
    .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
  if (new Set(duplicatesInProduct).size !== duplicatesInProduct.length) {
    const error = new Error("SKU codes must be unique across the product and its variants");
    error.statusCode = 409;
    throw error;
  }
  const regexes = skus.map((sku) => new RegExp(`^${sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
  const match = await Product.findOne({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: [
      { sku: { $in: regexes } },
      { "variants.sku": { $in: regexes } },
      { skuCodes: { $in: skus } },
    ],
  }).select("name sku variants.sku");
  if (match) {
    const error = new Error(`One of these SKU codes already belongs to ${match.name}`);
    error.statusCode = 409;
    throw error;
  }
}

module.exports = { productStatus, validatePublishable, normalizeProductTaxonomy, productSkus, assertUniqueProductSkus, isValidProductImageUrl };
