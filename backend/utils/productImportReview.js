const { isValidProductImageUrl } = require("./productLifecycle");
const { MAX_PRODUCT_BADGES } = require("./productBadges");

const PRODUCT_FIELDS = [
  "name",
  "sku",
  "description",
  "longDescription",
  "price",
  "compareAtPrice",
  "images",
  "brandId",
  "brand",
  "returnEligibility",
  "badge",
  "badges",
  "isFlashSale",
  "purposeTags",
  "flashSaleEndsAt",
  "stock",
  "reorderLevel",
  "variants",
];
const VARIANT_FIELDS = ["name", "sku", "price", "compareAtPrice", "stock", "reorderLevel", "image"];
const RETURN_ELIGIBILITY = new Set(["standard", "final_sale", "perishable", "digital_product"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readText(value, field, issues, maxLength) {
  if (typeof value !== "string") {
    issues.push(`${field} must be text.`);
    return "";
  }
  const text = value.trim();
  if (text.length > maxLength) issues.push(`${field} must be ${maxLength} characters or fewer.`);
  return text;
}

function readNumber(value, field, issues, { integer = false } = {}) {
  if (value === null || value === "") return null;
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    issues.push(`${field} must be a number or left blank.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    issues.push(`${field} must be a ${integer ? "whole number of zero or more" : "number of zero or more"}.`);
    return null;
  }
  return number;
}

function readImage(value, field, issues, optional = false) {
  if (optional && value === "") return "";
  if (typeof value !== "string" || !isValidProductImageUrl(value.trim())) {
    issues.push(`${field} must be a valid HTTPS image URL${optional ? " or blank" : ""}.`);
    return "";
  }
  return value.trim();
}

function normalizeReviewedProduct(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { product: null, issues: ["Reviewed product details are missing. Analyze the CSV again and review each product."] };
  }

  const missing = PRODUCT_FIELDS.filter((field) => !["reorderLevel", "badge", "badges"].includes(field) && !Object.prototype.hasOwnProperty.call(value, field));
  if (!Object.prototype.hasOwnProperty.call(value, "badge") && !Object.prototype.hasOwnProperty.call(value, "badges")) {
    missing.push("badges");
  }
  const unexpected = Object.keys(value).filter((field) => !PRODUCT_FIELDS.includes(field));
  if (missing.length) issues.push("Reviewed product details are incomplete. Analyze the CSV again and review each product.");
  if (unexpected.length) issues.push(`Unsupported product fields: ${unexpected.join(", ")}.`);

  const product = {
    name: readText(value.name, "Product name", issues, 240),
    sku: readText(value.sku, "Product SKU", issues, 100).toUpperCase(),
    description: readText(value.description, "Short description", issues, 5000),
    longDescription: readText(value.longDescription, "Long description", issues, 50000),
    price: readNumber(value.price, "Price", issues),
    compareAtPrice: readNumber(value.compareAtPrice, "Compare-at price", issues),
    images: [],
    brandId: readText(value.brandId, "Managed brand ID", issues, 24),
    brand: readText(value.brand, "Brand", issues, 160),
    returnEligibility: value.returnEligibility,
    badge: "",
    badges: [],
    isFlashSale: value.isFlashSale,
    purposeTags: [],
    flashSaleEndsAt: null,
    stock: readNumber(value.stock, "Stock", issues, { integer: true }),
    reorderLevel: readNumber(value.reorderLevel ?? 5, "Reorder level", issues, { integer: true }),
    variants: [],
  };
  const rawBadges = value.badges === undefined
    ? (value.badge ? [value.badge] : [])
    : value.badges;
  if (!Array.isArray(rawBadges) || rawBadges.length > MAX_PRODUCT_BADGES) {
    issues.push(`Badges must be a list of up to ${MAX_PRODUCT_BADGES} values.`);
  } else {
    product.badges = [...new Set(rawBadges.map((badge, index) => readText(badge, `Badge ${index + 1}`, issues, 100)).filter(Boolean))];
    product.badge = product.badges[0] || "";
  }
  if (product.reorderLevel > 1000000) issues.push("Reorder level must be 1,000,000 or less.");

  if (!Array.isArray(value.images) || value.images.length > 12) {
    issues.push("A product can have up to 12 gallery images.");
  } else {
    product.images = value.images.map((image, index) => readImage(image, `Image ${index + 1}`, issues));
  }

  if (!RETURN_ELIGIBILITY.has(value.returnEligibility)) {
    issues.push("Choose a valid return eligibility option.");
  }
  if (typeof value.isFlashSale !== "boolean") {
    issues.push("Flash sale status must be true or false.");
  }
  if (product.brandId && !/^[0-9a-f]{24}$/i.test(product.brandId)) {
    issues.push("Choose a valid managed brand.");
  }

  if (!Array.isArray(value.purposeTags) || value.purposeTags.length > 20) {
    issues.push("Purpose tags must be a list of up to 20 values.");
  } else {
    product.purposeTags = value.purposeTags.map((tag, index) => readText(tag, `Purpose tag ${index + 1}`, issues, 40));
    product.purposeTags = [...new Set(product.purposeTags)];
  }

  if (value.flashSaleEndsAt !== null && value.flashSaleEndsAt !== "") {
    const date = new Date(value.flashSaleEndsAt);
    if (typeof value.flashSaleEndsAt !== "string" || Number.isNaN(date.getTime())) {
      issues.push("Flash sale end must be a valid date and time or left blank.");
    } else {
      product.flashSaleEndsAt = date;
    }
  }

  if (!Array.isArray(value.variants) || value.variants.length > 100) {
    issues.push("A product can have up to 100 variants.");
  } else {
    product.variants = value.variants.map((variant, index) => {
      const label = `Variant ${index + 1}`;
      if (!isRecord(variant)) {
        issues.push(`${label} must be a product option.`);
        return { name: "", sku: "", price: null, compareAtPrice: null, stock: null, image: "" };
      }
      const extraFields = Object.keys(variant).filter((field) => !VARIANT_FIELDS.includes(field));
      if (extraFields.length) issues.push(`${label} contains unsupported fields.`);
      const normalized = {
        name: readText(variant.name, `${label} name`, issues, 160),
        sku: readText(variant.sku, `${label} SKU`, issues, 100).toUpperCase(),
        price: readNumber(variant.price, `${label} price`, issues),
        compareAtPrice: readNumber(variant.compareAtPrice, `${label} compare-at price`, issues),
        stock: readNumber(variant.stock, `${label} stock`, issues, { integer: true }),
        reorderLevel: readNumber(variant.reorderLevel ?? 5, `${label} reorder level`, issues, { integer: true }),
        image: readImage(variant.image, `${label} image`, issues, true),
      };
      if (normalized.reorderLevel > 1000000) issues.push(`${label} reorder level must be 1,000,000 or less.`);
      const effectivePrice = normalized.price ?? product.price;
      const effectiveCompareAt = normalized.compareAtPrice ?? product.compareAtPrice;
      if (effectivePrice !== null && effectiveCompareAt !== null && effectiveCompareAt > 0 && effectiveCompareAt <= effectivePrice) {
        issues.push(`${label} compare-at price must be higher than its selling price.`);
      }
      return normalized;
    });
  }

  if (product.price !== null && product.compareAtPrice !== null && product.compareAtPrice > 0 && product.compareAtPrice <= product.price) {
    issues.push("Compare-at price must be higher than its selling price.");
  }

  const skuCodes = [product.sku, ...product.variants.map((variant) => variant.sku)].filter(Boolean);
  if (new Set(skuCodes).size !== skuCodes.length) {
    issues.push("SKU codes must be unique across this product and its options.");
  }

  return { product, issues };
}

function validateImportPlan(mappedIndexes, plan, skippedIndexes) {
  if (!Array.isArray(plan) || !Array.isArray(skippedIndexes)) {
    return "Import review plan is invalid.";
  }
  if (plan.some((item) => !isRecord(item) || !["create", "overwrite"].includes(item.action))) {
    return "Import review plan contains an invalid product decision.";
  }

  const toIndex = (value) => Number(value);
  const decisions = plan.map((item) => toIndex(item.index));
  const skipped = skippedIndexes.map(toIndex);
  const all = [...decisions, ...skipped];
  const skippedSet = new Set(skipped);
  const allowed = new Set(mappedIndexes);
  if (
    all.some((index) => !Number.isInteger(index) || !allowed.has(index))
    || new Set(decisions).size !== decisions.length
    || new Set(skipped).size !== skipped.length
    || decisions.some((index) => skippedSet.has(index))
    || all.length !== mappedIndexes.length
  ) {
    return "Review every product row before importing. Analyze the CSV again if its preview is out of date.";
  }
  return "";
}

function validatePlannedSkuUniqueness(plan) {
  const skuRows = new Map();
  for (const decision of plan.filter((item) => item.action !== "skip")) {
    const skus = [decision.product?.sku, ...(Array.isArray(decision.product?.variants) ? decision.product.variants.map((variant) => variant?.sku) : [])]
      .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
    for (const sku of skus) {
      const previousIndex = skuRows.get(sku);
      if (previousIndex !== undefined) {
        if (previousIndex === Number(decision.index)) return `SKU ${sku} is repeated within CSV row ${Number(decision.index) + 1}.`;
        return `SKU ${sku} appears on CSV rows ${previousIndex + 1} and ${Number(decision.index) + 1}. Give each imported product or option a unique SKU, or skip one row.`;
      }
      skuRows.set(sku, Number(decision.index));
    }
  }
  return "";
}

module.exports = { normalizeReviewedProduct, validateImportPlan, validatePlannedSkuUniqueness, PRODUCT_FIELDS };
