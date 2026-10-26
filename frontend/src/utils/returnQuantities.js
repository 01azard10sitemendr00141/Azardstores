export function getAvailableReturnQuantities(order) {
  const available = (order?.items || []).map((item) => ["final_sale", "perishable", "digital_product"].includes(item.returnEligibility) ? 0 : Math.max(0, Number(item.quantity || 0)));
  for (const request of order?.returnRequests || []) {
    if (request.status === "rejected") continue;
    if (Array.isArray(request.itemQuantities) && request.itemQuantities.length) {
      for (const entry of request.itemQuantities) {
        if (Number.isInteger(entry.itemIndex) && entry.itemIndex >= 0 && entry.itemIndex < available.length) {
          available[entry.itemIndex] = Math.max(0, available[entry.itemIndex] - Number(entry.quantity || 0));
        }
      }
    } else {
      // Legacy requests reserved the full quantity for each selected order line.
      for (const itemIndex of request.itemIndexes || []) {
        if (Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < available.length) available[itemIndex] = 0;
      }
    }
  }
  return available;
}

export function getReturnRequestLines(request, order) {
  const quantities = Array.isArray(request?.itemQuantities) && request.itemQuantities.length
    ? request.itemQuantities
    : (request?.itemIndexes || []).map((itemIndex) => ({ itemIndex, quantity: Number(order?.items?.[itemIndex]?.quantity || 0) }));
  return quantities.map(({ itemIndex, quantity }) => {
    const item = order?.items?.[itemIndex];
    return item ? { itemIndex, quantity: Number(quantity || 0), name: item.name, amount: Number(item.price || 0) * Number(quantity || 0) } : null;
  }).filter(Boolean);
}

export function parseReturnQuantities(input, order) {
  const available = getAvailableReturnQuantities(order);
  const entries = String(input || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!entries.length) return { error: "Enter at least one item and quantity." };
  const seen = new Set();
  const itemQuantities = [];
  for (const entry of entries) {
    const match = entry.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!match) return { error: "Use item:quantity format, such as 1:1, 2:2." };
    const itemIndex = Number(match[1]) - 1;
    const quantity = Number(match[2]);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= available.length || !Number.isInteger(quantity) || quantity < 1) {
      return { error: "Enter valid item numbers and quantities." };
    }
    if (seen.has(itemIndex)) return { error: `Item ${itemIndex + 1} is listed more than once.` };
    if (quantity > available[itemIndex]) return { error: `Only ${available[itemIndex]} unit(s) of item ${itemIndex + 1} remain available for a return or exchange.` };
    seen.add(itemIndex);
    itemQuantities.push({ itemIndex, quantity });
  }
  return { itemQuantities };
}
