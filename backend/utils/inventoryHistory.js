const INVENTORY_HISTORY_LIMIT = 100;

function createInventoryMovement(type, previousStock, stock, details = {}) {
  const previous = Number.isInteger(previousStock) ? previousStock : null;
  const next = Number.isInteger(stock) ? stock : null;
  return {
    type,
    previousStock: previous,
    stock: next,
    delta: previous === null || next === null ? null : next - previous,
    changedAt: new Date(),
    ...details,
  };
}

function createDeltaMovement(type, delta, details = {}) {
  return {
    type,
    delta,
    previousStock: null,
    stock: null,
    changedAt: new Date(),
    ...details,
  };
}

function isBelowReorderLevel(stock, reorderLevel = 5) {
  return Number.isInteger(stock)
    && Number.isInteger(reorderLevel)
    && reorderLevel >= 0
    && stock <= reorderLevel;
}

function createInitialInventoryHistory(product, type = "initial", source = "product") {
  const entries = [];
  if (Number.isInteger(product.stock)) {
    entries.push(createInventoryMovement(type, null, product.stock, { source }));
  }
  for (const variant of product.variants || []) {
    if (Number.isInteger(variant.stock)) {
      entries.push(createInventoryMovement(type, null, variant.stock, {
        variantId: variant._id,
        variantName: variant.name || "",
        source,
      }));
    }
  }
  return entries.slice(-INVENTORY_HISTORY_LIMIT);
}

function createInventoryChanges(previous, next, type, source) {
  const entries = [];
  if (Object.prototype.hasOwnProperty.call(next, "stock")
    && (previous.stock ?? null) !== (next.stock ?? null)) {
    entries.push(createInventoryMovement(type, previous.stock, next.stock, { source }));
  }

  const oldVariants = new Map((previous.variants || []).map((variant) => [String(variant._id || ""), variant]));
  const nextVariantIds = new Set((next.variants || []).map((variant) => String(variant._id || "")));
  for (const variant of next.variants || []) {
    const old = oldVariants.get(String(variant._id || ""));
    if (!old && Number.isInteger(variant.stock)) {
      entries.push(createInventoryMovement(type, null, variant.stock, {
        variantId: variant._id,
        variantName: variant.name || "",
        source,
      }));
      continue;
    }
    if (!old || old.stock === variant.stock || (old.stock == null && variant.stock == null)) continue;
    entries.push(createInventoryMovement(type, old.stock, variant.stock, {
      variantId: variant._id,
      variantName: variant.name || old.name || "",
      source,
    }));
  }
  for (const [id, variant] of oldVariants) {
    if (!nextVariantIds.has(id) && Number.isInteger(variant.stock)) {
      entries.push(createInventoryMovement(type, variant.stock, null, {
        variantId: variant._id,
        variantName: variant.name || "",
        source,
      }));
    }
  }
  return entries.slice(-INVENTORY_HISTORY_LIMIT);
}

module.exports = {
  INVENTORY_HISTORY_LIMIT,
  createInventoryMovement,
  createDeltaMovement,
  isBelowReorderLevel,
  createInitialInventoryHistory,
  createInventoryChanges,
};
