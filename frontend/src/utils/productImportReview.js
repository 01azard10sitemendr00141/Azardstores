import { MAX_PRODUCT_BADGES } from "./productBadges.js";

export const IMPORT_PURPOSES = ["work", "gaming", "travel", "home", "fitness"];

export function prepareImportProduct(product = {}) {
  const date = product.flashSaleEndsAt ? new Date(product.flashSaleEndsAt) : null;
  const localDate = date && !Number.isNaN(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
  const badgeValues = [...(Array.isArray(product.badges) ? product.badges : []), product.badge];
  const badges = [...new Set(badgeValues.filter((badge) => typeof badge === "string").map((badge) => badge.trim()).filter(Boolean))];
  return {
    name: product.name || "",
    sku: product.sku || "",
    description: product.description || "",
    longDescription: product.longDescription || "",
    price: product.price ?? "",
    compareAtPrice: product.compareAtPrice ?? "",
    images: Array.isArray(product.images) ? product.images : [],
    brandId: product.brandId || "",
    brand: product.brand || "",
    returnEligibility: product.returnEligibility || "standard",
    badge: badges[0] || "",
    badges,
    isFlashSale: Boolean(product.isFlashSale),
    purposeTags: Array.isArray(product.purposeTags) ? product.purposeTags : [],
    flashSaleEndsAt: localDate,
    stock: product.stock ?? "",
    reorderLevel: product.reorderLevel ?? "",
    variants: Array.isArray(product.variants) ? product.variants.map((variant) => ({
      name: variant.name || "",
      sku: variant.sku || "",
      price: variant.price ?? "",
      compareAtPrice: variant.compareAtPrice ?? "",
      stock: variant.stock ?? "",
      reorderLevel: variant.reorderLevel ?? "",
      image: variant.image || "",
    })) : [],
  };
}

export function buildImportSkuIndex(items) {
  const index = new Map();
  for (const item of items) {
    if (item.action === "skip" || !item.product) continue;
    const skus = [item.product.sku, ...(item.product.variants || []).map((variant) => variant.sku)];
    for (const value of skus) {
      const sku = String(value || "").trim().toUpperCase();
      if (!sku) continue;
      const rows = index.get(sku) || [];
      rows.push(item.index);
      index.set(sku, rows);
    }
  }
  return index;
}

function validHttpsImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

function validOptionalNumber(value, label, issues, integer = false) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    issues.push(`${label} must be a ${integer ? "whole number" : "number"} of zero or more.`);
    return null;
  }
  return number;
}

