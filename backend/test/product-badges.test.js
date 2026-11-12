const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProductBadges } = require("../utils/productBadges");
const Product = require("../models/Product");

test("normalizes multiple product badges and preserves first-badge compatibility", () => {
  assert.deepEqual(normalizeProductBadges({
    badges: [" trending ", "best-seller", "trending", ""],
  }), {
    badges: ["trending", "best-seller"],
    badge: "trending",
  });
});

test("normalizes legacy single badge input", () => {
  assert.deepEqual(normalizeProductBadges({ badge: "trending" }), {
    badges: ["trending"],
    badge: "trending",
  });
});

test("rejects malformed or excessive badge lists", () => {
  assert.match(normalizeProductBadges({ badges: "trending" }).error, /list/);
  assert.match(normalizeProductBadges({ badges: ["trending", "new", "sale", "featured"] }).error, /up to 3/);
  assert.match(normalizeProductBadges({ badges: [4] }).error, /text/);
});

test("product schema rejects more than three badges", async () => {
  const product = new Product({
    name: "Badge limit test",
    shop: new Product.base.Types.ObjectId(),
    badges: ["trending", "new", "sale", "featured"],
  });
  await assert.rejects(product.validate(), (error) => {
    assert.match(error.errors.badges.message, /up to 3/);
    return true;
  });
});

test("product schema counts an unaligned legacy badge alias toward the limit", async () => {
  const product = new Product({
    name: "Badge alias limit test",
    shop: new Product.base.Types.ObjectId(),
    badge: "legacy-fourth",
    badges: ["trending", "new", "sale"],
  });
  await assert.rejects(product.validate(), (error) => {
    assert.match(error.errors.badges.message, /up to 3/);
    return true;
  });
});

test("three assigned badges remain valid with Flash Sale enabled separately", async () => {
  const product = new Product({
    name: "Flash Sale badge limit test",
    shop: new Product.base.Types.ObjectId(),
    badge: "trending",
    badges: ["trending", "new", "sale"],
    isFlashSale: true,
  });
  await product.validate();
});
