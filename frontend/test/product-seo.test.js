import test from "node:test";
import assert from "node:assert/strict";
import { getProductSeoDescription } from "../src/utils/productSeo.js";

test("product SEO description prefers cleaned short description", () => {
  assert.equal(getProductSeoDescription({
    name: "Travel mug",
    description: "<p>Insulated&nbsp;stainless steel mug</p>",
    longDescription: "Longer details",
  }), "Insulated stainless steel mug");
});

test("product SEO description falls back to long description when short copy is blank", () => {
  assert.equal(getProductSeoDescription({
    name: "Travel mug",
    description: "<p></p>",
    longDescription: "Keeps drinks warm while travelling.",
  }), "Keeps drinks warm while travelling.");
});

test("product SEO description uses a useful fallback and remains within 300 characters", () => {
  assert.equal(getProductSeoDescription({ name: "Travel mug" }), "Shop Travel mug at Azard Stores, Kenya's digital mall.");
  assert.equal(getProductSeoDescription({ name: "Travel mug", longDescription: "x".repeat(400) }).length, 300);
});