export function validateImportItem(item, items, categories, shops = [], brands = [], skuIndex = null) {
  if (item.action === "skip" || !item.product) return [];
  const product = item.product;
  const issues = [];
  if (!product.name.trim()) issues.push("Add a product name.");
  if (product.name.length > 240) issues.push("Product name must be 240 characters or fewer.");
  if (product.sku.length > 100) issues.push("Product SKU must be 100 characters or fewer.");
  if (product.description.length > 5000) issues.push("Short description must be 5,000 characters or fewer.");
  if (product.longDescription.length > 50000) issues.push("Long description must be 50,000 characters or fewer.");
  if (product.brand.length > 160) issues.push("Brand must be 160 characters or fewer.");
  if (product.brandId && !brands.some((brand) => String(brand._id) === String(product.brandId))) issues.push("Choose an existing managed brand.");
  if (product.brand && !product.brandId) issues.push("Map this brand to a managed brand or clear the brand value.");
  if (!Array.isArray(product.badges) || product.badges.length > MAX_PRODUCT_BADGES) issues.push(`Choose up to ${MAX_PRODUCT_BADGES} badges.`);
  else if (product.badges.some((badge) => typeof badge !== "string" || badge.length > 100)) issues.push("Each badge must be 100 characters or fewer.");
  if (!item.floorId) issues.push("Choose a floor.");
  if (!item.shopId) issues.push("Choose a shop.");
  if (item.placementIssue) issues.push(item.placementIssue);
  const shop = shops.find((entry) => String(entry._id) === String(item.shopId || ""));
  if (shop && item.floorId && String(shop.floor?._id || shop.floor || "") !== String(item.floorId)) {
    issues.push("Choose a shop that belongs to the selected floor.");
  }
  if (!Array.isArray(product.images) || product.images.length > 12) issues.push("A product can have up to 12 gallery images.");
  else if (product.images.some((image) => !validHttpsImage(image))) issues.push("Every gallery image must be a valid HTTPS URL.");

  const price = validOptionalNumber(product.price, "Price", issues);
  const compareAt = validOptionalNumber(product.compareAtPrice, "Compare-at price", issues);
  validOptionalNumber(product.stock, "Stock", issues, true);
  const reorderLevel = validOptionalNumber(product.reorderLevel, "Reorder level", issues, true);
  if (reorderLevel !== null && reorderLevel > 1000000) issues.push("Reorder level must be 1,000,000 or less.");
  if (compareAt !== null && price !== null && compareAt > 0 && compareAt <= price) issues.push("Compare-at price must be higher than its selling price.");
  if (!["standard", "final_sale", "perishable", "digital_product"].includes(product.returnEligibility)) issues.push("Choose a valid return eligibility option.");
  if (!Array.isArray(product.purposeTags) || product.purposeTags.length > 20) issues.push("Purpose tags must contain up to 20 values.");
  if (product.flashSaleEndsAt && Number.isNaN(new Date(product.flashSaleEndsAt).getTime())) issues.push("Flash sale end must be a valid date and time.");

  const category = categories.find((entry) => String(entry._id) === String(item.categoryId || "")
    || entry.name === item.category);
  if (item.status === "published") {
    if (!category || !item.categoryId) issues.push("Choose a managed category before publishing.");
    else if (!item.subcategoryId || !category.subcategories?.some((entry) => String(entry._id) === String(item.subcategoryId))) issues.push("Choose a subcategory from the selected category.");
    if (!product.images.length) issues.push("Add at least one product image before publishing.");
    if (!product.variants.length) {
      if (!product.sku.trim()) issues.push("Add a unique product SKU before publishing.");
      if (price === null || price <= 0) issues.push("Add a price greater than zero before publishing.");
      if (product.stock === "" || product.stock === null) issues.push("Confirm stock before publishing.");
    }
  }

  if (product.variants.length) {
    if (product.variants.length > 100) issues.push("A product can have up to 100 options.");
    product.variants.forEach((variant, index) => {
      const label = variant.name.trim() || `Option ${index + 1}`;
      if (variant.name.length > 160) issues.push(`${label}: name must be 160 characters or fewer.`);
      if (variant.sku.length > 100) issues.push(`${label}: SKU must be 100 characters or fewer.`);
      const variantPrice = validOptionalNumber(variant.price, `${label} price`, issues);
      const variantCompareAt = validOptionalNumber(variant.compareAtPrice, `${label} compare-at price`, issues);
      validOptionalNumber(variant.stock, `${label} stock`, issues, true);
      const variantReorderLevel = validOptionalNumber(variant.reorderLevel, `${label} reorder level`, issues, true);
      if (variantReorderLevel !== null && variantReorderLevel > 1000000) issues.push(`${label}: reorder level must be 1,000,000 or less.`);
      if (variant.image && !validHttpsImage(variant.image)) issues.push(`${label} image must be a valid HTTPS URL or blank.`);
      if (item.status === "published") {
        if (!variant.name.trim()) issues.push(`${label}: add a customer-facing option name.`);
        if (!variant.sku.trim()) issues.push(`${label}: add a unique SKU.`);
        if ((variantPrice ?? price) === null || (variantPrice ?? price) <= 0) issues.push(`${label}: add a price greater than zero.`);
        if (variant.stock === "" || variant.stock === null) issues.push(`${label}: confirm stock.`);
      }
      const effectivePrice = variantPrice ?? price;
      const effectiveCompareAt = variantCompareAt ?? compareAt;
      if (effectivePrice !== null && effectiveCompareAt !== null && effectiveCompareAt > 0 && effectiveCompareAt <= effectivePrice) {
        issues.push(`${label}: compare-at price must be higher than its selling price.`);
      }
    });
  }

  const skus = [product.sku, ...product.variants.map((variant) => variant.sku)].map((sku) => sku.trim().toUpperCase()).filter(Boolean);
  if (new Set(skus).size !== skus.length) issues.push("SKU codes must be unique across this product and its options.");
  const duplicateIndex = skuIndex
    ? skus.map((sku) => (skuIndex.get(sku) || []).find((index) => index !== item.index)).find((index) => index !== undefined)
    : undefined;
  const duplicateRow = duplicateIndex !== undefined
    ? items.find((other) => other.index === duplicateIndex)
    : skuIndex ? null : items.find((other) => other.index !== item.index && other.action !== "skip" && other.product
      && [other.product.sku, ...(other.product.variants || []).map((variant) => variant.sku)]
        .some((sku) => sku && skus.includes(sku.trim().toUpperCase())));
  if (duplicateRow) issues.push(`SKU also appears on CSV row ${duplicateRow.index + 1}; skip or edit one of these rows.`);
  if (item.action === "create" && item.candidates?.some((candidate) => {
    const sameShopName = candidate.matchedByName && String(candidate.shop?.id || "") === String(item.shopId || "");
    const currentSkus = [product.sku, ...product.variants.map((variant) => variant.sku)]
      .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
    const skuStillMatches = candidate.matchedBySku
      && [candidate.sku, ...(candidate.variantSkus || [])]
        .some((sku) => currentSkus.includes(String(sku || "").trim().toUpperCase()));
    return sameShopName || skuStillMatches;
  })) {
    issues.push("A product match still conflicts with this SKU or name. Choose overwrite or skip, or change the conflicting SKU.");
  }
  if (item.action === "overwrite" && (!item.productId || !item.candidates?.some((candidate) => String(candidate.id) === item.productId))) {
    issues.push("Choose an existing product to overwrite.");
  }
  return [...new Set(issues)];
}

export function getImportReviewStatus(item, issues = []) {
  if (item.action === "skip") return "skipped";
  if (!item.product) return "blocked";
  return issues.length ? "attention" : "ready";
}

export function getImportCounts(items) {
  return items.reduce((counts, item) => {
    if (item.action === "skip") counts.skipped += 1;
    else if (item.action === "overwrite") counts.overwrite += 1;
    else counts.create += 1;
    if (item.action !== "skip" && item.status === "published") counts.publish += 1;
    else if (item.action !== "skip") counts.draft += 1;
    return counts;
  }, { create: 0, overwrite: 0, skipped: 0, draft: 0, publish: 0 });
}
