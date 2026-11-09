import test from "node:test";
import assert from "node:assert/strict";
import { organizeHomepageSections } from "../src/utils/homepageProducts.js";

test("homepage product rails deduplicate in flash-sale and admin section order", () => {
  const flash = { _id: "flash", name: "Flash item" };
  const first = { _id: "first", name: "First item" };
  const shared = { _id: "shared", name: "Shared item" };
  const last = { _id: "last", name: "Last item" };
  const sections = [
    { _id: "section-a", products: [flash, first, shared, first] },
    { _id: "section-b", products: [shared, last] },
    { _id: "section-empty", products: [] },
  ];

  const organized = organizeHomepageSections(sections, [flash]);

  assert.deepEqual(organized.map((section) => section._id), ["section-a", "section-b"]);
  assert.deepEqual(organized.map((section) => section.products.map((product) => product._id)), [
    ["first", "shared"],
    ["last"],
  ]);
});

test("homepage product rails preserve products without IDs and ignore empty entries", () => {
  const anonymousProduct = { name: "Imported product" };
  const organized = organizeHomepageSections([
    { _id: "section-a", products: [null, anonymousProduct] },
    { _id: "section-b", products: [anonymousProduct] },
  ], []);

  assert.deepEqual(organized.map((section) => section.products), [
    [anonymousProduct],
    [anonymousProduct],
  ]);
});
