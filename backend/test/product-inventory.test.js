const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateStock, getTotalStock, shopStockEntries, serializeAvailableInventory } = require("../utils/productInventory");

const activeShops = [
  { _id: "shop-primary", name: "Primary" },
  { _id: "shop-east", name: "East" },
  { _id: "shop-west", name: "West" },
];

test("stock totals include only selected active locations", () => {
  const product = {
    shop: "shop-primary",
    stock: 3,
    inventoryLocations: [
      { shop: "shop-east", stock: 4 },
      { shop: "shop-west", stock: 20 },
    ],
  };
  assert.equal(getTotalStock(product, null, ["shop-primary", "shop-east"]), 7);
  assert.deepEqual(shopStockEntries(product, null, ["shop-east"]), [{ shopId: "shop-east", stock: 4 }]);
});

test("checkout allocates primary stock first and accounts for earlier cart lines", () => {
  const product = {
    shop: "shop-primary",
    stock: 2,
    inventoryLocations: [{ shop: "shop-east", stock: 5 }],
  };
  const used = new Map();
  const first = allocateStock(product, null, 3, activeShops, used);
  const second = allocateStock(product, null, 3, activeShops, used);
  assert.deepEqual(first.map(({ shop, quantity }) => [shop._id, quantity]), [["shop-primary", 2], ["shop-east", 1]]);
  assert.deepEqual(second.map(({ shop, quantity }) => [shop._id, quantity]), [["shop-east", 3]]);
  assert.equal(allocateStock(product, null, 2, activeShops, used), null);
});

test("variant stock is allocated independently and unknown locations are not treated as zero", () => {
  const product = {
    shop: "shop-primary",
    stock: 100,
    variants: [{ _id: "variant-blue", stock: 1 }],
    inventoryLocations: [{ shop: "shop-east", variants: [{ variantId: "variant-blue", stock: 2 }] }],
  };
  assert.equal(getTotalStock(product, "variant-blue", activeShops.map((shop) => shop._id)), 3);
  assert.equal(getTotalStock({ shop: "shop-primary", stock: 0, inventoryLocations: [{ shop: "shop-east" }] }, null, activeShops.map((shop) => shop._id)), undefined);
  assert.equal(allocateStock(product, "variant-blue", 4, activeShops), null);
});

test("storefront inventory serialization aggregates active locations without exposing location records", () => {
  const product = {
    _id: "product-1",
    shop: "shop-primary",
    stock: 2,
    inventoryLocations: [
      { shop: "shop-east", stock: 3, variants: [{ variantId: "variant-blue", stock: 4 }] },
      { shop: "shop-west", stock: 50, variants: [{ variantId: "variant-blue", stock: 40 }] },
    ],
    variants: [{ _id: "variant-blue", stock: 1 }],
    toJSON() {
      return { _id: this._id, stock: this.stock, variants: this.variants, inventoryLocations: this.inventoryLocations };
    },
  };
  const serialized = serializeAvailableInventory(product, ["shop-primary", "shop-east"]);
  assert.equal(serialized.stock, 5);
  assert.equal(serialized.variants[0].stock, 5);
  assert.equal(serialized.inventoryLocations, undefined);
});
