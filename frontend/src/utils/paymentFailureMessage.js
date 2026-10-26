export function paymentFailureEventMessage(event, paymentMethod = "mpesa") {
  const reason = String(event?.note || "").toLowerCase();
  const isMpesa = paymentMethod === "mpesa";

  if (reason.includes("insufficient") || reason.includes("not enough funds") || reason.includes("did not have enough funds") || reason.includes("balance is low") || reason.includes("balance is insufficient")) {
    return isMpesa ? "The M-Pesa account did not have enough funds. Add funds and retry." : "The card issuer declined the payment. Check your available balance or try another card.";
  }
  if (reason.includes("timeout") || reason.includes("timed out") || reason.includes("no response") || reason.includes("cannot be reached") || reason.includes("unreachable")) {
    return isMpesa ? "The M-Pesa prompt expired or could not reach your phone. Check your signal and retry." : "The card payment was not completed in time. Retry when you are ready.";
  }
  if (reason.includes("cancel")) {
    return isMpesa ? "The payment was cancelled on the phone. Retry when you are ready." : "The card payment was cancelled. Retry when you are ready.";
  }
  return isMpesa ? "M-Pesa declined the payment. Check your wallet balance, transaction limits, and phone prompt, then retry." : "The card payment was not completed. Retry or use another payment method.";
}

export function paymentFailureMessage(order) {
  const event = order?.events?.slice().reverse().find((entry) => entry.type === "payment_failed");
  return paymentFailureEventMessage(event, order?.paymentMethod);
}

export function paymentFailureGroups(order) {
  const groups = new Map();
  for (const event of order?.events || []) {
    if (event.type !== "payment_failed") continue;
    const message = paymentFailureEventMessage(event, order.paymentMethod);
    const existing = groups.get(message) || { message, count: 0, timestamps: [] };
    existing.count += 1;
    existing.timestamps.push(event.createdAt);
    groups.set(message, existing);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    timestamps: group.timestamps.sort((a, b) => new Date(b) - new Date(a)),
  })).sort((a, b) => new Date(b.timestamps[0]) - new Date(a.timestamps[0]));
}
