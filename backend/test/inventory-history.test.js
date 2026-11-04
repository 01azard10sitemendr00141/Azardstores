const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INVENTORY_HISTORY_LIMIT,
  createDeltaMovement,
  createInitialInventoryHistory,
  createInventoryChanges,
  isBelowReorderLevel,
} = require("../utils/inventoryHistory");

test("initial inventory history records simple and variant stock without inventing unknown values", () => {
  const entries = createInitialInventoryHistory({
    stock: 4,
    variants: [
      { _id: "variant-1", name: "Blue", stock: 2 },
      { _id: "variant-2", name: "Red" },
    ],
  }, "initial", "csv-import");

  assert.equal(entries.length, 2);
  assert.equal(entries[0].stock, 4);
  assert.equal(entries[0].previousStock, null);
  assert.equal(entries[0].source, "csv-import");
  assert.equal(entries[1].variantName, "Blue");
  assert.equal(entries[1].stock, 2);
});

test("inventory changes record only changed parent and variant quantities", () => {
  const entries = createInventoryChanges(
    { stock: 8, variants: [
      { _id: "variant-1", name: "Blue", stock: 5 },
      { _id: "variant-3", name: "Green", stock: 1 },
    ] },
    {
      stock: 3,
      variants: [
        { _id: "variant-1", name: "Blue", stock: 2 },
        { _id: "variant-2", name: "Red", stock: 6 },
      ],
    },
    "admin_adjustment",
    "product-editor",
  );

  assert.deepEqual(entries.map(({ previousStock, stock, delta, variantName }) => ({ previousStock, stock, delta, variantName })), [
    { previousStock: 8, stock: 3, delta: -5, variantName: undefined },
    { previousStock: 5, stock: 2, delta: -3, variantName: "Blue" },
    { previousStock: null, stock: 6, delta: null, variantName: "Red" },
    { previousStock: 1, stock: null, delta: null, variantName: "Green" },
  ]);
});

test("order stock movements preserve signed deltas and history remains bounded", () => {
  const movement = createDeltaMovement("order_reserved", -2, { source: "order" });
  assert.equal(movement.delta, -2);
  assert.equal(movement.stock, null);

  const entries = createInitialInventoryHistory({
    variants: Array.from({ length: INVENTORY_HISTORY_LIMIT + 10 }, (_, index) => ({ name: `Option ${index}`, stock: index })),
  });
  assert.equal(entries.length, INVENTORY_HISTORY_LIMIT);
});

test("reorder alerts use configured thresholds and do not infer unknown quantities", () => {
  assert.equal(isBelowReorderLevel(3, 5), true);
  assert.equal(isBelowReorderLevel(0, 0), true);
  assert.equal(isBelowReorderLevel(6, 5), false);
  assert.equal(isBelowReorderLevel(undefined, 5), false);
  assert.equal(isBelowReorderLevel(2, -1), false);
});
