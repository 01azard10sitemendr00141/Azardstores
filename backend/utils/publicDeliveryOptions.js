function getPublicDeliveryCounties(settings) {
  const configuredCounties = settings.deliveryCounties || [];
  const activeRouteCounties = (settings.deliveryRoutes || [])
    .filter((route) => route.active)
    .map((route) => route.county);
  return [...new Set(["Nairobi", ...configuredCounties, ...activeRouteCounties])];
}

module.exports = { getPublicDeliveryCounties };
