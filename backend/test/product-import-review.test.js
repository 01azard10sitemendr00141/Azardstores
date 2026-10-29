const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReviewedProduct, validateImportPlan, validatePlannedSkuUniqueness } = require("../utils/productImportReview");

function reviewedProduct(overrides = {}) {
  return {
    name: "Travel mug",
    sku: "mug-01",
    description: "Insulated stainless steel mug.",
    longDescription: "Keeps drinks warm during travel.",
    price: 1800,
    compareAtPrice: 2200,
    images: ["https://cdn.example.com/mug.jpg"],
    brand: "Field Goods",
    returnEligibility: "standard",
    badge: "",
    isFlashSale: false,
    purposeTags: ["travel"],
    flashSaleEndsAt: null,
    stock: 12,
    variants: [{
      name: "Blue",
      sku: "mug-01-blue",
      price: 1800,
      compareAtPrice: null,
      stock: 5,
      image: "https://cdn.example.com/mug-blue.jpg",
    }],
    ...overrides,
  };
}

test("reviewed product normalizes and preserves all editable catalog details", () => {
  const { product, issues } = normalizeReviewedProduct(reviewedProduct({
    price: "1800",
    purposeTags: ["travel", "travel", "home"],
    flashSaleEndsAt: "2026-10-28T15:00:00.000Z",
  }));
  assert.deepEqual(issues, []);
  assert.equal(product.price, 1800);
  assert.deepEqual(product.purposeTags, ["travel", "home"]);
  assert.equal(product.flashSaleEndsAt.toISOString(), "2026-10-28T15:00:00.000Z");
  assert.equal(product.description, "Insulated stainless steel mug.");
  assert.equal(product.longDescription, "Keeps drinks warm during travel.");
  assert.equal(product.variants[0].stock, 5);
  assert.equal(product.variants[0].image, "https://cdn.example.com/mug-blue.jpg");
});

test("reviewed product rejects unsafe images, invalid stock, unsupported fields, and invalid pricing", () => {
  const { issues } = normalizeReviewedProduct(reviewedProduct({
    images: ["http://cdn.example.com/mug.jpg"],
    stock: 1.5,
    compareAtPrice: 1500,
    hiddenAdminField: true,
  }));
  assert.ok(issues.some((issue) => issue.includes("HTTPS image URL")));
  assert.ok(issues.some((issue) => issue.includes("whole number")));
  assert.ok(issues.some((issue) => issue.includes("Compare-at price")));
  assert.ok(issues.some((issue) => issue.includes("Unsupported product fields")));
});

test("reviewed product requires all editable fields and validates variant data", () => {
  const incomplete = reviewedProduct();
  delete incomplete.longDescription;
  incomplete.variants[0].image = "javascript:alert(1)";
  incomplete.variants[0].sku = incomplete.sku;
  const { issues } = normalizeReviewedProduct(incomplete);
  assert.ok(issues.some((issue) => issue.includes("details are incomplete")));
  assert.ok(issues.some((issue) => issue.includes("Variant 1 image")));
  assert.ok(issues.some((issue) => issue.includes("SKU codes must be unique")));
});

test("import decisions exclude skipped products but cover each mapped product exactly once", () => {
  const mappedIndexes = [0, 2, 4];
  assert.equal(validateImportPlan(mappedIndexes, [
    { index: 0, action: "create" },
    { index: 4, action: "overwrite" },
  ], [2]), "");
  assert.match(validateImportPlan(mappedIndexes, [
    { index: 0, action: "create" },
  ], [2]), /Review every product row/);
  assert.match(validateImportPlan(mappedIndexes, [
    { index: 0, action: "skip" },
    { index: 4, action: "overwrite" },
  ], [2]), /invalid product decision/);
});

test("import plan rejects duplicate SKUs before any rows are written", () => {
  assert.match(validatePlannedSkuUniqueness([
    { index: 0, action: "create", product: { sku: "abc-1", variants: [] } },
    { index: 2, action: "overwrite", product: { sku: " ABC-1 ", variants: [] } },
  ]), /CSV rows 1 and 3/);
  assert.equal(validatePlannedSkuUniqueness([
    { index: 0, action: "create", product: { sku: "abc-1", variants: [] } },
    { index: 1, action: "skip", product: { sku: "abc-1", variants: [] } },
  ]), "");
  assert.match(validatePlannedSkuUniqueness([
    { index: 0, action: "create", product: { sku: "abc-1", variants: [{ sku: "ABC-1" }] } },
  ]), /repeated within CSV row 1/);
});
