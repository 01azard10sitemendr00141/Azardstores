const test = require("node:test");
const assert = require("node:assert/strict");
const { createProductSku } = require("../utils/productSku");

test("generated SKU uses a normalized product-name prefix and unique suffix", () => {
  assert.equal(createProductSku("JBL Clip 4", "A1B2C3D4"), "JBL-CLIP-4-A1B2C3D4");
  assert.equal(createProductSku("Étagère & décor", "01020304"), "ETAGERE-DECOR-01020304");
});

test("generated SKU prefix is bounded and retains its unique suffix", () => {
  const sku = createProductSku("A".repeat(200), "ABCD1234");
  assert.equal(sku.length, 49);
  assert.ok(sku.endsWith("-ABCD1234"));
});
