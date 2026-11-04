const InventoryOperation = require("../models/InventoryOperation");
const Product = require("../models/Product");

const transactionUnavailable = {
  statusCode: 503,
  body: { message: "Stock transfers and counts require MongoDB transaction support. Configure MongoDB as a replica set or sharded cluster." },
};

function supportsTransactions() {
  const topologyType = Product.db.client?.topology?.description?.type;
  return ["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"].includes(topologyType);
}

function sameOperationPayload(existing, requested) {
  return ["type", "shopId", "fromShopId", "toShopId", "variantId", "expectedStock", "countedStock", "quantity", "reason"]
    .every((field) => {
      if (field.endsWith("Id")) return String(existing[field] || "") === String(requested[field] || "");
      return (existing[field] ?? null) === (requested[field] ?? null);
    });
}

function makeReplay(existing, requested) {
  if (!sameOperationPayload(existing, requested)) {
    return { statusCode: 409, body: { message: "This operation key was already used for a different inventory change." } };
  }
  if (existing.type === "stock_count") {
    return { statusCode: 200, body: { message: "This stock count was already recorded.", stock: existing.countedStock } };
  }
  return { statusCode: 200, body: { message: "This stock transfer was already recorded.", transferId: existing.operationId } };
}

function createOperationConflict(message) {
  const error = new Error(message);
  error.isInventoryOperationConflict = true;
  return error;
}

async function runInventoryOperation(operation, apply) {
  if (!supportsTransactions()) return transactionUnavailable;
  await InventoryOperation.init();
  const filter = { productId: operation.productId, operationId: operation.operationId };
  const session = await Product.db.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const existing = await InventoryOperation.findOne(filter).session(session).lean();
      if (existing) {
        outcome = makeReplay(existing, operation);
        return;
      }

      const body = await apply(session);
      await InventoryOperation.create([operation], { session });
      outcome = { statusCode: 200, body };
    });
    return outcome;
  } catch (error) {
    if (error.isInventoryOperationConflict) {
      return { statusCode: 409, body: { message: error.message } };
    }
    if (error.code === 11000) {
      const existing = await InventoryOperation.findOne(filter).lean();
      if (existing) return makeReplay(existing, operation);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { createOperationConflict, runInventoryOperation };
