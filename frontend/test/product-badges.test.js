import test from "node:test";
import assert from "node:assert/strict";
import { getProductBadges, MAX_PRODUCT_BADGES } from "../src/utils/productBadges.js";

test("product badges combines new and legacy fields without duplicate slugs", () => {
  assert.deepEqual(getProductBadges({
    badge: "trending",
    badges: ["trending", "best-seller", "new-arrival"],
  }), ["trending", "best-seller", "new-arrival"]);
});

test("product badges falls back to legacy single badge", () => {
  assert.deepEqual(getProductBadges({ badge: "trending" }), ["trending"]);
  assert.deepEqual(getProductBadges({ badges: [], badge: "" }), []);
});

test("product badge assignment limit is three", () => {
  assert.equal(MAX_PRODUCT_BADGES, 3);
});
