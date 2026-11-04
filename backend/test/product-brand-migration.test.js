const test = require("node:test");
const assert = require("node:assert/strict");
const { findName } = require("../utils/migrateProductBrands");

test("legacy brand matching is case-insensitive and never guesses between managed duplicates", () => {
  const brands = [
    { _id: "brand-1", name: "Field Goods" },
    { _id: "brand-2", name: "FIELD GOODS" },
    { _id: "brand-3", name: "Northwind" },
  ];

  assert.equal(findName(brands, "northwind")._id, "brand-3");
  assert.equal(findName(brands, "field goods"), null);
  assert.equal(findName(brands, "unknown"), null);
});
