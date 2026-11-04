// Mapper for the standard WooCommerce product CSV export. It keeps source
// category labels for the admin to map, and groups variation rows under one
// parent product instead of creating a separate listing for each option.
function extractBrand(text) {
  if (!text) return "";
  const match = String(text).match(/Brand:\s*([^<\n\\]+)/i);
  return match ? match[1].trim() : "";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<li[^>]*>/gi, "")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCategory(categories) {
  if (!categories) return "";
  const parts = String(categories).split(",").map((part) => part.trim()).filter((part) => part && part.toLowerCase() !== "uncategorized");
  const leaf = (parts[0] || "").split(">").map((part) => part.trim()).filter(Boolean);
  return leaf[leaf.length - 1] || "";
}

function parseImages(images) {
  if (!images) return [];
  return [...new Set(String(images).split(",").map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)))];
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const number = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : undefined;
}

function readLocationField(row, labels) {
  const keys = new Map(Object.keys(row).map((key) => [key.trim().toLowerCase(), key]));
  for (const label of labels) {
    const key = keys.get(label.toLowerCase());
    const value = key ? String(row[key] || "").trim() : "";
    if (value) return value;
  }
  return "";
}

function sourcePlacement(row) {
  return {
    floor: readLocationField(row, ["Floor", "Floor Name", "Floor Number"]),
    shop: readLocationField(row, ["Shop", "Shop Name"]),
  };
}

