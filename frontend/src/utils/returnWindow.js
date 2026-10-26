const RETURN_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

export function orderFulfilledAt(order) {
  if (order?.deliveredAt) return new Date(order.deliveredAt);
  const event = [...(order?.events || [])].reverse().find((entry) => ["status_delivered", "status_collected"].includes(entry.type));
  return event?.createdAt ? new Date(event.createdAt) : null;
}

export function isReturnWindowOpen(order, now = Date.now()) {
  if (!["delivered", "collected"].includes(order?.status) || order?.paymentStatus !== "paid") return false;
  const fulfilledAt = orderFulfilledAt(order);
  if (!fulfilledAt || !Number.isFinite(fulfilledAt.getTime())) return false;
  const elapsed = now - fulfilledAt.getTime();
  return elapsed >= 0 && elapsed <= RETURN_WINDOW_MS;
}
