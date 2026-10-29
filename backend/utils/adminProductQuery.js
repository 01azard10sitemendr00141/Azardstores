const { parseListQuery, queryText, escapeRegex } = require("./listQuery");

const PRODUCT_STATUSES = new Set(["all", "published", "draft", "archived"]);
const INVENTORY_STATUSES = new Set(["all", "in_stock", "low_stock", "out_of_stock"]);

function simpleProductStock(stockFilter) {
  return {
    $and: [
      { $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
      { stock: stockFilter },
    ],
  };
}

function variantProductStock(stockFilter) {
  return { variants: { $elemMatch: { stock: stockFilter } } };
}

function buildInventoryFilter(inventory) {
  if (inventory === "in_stock") {
    return {
      $or: [
        simpleProductStock({ $gt: 5 }),
        {
          $and: [
            variantProductStock({ $gt: 5 }),
            { variants: { $not: { $elemMatch: { stock: { $gte: 1, $lte: 5 } } } } },
            { variants: { $not: { $elemMatch: { stock: { $exists: false } } } } },
          ],
        },
      ],
    };
  }
  if (inventory === "low_stock") {
    return {
      $or: [
        simpleProductStock({ $gte: 1, $lte: 5 }),
        variantProductStock({ $gte: 1, $lte: 5 }),
      ],
    };
  }
  if (inventory === "out_of_stock") {
    return {
      $or: [
        simpleProductStock(0),
        {
          $and: [
            { variants: { $exists: true, $ne: [] } },
            { variants: { $not: { $elemMatch: { stock: { $ne: 0 } } } } },
          ],
        },
      ],
    };
  }
  return null;
}

function buildAdminProductQuery(input = {}) {
  const { search } = parseListQuery(input);
  const status = queryText(input.status, 20) || "all";
  const category = queryText(input.category, 100);
  const inventory = queryText(input.inventory, 20) || "all";
  if (!PRODUCT_STATUSES.has(status)) {
    const error = new Error("Choose a valid product status filter.");
    error.statusCode = 400;
    throw error;
  }
  if (!INVENTORY_STATUSES.has(inventory)) {
    const error = new Error("Choose a valid product inventory filter.");
    error.statusCode = 400;
    throw error;
  }

  const clauses = [];
  if (status === "published") {
    clauses.push({ isActive: true, $or: [{ status: "published" }, { status: { $exists: false } }] });
  } else if (status === "draft") {
    clauses.push({ $or: [{ status: "draft" }, { status: { $exists: false }, isActive: false }] });
  } else if (status === "archived") {
    clauses.push({ status: "archived" });
  }

  if (category) clauses.push({ category: new RegExp(`^${escapeRegex(category)}$`, "i") });
  const inventoryClause = buildInventoryFilter(inventory);
  if (inventoryClause) clauses.push(inventoryClause);
  if (search) {
    const escaped = escapeRegex(search);
    clauses.push({ $or: [
      { name: new RegExp(escaped, "i") },
      { sku: new RegExp(escaped, "i") },
      { "variants.sku": new RegExp(escaped, "i") },
      { brand: new RegExp(escaped, "i") },
    ] });
  }

  return {
    filter: clauses.length > 1 ? { $and: clauses } : clauses[0] || {},
    search,
    status,
    category,
    inventory,
  };
}

function isValidExpectedProductCount(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function matchesExpectedProductCount(expectedCount, matchingCount) {
  return isValidExpectedProductCount(expectedCount)
    && Number.isSafeInteger(matchingCount)
    && matchingCount === expectedCount;
}

module.exports = { buildAdminProductQuery, isValidExpectedProductCount, matchesExpectedProductCount };
