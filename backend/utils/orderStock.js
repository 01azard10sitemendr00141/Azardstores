const Product = require("../models/Product");
const Order = require("../models/Order");

function reservationSelector(orderId, itemIndex) {
  return { orderId, itemIndex };
}

async function hasReservation(item, orderId, itemIndex, session) {
  const query = item.variantId
    ? Product.findOne({ _id: item.product, variants: { $elemMatch: { _id: item.variantId, stockReservations: { $elemMatch: reservationSelector(orderId, itemIndex) } } } }).select("_id")
    : Product.findOne({ _id: item.product, stockReservations: { $elemMatch: reservationSelector(orderId, itemIndex) } }).select("_id");
  if (session) query.session(session);
  return Boolean(await query.lean());
}

async function reserveItem(item, itemIndex, orderId, session) {
  if (!item.product) {
    const error = new Error(`Stock record for "${item.name}" is no longer available`);
    error.statusCode = 409;
    throw error;
  }
  const ref = { ...reservationSelector(orderId, itemIndex), quantity: item.quantity };
  const options = session ? { new: true, session } : { new: true };
  const updated = item.variantId
    ? await Product.findOneAndUpdate(
        { _id: item.product, variants: { $elemMatch: { _id: item.variantId, stock: { $gte: item.quantity }, stockReservations: { $not: { $elemMatch: reservationSelector(orderId, itemIndex) } } } } },
        { $inc: { "variants.$.stock": -item.quantity }, $push: { "variants.$.stockReservations": ref } },
        options
      )
    : await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity }, stockReservations: { $not: { $elemMatch: reservationSelector(orderId, itemIndex) } } },
        { $inc: { stock: -item.quantity }, $push: { stockReservations: ref } },
        options
      );
  if (updated) return;
  if (await hasReservation(item, orderId, itemIndex, session)) return;
  const error = new Error(`Not enough stock for "${item.name}"${item.variantName ? ` (${item.variantName})` : ""}`);
  error.statusCode = 409;
  throw error;
}

async function releaseTrackedItem(item, itemIndex, orderId, session) {
  if (!item.product) throw new Error(`Stock record for "${item.name}" is missing`);
  const ref = reservationSelector(orderId, itemIndex);
  const options = session ? { session } : {};
  const updated = item.variantId
    ? await Product.updateOne(
        { _id: item.product, variants: { $elemMatch: { _id: item.variantId, stockReservations: { $elemMatch: ref } } } },
        { $inc: { "variants.$[variant].stock": item.quantity }, $pull: { "variants.$[variant].stockReservations": ref } },
        { ...options, arrayFilters: [{ "variant._id": item.variantId, "variant.stockReservations": { $elemMatch: ref } }] }
      )
    : await Product.updateOne(
        { _id: item.product, stockReservations: { $elemMatch: ref } },
        { $inc: { stock: item.quantity }, $pull: { stockReservations: ref } },
        options
      );
  if (updated.modifiedCount) return true;
  const productQuery = Product.findById(item.product).select(item.variantId ? "variants._id" : "_id");
  if (session) productQuery.session(session);
  const product = await productQuery.lean();
  if (!product) throw new Error(`Could not find inventory for "${item.name}"`);
  if (item.variantId && !product.variants?.some((variant) => String(variant._id) === String(item.variantId))) {
    throw new Error(`Could not find the reserved option for "${item.name}"`);
  }
  return false; // Already released or committed; retries must not increment stock again.
}

async function releaseTrackedOrderStock(order, session) {
  for (let index = 0; index < order.items.length; index += 1) {
    await releaseTrackedItem(order.items[index], index, order._id, session);
  }
}

async function reserveOrderStock(items, orderId, session) {
  const reserved = [];
  try {
    for (let index = 0; index < items.length; index += 1) {
      await reserveItem(items[index], index, orderId, session);
      reserved.push({ item: items[index], index });
    }
  } catch (error) {
    if (!session) {
      try {
        for (const entry of reserved.reverse()) await releaseTrackedItem(entry.item, entry.index, orderId);
      } catch (rollbackError) {
        const failure = new Error(`${error.message}. Inventory rollback also failed: ${rollbackError.message}`);
        failure.statusCode = 500;
        throw failure;
      }
    }
    error.statusCode = error.statusCode || 500;
    throw error;
  }
}

