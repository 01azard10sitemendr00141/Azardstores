const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldRestoreOrderStock } = require("../utils/orderStock");

test("cancellation restores a held reservation once but never returns committed fulfillment stock", () => {
  assert.equal(shouldRestoreOrderStock({ stockReservedAt: new Date() }), true);
  assert.equal(shouldRestoreOrderStock({ stockReservedAt: new Date(), stockRestoredAt: new Date() }), false);
  assert.equal(shouldRestoreOrderStock({ stockReservedAt: new Date(), stockReservationCommittedAt: new Date() }), false);
  assert.equal(shouldRestoreOrderStock({ stockReservedAt: new Date(), events: [{ type: "status_shipped" }] }), false);
  assert.equal(shouldRestoreOrderStock({ stockNeedsReservation: true }), false);
});
