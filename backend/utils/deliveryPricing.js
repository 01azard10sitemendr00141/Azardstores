function getCbdDeliveryFee(subtotal, settings = {}) {
  const itemSubtotal = Math.max(0, Number(subtotal) || 0);
  const deliveryFee = Math.max(0, Number(settings.deliveryFee) || 0);
  const freeDeliveryThreshold = Math.max(0, Number(settings.freeDeliveryThreshold) || 0);
  return freeDeliveryThreshold > 0 && itemSubtotal >= freeDeliveryThreshold ? 0 : deliveryFee;
}

module.exports = { getCbdDeliveryFee };
