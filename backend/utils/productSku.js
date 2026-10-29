const crypto = require("crypto");
const Product = require("../models/Product");

function createProductSku(name, suffix) {
  const nameCode = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "") || "PRODUCT";
  return `${nameCode}-${suffix}`.slice(0, 100);
}

async function suggestUniqueProductSku(name, reservedSkus = new Set()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const sku = createProductSku(name, suffix);
    if (reservedSkus.has(sku)) continue;
    const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exists = await Product.exists({
      $or: [
        { sku: new RegExp(`^${escapedSku}$`, "i") },
        { "variants.sku": new RegExp(`^${escapedSku}$`, "i") },
        { skuCodes: sku },
      ],
    });
    if (!exists) {
      reservedSkus.add(sku);
      return sku;
    }
  }
  const error = new Error("Could not generate an available SKU. Try again.");
  error.statusCode = 503;
  throw error;
}

module.exports = { createProductSku, suggestUniqueProductSku };
