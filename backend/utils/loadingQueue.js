function loadingQueueFilter(now = new Date()) {
  return {
    status: "confirmed",
    paymentStatus: "paid",
    $and: [
      { $or: [{ stockRequest: null }, { checkoutDetailsCompletedAt: { $ne: null } }] },
      { $or: [{ stockReservedUntil: null }, { stockReservedUntil: { $gt: now } }] },
      { cancellationRequests: { $not: { $elemMatch: { status: "pending" } } } },
    ],
  };
}

function incompleteLoadingItems(order) {
  return (order.items || []).filter((item) =>
    !item.loadedAt || Number(item.loadedQuantity || 0) !== Number(item.quantity || 0)
  );
}

function validateLoadedQuantity(item, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    const error = new Error("Enter a whole-number quantity that was physically checked.");
    error.statusCode = 400;
    throw error;
  }
  if (quantity !== Number(item.quantity)) {
    const error = new Error(`Confirm exactly ${item.quantity} loaded for "${item.name}". If that quantity is unavailable, resolve the availability issue instead.`);
    error.statusCode = 409;
    throw error;
  }
}

module.exports = { loadingQueueFilter, incompleteLoadingItems, validateLoadedQuantity };
