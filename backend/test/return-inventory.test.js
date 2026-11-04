const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReturnInspectionLines, applyReturnInspection } = require("../utils/returnInventory");

function createProductModel(product) {
  return {
    async updateOne(filter, update) {
      if (String(filter._id) !== String(product._id)) return { modifiedCount: 0 };
      const marker = filter.inventoryHistory?.$not?.$elemMatch;
      if (marker && product.inventoryHistory.some((entry) =>
        String(entry.returnRequestId) === String(marker.returnRequestId)
        && Number(entry.itemIndex) === Number(marker.itemIndex)
      )) return { modifiedCount: 0 };

      const variantFilter = filter.variants?.$elemMatch;
      let variant;
      if (variantFilter) {
        variant = product.variants.find((entry) => String(entry._id) === String(variantFilter._id));
        if (!variant || (variantFilter.stock && !Number.isInteger(variant.stock))) return { modifiedCount: 0 };
      } else if (filter.stock && !Number.isInteger(product.stock)) {
        return { modifiedCount: 0 };
      }

      if (update.$inc?.stock) product.stock += update.$inc.stock;
      if (update.$inc?.["variants.$[variant].stock"]) variant.stock += update.$inc["variants.$[variant].stock"];
      product.inventoryHistory.push(...update.$push.inventoryHistory.$each);
      return { modifiedCount: 1 };
    },
    findById() {
      return {
        select() {
          return {
            lean: async () => structuredClone(product),
          };
        },
      };
    },
  };
}

test("return inspection requires complete, nonnegative whole-unit dispositions for each line", () => {
  const normalized = normalizeReturnInspectionLines(
    [{ itemIndex: 2, quantity: 3 }],
    [{ itemIndex: 2, restockedQuantity: "1", damagedQuantity: "1", discardedQuantity: "1" }]
  );
  assert.deepEqual(normalized, [{ itemIndex: 2, restockedQuantity: 1, damagedQuantity: 1, discardedQuantity: 1 }]);

  assert.throws(
    () => normalizeReturnInspectionLines([{ itemIndex: 0, quantity: 2 }], [{ itemIndex: 0, restockedQuantity: 1, damagedQuantity: 0, discardedQuantity: 0 }]),
    { statusCode: 400, message: /must total 2/ }
  );
  assert.throws(
    () => normalizeReturnInspectionLines([{ itemIndex: 0, quantity: 1 }], [{ itemIndex: 0, restockedQuantity: -1, damagedQuantity: 2, discardedQuantity: 0 }]),
    { statusCode: 400 }
  );
});

test("return inspection restores sellable stock once and records damaged/discarded quantities", async () => {
  const product = { _id: "product-1", stock: 5, variants: [], inventoryHistory: [] };
  const args = {
    Product: createProductModel(product),
    order: { _id: "order-1", items: [{ product: "product-1", name: "Shirt" }] },
    request: { _id: "return-1" },
    inspectionLines: [{ itemIndex: 0, restockedQuantity: 1, damagedQuantity: 1, discardedQuantity: 1 }],
    inspectionNote: "Received and inspected",
  };

  await applyReturnInspection(args);
  await applyReturnInspection(args);

  assert.equal(product.stock, 6);
  assert.equal(product.inventoryHistory.length, 1);
  assert.equal(product.inventoryHistory[0].type, "return_inspected");
  assert.equal(product.inventoryHistory[0].delta, 1);
  assert.equal(product.inventoryHistory[0].restockedQuantity, 1);
  assert.equal(product.inventoryHistory[0].damagedQuantity, 1);
  assert.equal(product.inventoryHistory[0].discardedQuantity, 1);
});