function normalizedLocation(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function matchFloor(value, floors) {
  const normalized = normalizedLocation(value);
  if (!normalized) return { floor: null, provided: false };
  const floorNumber = normalized.match(/^(?:floor\s*)?#?\s*(\d+)(?:\s*[:\-].*)?$/);
  const matches = floors.filter((floor) => (
    normalizedLocation(floor.name) === normalized
    || (floorNumber && Number(floorNumber[1]) === Number(floor.floorNumber))
  ));
  return { floor: matches.length === 1 ? matches[0] : null, provided: true, ambiguous: matches.length > 1 };
}

function suggestImportPlacement(source, floors, shops) {
  const sourceFloor = String(source?.floor || "").trim();
  const sourceShop = String(source?.shop || "").trim();
  const floorMatch = matchFloor(sourceFloor, floors);
  let floor = floorMatch.floor;
  let shop = null;
  let issue = "";

  if (sourceFloor && !floor) {
    issue = floorMatch.ambiguous ? "The CSV floor matches more than one floor." : `CSV floor "${sourceFloor}" was not matched; choose a floor.`;
  }

  if (sourceShop) {
    let candidates = sourceFloor && !floor ? [] : shops;
    if (floor) candidates = candidates.filter((entry) => String(entry.floor?._id || entry.floor || "") === String(floor._id));
    const numberedShop = sourceShop.match(/^#?\s*(\d+)$/);
    const numberedName = sourceShop.match(/^#?\s*(\d+)\s+(.+)$/);
    candidates = candidates.filter((entry) => (
      normalizedLocation(entry.name) === normalizedLocation(sourceShop)
      || (numberedShop && Number(entry.shopNumber) === Number(numberedShop[1]))
      || (numberedName && Number(entry.shopNumber) === Number(numberedName[1])
        && normalizedLocation(entry.name) === normalizedLocation(numberedName[2]))
    ));

    if (!floor && candidates.length === 1) {
      shop = candidates[0];
      floor = floors.find((entry) => String(entry._id) === String(shop.floor?._id || shop.floor)) || null;
    } else if (candidates.length === 1) {
      shop = candidates[0];
    } else if (!issue) {
      issue = candidates.length > 1
        ? `CSV shop "${sourceShop}" matches more than one shop; choose a floor and shop.`
        : `CSV shop "${sourceShop}" was not matched; choose a shop.`;
    }

    if (shop && floor && String(shop.floor?._id || shop.floor || "") !== String(floor._id)) {
      shop = null;
      issue = `CSV shop "${sourceShop}" does not belong to floor "${sourceFloor}". Choose a shop on that floor.`;
    }
  }

  return {
    floorId: floor?._id ? String(floor._id) : "",
    shopId: shop?._id ? String(shop._id) : "",
    issue,
  };
}

function rowSku(row) { return String(row.SKU || row.sku || "").trim().toUpperCase(); }
function rowPublished(row) { return ["1", "yes", "true"].includes(String(row.Published || "").trim().toLowerCase()); }

function variantName(row) {
  const attributes = Object.keys(row).map((key) => {
    const match = key.match(/^Attribute\s+(\d+)\s+name$/i);
    if (!match) return null;
    const value = row[`Attribute ${match[1]} value(s)`] || row[`Attribute ${match[1]} value`] || "";
    return value ? `${String(row[key] || "Option").trim()}: ${String(value).trim()}` : null;
  }).filter(Boolean);
  return attributes.join(" / ") || String(row.Name || "").trim() || (rowSku(row) ? `Option (${rowSku(row)})` : "Unnamed option");
}

function mapSimple(row) {
  const name = String(row.Name || "").trim();
  const regularPrice = numberOrUndefined(row["Regular price"]);
  const salePrice = numberOrUndefined(row["Sale price"]);
  if (!name) return { product: null, reason: "Missing product name" };
  const validRegularPrice = regularPrice > 0;
  const hasSale = validRegularPrice && salePrice > 0 && salePrice < regularPrice;
  const shortDescription = stripHtml(row["Short description"] || "");
  const longDescription = stripHtml(row.Description || "");
  const product = {
    name,
    sku: rowSku(row),
    ...(validRegularPrice ? { price: hasSale ? salePrice : regularPrice } : {}),
    ...(hasSale ? { compareAtPrice: regularPrice } : {}),
    images: parseImages(row.Images),
    sourceCategory: cleanCategory(row.Categories),
    sourcePlacement: sourcePlacement(row),
    brand: extractBrand(shortDescription),
    description: shortDescription,
    longDescription,
    status: "draft",
  };
  const stock = numberOrUndefined(row.Stock);
  if (stock !== undefined && stock >= 0) product.stock = stock;
  const reorderLevel = numberOrUndefined(row["Reorder Level"] ?? row.reorderLevel);
  if (Number.isInteger(reorderLevel) && reorderLevel >= 0 && reorderLevel <= 1000000) product.reorderLevel = reorderLevel;
  return { product, sourcePublished: rowPublished(row), sourceType: String(row.Type || "simple").trim().toLowerCase() };
}

function mapWooCommerceRows(rows) {
  const parents = new Map();
  const simpleRows = [];
  const variationRows = [];
  rows.forEach((row, index) => {
    const type = String(row.Type || "simple").trim().toLowerCase();
    if (type === "variation") variationRows.push({ row, index });
    else if (type === "variable") parents.set(rowSku(row) || String(row.ID || index), { row, index, variants: [] });
    else simpleRows.push({ row, index });
  });

  const parentByKey = new Map();
  const groupedVariationIndexes = new Set();
  for (const [key, entry] of parents) {
    parentByKey.set(String(key).toLowerCase(), entry);
    if (entry.row.ID) parentByKey.set(String(entry.row.ID).toLowerCase(), entry);
    if (entry.row.Name) parentByKey.set(String(entry.row.Name).trim().toLowerCase(), entry);
  }
  for (const { row, index } of variationRows) {
    const parentKey = String(row.Parent || "").replace(/^(id|sku|parent):/i, "").trim().toLowerCase();
    const parent = parentByKey.get(parentKey);
    if (!parent) continue;
    groupedVariationIndexes.add(index);
    const regularPrice = numberOrUndefined(row["Regular price"]);
    const salePrice = numberOrUndefined(row["Sale price"]);
    const hasSale = salePrice > 0 && regularPrice > 0 && salePrice < regularPrice;
    const variant = {
      name: variantName(row), sku: rowSku(row),
      ...(regularPrice > 0 ? { price: hasSale ? salePrice : regularPrice } : {}),
      ...(hasSale ? { compareAtPrice: regularPrice } : {}),
      image: parseImages(row.Images)[0] || "",
    };
    const stock = numberOrUndefined(row.Stock);
    if (stock !== undefined && stock >= 0) variant.stock = stock;
    const reorderLevel = numberOrUndefined(row["Reorder Level"] ?? row.reorderLevel);
    if (Number.isInteger(reorderLevel) && reorderLevel >= 0 && reorderLevel <= 1000000) variant.reorderLevel = reorderLevel;
    parent.variants.push(variant);
  }

  const mapped = simpleRows.map(({ row, index }) => ({ index, ...mapSimple(row) }));
  for (const [key, entry] of parents) {
    const base = mapSimple(entry.row);
    if (!base.product) { mapped.push({ index: entry.index, ...base }); continue; }
    const product = base.product;
    product.variants = entry.variants;
    if (!entry.variants.length) base.reason = `"${product.name}": variable product has no matching variation rows`;
    const prices = entry.variants.map((variant) => variant.price).filter((price) => price > 0);
    if (prices.length) product.price = Math.min(...prices);
    product.sku = rowSku(entry.row); // optional grouping SKU, not a sellable SKU
    mapped.push({ index: entry.index, ...base });
  }
  for (const { row, index } of variationRows) {
    if (!groupedVariationIndexes.has(index)) mapped.push({ index, product: null, reason: `Variation "${row.Name || rowSku(row) || index + 1}" could not be matched to a variable product.` });
  }
  return mapped.sort((a, b) => a.index - b.index);
}

// Backward-compatible one-row mapper for existing callers.
function mapWooCommerceRow(row) {
  return mapSimple(row);
}

module.exports = { mapWooCommerceRow, mapWooCommerceRows, extractBrand, cleanCategory, parseImages, stripHtml, sourcePlacement, suggestImportPlacement };
