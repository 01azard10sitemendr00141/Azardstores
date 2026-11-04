const { INVENTORY_HISTORY_LIMIT, createDeltaMovement } = require("./inventoryHistory");

function invalidInspection(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeReturnInspectionLines(returnedLines, proposedLines) {
  if (!Array.isArray(proposedLines) || proposedLines.length !== returnedLines.length) {
    throw invalidInspection("Record a disposition for every returned item.");
  }

  const proposedByIndex = new Map();
  for (const line of proposedLines) {
    const itemIndex = Number(line?.itemIndex);
    if (!Number.isInteger(itemIndex) || proposedByIndex.has(itemIndex)) {
      throw invalidInspection("Each returned item must have exactly one inspection disposition.");
    }
    proposedByIndex.set(itemIndex, line);
  }

  return returnedLines.map(({ itemIndex, quantity }) => {
    const line = proposedByIndex.get(itemIndex);
    if (!line) throw invalidInspection("Record a disposition for every returned item.");
    const normalized = {
      itemIndex,
      restockedQuantity: Number(line.restockedQuantity),
      damagedQuantity: Number(line.damagedQuantity),
      discardedQuantity: Number(line.discardedQuantity),
    };
    const counts = [normalized.restockedQuantity, normalized.damagedQuantity, normalized.discardedQuantity];
    if (counts.some((count) => !Number.isInteger(count) || count < 0 || count > 1000000)
      || counts.reduce((sum, count) => sum + count, 0) !== Number(quantity)) {
      throw invalidInspection(`Restocked, damaged, and discarded quantities for item ${itemIndex + 1} must total ${quantity}.`);
    }
    return normalized;
  });
}

function hasRecordedInspection(product, requestId, itemIndex) {
  return (product?.inventoryHistory || []).some((entry) =>
    String(entry.returnRequestId || "") === String(requestId)
    && Number(entry.itemIndex) === Number(itemIndex)
  );
}

async function applyReturnInspection({ Product, order, request, inspectionLines, inspectionNote }) {
  for (const line of inspectionLines) {
    const item = order.items[line.itemIndex];
    if (!item?.product) {
      const error = new Error(`Cannot record the inspection for "${item?.name || "unknown"}" because its product record is missing.`);
      error.statusCode = 409;
      throw error;
    }

    const movement = createDeltaMovement("return_inspected", line.restockedQuantity, {
      variantId: item.variantId || null,
      variantName: item.variantName || "",
      shopId: item.shopId || null,
      orderId: order._id,
      returnRequestId: request._id,
      itemIndex: line.itemIndex,
      restockedQuantity: line.restockedQuantity,
      damagedQuantity: line.damagedQuantity,
      discardedQuantity: line.discardedQuantity,
      source: "order-return",
      reason: String(inspectionNote || "").trim().slice(0, 500),
    });
    const historyUpdate = {
      $push: { inventoryHistory: { $each: [movement], $slice: -INVENTORY_HISTORY_LIMIT } },
    };
    const markerFilter = {
      inventoryHistory: { $not: { $elemMatch: { returnRequestId: request._id, itemIndex: line.itemIndex } } },
    };
    const secondaryShop = item.shopId && item.productShopId && String(item.shopId) !== String(item.productShopId);
    let filter;
    let options = {};

    if (secondaryShop && item.variantId) {
      filter = {
        _id: item.product,
        ...markerFilter,
        inventoryLocations: {
          $elemMatch: {
            shop: item.shopId,
            variants: {
              $elemMatch: {
                variantId: item.variantId,
                ...(line.restockedQuantity > 0 ? {
                  stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - line.restockedQuantity },
                } : {}),
              },
            },
          },
        },
      };
      if (line.restockedQuantity > 0) historyUpdate.$inc = { "inventoryLocations.$[location].variants.$[variant].stock": line.restockedQuantity };
      options = { arrayFilters: [{ "location.shop": item.shopId }, { "variant.variantId": item.variantId }] };
    } else if (secondaryShop) {
      filter = {
        _id: item.product,
        ...markerFilter,
        inventoryLocations: {
          $elemMatch: {
            shop: item.shopId,
            ...(line.restockedQuantity > 0 ? {
              stock: { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - line.restockedQuantity },
            } : {}),
          },
        },
      };
      if (line.restockedQuantity > 0) historyUpdate.$inc = { "inventoryLocations.$[location].stock": line.restockedQuantity };
      options = { arrayFilters: [{ "location.shop": item.shopId }] };
    } else if (item.variantId) {
      filter = {
        _id: item.product,
        ...markerFilter,
        variants: {
          $elemMatch: {
            _id: item.variantId,
            ...(line.restockedQuantity > 0 ? {
              stock: {
                $type: "number",
                $mod: [1, 0],
                $lte: Number.MAX_SAFE_INTEGER - line.restockedQuantity,
              },
            } : {}),
          },
        },
      };
      if (line.restockedQuantity > 0) historyUpdate.$inc = { "variants.$[variant].stock": line.restockedQuantity };
      options = { arrayFilters: [{ "variant._id": item.variantId }] };
    } else {
      filter = {
        _id: item.product,
        ...markerFilter,
        ...(line.restockedQuantity > 0 ? {
          stock: {
            $type: "number",
            $mod: [1, 0],
            $lte: Number.MAX_SAFE_INTEGER - line.restockedQuantity,
          },
        } : {}),
      };
      if (line.restockedQuantity > 0) historyUpdate.$inc = { stock: line.restockedQuantity };
    }

    const result = await Product.updateOne(filter, historyUpdate, options);
    if (result.modifiedCount) continue;

    const currentProduct = await Product.findById(item.product)
      .select("stock variants._id variants.stock +inventoryHistory +inventoryLocations")
      .lean();
    if (hasRecordedInspection(currentProduct, request._id, line.itemIndex)) continue;
    if (!currentProduct) {
      const error = new Error(`Cannot record the inspection for "${item.name}" because its product record is missing.`);
      error.statusCode = 409;
      throw error;
    }
    if (secondaryShop && item.variantId) {
      const location = currentProduct.inventoryLocations?.find((entry) => String(entry.shop) === String(item.shopId));
      const variant = location?.variants?.find((entry) => String(entry.variantId) === String(item.variantId));
      if (!variant) {
        const error = new Error(`Cannot process "${item.name}" because its returned option no longer exists at the fulfillment shop.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isInteger(variant.stock)) {
        const error = new Error(`Confirm stock for "${item.name} (${item.variantName})" at the fulfillment shop before restocking this return.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isSafeInteger(variant.stock + line.restockedQuantity)) {
        const error = new Error(`Restocking "${item.name} (${item.variantName})" would exceed the supported inventory quantity.`);
        error.statusCode = 409;
        throw error;
      }
    } else if (secondaryShop) {
      const location = currentProduct.inventoryLocations?.find((entry) => String(entry.shop) === String(item.shopId));
      if (!location) {
        const error = new Error(`Cannot process "${item.name}" because its fulfillment shop no longer has an inventory location.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isInteger(location.stock)) {
        const error = new Error(`Confirm stock for "${item.name}" at the fulfillment shop before restocking this return.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isSafeInteger(location.stock + line.restockedQuantity)) {
        const error = new Error(`Restocking "${item.name}" would exceed the supported inventory quantity.`);
        error.statusCode = 409;
        throw error;
      }
    } else if (item.variantId) {
      const variant = currentProduct.variants?.find((entry) => String(entry._id) === String(item.variantId));
      if (!variant) {
        const error = new Error(`Cannot process "${item.name}" because its returned option no longer exists.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isInteger(variant.stock)) {
        const error = new Error(`Confirm stock for "${item.name} (${item.variantName})" before restocking this return.`);
        error.statusCode = 409;
        throw error;
      }
      if (line.restockedQuantity > 0 && !Number.isSafeInteger(variant.stock + line.restockedQuantity)) {
        const error = new Error(`Restocking "${item.name} (${item.variantName})" would exceed the supported inventory quantity.`);
        error.statusCode = 409;
        throw error;
      }
    } else if (line.restockedQuantity > 0 && !Number.isInteger(currentProduct.stock)) {
      const error = new Error(`Confirm stock for "${item.name}" before restocking this return.`);
      error.statusCode = 409;
      throw error;
    } else if (line.restockedQuantity > 0 && !Number.isSafeInteger(currentProduct.stock + line.restockedQuantity)) {
      const error = new Error(`Restocking "${item.name}" would exceed the supported inventory quantity.`);
      error.statusCode = 409;
      throw error;
    }
    const error = new Error(`Could not record the inspection for "${item.name}". Refresh and retry.`);
    error.statusCode = 409;
    throw error;
  }
}

module.exports = { normalizeReturnInspectionLines, applyReturnInspection };
