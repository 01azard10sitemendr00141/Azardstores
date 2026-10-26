function emitOrderEvent(io, eventName, order, details = {}) {
  if (!io || !order?._id) return;
  const owner = order.user?._id || order.user;
  let audience = io.to("admins");
  if (owner) audience = audience.to(`user:${String(owner)}`);
  audience.emit(eventName, {
    id: String(order._id),
    userId: owner ? String(owner) : null,
    ...(eventName === "order-status-updated"
      ? { status: order.status, paymentStatus: order.paymentStatus }
      : {}),
    ...details,
  });
}

function emitOrderCreatedEvent(io, order) {
  if (!io || !order?._id) return;
  const owner = order.user?._id || order.user;
  const id = String(order._id);
  const userId = owner ? String(owner) : null;
  io.to("admins").emit("new-order", {
    id,
    userId,
    totalAmount: order.totalAmount,
    channel: order.channel,
  });
  if (userId) io.to(`user:${userId}`).emit("new-order", { id, userId });
}

function emitStoreBalanceUpdated(io, userId, orderIds = []) {
  if (!io || !userId) return;
  io.to("admins").to(`user:${String(userId)}`).emit("store-balance-updated", {
    userId: String(userId),
    orderIds: orderIds.map(String),
  });
}

module.exports = { emitOrderEvent, emitOrderCreatedEvent, emitStoreBalanceUpdated };
