const test = require("node:test");
const assert = require("node:assert/strict");
const { createActiveShopIdsLoader } = require("../utils/activeShopIds");

test("shares an active-shop lookup among concurrent requests, then reloads", async () => {
  let calls = 0;
  const loadActiveShopIds = createActiveShopIdsLoader(async () => {
    calls += 1;
    return ["shop-1"];
  });

  const [first, second] = await Promise.all([
    loadActiveShopIds(),
    loadActiveShopIds(),
  ]);
  assert.deepEqual(first, ["shop-1"]);
  assert.strictEqual(second, first);
  assert.equal(calls, 1);

  await loadActiveShopIds();
  assert.equal(calls, 2);
});

test("retries active-shop lookup after a failure", async () => {
  let calls = 0;
  const loadActiveShopIds = createActiveShopIdsLoader(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary query error");
    return ["shop-1"];
  });

  await assert.rejects(loadActiveShopIds(), /temporary query error/);
  assert.deepEqual(await loadActiveShopIds(), ["shop-1"]);
  assert.equal(calls, 2);
});
