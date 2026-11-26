const test = require("node:test");
const assert = require("node:assert/strict");
const { loadingQueueFilter, incompleteLoadingItems, validateLoadedQuantity } = require("../utils/loadingQueue");

test("loading-zone database filter only selects ready confirmed orders", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");
  const filter = loadingQueueFilter(now);
  assert.equal(filter.status, "confirmed");
  assert.equal(filter.paymentStatus, "paid");
  assert.deepEqual(filter.$and, [
    { $or: [{ stockRequest: null }, { checkoutDetailsCompletedAt: { $ne: null } }] },
    { $or: [{ stockReservedUntil: null }, { stockReservedUntil: { $gt: now } }] },
    { cancellationRequests: { $not: { $elemMatch: { status: "pending" } } } },
  ]);
});

test("loading checklist requires every item to have an exact confirmed quantity", () => {
  const items = [
    { name: "One", quantity: 2, loadedQuantity: 2, loadedAt: new Date() },
    { name: "Two", quantity: 1, loadedQuantity: 0, loadedAt: null },
  ];
  assert.deepEqual(incompleteLoadingItems({ items }), [items[1]]);
  assert.doesNotThrow(() => validateLoadedQuantity(items[0], 2));
  assert.throws(() => validateLoadedQuantity(items[0], 1), { statusCode: 409 });
  assert.throws(() => validateLoadedQuantity(items[0], 1.5), { statusCode: 400 });
});
