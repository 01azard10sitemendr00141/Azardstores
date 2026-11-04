const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const Floor = require("../models/Floor");
const InventoryOperation = require("../models/InventoryOperation");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const productsRouter = require("../routes/products");
const { reserveOrderStock, releaseTrackedOrderStock, restoreOrderStockOnce } = require("../utils/orderStock");

let mongo;
let primaryShop;
let secondShop;
let thirdShop;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60_000 }] });
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  const floor = await Floor.create({ floorNumber: 1, name: "Integration Floor" });
  [primaryShop, secondShop, thirdShop] = await Shop.create([
    { shopNumber: 1, name: "Primary Shop", floor: floor._id },
    { shopNumber: 2, name: "Second Shop", floor: floor._id },
    { shopNumber: 3, name: "Third Shop", floor: floor._id },
  ]);
});

function routeHandler(path) {
  const route = productsRouter.stack.find((layer) => layer.route?.path === path)?.route;
  assert.ok(route, `Expected route ${path} to exist`);
  return route.stack.at(-1).handle;
}

async function invokeAdminRoute(path, params, body) {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  let forwardedError;
  await routeHandler(path)({ params, body }, response, (error) => {
    forwardedError = error;
  });
  if (forwardedError) throw forwardedError;
  return response;
}

async function loadInventory(productId) {
  return Product.findById(productId).select("+inventoryLocations +inventoryHistory");
}

