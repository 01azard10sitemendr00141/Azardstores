import test from "node:test";
import assert from "node:assert/strict";
import { getImportCounts, getImportReviewStatus, prepareImportProduct, validateImportItem } from "../src/utils/productImportReview.js";

test("import review prepares every editable catalog field and preserves variants", () => {
  const product = prepareImportProduct({
    name: "Travel mug",
    sku: "mug-01",
    description: "Short details",
    longDescription: "Long details",
    price: 1800,
    compareAtPrice: 2200,
    images: ["https://cdn.example.com/mug.jpg"],
    brand: "Field Goods",
    returnEligibility: "final_sale",
    badge: "new",
    isFlashSale: true,
    purposeTags: ["travel"],
    flashSaleEndsAt: "2026-10-28T15:00:00.000Z",
    stock: 12,
    variants: [{ name: "Blue", sku: "mug-blue", price: 1800, stock: 5, image: "https://cdn.example.com/blue.jpg" }],
  });
  assert.equal(product.longDescription, "Long details");
  assert.equal(product.badge, "new");
  assert.equal(product.isFlashSale, true);
  assert.equal(product.variants[0].stock, 5);
  assert.equal(product.images[0], "https://cdn.example.com/mug.jpg");
});

test("import review counts create, overwrite, skip, draft, and publish decisions", () => {
  assert.deepEqual(getImportCounts([
    { action: "create", status: "published" },
    { action: "overwrite", status: "draft" },
    { action: "skip", status: "published" },
  ]), { create: 1, overwrite: 1, skipped: 1, draft: 1, publish: 1 });
});

test("skipped and unmappable rows are accounted as skipped rather than needing attention", () => {
  assert.equal(getImportReviewStatus({ action: "skip", product: null }), "skipped");
  assert.equal(getImportReviewStatus({ action: "create", product: null }), "blocked");
  assert.equal(getImportReviewStatus({ action: "create", product: {} }, ["Choose a shop."]), "attention");
  assert.equal(getImportReviewStatus({ action: "create", product: {} }), "ready");
});

test("import validation catches SKU conflicts and allows an explicit skip", () => {
  const item = { index: 0, action: "create", status: "draft", shopId: "shop", category: "", subcategory: "", productId: "", candidates: [], product: prepareImportProduct({ name: "Mug", sku: "same" }) };
  const duplicate = { ...item, index: 1, product: { ...item.product, name: "Other" } };
  const errors = validateImportItem(item, [item, duplicate], []);
  assert.ok(errors.some((error) => error.includes("SKU also appears")));
  assert.deepEqual(validateImportItem({ ...item, action: "skip" }, [item], []), []);
});

test("import permits a replacement for a catalog SKU match but keeps same-name matches guarded", () => {
  const candidate = { id: "existing", sku: "OLD-1", variantSkus: [], matchedBySku: true, matchedByName: false, shop: { id: "other-shop" } };
  const item = {
    index: 0,
    action: "create",
    status: "draft",
    shopId: "new-shop",
    category: "",
    subcategory: "",
    productId: "",
    candidates: [candidate],
    product: prepareImportProduct({ name: "Different item", sku: "OLD-1" }),
  };
  assert.ok(validateImportItem(item, [item], []).some((issue) => issue.includes("match still conflicts")));
  const replaced = { ...item, product: { ...item.product, sku: "DIFFERENT-2" } };
  assert.deepEqual(validateImportItem(replaced, [replaced], []), []);

  const sameNameCandidate = { ...candidate, matchedByName: true, shop: { id: "new-shop" } };
  const sameName = { ...replaced, candidates: [sameNameCandidate] };
  assert.ok(validateImportItem(sameName, [sameName], []).some((issue) => issue.includes("match still conflicts")));
});
