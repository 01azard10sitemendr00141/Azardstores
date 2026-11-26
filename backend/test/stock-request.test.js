const test = require("node:test");
const assert = require("node:assert/strict");
const stockRequestsRouter = require("../routes/stockRequests");
const {
  QUOTE_VALIDITY_MS,
  quoteExpiryFrom,
  validateSetAsideQuantity,
  canExtendQuote,
  stockRequestCanCancel,
  stockRequestBelongsToUser,
} = require("../utils/stockRequest");

test("a quote is valid for exactly 12 hours", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");
  assert.equal(QUOTE_VALIDITY_MS, 12 * 60 * 60 * 1000);
  assert.equal(quoteExpiryFrom(now).toISOString(), "2026-11-19T00:00:00.000Z");
});

test("set-aside quantity must exactly match the requested quantity", () => {
  assert.equal(validateSetAsideQuantity(3, 3), 3);
  assert.throws(() => validateSetAsideQuantity(3, 2), { statusCode: 400 });
  assert.throws(() => validateSetAsideQuantity(3, 4), { statusCode: 400 });
});

test("only an active quote without a prior extension can be extended", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");
  assert.equal(canExtendQuote({
    status: "quoted",
    quoteExtensionCount: 0,
    quoteExpiresAt: new Date("2026-11-18T15:00:00.000Z"),
  }, now), true);
  assert.equal(canExtendQuote({
    status: "quoted",
    quoteExtensionCount: 1,
    quoteExpiresAt: new Date("2026-11-18T15:00:00.000Z"),
  }, now), false);
  assert.equal(canExtendQuote({
    status: "expired",
    quoteExtensionCount: 0,
    quoteExpiresAt: new Date("2026-11-18T15:00:00.000Z"),
  }, now), false);
});

test("only active stock-check states can be cancelled by the customer", () => {
  for (const status of ["checking", "partial", "quoted"]) assert.equal(stockRequestCanCancel({ status }), true);
  for (const status of ["expired", "released", "cancelled"]) assert.equal(stockRequestCanCancel({ status }), false);
});

test("stock requests belong to the matching account ID or customer email", () => {
  const user = { _id: "user-1", email: "customer@example.com" };
  assert.equal(stockRequestBelongsToUser({ user: "user-1", guestInfo: {} }, user), true);
  assert.equal(stockRequestBelongsToUser({ user: "legacy-user", guestInfo: { email: "CUSTOMER@example.com" } }, user), true);
  assert.equal(stockRequestBelongsToUser({ user: "legacy-user", guestInfo: { email: "other@example.com" } }, user), false);
});

test("stock-request collection routes are registered before the dynamic request-ID route", () => {
  const routes = stockRequestsRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(routes.indexOf("/admin") >= 0);
  assert.ok(routes.indexOf("/mine") >= 0);
  assert.ok(routes.indexOf("/admin") < routes.indexOf("/:id"));
  assert.ok(routes.indexOf("/mine") < routes.indexOf("/:id"));
});