test("shop transfer atomically moves stock, records both movements, and safely retries", async () => {
  const product = await Product.create({
    name: "Transfer Product",
    shop: primaryShop._id,
    stock: 10,
    inventoryLocations: [{ shop: secondShop._id, stock: 2 }],
  });
  const params = { id: String(product._id) };
  const body = {
    fromShopId: String(primaryShop._id),
    toShopId: String(secondShop._id),
    quantity: 3,
    transferId: "transfer-integration-001",
    reason: "Move stock for testing",
  };

  const [response, concurrentRetry] = await Promise.all([
    invokeAdminRoute("/admin/:id/stock-transfer", params, body),
    invokeAdminRoute("/admin/:id/stock-transfer", params, body),
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(concurrentRetry.statusCode, 200);
  let updated = await loadInventory(product._id);
  assert.equal(updated.stock, 7);
  assert.equal(updated.inventoryLocations[0].stock, 5);
  assert.equal(updated.inventoryHistory.filter((entry) => entry.transferId === body.transferId).length, 2);
  assert.equal(await InventoryOperation.countDocuments({ productId: product._id, operationId: body.transferId }), 1);

  const retry = await invokeAdminRoute("/admin/:id/stock-transfer", params, body);
  assert.equal(retry.statusCode, 200);
  updated = await loadInventory(product._id);
  assert.equal(updated.stock, 7);
  assert.equal(updated.inventoryLocations[0].stock, 5);
  assert.equal(updated.inventoryHistory.filter((entry) => entry.transferId === body.transferId).length, 2);
});

test("concurrent transfers cannot overspend the same source stock", async () => {
  const product = await Product.create({
    name: "Concurrent Transfer Product",
    shop: primaryShop._id,
    stock: 5,
    inventoryLocations: [],
  });
  const params = { id: String(product._id) };
  const transfer = (toShop, transferId) => invokeAdminRoute("/admin/:id/stock-transfer", params, {
    fromShopId: String(primaryShop._id),
    toShopId: String(toShop._id),
    quantity: 4,
    transferId,
    reason: "Concurrent stock test",
  });
  const responses = await Promise.all([
    transfer(secondShop, "transfer-concurrent-001"),
    transfer(thirdShop, "transfer-concurrent-002"),
  ]);

  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
  const updated = await loadInventory(product._id);
  assert.equal(updated.stock, 1);
  assert.equal(updated.inventoryLocations.length, 1);
  assert.equal(updated.inventoryLocations.reduce((sum, location) => sum + location.stock, 0), 4);
});

test("variant transfers update only the selected variant at each secondary shop", async () => {
  const variantId = new mongoose.Types.ObjectId();
  const product = await Product.create({
    name: "Variant Transfer Product",
    shop: primaryShop._id,
    variants: [{ _id: variantId, name: "Green", stock: 2 }],
    inventoryLocations: [
      { shop: secondShop._id, variants: [{ variantId, stock: 5 }] },
      { shop: thirdShop._id, variants: [{ variantId, stock: 1 }] },
    ],
  });

  const response = await invokeAdminRoute("/admin/:id/stock-transfer", { id: String(product._id) }, {
    fromShopId: String(secondShop._id),
    toShopId: String(thirdShop._id),
    variantId: String(variantId),
    quantity: 2,
    transferId: "transfer-variant-integration-001",
    reason: "Move variant stock",
  });

  assert.equal(response.statusCode, 200);
  const updated = await loadInventory(product._id);
  assert.equal(updated.variants[0].stock, 2);
  assert.equal(updated.inventoryLocations[0].variants[0].stock, 3);
  assert.equal(updated.inventoryLocations[1].variants[0].stock, 3);
});

test("secondary-shop stock counts use compare-and-set and retry idempotently", async () => {
  const product = await Product.create({
    name: "Count Product",
    shop: primaryShop._id,
    stock: 8,
    inventoryLocations: [{ shop: secondShop._id, stock: 5 }],
  });
  const params = { id: String(product._id) };
  const body = {
    shopId: String(secondShop._id),
    expectedStock: 5,
    countedStock: 3,
    operationId: "stock-count-integration-001",
    reason: "Physical count correction",
  };

  const response = await invokeAdminRoute("/admin/:id/stock-count", params, body);
  assert.equal(response.statusCode, 200);
  let updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 3);
  assert.equal(updated.inventoryHistory.filter((entry) => entry.operationId === body.operationId).length, 1);
  assert.equal(await InventoryOperation.countDocuments({ productId: product._id, operationId: body.operationId }), 1);

  const retry = await invokeAdminRoute("/admin/:id/stock-count", params, body);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.stock, 3);
  updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 3);
  assert.equal(updated.inventoryHistory.filter((entry) => entry.operationId === body.operationId).length, 1);

  const reusedKey = await invokeAdminRoute("/admin/:id/stock-count", params, {
    ...body,
    countedStock: 4,
  });
  assert.equal(reusedKey.statusCode, 409);
  updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 3);

  const staleCount = await invokeAdminRoute("/admin/:id/stock-count", params, {
    ...body,
    operationId: "stock-count-integration-002",
  });
  assert.equal(staleCount.statusCode, 409);
  updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 3);

  const reservationId = new mongoose.Types.ObjectId();
  await reserveOrderStock([{
    product: product._id,
    name: product.name,
    quantity: 1,
    shopId: secondShop._id,
    productShopId: primaryShop._id,
  }], reservationId);
  const reservedCount = await invokeAdminRoute("/admin/:id/stock-count", params, {
    ...body,
    expectedStock: 2,
    countedStock: 1,
    operationId: "stock-count-integration-003",
  });
  assert.equal(reservedCount.statusCode, 409);
  updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 2);
  assert.equal(updated.inventoryLocations[0].stockReservations.length, 1);
});

test("durable transfer idempotency survives inventory-history trimming", async () => {
  const product = await Product.create({
    name: "Durable Operation Product",
    shop: primaryShop._id,
    stock: 10,
    inventoryLocations: [{ shop: secondShop._id, stock: 0 }],
  });
  const params = { id: String(product._id) };
  const body = {
    fromShopId: String(primaryShop._id),
    toShopId: String(secondShop._id),
    quantity: 1,
    transferId: "transfer-durable-integration-001",
    reason: "Test durable operation",
  };
  const first = await invokeAdminRoute("/admin/:id/stock-transfer", params, body);
  assert.equal(first.statusCode, 200);

  await Product.updateOne(
    { _id: product._id },
    {
      $push: {
        inventoryHistory: {
          $each: Array.from({ length: 101 }, () => ({
            type: "restock",
            delta: 1,
            source: "integration-history-trim",
          })),
          $slice: -100,
        },
      },
    }
  );
  const trimmed = await loadInventory(product._id);
  assert.equal(trimmed.inventoryHistory.some((entry) => entry.transferId === body.transferId), false);

  const retry = await invokeAdminRoute("/admin/:id/stock-transfer", params, body);
  assert.equal(retry.statusCode, 200);
  assert.match(retry.body.message, /already recorded/i);
  const updated = await loadInventory(product._id);
  assert.equal(updated.stock, 9);
  assert.equal(updated.inventoryLocations[0].stock, 1);
  assert.equal(await InventoryOperation.countDocuments({ productId: product._id, operationId: body.transferId }), 1);
});

