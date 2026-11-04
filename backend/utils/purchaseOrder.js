const crypto = require("node:crypto");
const { INVENTORY_HISTORY_LIMIT, createDeltaMovement } = require("./inventoryHistory");

function purchaseOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `PO-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function normalizePurchaseOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    const error = new Error("Add between 1 and 100 products to the purchase order.");
    error.statusCode = 400;
    throw error;
  }
  const seen = new Set();
  return items.map((item) => {
    const productId = String(item?.productId || "");
    const variantId = item?.variantId ? String(item.variantId) : "";
    const key = `${productId}:${variantId}`;
    const quantityOrdered = Number(item?.quantityOrdered);
    const unitCost = Number(item?.unitCost);
    if (!productId || seen.has(key)) {
      const error = new Error(seen.has(key) ? "Each product option can appear only once per purchase order." : "Choose a product for every purchase-order line.");
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isSafeInteger(quantityOrdered) || quantityOrdered < 1 || quantityOrdered > 1000000) {
      const error = new Error("Each ordered quantity must be a whole number from 1 to 1,000,000.");
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1000000000) {
      const error = new Error("Each unit cost must be a valid amount from 0 to 1,000,000,000.");
      error.statusCode = 400;
      throw error;
    }
    seen.add(key);
    const shopId = item?.shopId ? String(item.shopId) : "";
    return { productId, variantId: variantId || null, shopId: shopId || null, quantityOrdered, unitCost };
  });
}

function normalizeReceiptLines(purchaseOrder, input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > purchaseOrder.items.length) {
    const error = new Error("Choose at least one purchase-order line to receive.");
    error.statusCode = 400;
    throw error;
  }
  const seen = new Set();
  return input.map((line) => {
    const lineId = String(line?.purchaseOrderLineId || "");
    const quantity = Number(line?.quantity);
    const item = purchaseOrder.items.find((entry) => String(entry._id) === lineId);
    if (!item || seen.has(lineId)) {
      const error = new Error("Each received line must refer to a unique item on this purchase order.");
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000
      || Number(item.quantityReceived || 0) + quantity > Number(item.quantityOrdered)) {
      const error = new Error(`Received quantity for "${item.productName}" must be a whole number within the remaining ordered quantity.`);
      error.statusCode = 400;
      throw error;
    }
    seen.add(lineId);
    return { purchaseOrderLineId: item._id, quantity };
  });
}

function hasPurchaseReceiptMovement(product, purchaseOrderId, receiptId, lineId) {
  return (product?.inventoryHistory || []).some((entry) =>
    String(entry.purchaseOrderId || "") === String(purchaseOrderId)
    && String(entry.receiptId || "") === String(receiptId)
    && String(entry.purchaseOrderLineId || "") === String(lineId)
  );
}

async function applyPurchaseReceipt({ Product, purchaseOrder, receipt }) {
  for (const receiptLine of receipt.lines) {
    if (receiptLine.inventoryAppliedAt) continue;
    const item = purchaseOrder.items.find((entry) => String(entry._id) === String(receiptLine.purchaseOrderLineId));
    if (!item) {
      const error = new Error("A received line no longer matches an item on this purchase order.");
      error.statusCode = 409;
      throw error;
    }
    const quantity = Number(receiptLine.quantity);
    const movement = createDeltaMovement("purchase_order_received", quantity, {
      variantId: item.variantId || null,
      variantName: item.variantName || "",
      shopId: item.shopId || item.productShopId || null,
      purchaseOrderId: purchaseOrder._id,
      purchaseOrderLineId: item._id,
      receiptId: receipt.receiptId,
      source: "purchase-order",
      reason: `${purchaseOrder.orderNumber}${receipt.note ? ` · ${receipt.note}` : ""}`,
    });
    const secondaryShop = item.shopId && item.productShopId && String(item.shopId) !== String(item.productShopId);
    if (secondaryShop) {
      let product = await Product.findById(item.product)
        .select("shop variants._id +inventoryLocations +inventoryHistory")
        .lean();
      if (!product) {
        const error = new Error(`Product "${item.productName}" no longer exists.`);
        error.statusCode = 409;
        throw error;
      }
      if (hasPurchaseReceiptMovement(product, purchaseOrder._id, receipt.receiptId, item._id)) {
        await markReceiptLineApplied(purchaseOrder, receipt.receiptId, item._id);
        continue;
      }
      if (!(product.inventoryLocations || []).some((location) => String(location.shop) === String(item.shopId))) {
        const location = product.variants?.length
          ? {
              shop: item.shopId,
              variants: product.variants.map((variant) => ({
                variantId: variant._id,
                ...(String(variant._id) === String(item.variantId) ? { stock: 0 } : {}),
              })),
            }
          : { shop: item.shopId, stock: 0 };
        await Product.updateOne(
          { _id: item.product, inventoryLocations: { $not: { $elemMatch: { shop: item.shopId } } } },
          { $push: { inventoryLocations: location } },
          { runValidators: true }
        );
      }
    }
    const marker = {
      inventoryHistory: { $not: { $elemMatch: {
        purchaseOrderId: purchaseOrder._id,
        receiptId: receipt.receiptId,
        purchaseOrderLineId: item._id,
      } } },
    };
    const update = {
      $inc: {},
      $push: { inventoryHistory: { $each: [movement], $slice: -INVENTORY_HISTORY_LIMIT } },
    };
    let filter;
    let options = {};
    if (secondaryShop && item.variantId) {
      filter = {
        _id: item.product,
        ...marker,
        inventoryLocations: {
          $elemMatch: {
            shop: item.shopId,
            variants: {
              $elemMatch: {
                variantId: item.variantId,
                stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity },
              },
            },
          },
        },
      };
      update.$inc["inventoryLocations.$[location].variants.$[variant].stock"] = quantity;
      options = { arrayFilters: [{ "location.shop": item.shopId }, { "variant.variantId": item.variantId }] };
    } else if (secondaryShop) {
      filter = {
        _id: item.product,
        ...marker,
        inventoryLocations: {
          $elemMatch: {
            shop: item.shopId,
            stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity },
          },
        },
      };
      update.$inc["inventoryLocations.$[location].stock"] = quantity;
      options = { arrayFilters: [{ "location.shop": item.shopId }] };
    } else if (item.variantId) {
      filter = {
        _id: item.product,
        ...marker,
        variants: {
          $elemMatch: {
            _id: item.variantId,
            stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity },
          },
        },
      };
      update.$inc["variants.$[variant].stock"] = quantity;
      options = { arrayFilters: [{ "variant._id": item.variantId }] };
    } else {
      filter = {
        _id: item.product,
        ...marker,
        stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity },
      };
      update.$inc.stock = quantity;
    }

    const result = await Product.updateOne(filter, update, options);
    if (!result.modifiedCount) {
      const currentProduct = await Product.findById(item.product).select("shop stock variants._id variants.stock +inventoryHistory +inventoryLocations").lean();
      if (!currentProduct) {
        const error = new Error(`Product "${item.productName}" no longer exists.`);
        error.statusCode = 409;
        throw error;
      }
      if (hasPurchaseReceiptMovement(currentProduct, purchaseOrder._id, receipt.receiptId, item._id)) {
        await markReceiptLineApplied(purchaseOrder, receipt.receiptId, item._id);
        continue;
      }
      const location = secondaryShop && currentProduct.inventoryLocations?.find((entry) => String(entry.shop) === String(item.shopId));
      const variant = item.variantId && (secondaryShop
        ? location?.variants?.find((entry) => String(entry.variantId) === String(item.variantId))
        : currentProduct.variants?.find((entry) => String(entry._id) === String(item.variantId)));
      if (item.variantId && !variant) {
        const error = new Error(`Option "${item.variantName}" no longer exists on "${item.productName}".`);
        error.statusCode = 409;
        throw error;
      }
      const stock = secondaryShop ? item.variantId ? variant?.stock : location?.stock : item.variantId ? variant.stock : currentProduct.stock;
      const label = item.variantId ? `${item.productName} (${item.variantName})` : item.productName;
      if (!Number.isInteger(stock)) {
        const error = new Error(`Confirm current stock for "${label}" before receiving this purchase order.`);
        error.statusCode = 409;
        throw error;
      }
      if (!Number.isSafeInteger(stock + quantity)) {
        const error = new Error(`Receiving this quantity would exceed supported stock for "${label}".`);
        error.statusCode = 409;
        throw error;
      }
      const error = new Error(`Could not record receipt for "${label}". Refresh and retry.`);
      error.statusCode = 409;
      throw error;
    }
    await markReceiptLineApplied(purchaseOrder, receipt.receiptId, item._id);
  }
}

async function markReceiptLineApplied(purchaseOrder, receiptId, lineId) {
  const result = await purchaseOrder.constructor.updateOne(
    { _id: purchaseOrder._id, receipts: { $elemMatch: { receiptId } } },
    { $set: { "receipts.$[receipt].lines.$[line].inventoryAppliedAt": new Date() } },
    { arrayFilters: [{ "receipt.receiptId": receiptId }, { "line.purchaseOrderLineId": lineId }] }
  );
  if (!result.modifiedCount) {
    const error = new Error("Stock was received but its purchase-order receipt could not be marked complete. Retry the saved receipt.");
    error.statusCode = 409;
    throw error;
  }
}

module.exports = {
  purchaseOrderNumber,
  normalizePurchaseOrderItems,
  normalizeReceiptLines,
  hasPurchaseReceiptMovement,
  applyPurchaseReceipt,
};
