const test = require("node:test");
const assert = require("node:assert/strict");
const {
  purchaseOrderNumber,
  normalizePurchaseOrderItems,
  normalizeReceiptLines,
  hasPurchaseReceiptMovement,
  applyPurchaseReceipt,
} = require("../utils/purchaseOrder");

function makePurchaseOrder({ failFirstAppliedMark = false } = {}) {
  const purchaseOrder = {
    _id: "po-1",
    orderNumber: "PO-20261102-ABC123",
    items: [{ _id: "line-1", product: "product-1", productName: "Lamp", variantId: null, quantityOrdered: 5, quantityReceived: 0 }],
    receipts: [{ receiptId: "receipt-1234567890", note: "Delivery", lines: [{ purchaseOrderLineId: "line-1", quantity: 2, inventoryAppliedAt: null }] }],
  };
  purchaseOrder.constructor = {
    updateOne: async (_filter, _update) => {
      const line = purchaseOrder.receipts[0].lines[0];
      if (failFirstAppliedMark) {
        failFirstAppliedMark = false;
        throw new Error("Temporary database error");
      }
      if (line.inventoryAppliedAt) return { modifiedCount: 0 };
      line.inventoryAppliedAt = new Date();
      return { modifiedCount: 1 };
    },
  };
  return purchaseOrder;
}

function makeProductModel(product) {
  return {
    async updateOne(filter, update) {
      if (String(filter._id) !== String(product._id)) return { modifiedCount: 0 };
      if (update.$push?.inventoryLocations) {
        product.inventoryLocations ||= [];
        if (!product.inventoryLocations.some((location) => String(location.shop) === String(update.$push.inventoryLocations.shop))) {
          product.inventoryLocations.push(structuredClone(update.$push.inventoryLocations));
        }
        return { modifiedCount: 1 };
      }
      const marker = filter.inventoryHistory?.$not?.$elemMatch;
      if (marker && hasPurchaseReceiptMovement(product, marker.purchaseOrderId, marker.receiptId, marker.purchaseOrderLineId)) return { modifiedCount: 0 };
      const variantFilter = filter.variants?.$elemMatch;
      const locationFilter = filter.inventoryLocations?.$elemMatch;
      let variant;
      let location;
      if (locationFilter) {
        location = product.inventoryLocations?.find((entry) => String(entry.shop) === String(locationFilter.shop));
        if (!location) return { modifiedCount: 0 };
        if (locationFilter.variants?.$elemMatch) {
          variant = location.variants?.find((entry) => String(entry.variantId) === String(locationFilter.variants.$elemMatch.variantId));
          if (!variant || !Number.isInteger(variant.stock)) return { modifiedCount: 0 };
        } else if (!Number.isInteger(location.stock)) return { modifiedCount: 0 };
      } else if (variantFilter) {
        variant = product.variants.find((entry) => String(entry._id) === String(variantFilter._id));
        if (!variant || !Number.isInteger(variant.stock)) return { modifiedCount: 0 };
      } else if (!Number.isInteger(product.stock)) return { modifiedCount: 0 };

      if (update.$inc.stock) product.stock += update.$inc.stock;
      if (update.$inc["variants.$[variant].stock"]) variant.stock += update.$inc["variants.$[variant].stock"];
      if (update.$inc["inventoryLocations.$[location].stock"]) location.stock += update.$inc["inventoryLocations.$[location].stock"];
      if (update.$inc["inventoryLocations.$[location].variants.$[variant].stock"]) variant.stock += update.$inc["inventoryLocations.$[location].variants.$[variant].stock"];
      product.inventoryHistory.push(...update.$push.inventoryHistory.$each);
      return { modifiedCount: 1 };
    },
    findById() {
      return {
        select() {
          return { lean: async () => structuredClone(product) };
        },
      };
    },
  };
}

test("purchase-order numbers include a date and unique suffix", () => {
  const number = purchaseOrderNumber(new Date("2026-11-02T00:00:00.000Z"));
  assert.match(number, /^PO-20261102-[A-F0-9]{6}$/);
});

test("purchase-order lines validate quantities, costs, and duplicate options", () => {
  assert.deepEqual(normalizePurchaseOrderItems([
    { productId: "product-1", quantityOrdered: "4", unitCost: "12.5" },
  ]), [{ productId: "product-1", variantId: null, shopId: null, quantityOrdered: 4, unitCost: 12.5 }]);
  assert.throws(() => normalizePurchaseOrderItems([
    { productId: "product-1", quantityOrdered: 2, unitCost: 10 },
    { productId: "product-1", quantityOrdered: 3, unitCost: 10 },
  ]), { statusCode: 400, message: /only once/ });
  assert.throws(() => normalizePurchaseOrderItems([
    { productId: "product-1", quantityOrdered: 0, unitCost: 10 },
  ]), { statusCode: 400 });
});

