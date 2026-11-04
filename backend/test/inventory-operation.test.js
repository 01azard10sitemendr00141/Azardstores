const test = require("node:test");
const assert = require("node:assert/strict");
const { runInventoryOperation } = require("../utils/inventoryOperation");

test("inventory operations fail clearly when MongoDB transactions are unavailable", async () => {
  const outcome = await runInventoryOperation({ productId: "product", operationId: "operation" }, async () => {
    assert.fail("The inventory operation must not run without transaction support.");
  });

  assert.equal(outcome.statusCode, 503);
  assert.match(outcome.body.message, /replica set or sharded cluster/i);
});
