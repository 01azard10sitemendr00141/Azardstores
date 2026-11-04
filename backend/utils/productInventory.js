function shopStockEntries(product, variantId = null, activeShopIds = null) {
  const active = activeShopIds ? new Set([...activeShopIds].map(String)) : null;
  const getStock = (location) => {
    if (!variantId) return location.stock;
    return location.variants?.find((variant) => String(variant.variantId || variant._id) === String(variantId))?.stock;
  };
  const entries = [{ shopId: String(product.shop?._id || product.shop || ""), stock: getStock(product) }];
  for (const location of product.inventoryLocations || []) {
    entries.push({ shopId: String(location.shop?._id || location.shop || ""), stock: getStock(location) });
  }
  return entries.filter((entry) => entry.shopId && (!active || active.has(entry.shopId)));
}

function getTotalStock(product, variantId = null, activeShopIds = null) {
  const locations = shopStockEntries(product, variantId, activeShopIds);
  if (!locations.length || locations.some((location) => !Number.isInteger(location.stock))) return undefined;
  return locations.reduce((total, location) => total + location.stock, 0);
}

function allocateStock(product, variantId, quantity, activeShops, previouslyAllocated = new Map()) {
  const activeShopIds = new Set(activeShops.map((shop) => String(shop._id)));
  const shopsById = new Map(activeShops.map((shop) => [String(shop._id), shop]));
  const primaryShopId = String(product.shop?._id || product.shop || "");
  const locations = shopStockEntries(product, variantId, activeShopIds)
    .filter((location) => Number.isInteger(location.stock) && location.stock > 0)
    .sort((left, right) => left.shopId === primaryShopId ? -1 : right.shopId === primaryShopId ? 1 : left.shopId.localeCompare(right.shopId));
  let remaining = quantity;
  const allocations = [];
  for (const location of locations) {
    if (!remaining) break;
    const available = location.stock - (previouslyAllocated.get(location.shopId) || 0);
    if (available <= 0) continue;
    const allocated = Math.min(remaining, available);
    allocations.push({ shop: shopsById.get(location.shopId), quantity: allocated });
    previouslyAllocated.set(location.shopId, (previouslyAllocated.get(location.shopId) || 0) + allocated);
    remaining -= allocated;
  }
  return remaining === 0 ? allocations : null;
}

function serializeAvailableInventory(product, activeShopIds) {
  const serialized = product.toJSON ? product.toJSON() : { ...product };
  delete serialized.inventoryLocations;
  const totalStock = getTotalStock(product, null, activeShopIds);
  if (totalStock !== undefined) serialized.stock = totalStock;
  else delete serialized.stock;
  if (Array.isArray(serialized.variants)) {
    serialized.variants = serialized.variants.map((variant) => {
      const variantStock = getTotalStock(product, variant._id, activeShopIds);
      if (variantStock !== undefined) variant.stock = variantStock;
      else delete variant.stock;
      return variant;
    });
  }
  return serialized;
}

module.exports = { shopStockEntries, getTotalStock, allocateStock, serializeAvailableInventory };
