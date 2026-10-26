export function hasFreeCbdDelivery(subtotal, threshold) {
  const amount = Math.max(0, Number(subtotal) || 0);
  const minimum = Math.max(0, Number(threshold) || 0);
  return minimum > 0 && amount >= minimum;
}

export function getCbdDeliveryFee(subtotal, settings = {}) {
  return hasFreeCbdDelivery(subtotal, settings.freeDeliveryThreshold)
    ? 0
    : Math.max(0, Number(settings.deliveryFee) || 0);
}