test("non-sellable returns are recorded without changing sellable stock", async () => {
  const product = { _id: "product-1", stock: 5, variants: [], inventoryHistory: [] };
  await applyReturnInspection({
    Product: createProductModel(product),
    order: { _id: "order-1", items: [{ product: "product-1", name: "Shirt" }] },
    request: { _id: "return-1" },
    inspectionLines: [{ itemIndex: 0, restockedQuantity: 0, damagedQuantity: 1, discardedQuantity: 0 }],
    inspectionNote: "Item is damaged",
  });

  assert.equal(product.stock, 5);
  assert.equal(product.inventoryHistory[0].delta, 0);
  assert.equal(product.inventoryHistory[0].damagedQuantity, 1);
});

test("return inspection restocks the ordered variant instead of the parent product", async () => {
  const product = { _id: "product-1", stock: 10, variants: [{ _id: "variant-1", stock: 2 }], inventoryHistory: [] };
  await applyReturnInspection({
    Product: createProductModel(product),
    order: { _id: "order-1", items: [{ product: "product-1", variantId: "variant-1", variantName: "Blue", name: "Shirt" }] },
    request: { _id: "return-1" },
    inspectionLines: [{ itemIndex: 0, restockedQuantity: 1, damagedQuantity: 0, discardedQuantity: 0 }],
    inspectionNote: "Received and inspected",
  });

  assert.equal(product.stock, 10);
  assert.equal(product.variants[0].stock, 3);
  assert.equal(product.inventoryHistory[0].variantId, "variant-1");
});

test("return inspection restocks a variant at the shop that fulfilled the order", async () => {
  const product = {
    _id: "product-1",
    shop: "shop-primary",
    stock: 10,
    variants: [{ _id: "variant-1", stock: 5 }],
    inventoryLocations: [{ shop: "shop-east", variants: [{ variantId: "variant-1", stock: 2 }] }],
    inventoryHistory: [],
  };
  const Product = {
    async updateOne(filter, update) {
      const locationFilter = filter.inventoryLocations?.$elemMatch;
      if (!locationFilter || String(locationFilter.shop) !== "shop-east") return { modifiedCount: 0 };
      if (product.inventoryHistory.some((entry) => String(entry.returnRequestId) === String(filter.inventoryHistory.$not.$elemMatch.returnRequestId)
        && Number(entry.itemIndex) === Number(filter.inventoryHistory.$not.$elemMatch.itemIndex))) return { modifiedCount: 0 };
      const variant = product.inventoryLocations[0].variants[0];
      if (update.$inc?.["inventoryLocations.$[location].variants.$[variant].stock"]) {
        variant.stock += update.$inc["inventoryLocations.$[location].variants.$[variant].stock"];
      }
      product.inventoryHistory.push(...update.$push.inventoryHistory.$each);
      return { modifiedCount: 1 };
    },
    findById() {
      return {
        select() { return { lean: async () => structuredClone(product) }; },
      };
    },
  };
  await applyReturnInspection({
    Product,
    order: { _id: "order-1", items: [{ product: "product-1", productShopId: "shop-primary", shopId: "shop-east", variantId: "variant-1", variantName: "Blue", name: "Shirt" }] },
    request: { _id: "return-east" },
    inspectionLines: [{ itemIndex: 0, restockedQuantity: 1, damagedQuantity: 0, discardedQuantity: 0 }],
    inspectionNote: "Inspected",
  });

  assert.equal(product.variants[0].stock, 5);
  assert.equal(product.inventoryLocations[0].variants[0].stock, 3);
  assert.equal(product.inventoryHistory[0].shopId, "shop-east");
});

test("return cannot be restocked while its current stock is unconfirmed", async () => {
  const product = { _id: "product-1", variants: [], inventoryHistory: [] };
  await assert.rejects(
    applyReturnInspection({
      Product: createProductModel(product),
      order: { _id: "order-1", items: [{ product: "product-1", name: "Shirt" }] },
      request: { _id: "return-1" },
      inspectionLines: [{ itemIndex: 0, restockedQuantity: 1, damagedQuantity: 0, discardedQuantity: 0 }],
      inspectionNote: "Received and inspected",
    }),
    { statusCode: 409, message: /Confirm stock/ }
  );
});
