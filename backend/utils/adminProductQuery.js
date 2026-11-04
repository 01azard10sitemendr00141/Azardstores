const { parseListQuery, queryText, escapeRegex } = require("./listQuery");

const LOW_STOCK_THRESHOLD = 5;
const PRODUCT_STATUSES = new Set(["all", "published", "draft", "archived"]);
const INVENTORY_STATUSES = new Set(["all", "in_stock", "low_stock", "out_of_stock", "needs_restock"]);

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
  if (inventory === "needs_restock") {
    return {
      $expr: {
        $or: [
          {
            $and: [
              { $eq: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
              { $isNumber: "$stock" },
              { $lte: ["$stock", { $ifNull: ["$reorderLevel", LOW_STOCK_THRESHOLD] }] },
            ],
          },
          {
            $anyElementTrue: [
              {
                $map: {
                  input: { $ifNull: ["$inventoryLocations", []] },
                  as: "location",
                  in: {
                    $and: [
                      { $isNumber: "$$location.stock" },
                      { $lte: ["$$location.stock", { $ifNull: ["$reorderLevel", LOW_STOCK_THRESHOLD] }] },
                    ],
                  },
                },
              },
            ],
          },
          {
            $anyElementTrue: [
              {
                $map: {
                  input: { $ifNull: ["$variants", []] },
                  as: "variant",
                  in: {
                    $and: [
                      { $isNumber: "$$variant.stock" },
                      { $lte: ["$$variant.stock", { $ifNull: ["$$variant.reorderLevel", LOW_STOCK_THRESHOLD] }] },
                    ],
                  },
                },
              },
            ],
          },
          {
            $anyElementTrue: [
              {
                $map: {
                  input: { $ifNull: ["$inventoryLocations", []] },
                  as: "location",
                  in: {
                    $anyElementTrue: [
                      {
                        $map: {
                          input: { $ifNull: ["$$location.variants", []] },
                          as: "locationVariant",
                          in: {
                            $let: {
                              vars: {
                                catalogVariant: {
                                  $arrayElemAt: [
                                    {
                                      $filter: {
                                        input: { $ifNull: ["$variants", []] },
                                        as: "variant",
                                        cond: { $eq: ["$$variant._id", "$$locationVariant.variantId"] },
                                      },
                                    },
                                    0,
                                  ],
                                },
                              },
                              in: {
                                $and: [
                                  { $isNumber: "$$locationVariant.stock" },
                                  {
                                    $lte: [
                                      "$$locationVariant.stock",
                                      { $ifNull: ["$$catalogVariant.reorderLevel", LOW_STOCK_THRESHOLD] },
                                    ],
                                  },
                                ],
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };
  }
  if (inventory === "in_stock") {
    return {
      $or: [
        simpleProductStock({ $gt: LOW_STOCK_THRESHOLD }),
        {
          $and: [
            variantProductStock({ $gt: LOW_STOCK_THRESHOLD }),
            { variants: { $not: { $elemMatch: { stock: { $gte: 1, $lte: LOW_STOCK_THRESHOLD } } } } },
            { variants: { $not: { $elemMatch: { stock: { $exists: false } } } } },
          ],
        },
      ],
    };
  }
  if (inventory === "low_stock") {
    return {
      $or: [
        simpleProductStock({ $gte: 1, $lte: LOW_STOCK_THRESHOLD }),
        variantProductStock({ $gte: 1, $lte: LOW_STOCK_THRESHOLD }),
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

function buildAdminProductQuery(input = {}, { floorShopIds } = {}) {
  const { search } = parseListQuery(input);
  const status = queryText(input.status, 20) || "all";
  const category = queryText(input.category, 100);
  const inventory = queryText(input.inventory, 20) || "all";
  const floor = queryText(input.floor, 64);
  const shop = queryText(input.shop, 64);
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
  for (const [label, value] of [["floor", floor], ["shop", shop]]) {
    if (value && !/^[0-9a-f]{24}$/i.test(value)) {
      const error = new Error(`Choose a valid ${label}.`);
      error.statusCode = 400;
      throw error;
    }
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
  if (floor) clauses.push({ $or: [{ shop: { $in: floorShopIds || [] } }, { "inventoryLocations.shop": { $in: floorShopIds || [] } }] });
  if (shop) clauses.push({ $or: [{ shop }, { "inventoryLocations.shop": shop }] });
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
    floor,
    shop,
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

module.exports = { LOW_STOCK_THRESHOLD, buildAdminProductQuery, isValidExpectedProductCount, matchesExpectedProductCount };
