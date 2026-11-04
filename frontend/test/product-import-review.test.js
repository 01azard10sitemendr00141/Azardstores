import test from "node:test";
import assert from "node:assert/strict";
import { buildImportSkuIndex, getImportCounts, getImportReviewStatus, prepareImportProduct, validateImportItem } from "../src/utils/productImportReview.js";

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
    reorderLevel: 8,
    variants: [{ name: "Blue", sku: "mug-blue", price: 1800, stock: 5, reorderLevel: 2, image: "https://cdn.example.com/blue.jpg" }],
  });
  assert.equal(product.longDescription, "Long details");
  assert.equal(product.brandId, "");
  assert.equal(product.badge, "new");
  assert.equal(product.isFlashSale, true);
  assert.equal(product.variants[0].stock, 5);
  assert.equal(product.reorderLevel, 8);
  assert.equal(product.variants[0].reorderLevel, 2);
  assert.equal(product.images[0], "https://cdn.example.com/mug.jpg");
});

test("import review leaves absent reorder levels blank to preserve existing values on overwrite", () => {
  const product = prepareImportProduct({ variants: [{ name: "Blue" }] });
  assert.equal(product.reorderLevel, "");
  assert.equal(product.variants[0].reorderLevel, "");
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
  const item = { index: 0, action: "create", status: "draft", floorId: "floor-1", shopId: "shop", category: "", subcategory: "", productId: "", candidates: [], product: prepareImportProduct({ name: "Mug", sku: "same" }) };
  const duplicate = { ...item, index: 1, product: { ...item.product, name: "Other" } };
  const errors = validateImportItem(item, [item, duplicate], []);
  assert.ok(errors.some((error) => error.includes("SKU also appears")));
  assert.deepEqual(validateImportItem({ ...item, action: "skip" }, [item], []), []);
});

test("import review indexes active SKUs once across rows", () => {
  const rows = [
    { index: 0, action: "create", product: prepareImportProduct({ sku: " SKU-1 " }) },
    { index: 1, action: "skip", product: prepareImportProduct({ sku: "SKU-1" }) },
    { index: 2, action: "overwrite", product: prepareImportProduct({ variants: [{ sku: "sku-1" }] }) },
  ];
  assert.deepEqual(buildImportSkuIndex(rows).get("SKU-1"), [0, 2]);
});

test("import review requires brands to map to managed IDs", () => {
  const item = {
    index: 0,
    action: "create",
    status: "draft",
    floorId: "floor-1",
    shopId: "shop-1",
    candidates: [],
    product: prepareImportProduct({ name: "Mug", brand: "Field Goods" }),
  };
  const brands = [{ _id: "brand-1", name: "Field Goods" }];
  assert.ok(validateImportItem(item, [item], [], [{ _id: "shop-1", floor: "floor-1" }], brands)
    .some((issue) => issue.includes("managed brand")));
  const linked = { ...item, product: { ...item.product, brandId: "brand-1" } };
  assert.equal(validateImportItem(linked, [linked], [], [{ _id: "shop-1", floor: "floor-1" }], brands)
    .some((issue) => issue.includes("brand")), false);
});

test("published CSV rows require a floor-aligned shop and managed taxonomy IDs", () => {
  const categories = [{
    _id: "category-1",
    name: "Electronics",
    subcategories: [{ _id: "subcategory-1", name: "Headphones" }],
  }];
  const shops = [{ _id: "shop-1", floor: "floor-1", name: "Audio" }];
  const item = {
    index: 0,
    action: "create",
    status: "published",
    floorId: "floor-1",
    shopId: "shop-1",
    categoryId: "category-1",
    subcategoryId: "subcategory-1",
    category: "Electronics",
    subcategory: "Headphones",
    productId: "",
    candidates: [],
    product: prepareImportProduct({
      name: "Studio headphones",
      sku: "HEADPHONE-1",
      price: 2500,
      stock: 5,
      images: ["https://cdn.example.com/headphones.jpg"],
    }),
  };

  assert.deepEqual(validateImportItem(item, [item], categories, shops), []);
  assert.ok(validateImportItem({ ...item, floorId: "floor-2" }, [item], categories, shops)
    .some((issue) => issue.includes("belongs to the selected floor")));
  assert.ok(validateImportItem({ ...item, subcategoryId: "" }, [item], categories, shops)
    .some((issue) => issue.includes("subcategory")));
});

test("import permits a replacement for a catalog SKU match but keeps same-name matches guarded", () => {
  const candidate = { id: "existing", sku: "OLD-1", variantSkus: [], matchedBySku: true, matchedByName: false, shop: { id: "other-shop" } };
  const item = {
    index: 0,
    action: "create",
    status: "draft",
    floorId: "floor-1",
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
