import test from "node:test";
import assert from "node:assert/strict";
import { isValidPassword } from "../src/utils/passwordPolicy.js";
import { getStartingPrice } from "../src/utils/productPricing.js";
import { productImageUrl } from "../src/utils/productImageUrl.js";
import { normalizeHomepageContent } from "../src/utils/homepageContent.js";
import {
  readRecentlyViewed,
  recordRecentlyViewed,
  validateRecentlyViewed,
  RECENTLY_VIEWED_LIMIT,
  RECENTLY_VIEWED_STORAGE_KEY,
} from "../src/utils/recentlyViewed.js";

test("password policy enforces minimum characters and UTF-8 byte limit", () => {
  assert.equal(isValidPassword("short"), false);
  assert.equal(isValidPassword("123456789012"), true);
  assert.equal(isValidPassword("😀".repeat(18)), true);
  assert.equal(isValidPassword("😀".repeat(19)), false);
});

test("starting price uses the lowest valid variant price with product fallback", () => {
  assert.equal(getStartingPrice({ price: 40, variants: [{ price: 80 }, { price: 30 }, { price: 0 }] }), 30);
  assert.equal(getStartingPrice({ price: 40, variants: [{}, { price: -2 }] }), 40);
  assert.equal(getStartingPrice({ price: 0 }), undefined);
});

test("product image sizing optimizes Unsplash sources and preserves other hosts", () => {
  const sized = new URL(productImageUrl("https://images.unsplash.com/photo-123?ixlib=test", { width: 480, quality: 76 }));
  assert.equal(sized.searchParams.get("w"), "480");
  assert.equal(sized.searchParams.get("q"), "76");
  assert.equal(sized.searchParams.get("auto"), "format");
  assert.equal(productImageUrl("https://cdn.example.com/item.jpg"), "https://cdn.example.com/item.jpg");
});

test("homepage content replaces only the previous default closing copy", () => {
  assert.deepEqual(
    normalizeHomepageContent({ closingHeadline: "The standard", closingAccent: "has changed.", purposeHeading: "Browse" }),
    { closingHeadline: "Discover more.", closingAccent: "Shop it all.", purposeHeading: "Browse" },
  );
  assert.equal(
    normalizeHomepageContent({ closingHeadline: "My headline", closingAccent: "My accent" }).closingHeadline,
    "My headline",
  );
});

test("recently viewed validation deduplicates entries and keeps only the latest eight", () => {
  const products = Array.from({ length: 10 }, (_, index) => ({
    slug: `item-${index}`,
    name: `Item ${index}`,
    image: `https://cdn.example.com/${index}.jpg`,
    price: index * 100,
  }));
  const entries = validateRecentlyViewed([
    products[0],
    { ...products[0], name: "Duplicate" },
    ...products.slice(1),
    { slug: "../unsafe", name: "Unsafe" },
    { slug: "missing-name" },
  ]);

  assert.equal(RECENTLY_VIEWED_LIMIT, 8);
  assert.deepEqual(entries.map(({ slug }) => slug), [
    "item-0", "item-1", "item-2", "item-3", "item-4", "item-5", "item-6", "item-7",
  ]);
  assert.deepEqual(Object.keys(entries[0]), ["slug", "name", "image"]);
});

test("recently viewed capture moves a product to the front and tolerates malformed storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  storage.setItem(RECENTLY_VIEWED_STORAGE_KEY, "{malformed");
  assert.deepEqual(readRecentlyViewed(storage), []);

  recordRecentlyViewed({ slug: "first", name: "First", images: ["first.jpg"] }, storage);
  recordRecentlyViewed({ slug: "second", name: "Second", images: ["second.jpg"] }, storage);
  const recent = recordRecentlyViewed(
    { slug: "FIRST", name: "First again", images: ["updated.jpg"] },
    storage,
  );

  assert.deepEqual(recent, [
    { slug: "FIRST", name: "First again", image: "updated.jpg" },
    { slug: "second", name: "Second", image: "second.jpg" },
  ]);
  assert.deepEqual(readRecentlyViewed(storage), recent);
});