test("concurrent secondary-shop reservations cannot oversell available stock", async () => {
  const product = await Product.create({
    name: "Concurrent Reservation Product",
    shop: primaryShop._id,
    stock: 1,
    inventoryLocations: [{ shop: secondShop._id, stock: 5 }],
  });
  const item = {
    product: product._id,
    name: product.name,
    quantity: 4,
    shopId: secondShop._id,
    productShopId: primaryShop._id,
  };
  const reservations = await Promise.allSettled([
    reserveOrderStock([item], new mongoose.Types.ObjectId()),
    reserveOrderStock([item], new mongoose.Types.ObjectId()),
  ]);

  assert.deepEqual(reservations.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  const updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].stock, 1);
  assert.equal(updated.inventoryLocations[0].stockReservations.length, 1);
  assert.equal(updated.inventoryHistory.filter((entry) => entry.type === "order_reserved").length, 1);
});

test("order cancellation restores a secondary-shop reservation once, including concurrent retries", async () => {
  const product = await Product.create({
    name: "Cancellation Product",
    shop: primaryShop._id,
    stock: 1,
    inventoryLocations: [{ shop: secondShop._id, stock: 5 }],
  });
  const orderId = new mongoose.Types.ObjectId();
  const item = {
    product: product._id,
    name: product.name,
    quantity: 2,
    price: 4,
    shopId: secondShop._id,
    productShopId: primaryShop._id,
  };
  await reserveOrderStock([item], orderId);
  const order = await Order.create({
    _id: orderId,
    items: [item],
    totalAmount: 8,
    stockReservedAt: new Date(),
    stockReservationTracked: true,
  });

  await Promise.all([restoreOrderStockOnce(order), restoreOrderStockOnce(order)]);
  const updated = await loadInventory(product._id);
  const restoredOrder = await Order.findById(orderId);
  assert.equal(updated.inventoryLocations[0].stock, 5);
  assert.equal(updated.inventoryLocations[0].stockReservations.length, 0);
  assert.ok(restoredOrder.stockRestoredAt);

  await restoreOrderStockOnce(restoredOrder);
  const retried = await loadInventory(product._id);
  assert.equal(retried.inventoryLocations[0].stock, 5);
});

test("secondary-shop variant reservations and releases use nested array filters idempotently", async () => {
  const variantId = new mongoose.Types.ObjectId();
  const product = await Product.create({
    name: "Variant Reservation Product",
    shop: primaryShop._id,
    variants: [{ _id: variantId, name: "Blue", stock: 2 }],
    inventoryLocations: [{
      shop: secondShop._id,
      variants: [{ variantId, stock: 6 }],
    }],
  });

  const orderId = new mongoose.Types.ObjectId();
  const item = {
    product: product._id,
    name: product.name,
    quantity: 2,
    variantId,
    variantName: "Blue",
    shopId: secondShop._id,
    productShopId: primaryShop._id,
  };
  await reserveOrderStock([item], orderId);
  await reserveOrderStock([item], orderId);

  let updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].variants[0].stock, 4);
  assert.equal(updated.inventoryLocations[0].variants[0].stockReservations.length, 1);

  const order = { _id: orderId, items: [item] };
  await releaseTrackedOrderStock(order);
  await releaseTrackedOrderStock(order);
  updated = await loadInventory(product._id);
  assert.equal(updated.inventoryLocations[0].variants[0].stock, 6);
  assert.equal(updated.inventoryLocations[0].variants[0].stockReservations.length, 0);
});