// Legacy orders have no per-product reservation record. Restore them with a
// compensating update; new orders use the idempotent reservation ledger below.
async function restoreLegacyOrderStock(items) {
  const restored = [];
  try {
    for (const item of items) {
      if (!item.product) throw new Error(`Stock record for "${item.name}" is missing`);
      const result = item.variantId
        ? await Product.updateOne({ _id: item.product, "variants._id": item.variantId }, { $inc: { "variants.$.stock": item.quantity } })
        : await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
      if (!result.matchedCount) throw new Error(`Could not restore stock for "${item.name}"`);
      restored.push(item);
    }
  } catch (error) {
    for (const item of restored.reverse()) {
      const rollback = item.variantId
        ? await Product.updateOne({ _id: item.product, "variants._id": item.variantId, "variants.stock": { $gte: item.quantity } }, { $inc: { "variants.$.stock": -item.quantity } })
        : await Product.updateOne({ _id: item.product, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } });
      if (!rollback.matchedCount) throw new Error(`${error.message}; could not roll back partial inventory restoration for "${item.name}"`);
    }
    throw error;
  }
}

async function restoreOrderStockOnce(order) {
  if (!order.stockReservedAt || order.stockRestoredAt) return;
  const topologyType = Order.db.client?.topology?.description?.type;
  const supportsTransactions = ["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"].includes(topologyType);

  if (supportsTransactions) {
    const session = await Order.db.startSession();
    try {
      await session.withTransaction(async () => {
        const restoredAt = new Date();
        const claimed = await Order.updateOne({ _id: order._id, stockRestoredAt: null }, { $set: { stockRestoredAt: restoredAt } }, { session });
        if (!claimed.modifiedCount) return;
        if (order.stockReservationTracked) await releaseTrackedOrderStock(order, session);
        else {
          for (const item of order.items) {
            if (!item.product) throw new Error(`Stock record for "${item.name}" is missing`);
            const result = item.variantId
              ? await Product.updateOne({ _id: item.product, "variants._id": item.variantId }, { $inc: { "variants.$.stock": item.quantity } }, { session })
              : await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
            if (!result.matchedCount) throw new Error(`Could not restore stock for "${item.name}"`);
          }
        }
      });
    } finally {
      await session.endSession();
    }
    return;
  }

  if (order.stockReservationTracked) {
    await releaseTrackedOrderStock(order);
    const restoredAt = new Date();
    await Order.updateOne({ _id: order._id, stockRestoredAt: null }, { $set: { stockRestoredAt: restoredAt } });
    return;
  }

  // Best-effort compatibility for legacy records on standalone MongoDB. New
  // records use product-level idempotency keys and are safe to retry.
  const restoredAt = new Date();
  const claimed = await Order.updateOne({ _id: order._id, stockRestoredAt: null }, { $set: { stockRestoredAt: restoredAt } });
  if (claimed.modifiedCount) {
    try {
      await restoreLegacyOrderStock(order.items);
    } catch (error) {
      await Order.updateOne({ _id: order._id, stockRestoredAt: restoredAt }, { $set: { stockRestoredAt: null } });
      throw error;
    }
  }
}

async function commitOrderStockReservations(order) {
  if (!order?.stockReservationTracked || order.stockReservationCommittedAt) return;
  for (let index = 0; index < order.items.length; index += 1) {
    const item = order.items[index];
    if (!item.product) continue;
    const ref = reservationSelector(order._id, index);
    const result = item.variantId
      ? await Product.updateOne({ _id: item.product }, { $pull: { "variants.$[variant].stockReservations": ref } }, { arrayFilters: [{ "variant._id": item.variantId }] })
      : await Product.updateOne({ _id: item.product }, { $pull: { stockReservations: ref } });
    if (!result.matchedCount) throw new Error(`Could not finalize reserved stock for "${item.name}"`);
  }
  const committedAt = new Date();
  await Order.updateOne({ _id: order._id, stockReservationCommittedAt: null }, { $set: { stockReservationCommittedAt: committedAt } });
}

async function recoverAbandonedStockReservations(now = new Date()) {
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const abandoned = await Order.find({ status: "pending", availabilityConfirmationInProgress: true, updatedAt: { $lte: staleBefore } }).limit(100);
  for (const order of abandoned) {
    try {
      await releaseTrackedOrderStock(order);
      await Order.updateOne(
        { _id: order._id, status: "pending", availabilityConfirmationInProgress: true, updatedAt: { $lte: staleBefore } },
        { $set: { availabilityConfirmationInProgress: false, stockReservationTracked: false } }
      );
    } catch (error) {
      console.error(`Abandoned stock reservation needs review for order ${order._id}:`, error.message);
    }
  }

  const committed = await Order.find({ status: { $in: ["shipped", "ready_for_collection", "collected", "delivered"] }, stockReservationTracked: true, stockReservationCommittedAt: null }).limit(100);
  for (const order of committed) {
    try {
      await commitOrderStockReservations(order);
    } catch (error) {
      console.error(`Committed stock reservation cleanup failed for order ${order._id}:`, error.message);
    }
  }
}

module.exports = { reserveOrderStock, restoreOrderStock: restoreLegacyOrderStock, restoreOrderStockOnce, releaseTrackedOrderStock, commitOrderStockReservations, recoverAbandonedStockReservations };