test("receipt lines cannot exceed ordered remaining quantity", () => {
  const purchaseOrder = { items: [{ _id: "line-1", productName: "Lamp", quantityOrdered: 5, quantityReceived: 2 }] };
  assert.deepEqual(normalizeReceiptLines(purchaseOrder, [{ purchaseOrderLineId: "line-1", quantity: "3" }]), [
    { purchaseOrderLineId: "line-1", quantity: 3 },
  ]);
  assert.throws(
    () => normalizeReceiptLines(purchaseOrder, [{ purchaseOrderLineId: "line-1", quantity: 4 }]),
    { statusCode: 400, message: /remaining ordered quantity/ }
  );
});

test("purchase receipts increase stock once and link history to the receipt", async () => {
  const product = { _id: "product-1", stock: 3, variants: [], inventoryHistory: [] };
  const purchaseOrder = makePurchaseOrder();
  const args = { Product: makeProductModel(product), purchaseOrder, receipt: purchaseOrder.receipts[0] };

  await applyPurchaseReceipt(args);
  await applyPurchaseReceipt(args);

  assert.equal(product.stock, 5);
  assert.equal(product.inventoryHistory.length, 1);
  assert.equal(product.inventoryHistory[0].type, "purchase_order_received");
  assert.equal(product.inventoryHistory[0].delta, 2);
  assert.equal(product.inventoryHistory[0].purchaseOrderId, "po-1");
  assert.equal(product.inventoryHistory[0].receiptId, "receipt-1234567890");
  assert.ok(purchaseOrder.receipts[0].lines[0].inventoryAppliedAt);
});

test("purchase receipt retry recovers a stock update interrupted before its receipt marker", async () => {
  const product = { _id: "product-1", stock: 3, variants: [], inventoryHistory: [] };
  const purchaseOrder = makePurchaseOrder({ failFirstAppliedMark: true });
  const args = { Product: makeProductModel(product), purchaseOrder, receipt: purchaseOrder.receipts[0] };

  await assert.rejects(applyPurchaseReceipt(args), /Temporary database error/);
  await applyPurchaseReceipt(args);

  assert.equal(product.stock, 5);
  assert.equal(product.inventoryHistory.length, 1);
  assert.ok(purchaseOrder.receipts[0].lines[0].inventoryAppliedAt);
});

test("purchase receipt restocks the selected variant only", async () => {
  const product = { _id: "product-1", stock: 8, variants: [{ _id: "variant-1", stock: 2 }], inventoryHistory: [] };
  const purchaseOrder = makePurchaseOrder();
  purchaseOrder.items[0].variantId = "variant-1";
  purchaseOrder.items[0].variantName = "Blue";
  await applyPurchaseReceipt({ Product: makeProductModel(product), purchaseOrder, receipt: purchaseOrder.receipts[0] });

  assert.equal(product.stock, 8);
  assert.equal(product.variants[0].stock, 4);
  assert.equal(product.inventoryHistory[0].variantId, "variant-1");
});

test("purchase receipt initializes and updates the selected secondary shop", async () => {
  const product = { _id: "product-1", shop: "shop-primary", stock: 8, variants: [{ _id: "variant-1", stock: 4 }], inventoryLocations: [], inventoryHistory: [] };
  const purchaseOrder = makePurchaseOrder();
  purchaseOrder.items[0].variantId = "variant-1";
  purchaseOrder.items[0].variantName = "Blue";
  purchaseOrder.items[0].shopId = "shop-east";
  purchaseOrder.items[0].productShopId = "shop-primary";
  await applyPurchaseReceipt({ Product: makeProductModel(product), purchaseOrder, receipt: purchaseOrder.receipts[0] });

  assert.equal(product.stock, 8);
  assert.equal(product.variants[0].stock, 4);
  assert.equal(product.inventoryLocations[0].shop, "shop-east");
  assert.equal(product.inventoryLocations[0].variants[0].stock, 2);
  assert.equal(product.inventoryHistory[0].shopId, "shop-east");
});

test("purchase receipt does not assume unconfirmed stock is zero", async () => {
  const product = { _id: "product-1", variants: [], inventoryHistory: [] };
  const purchaseOrder = makePurchaseOrder();
  await assert.rejects(
    applyPurchaseReceipt({ Product: makeProductModel(product), purchaseOrder, receipt: purchaseOrder.receipts[0] }),
    { statusCode: 409, message: /Confirm current stock/ }
  );
});
