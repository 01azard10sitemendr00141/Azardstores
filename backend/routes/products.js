const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const Floor = require("../models/Floor");
const Brand = require("../models/Brand");
const { protect, requireRole } = require("../middleware/auth");
const { mapWooCommerceRows, cleanCategory, suggestImportPlacement } = require("../utils/wooCommerceImport");
const { toCsv } = require("../utils/csvExport");
const { productStatus, validatePublishable, normalizeProductTaxonomy, assertUniqueProductSkus, isValidProductImageUrl } = require("../utils/productLifecycle");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");
const { buildAdminProductQuery, isValidExpectedProductCount, matchesExpectedProductCount } = require("../utils/adminProductQuery");
const { normalizeReviewedProduct, validateImportPlan, validatePlannedSkuUniqueness } = require("../utils/productImportReview");
const { suggestUniqueProductSku } = require("../utils/productSku");
const { normalizeProductBadges } = require("../utils/productBadges");
const { serializeAvailableInventory } = require("../utils/productInventory");
const { createOperationConflict, runInventoryOperation } = require("../utils/inventoryOperation");
const {
  INVENTORY_HISTORY_LIMIT,
  createInventoryMovement,
  createDeltaMovement,
  createInitialInventoryHistory,
  createInventoryChanges,
} = require("../utils/inventoryHistory");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB cap
const MAX_BULK_EDIT_PRODUCTS = 500;
const IMPORT_MATCH_BATCH_SIZE = 25;

async function buildAdminQuery(input) {
  const floor = queryText(input?.floor, 64);
  if (!floor) return buildAdminProductQuery(input);
  if (!/^[0-9a-f]{24}$/i.test(floor)) {
    const error = new Error("Choose a valid floor.");
    error.statusCode = 400;
    throw error;
  }
  const floorDoc = await Floor.findById(floor).select("_id");
  if (!floorDoc) {
    const error = new Error("Floor not found.");
    error.statusCode = 404;
    throw error;
  }
  const floorShopIds = await Shop.find({ floor: floorDoc._id }).distinct("_id");
  return buildAdminProductQuery(input, { floorShopIds });
}

async function resolveProductBrand(brandId, brandName) {
  const name = String(brandName || "").trim();
  if (!brandId && !name) return { brandId: null, brand: "" };
  let brand;
  if (brandId) {
    if (!/^[0-9a-f]{24}$/i.test(String(brandId))) {
      const error = new Error("Choose a managed brand.");
      error.statusCode = 400;
      throw error;
    }
    brand = await Brand.findById(brandId).select("_id name");
  } else {
    const matches = await Brand.find({ name: new RegExp(`^${escapeRegExp(name)}$`, "i") }).select("_id name").limit(2);
    if (matches.length > 1) {
      const error = new Error("This brand name matches multiple managed brands. Select the intended brand by ID.");
      error.statusCode = 400;
      throw error;
    }
    brand = matches[0];
  }
  if (!brand) {
    const error = new Error("Choose an existing managed brand or clear the brand field.");
    error.statusCode = 400;
    throw error;
  }
  return { brandId: brand._id, brand: brand.name };
}

function parseImageUrls(raw) {
  if (!raw) return [];
  const urls = Array.isArray(raw) ? raw.map((u) => String(u).trim()).filter(Boolean) : String(raw)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length > 12) {
    const error = new Error("A product can have up to 12 gallery images.");
    error.statusCode = 400;
    throw error;
  }
  return urls;
}

function isValidReorderLevel(value) {
  return value !== null
    && String(value).trim() !== ""
    && Number.isInteger(Number(value))
    && Number(value) >= 0
    && Number(value) <= 1000000;
}

function addInventoryHistory(update, movements) {
  if (!movements.length) return;
  update.$push = {
    ...(update.$push || {}),
    inventoryHistory: { $each: movements, $slice: -INVENTORY_HISTORY_LIMIT },
  };
}

function inventoryAtShop(product, shopId, variantId) {
  const isPrimary = String(product.shop) === String(shopId);
  const location = isPrimary
    ? product
    : (product.inventoryLocations || []).find((entry) => String(entry.shop?._id || entry.shop) === String(shopId));
  if (!location) return null;
  const variant = variantId
    ? isPrimary
      ? (product.variants || []).find((entry) => String(entry._id) === String(variantId))
      : (location.variants || []).find((entry) => String(entry.variantId) === String(variantId))
    : null;
  return { isPrimary, location, variant, stock: variantId ? variant?.stock : location.stock };
}

function stockPath(shopId, product, variantId, locationFilterName, variantFilterName) {
  const isPrimary = String(product.shop) === String(shopId);
  if (isPrimary) return variantId ? `variants.$[${variantFilterName}].stock` : "stock";
  return variantId
    ? `inventoryLocations.$[${locationFilterName}].variants.$[${variantFilterName}].stock`
    : `inventoryLocations.$[${locationFilterName}].stock`;
}

function stockLocationCondition(product, shopId, variantId, stockCondition, reservationFree = false) {
  const isPrimary = String(product.shop) === String(shopId);
  const reservationCondition = reservationFree
    ? { stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } } }
    : {};
  if (isPrimary && !variantId) {
    return {
      stock: stockCondition,
      ...reservationCondition,
    };
  }
  if (isPrimary) {
    return {
      variants: {
        $elemMatch: {
          _id: variantId,
          stock: stockCondition,
          ...reservationCondition,
        },
      },
    };
  }
  return {
    inventoryLocations: {
      $elemMatch: {
        shop: shopId,
        ...(variantId
          ? {
              variants: {
                $elemMatch: {
                  variantId,
                  stock: stockCondition,
                  ...reservationCondition,
                },
              },
            }
          : {
              stock: stockCondition,
              ...reservationCondition,
            }),
      },
    },
  };
}

function stockArrayFilters(product, shopId, variantId, locationName, variantName) {
  const filters = [];
  if (String(product.shop) !== String(shopId)) filters.push({ [`${locationName}.shop`]: shopId });
  if (variantId) filters.push({ [`${variantName}.${String(product.shop) === String(shopId) ? "_id" : "variantId"}`]: variantId });
  return filters;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function catalogReviewFlags(product, duplicateSiblings = []) {
  const status = productStatus(product);
  const variants = product.variants || [];
  const hasConfirmedStock = variants.length
    ? variants.every((variant) => Number.isInteger(variant.stock))
    : Number.isInteger(product.stock);
  const hasAvailableStock = variants.length
    ? variants.some((variant) => Number.isInteger(variant.stock) && variant.stock > 0)
    : Number.isInteger(product.stock) && product.stock > 0;
  return {
    duplicateSiblings,
    archiveReview: status === "draft"
      ? "Draft is hidden from shoppers; publish or archive after review."
      : status === "published" && hasConfirmedStock && !hasAvailableStock
        ? "No sellable stock; restock or archive if discontinued."
        : "",
  };
}

async function findDuplicateProductIds(products) {
  const candidates = products.filter((product) => String(product.name || "").trim() && product.shop);
  if (!candidates.length) return new Map();
  const matches = await Product.find({
    $or: candidates.map((product) => ({
      shop: product.shop?._id || product.shop,
      name: new RegExp(`^${escapeRegExp(String(product.name).trim())}$`, "i"),
      ...(String(product.brand || "").trim()
        ? { brand: new RegExp(`^${escapeRegExp(String(product.brand).trim())}$`, "i") }
        : { $or: [{ brand: { $exists: false } }, { brand: null }, { brand: "" }] }),
    })),
  }).select("_id name brand shop").lean();
  const groups = new Map();
  for (const product of matches) {
    const key = [
      String(product.shop || ""),
      String(product.name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(),
      String(product.brand || "").trim().toLocaleLowerCase(),
    ].join(":");
    groups.set(key, [...(groups.get(key) || []), product]);
  }
  const duplicates = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const product of group) {
      duplicates.set(String(product._id), group
        .filter((entry) => String(entry._id) !== String(product._id))
        .map((entry) => ({ _id: entry._id, name: entry.name, brand: entry.brand || "" })));
    }
  }
  return duplicates;
}

function mergeImportedVariants(existingVariants = [], importedVariants = []) {
  const matchedIds = new Set();
  const merged = importedVariants.map((incoming) => {
    const incomingSku = String(incoming.sku || "").trim().toUpperCase();
    const unmatched = existingVariants.filter((variant) => !matchedIds.has(String(variant._id)));
    const existing = (incomingSku && unmatched.find((variant) => String(variant.sku || "").trim().toUpperCase() === incomingSku))
      || unmatched.find((variant) => String(variant.name || "").trim().toLowerCase() === String(incoming.name || "").trim().toLowerCase());
    if (!existing) return incoming;
    matchedIds.add(String(existing._id));
    const old = existing.toObject ? existing.toObject() : existing;
    if ((old.stockReservations || []).length && incoming.stock !== undefined && incoming.stock !== null && Number(incoming.stock) !== Number(old.stock)) {
      const error = new Error(`Stock for variant "${old.name}" cannot be overwritten while it has an active order reservation.`);
      error.statusCode = 409;
      throw error;
    }
    const next = { ...old };
    for (const [key, value] of Object.entries(incoming)) {
      if (key === "stock" && (value === undefined || value === null)) continue;
      if (key === "reorderLevel" && (value === undefined || value === null)) continue;
      if (value === undefined || value === "") continue;
      next[key] = value;
    }
    next._id = old._id;
    next.stockReservations = old.stockReservations || [];
    return next;
  });
  const removedReserved = existingVariants.find((variant) => {
    const reservations = variant.stockReservations || [];
    return reservations.length && !matchedIds.has(String(variant._id));
  });
  if (removedReserved) {
    const error = new Error(`Variant "${removedReserved.name}" has an active order reservation and cannot be removed by import yet.`);
    error.statusCode = 409;
    throw error;
  }
  return merged;
}

router.get("/", async (req, res, next) => {
  try {
    const shop = queryText(req.query.shop, 64);
    const floor = queryText(req.query.floor, 100);
    const purpose = queryText(req.query.purpose, 100);
    const badge = queryText(req.query.badge, 100);
    const flashSale = queryText(req.query.flashSale, 5);
    const brand = queryText(req.query.brand, 100);
    const category = queryText(req.query.category, 100);
    const subcategory = queryText(req.query.subcategory, 100);
    const sort = queryText(req.query.sort, 20);
    const order = queryText(req.query.order, 10);
    const includeTotal = queryText(req.query.includeTotal, 5) !== "false";
    const { search, page: pageNumber, limit: pageSize } = parseListQuery(req.query);
    const allActiveShopIds = await Shop.find({ isActive: true }).distinct("_id");
    let availableShopIds = allActiveShopIds.slice();
    if (floor) {
      const floorDoc = /^[0-9a-fA-F]{24}$/.test(String(floor))
        ? await Floor.findById(floor).select("_id")
        : await Floor.findOne({ slug: floor }).select("_id");
      if (!floorDoc) return res.status(404).json({ message: "Floor not found" });
      const floorShopIds = await Shop.find({ floor: floorDoc._id, isActive: true }).distinct("_id");
      const floorShopSet = new Set(floorShopIds.map(String));
      availableShopIds = availableShopIds.filter((id) => floorShopSet.has(String(id)));
    }
    if (shop) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(shop))) return res.status(400).json({ message: "Invalid shop ID" });
      availableShopIds = availableShopIds.filter((id) => String(id) === String(shop));
    }
    const activeInventoryShopIds = floor || shop ? availableShopIds : allActiveShopIds;

    // Include legacy active products that predate the lifecycle status field,
    // but never expose drafts even if an old/manual write left isActive true.
    const filter = {
      isActive: true,
      $or: [{ status: "published" }, { status: { $exists: false } }],
      $and: [{ $or: [{ shop: { $in: availableShopIds } }, { "inventoryLocations.shop": { $in: availableShopIds } }] }],
    };
    if (purpose) filter.purposeTags = purpose;
    if (badge) filter.$and.push({ $or: [{ badge }, { badges: badge }] });
    if (flashSale === "true") filter.isFlashSale = true;
    if (search) filter.$text = { $search: search };
    // Exact (case-insensitive) match, not a substring search — brand/category
    // pages want "Nike" to mean Nike, not everything containing "nike".
    // Escaped since these come straight from the URL and $regex would
    // otherwise let a value like "(" throw a 500 instead of just matching nothing.
    if (brand) filter.brand = new RegExp(`^${escapeRegex(brand)}$`, "i");
    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
    if (subcategory) filter.subcategory = new RegExp(`^${escapeRegex(subcategory)}$`, "i");

    const skip = (pageNumber - 1) * pageSize;

    // Whitelist sortable fields so `sort` can't be used to sort/expose arbitrary
    // schema fields — falls back to newest-first if nothing valid is passed.
    const ALLOWED_SORT_FIELDS = ["price", "createdAt", "name"];
    const sortField = ALLOWED_SORT_FIELDS.includes(sort) ? sort : "createdAt";
    const sortDirection = order === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    const productsQuery = Product.find(filter)
      .select("+inventoryLocations")
      .populate({ path: "shop", select: "name shopNumber slug floor", populate: { path: "floor", select: "name floorNumber slug" } })
      .skip(skip)
      .limit(pageSize)
      .sort(sortObj);
    const [products, total] = includeTotal
      ? await Promise.all([productsQuery, Product.countDocuments(filter)])
      : [await productsQuery, null];

    res.json({
      products: products.map((product) => serializeAvailableInventory(product, activeInventoryShopIds)),
      ...(includeTotal ? { total, page: pageNumber, pages: Math.ceil(total / pageSize) } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// Admin catalog includes drafts and archived items. Public catalog routes
// deliberately remain published-only.
router.get("/admin/list", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { search, filter } = await buildAdminQuery(req.query);
    const { page: pageNumber, limit: pageSize } = parseListQuery(req.query);
    const [products, total] = await Promise.all([
      Product.find(filter).select("+inventoryLocations").populate({ path: "shop", select: "name shopNumber isActive floor", populate: { path: "floor", select: "name floorNumber isActive" } }).populate({ path: "inventoryLocations.shop", select: "name shopNumber isActive floor" }).sort({ updatedAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
      Product.countDocuments(filter),
    ]);
    const duplicateIds = await findDuplicateProductIds(products);
    res.json({ products: products.map((product) => {
      const duplicateSiblings = duplicateIds.get(String(product._id)) || [];
      const inventoryLocations = (product.inventoryLocations || []).map((location) => ({
        shop: location.shop,
        stock: location.stock,
        variants: (location.variants || []).map((variant) => ({ variantId: variant.variantId, stock: variant.stock })),
      }));
      return {
        ...product.toJSON(),
        inventoryLocations,
        status: productStatus(product),
        publishIssues: validatePublishable(product),
        catalogReview: catalogReviewFlags(product, duplicateSiblings),
      };
    }), total, page: pageNumber, pages: Math.ceil(total / pageSize) });
  } catch (err) { next(err); }
});

router.post("/admin/:id/restock", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ message: "Enter the restock details." });
    }
    const { variantId = "", shopId = "", quantity, reason } = req.body;
    const note = typeof reason === "string" ? reason.trim() : "";
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
      return res.status(400).json({ message: "Enter a whole-number quantity from 1 to 1,000,000." });
    }
    if (note.length < 5 || note.length > 500) {
      return res.status(400).json({ message: "Enter a restock reason between 5 and 500 characters." });
    }
    if (variantId && !/^[0-9a-f]{24}$/i.test(String(variantId))) {
      return res.status(400).json({ message: "Choose a valid product option." });
    }
    if (shopId && !/^[0-9a-f]{24}$/i.test(String(shopId))) return res.status(400).json({ message: "Choose a valid shop." });

    let product = await Product.findById(req.params.id).select("name shop stock variants._id variants.name variants.stock +inventoryLocations");
    if (!product) return res.status(404).json({ message: "Product not found." });
    const variant = variantId ? product.variants.id(variantId) : null;
    if (variantId && !variant) return res.status(404).json({ message: "Product option not found." });
    const targetShopId = shopId || String(product.shop);
    if (!await Shop.exists({ _id: targetShopId, isActive: true })) return res.status(400).json({ message: "Choose an active shop to receive this stock." });
    if (product.variants.length && !variant) return res.status(400).json({ message: "Choose a product option before recording a restock." });
    if (String(product.shop) !== String(targetShopId) && !product.inventoryLocations.some((location) => String(location.shop) === String(targetShopId))) {
      const location = product.variants.length
        ? {
            shop: targetShopId,
            variants: product.variants.map((entry) => ({
              variantId: entry._id,
              ...(String(entry._id) === String(variantId) ? { stock: 0 } : {}),
            })),
          }
        : { shop: targetShopId, stock: 0 };
      await Product.updateOne(
        { _id: product._id, inventoryLocations: { $not: { $elemMatch: { shop: targetShopId } } } },
        { $push: { inventoryLocations: location } },
        { runValidators: true }
      );
      product = await Product.findById(req.params.id).select("name shop stock variants._id variants.name variants.stock +inventoryLocations");
      if (!product) return res.status(404).json({ message: "Product not found." });
    }
    const current = inventoryAtShop(product, targetShopId, variantId);
    const currentStock = current?.stock;
    if (!Number.isInteger(currentStock)) {
      return res.status(409).json({ message: "Confirm the current stock quantity at this shop before recording a restock." });
    }
    if (!Number.isSafeInteger(currentStock + quantity)) {
      return res.status(400).json({ message: "The restock quantity is too large for the current inventory count." });
    }

    const movement = createDeltaMovement("restock", quantity, {
      variantId: variant?._id || null,
      variantName: variant?.name || "",
      shopId: targetShopId,
      source: "admin-restock",
      reason: note,
    });
    const update = {
      $inc: { [stockPath(targetShopId, product, variant?._id, "restockLocation", "restockVariant")]: quantity },
      $push: { inventoryHistory: { $each: [movement], $slice: -INVENTORY_HISTORY_LIMIT } },
    };
    const filter = {
      $and: [
        { _id: product._id },
        stockLocationCondition(product, targetShopId, variant?._id, { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity }),
      ],
    };
    const arrayFilters = stockArrayFilters(product, targetShopId, variant?._id, "restockLocation", "restockVariant");
    const updated = await Product.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      ...(arrayFilters.length ? { arrayFilters } : {}),
    });
    if (!updated) return res.status(409).json({ message: "Stock changed while recording the restock. Refresh and try again." });
    res.json({ product: updated, movement });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/:id/stock-count", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { shopId, variantId = "", expectedStock, countedStock, operationId, reason } = req.body || {};
    if (!/^[0-9a-f]{24}$/i.test(String(req.params.id)) || !/^[0-9a-f]{24}$/i.test(String(shopId || ""))) {
      return res.status(400).json({ message: "Choose a valid product and shop." });
    }
    if (variantId && !/^[0-9a-f]{24}$/i.test(String(variantId))) return res.status(400).json({ message: "Choose a valid product option." });
    const hasConfirmedExpectedStock = Number.isSafeInteger(expectedStock) && expectedStock >= 0 && expectedStock <= 1000000;
    if ((expectedStock !== null && !hasConfirmedExpectedStock)
      || !Number.isSafeInteger(countedStock) || countedStock < 0 || countedStock > 1000000) {
      return res.status(400).json({ message: "Expected and counted stock must be whole numbers from 0 to 1,000,000." });
    }
    if (!/^[\w-]{16,80}$/.test(String(operationId || ""))) return res.status(400).json({ message: "A valid stock-count idempotency key is required." });
    const note = typeof reason === "string" ? reason.trim() : "";
    if (note.length < 5 || note.length > 500) return res.status(400).json({ message: "Enter a stock-count reason between 5 and 500 characters." });
    if (!await Shop.exists({ _id: shopId })) return res.status(400).json({ message: "Choose an existing shop." });

    const operation = {
      productId: req.params.id,
      operationId,
      type: "stock_count",
      shopId,
      variantId: variantId || null,
      expectedStock: hasConfirmedExpectedStock ? expectedStock : null,
      countedStock,
      reason: note,
    };
    const outcome = await runInventoryOperation(operation, async (session) => {
      const product = await Product.findById(req.params.id)
        .select("shop stock stockReservations variants._id variants.name variants.stock variants.stockReservations +inventoryLocations +inventoryHistory")
        .session(session);
      if (!product) {
        const error = new Error("Product not found.");
        error.statusCode = 404;
        throw error;
      }
      if (variantId && !product.variants.some((variant) => String(variant._id) === String(variantId))) {
        const error = new Error("Product option not found.");
        error.statusCode = 404;
        throw error;
      }
      if (!variantId && product.variants.length) {
        const error = new Error("Choose a product option before counting stock.");
        error.statusCode = 400;
        throw error;
      }
      const priorCount = product.inventoryHistory.find((entry) => entry.operationId === operationId);
      if (priorCount) {
        if (String(priorCount.shopId) !== String(shopId)
          || String(priorCount.variantId || "") !== String(variantId || "")
          || priorCount.previousStock !== operation.expectedStock
          || priorCount.stock !== countedStock) {
          throw createOperationConflict("This stock-count key was already used for a different count.");
        }
        return { message: "This stock count was already recorded.", stock: priorCount.stock };
      }

      const current = inventoryAtShop(product, shopId, variantId);
      if (!current) {
        const error = new Error("This product has no inventory location at the selected shop. Transfer stock there first.");
        error.statusCode = 404;
        throw error;
      }
      if (operation.expectedStock === null ? Number.isInteger(current.stock) : current.stock !== operation.expectedStock) {
        throw createOperationConflict("Stock changed after the count was started. Refresh and count again.");
      }
      const reservations = variantId ? current.variant?.stockReservations : current.location.stockReservations;
      if (reservations?.length) {
        throw createOperationConflict("Complete or release active orders for this shop before reconciling its stock count.");
      }

      const movement = createInventoryMovement("stock_count", operation.expectedStock, countedStock, {
        variantId: variantId || null,
        variantName: variantId ? current.variant.name : "",
        shopId,
        operationId,
        source: "admin-stock-count",
        reason: note,
      });
      const filter = {
        $and: [
          { _id: product._id },
          stockLocationCondition(product, shopId, variantId, operation.expectedStock === null ? { $in: [null] } : { $eq: operation.expectedStock }, true),
        ],
      };
      const update = {
        $set: { [stockPath(shopId, product, variantId, "countLocation", "countVariant")]: countedStock },
        $push: { inventoryHistory: { $each: [movement], $slice: -INVENTORY_HISTORY_LIMIT } },
      };
      const arrayFilters = stockArrayFilters(product, shopId, variantId, "countLocation", "countVariant");
      const result = await Product.updateOne(filter, update, {
        session,
        ...(arrayFilters.length ? { arrayFilters } : {}),
        runValidators: true,
      });
      if (!result.modifiedCount) {
        throw createOperationConflict("Stock changed or an order reserved it while recording the count. Refresh and try again.");
      }
      return { message: "Stock count recorded.", stock: countedStock, movement };
    });
    res.status(outcome.statusCode).json(outcome.body);
  } catch (error) { next(error); }
});

router.post("/admin/:id/stock-transfer", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { fromShopId, toShopId, variantId = "", quantity, transferId, reason } = req.body || {};
    if (!/^[0-9a-f]{24}$/i.test(String(req.params.id))
      || !/^[0-9a-f]{24}$/i.test(String(fromShopId || ""))
      || !/^[0-9a-f]{24}$/i.test(String(toShopId || ""))) {
      return res.status(400).json({ message: "Choose a valid product, source shop, and destination shop." });
    }
    if (String(fromShopId) === String(toShopId)) return res.status(400).json({ message: "Choose two different shops for a stock transfer." });
    if (variantId && !/^[0-9a-f]{24}$/i.test(String(variantId))) return res.status(400).json({ message: "Choose a valid product option." });
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return res.status(400).json({ message: "Transfer quantity must be a whole number from 1 to 1,000,000." });
    if (!/^[\w-]{16,80}$/.test(String(transferId || ""))) return res.status(400).json({ message: "A valid transfer idempotency key is required." });
    const note = typeof reason === "string" ? reason.trim() : "";
    if (note.length < 5 || note.length > 500) return res.status(400).json({ message: "Enter a transfer reason between 5 and 500 characters." });
    const [sourceExists, destinationIsActive] = await Promise.all([
      Shop.exists({ _id: fromShopId }),
      Shop.exists({ _id: toShopId, isActive: true }),
    ]);
    if (!sourceExists || !destinationIsActive) return res.status(400).json({ message: "Choose an existing source shop and an active destination shop." });

    const operation = {
      productId: req.params.id,
      operationId: transferId,
      type: "stock_transfer",
      fromShopId,
      toShopId,
      variantId: variantId || null,
      quantity,
      reason: note,
    };
    const outcome = await runInventoryOperation(operation, async (session) => {
      let product = await Product.findById(req.params.id)
        .select("shop stock stockReservations variants._id variants.name variants.stock variants.stockReservations +inventoryLocations +inventoryHistory")
        .session(session);
      if (!product) {
        const error = new Error("Product not found.");
        error.statusCode = 404;
        throw error;
      }
      if (variantId && !product.variants.some((variant) => String(variant._id) === String(variantId))) {
        const error = new Error("Product option not found.");
        error.statusCode = 404;
        throw error;
      }
      if (!variantId && product.variants.length) {
        const error = new Error("Choose a product option before transferring stock.");
        error.statusCode = 400;
        throw error;
      }

      const priorTransfer = product.inventoryHistory.filter((entry) => entry.transferId === transferId);
      if (priorTransfer.length) {
        const alreadyApplied = priorTransfer.some((entry) => entry.type === "transfer_out"
          && String(entry.shopId) === String(fromShopId)
          && String(entry.variantId || "") === String(variantId || "")
          && entry.delta === -quantity
          && priorTransfer.some((incoming) => incoming.type === "transfer_in"
            && String(incoming.shopId) === String(toShopId)
            && String(incoming.variantId || "") === String(variantId || "")
            && incoming.delta === quantity));
        if (!alreadyApplied) throw createOperationConflict("This transfer key was already used for a different transfer.");
        return { message: "This stock transfer was already recorded.", transferId };
      }

      const initialSource = inventoryAtShop(product, fromShopId, variantId);
      if (!initialSource) {
        const error = new Error("The product has no inventory at the source shop.");
        error.statusCode = 404;
        throw error;
      }
      if (!Number.isInteger(initialSource.stock) || initialSource.stock < quantity) {
        throw createOperationConflict("The source shop does not have enough confirmed stock for this transfer.");
      }

      if (String(product.shop) !== String(toShopId) && !product.inventoryLocations.some((location) => String(location.shop) === String(toShopId))) {
        const newLocation = product.variants.length
          ? {
              shop: toShopId,
              variants: product.variants.map((variant) => ({
                variantId: variant._id,
                ...(String(variant._id) === String(variantId) ? { stock: 0 } : {}),
              })),
            }
          : { shop: toShopId, stock: 0 };
        await Product.updateOne(
          { _id: product._id, inventoryLocations: { $not: { $elemMatch: { shop: toShopId } } } },
          { $push: { inventoryLocations: newLocation } },
          { session, runValidators: true }
        );
        product = await Product.findById(req.params.id)
          .select("shop stock stockReservations variants._id variants.name variants.stock variants.stockReservations +inventoryLocations +inventoryHistory")
          .session(session);
      }

      if (!product) {
        const error = new Error("Product not found.");
        error.statusCode = 404;
        throw error;
      }
      const source = inventoryAtShop(product, fromShopId, variantId);
      const destination = inventoryAtShop(product, toShopId, variantId);
      if (!source || !destination) throw createOperationConflict("The source or destination inventory location changed. Refresh and try again.");
      if (!Number.isInteger(source.stock) || source.stock < quantity) {
        throw createOperationConflict("The source shop does not have enough confirmed stock for this transfer.");
      }
      if (!Number.isInteger(destination.stock) || !Number.isSafeInteger(destination.stock + quantity)) {
        throw createOperationConflict("Confirm destination stock before transferring inventory there.");
      }

      const variantName = variantId ? source.variant.name : "";
      const movementDetails = {
        variantId: variantId || null,
        variantName,
        transferId,
        reason: note,
        source: "admin-stock-transfer",
      };
      const movements = [
        createDeltaMovement("transfer_out", -quantity, { ...movementDetails, shopId: fromShopId }),
        createDeltaMovement("transfer_in", quantity, { ...movementDetails, shopId: toShopId }),
      ];
      const filter = {
        $and: [
          { _id: product._id },
          stockLocationCondition(product, fromShopId, variantId, { $type: "number", $mod: [1, 0], $gte: quantity }),
          stockLocationCondition(product, toShopId, variantId, { $type: "number", $mod: [1, 0], $lte: Number.MAX_SAFE_INTEGER - quantity }),
        ],
      };
      const update = {
        $inc: {
          [stockPath(fromShopId, product, variantId, "sourceLocation", "sourceVariant")]: -quantity,
          [stockPath(toShopId, product, variantId, "destinationLocation", "destinationVariant")]: quantity,
        },
        $push: { inventoryHistory: { $each: movements, $slice: -INVENTORY_HISTORY_LIMIT } },
      };
      const arrayFilters = [
        ...stockArrayFilters(product, fromShopId, variantId, "sourceLocation", "sourceVariant"),
        ...stockArrayFilters(product, toShopId, variantId, "destinationLocation", "destinationVariant"),
      ];
      const result = await Product.updateOne(filter, update, { session, arrayFilters, runValidators: true });
      if (!result.modifiedCount) {
        throw createOperationConflict("Shop stock changed while the transfer was being recorded. Refresh and try again.");
      }
      return { message: "Stock transferred.", transferId, movements };
    });
    res.status(outcome.statusCode).json(outcome.body);
  } catch (error) { next(error); }
});

router.get("/admin/:id/inventory-history", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .select("name +inventoryHistory")
      .lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    const history = product.inventoryHistory || [];
    const shopIds = [...new Set(history.map((entry) => entry.shopId?.toString()).filter(Boolean))];
    const shops = shopIds.length
      ? await Shop.find({ _id: { $in: shopIds } }).select("name shopNumber").lean()
      : [];
    const shopsById = new Map(shops.map((shop) => [String(shop._id), shop]));
    const entries = history
      .map((entry) => ({
        ...entry,
        shopId: entry.shopId ? shopsById.get(String(entry.shopId)) || null : null,
      }))
      .sort((left, right) => new Date(right.changedAt) - new Date(left.changedAt));
    res.json({ product: { _id: product._id, name: product.name }, entries });
  } catch (err) { next(err); }
});

router.post("/admin/sku-suggestion", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Add a product name before generating an SKU." });
    const reservedSkus = new Set((Array.isArray(req.body?.reservedSkus) ? req.body.reservedSkus : [])
      .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean));
    res.json({ sku: await suggestUniqueProductSku(name, reservedSkus) });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/archive-matching", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const expectedCount = req.body?.expectedCount;
    if (!isValidExpectedProductCount(expectedCount)) {
      return res.status(400).json({ message: "A positive matching product count is required to confirm this archive." });
    }
    const { filter } = await buildAdminQuery(req.body);
    const matchingCount = await Product.countDocuments(filter);
    if (!matchesExpectedProductCount(expectedCount, matchingCount)) {
      return res.status(409).json({
        message: `The matching product count changed from ${expectedCount} to ${matchingCount}. Refresh the list and confirm the current selection again.`,
        matchingCount,
      });
    }

    const archivedAt = new Date();
    const result = await Product.updateMany(filter, { $set: { status: "archived", isActive: false, archivedAt } }, { runValidators: true });
    res.json({ message: `${result.modifiedCount} matching products archived.`, total: expectedCount, archived: result.modifiedCount });
  } catch (err) { next(err); }
});

// GET /api/products/export - admin only. Exports the full active catalog as CSV.
router.get("/export", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const products = await Product.find()
      .populate({ path: "shop", select: "name shopNumber" })
      .sort({ createdAt: -1 });

    const csv = toCsv(products, [
      { label: "Name", value: "name" },
      { label: "SKU", value: "sku" },
      { label: "Short Description", value: "description" },
      { label: "Long Description", value: "longDescription" },
      { label: "Brand", value: "brand" },
      { label: "Brand ID", value: "brandId" },
      { label: "Category", value: "category" },
      { label: "Subcategory", value: "subcategory" },
      { label: "Price", value: "price" },
      { label: "Compare At Price", value: "compareAtPrice" },
      { label: "Stock", value: "stock" },
      { label: "Reorder Level", value: (product) => product.reorderLevel ?? 5 },
      { label: "Status", value: (p) => productStatus(p) },
      { label: "Variants", value: (p) => JSON.stringify((p.variants || []).map((variant) => ({ name: variant.name, sku: variant.sku, price: variant.price, compareAtPrice: variant.compareAtPrice, stock: variant.stock, reorderLevel: variant.reorderLevel ?? 5, image: variant.image }))) },
      { label: "Badge", value: "badge" },
      { label: "Badges", value: (product) => (product.badges?.length ? product.badges : product.badge ? [product.badge] : []).join("; ") },
      { label: "Return Eligibility", value: (p) => p.returnEligibility || "standard" },
      { label: "Shop", value: (p) => p.shop ? `#${p.shop.shopNumber} ${p.shop.name}` : "" },
      { label: "Active", value: (p) => (p.isActive ? "yes" : "no") },
      { label: "Images", value: (p) => (p.images || []).join(", ") },
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="products-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select("+inventoryLocations").populate({
      path: "shop",
      select: "name shopNumber slug floor",
      populate: { path: "floor", select: "name floorNumber slug" },
    });
    if (!product || !product.shop) return res.status(404).json({ message: "Product not found" });
    const activeShopIds = await Shop.find({ isActive: true }).distinct("_id");
    res.json(serializeAvailableInventory(product, activeShopIds));
  } catch (err) {
    next(err);
  }
});

router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const createFields = new Set([
      "name", "sku", "description", "longDescription", "price", "compareAtPrice", "images", "imageUrls", "shop",
      "floorId", "categoryId", "subcategoryId", "category", "subcategory", "brandId", "brand", "returnEligibility", "stock", "reorderLevel", "badge", "badges", "isFlashSale",
      "purposeTags", "variants", "flashSaleEndsAt", "status", "publish",
    ]);
    const safeBody = Object.fromEntries(Object.entries(body).filter(([key]) => createFields.has(key)));
    const badgeFields = normalizeProductBadges(safeBody);
    if (badgeFields.error) return res.status(400).json({ message: badgeFields.error });
    Object.assign(safeBody, badgeFields);
    if (safeBody.reorderLevel !== undefined && !isValidReorderLevel(safeBody.reorderLevel)) {
      return res.status(400).json({ message: "Reorder level must be a whole number from 0 to 1,000,000." });
    }
    if (Array.isArray(safeBody.variants) && safeBody.variants.some((variant) => variant.reorderLevel !== undefined && !isValidReorderLevel(variant.reorderLevel))) {
      return res.status(400).json({ message: "Each option's reorder level must be a whole number from 0 to 1,000,000." });
    }
    Object.assign(safeBody, await resolveProductBrand(safeBody.brandId, safeBody.brand));
    const images = parseImageUrls(safeBody.images || safeBody.imageUrls);
    delete safeBody.stockReservations;
    delete safeBody.skuCodes;
    delete safeBody.isActive;
    const submittedFloorId = String(safeBody.floorId || "").trim();
    delete safeBody.floorId;
    const variants = Array.isArray(safeBody.variants) ? safeBody.variants.map((variant) => {
      const cleanVariant = { ...variant };
      delete cleanVariant.stockReservations;
      cleanVariant.sku = String(cleanVariant.sku || "").trim().toUpperCase();
      return cleanVariant;
    }) : safeBody.variants;
    const status = safeBody.status === "published" || safeBody.publish === true ? "published" : "draft";
    delete safeBody.publish;
    const selectedShop = await Shop.findById(safeBody.shop).select("_id floor isActive");
    if (!selectedShop || (status === "published" && !selectedShop.isActive)) {
      return res.status(400).json({ message: status === "published" ? "Choose an active shop before publishing this product." : "Choose an existing shop for this product." });
    }
    if (submittedFloorId && String(selectedShop.floor) !== submittedFloorId) {
      return res.status(400).json({ message: "The selected shop does not belong to the selected floor." });
    }
    if (String(safeBody.name || "").trim()) {
      const duplicateName = await Product.findOne({
        name: new RegExp(`^${escapeRegExp(safeBody.name)}$`, "i"),
        ...(safeBody.brand ? { brand: new RegExp(`^${escapeRegExp(safeBody.brand)}$`, "i") } : {}),
        shop: safeBody.shop,
      }).select("name sku");
      if (duplicateName) {
        return res.status(409).json({ message: `“${duplicateName.name}” already exists in this shop. Search for it and edit the existing product instead.` });
      }
    }
    await assertUniqueProductSkus({ ...safeBody, variants });
    const candidate = { ...safeBody, variants, stockReservations: [], images, status, isActive: status === "published" };
    const taxonomy = await normalizeProductTaxonomy(candidate, { requireComplete: status === "published" });
    if (status === "published" || safeBody.categoryId || safeBody.subcategoryId) {
      if (taxonomy.issues.length) return res.status(400).json({ message: "This product's category selection is invalid", issues: taxonomy.issues });
    }
    if (!taxonomy.issues.length) {
      candidate.category = taxonomy.category;
      candidate.subcategory = taxonomy.subcategory;
      candidate.categoryId = taxonomy.categoryId;
      candidate.subcategoryId = taxonomy.subcategoryId;
    }
    if (status === "published") {
      const issues = validatePublishable(candidate);
      if (issues.length) return res.status(400).json({ message: "This product cannot be published yet", issues });
    }
    candidate.inventoryHistory = createInitialInventoryHistory(candidate, "initial", "manual-entry");
    const product = await Product.create(candidate);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const expectedUpdatedAt = new Date(req.body.updatedAt);
    if (!req.body.updatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
      return res.status(400).json({ message: "Refresh this product before saving your changes." });
    }
    const editableFields = new Set([
      "name", "sku", "description", "longDescription", "price", "compareAtPrice", "images", "imageUrls", "shop",
      "floorId", "categoryId", "subcategoryId", "category", "subcategory", "brandId", "brand", "returnEligibility", "stock", "reorderLevel", "badge", "badges", "isFlashSale",
      "purposeTags", "variants", "flashSaleEndsAt", "status", "isActive", "publish",
    ]);
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => editableFields.has(key)));
    if (updates.badge !== undefined || updates.badges !== undefined) {
      const badgeFields = normalizeProductBadges(updates);
      if (badgeFields.error) return res.status(400).json({ message: badgeFields.error });
      Object.assign(updates, badgeFields);
    }
    if (updates.reorderLevel !== undefined && !isValidReorderLevel(updates.reorderLevel)) {
      return res.status(400).json({ message: "Reorder level must be a whole number from 0 to 1,000,000." });
    }
    if (Array.isArray(updates.variants) && updates.variants.some((variant) => variant.reorderLevel !== undefined && !isValidReorderLevel(variant.reorderLevel))) {
      return res.status(400).json({ message: "Each option's reorder level must be a whole number from 0 to 1,000,000." });
    }
    const submittedFloorId = String(updates.floorId || "").trim();
    delete updates.floorId;
    if (req.body.images !== undefined || req.body.imageUrls !== undefined) {
      updates.images = parseImageUrls(req.body.images || req.body.imageUrls);
    }
    if (Array.isArray(updates.variants)) {
      const current = await Product.findById(req.params.id).select("variants._id variants.stockReservations +inventoryLocations");
      if (!current) return res.status(404).json({ message: "Product not found" });
      const variants = updates.variants.map((variant) => {
        const cleanVariant = { ...variant };
        if (!cleanVariant._id) cleanVariant._id = new mongoose.Types.ObjectId();
        delete cleanVariant.stockReservations;
        cleanVariant.sku = String(cleanVariant.sku || "").trim().toUpperCase();
        return cleanVariant;
      });
      for (const currentVariant of current.variants) {
        const activeReservations = currentVariant.stockReservations || [];
        const nextVariant = variants.find((variant) => String(variant._id || "") === String(currentVariant._id));
        const locationInventory = (current.inventoryLocations || []).some((location) => {
          const locationVariant = (location.variants || []).find((entry) => String(entry.variantId) === String(currentVariant._id));
          return locationVariant && (
            (locationVariant.stockReservations || []).length
            ||             (locationVariant.stock !== 0)
          );
        });
        if (!activeReservations.length && !locationInventory) continue;
        if (!nextVariant) return res.status(409).json({ message: "This product option still has inventory or an active order reservation at a shop and cannot be removed yet." });
        nextVariant.stockReservations = activeReservations;
      }
      updates.variants = variants;
      if (current.inventoryLocations?.length) {
        updates.inventoryLocations = current.inventoryLocations.map((location) => {
          const locationObject = location.toObject();
          const currentVariants = new Map((location.variants || []).map((variant) => [String(variant.variantId), variant]));
          locationObject.variants = variants.map((variant) => {
            const existing = currentVariants.get(String(variant._id));
            return existing ? existing.toObject() : { variantId: variant._id };
          });
          return locationObject;
        });
      }
    }
    if (updates.sku !== undefined) updates.sku = String(updates.sku || "").trim().toUpperCase();
    if (updates.status === "published" || updates.publish === true || (updates.isActive === true && updates.status === undefined)) {
      updates.status = "published";
      updates.isActive = true;
    } else if (updates.status === "draft" || updates.status === "archived" || (updates.isActive === false && updates.status === undefined)) {
      updates.status = updates.status || "draft";
      updates.isActive = false;
    }
    delete updates.skuCodes;
    delete updates.publish;
    delete updates.imageUrls;
    const currentProduct = await Product.findById(req.params.id).select("+inventoryLocations");
    if (!currentProduct) return res.status(404).json({ message: "Product not found" });
    if (currentProduct.updatedAt?.getTime() !== expectedUpdatedAt.getTime()) {
      return res.status(409).json({ message: "This product changed after you opened it. Refresh the product, review the latest details, and apply your changes again." });
    }
    if (updates.shop && String(updates.shop) !== String(currentProduct.shop)) {
      const inventoryLocations = currentProduct.inventoryLocations || [];
      const hasInventory = !Number.isInteger(currentProduct.stock)
        || currentProduct.stock !== 0
        || (currentProduct.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0)
        || inventoryLocations.some((location) => !Number.isInteger(location.stock)
          || location.stock !== 0
          || (location.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0));
      const hasReservations = (currentProduct.stockReservations || []).length
        || (currentProduct.variants || []).some((variant) => (variant.stockReservations || []).length)
        || inventoryLocations.some((location) => (location.stockReservations || []).length
          || (location.variants || []).some((variant) => (variant.stockReservations || []).length));
      if (hasInventory || hasReservations) {
        return res.status(409).json({ message: "Move or reconcile this product's inventory before changing its catalog shop." });
      }
      updates.inventoryLocations = [];
    }
    if (updates.shop && !await Shop.exists({ _id: updates.shop })) {
      return res.status(400).json({ message: "Choose an existing shop for this product." });
    }
    if (updates.shop && productStatus(currentProduct) === "published" && !await Shop.exists({ _id: updates.shop, isActive: true })) {
      return res.status(400).json({ message: "Move a published product to an active shop or save it as a draft first." });
    }
    if (
      updates.stock !== undefined &&
      (currentProduct.stockReservations || []).length > 0 &&
      (updates.stock === null || Number(updates.stock) !== Number(currentProduct.stock))
    ) {
      return res.status(409).json({ message: "Stock cannot be changed while this product has active order reservations. Update it after those orders finish." });
    }
    if (Array.isArray(updates.variants)) {
      for (const currentVariant of currentProduct.variants || []) {
        const hasPrimaryReservations = (currentVariant.stockReservations || []).length > 0;
        const locationInventory = (currentProduct.inventoryLocations || []).some((location) => {
          const locationVariant = (location.variants || []).find((entry) => String(entry.variantId) === String(currentVariant._id));
          return locationVariant && (
            (locationVariant.stockReservations || []).length
            || (locationVariant.stock !== undefined && locationVariant.stock !== 0)
          );
        });
        const nextVariant = updates.variants.find((variant) => String(variant._id || "") === String(currentVariant._id));
        if (!hasPrimaryReservations && !locationInventory) continue;
        if (!nextVariant) return res.status(409).json({ message: `Option "${currentVariant.name}" still has inventory or an active order reservation at a shop and cannot be removed yet.` });
        if (hasPrimaryReservations && (nextVariant.stock === undefined || nextVariant.stock === null || Number(nextVariant.stock) !== Number(currentVariant.stock))) {
          return res.status(409).json({ message: `Stock for option "${currentVariant.name}" cannot be changed while it has active order reservations.` });
        }
      }
    }
    const candidate = { ...currentProduct.toObject(), ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, "brandId") || Object.prototype.hasOwnProperty.call(updates, "brand")) {
      Object.assign(candidate, await resolveProductBrand(candidate.brandId, candidate.brand));
    }
    if (updates.variants) candidate.variants = updates.variants;
    if (updates.images) candidate.images = updates.images;
    if (submittedFloorId) {
      const selectedShop = await Shop.findById(candidate.shop).select("floor");
      if (!selectedShop || String(selectedShop.floor) !== submittedFloorId) {
        return res.status(400).json({ message: "The selected shop does not belong to the selected floor." });
      }
    }
    if (String(candidate.name || "").trim() && candidate.shop) {
      const duplicateName = await Product.findOne({
        _id: { $ne: currentProduct._id },
        name: new RegExp(`^${escapeRegExp(candidate.name)}$`, "i"),
        ...(candidate.brand ? { brand: new RegExp(`^${escapeRegExp(candidate.brand)}$`, "i") } : {}),
        shop: candidate.shop,
      }).select("name");
      if (duplicateName) {
        return res.status(409).json({ message: `“${duplicateName.name}” already exists in this shop. Choose a different name or review the existing product.` });
      }
    }
    const isPublished = productStatus(candidate) === "published";
    const taxonomy = await normalizeProductTaxonomy(candidate, { requireComplete: isPublished });
    if ((isPublished || updates.categoryId || updates.subcategoryId) && taxonomy.issues.length) {
      return res.status(400).json({ message: "This product's category selection is invalid", issues: taxonomy.issues });
    }
    if (!taxonomy.issues.length) {
      candidate.category = taxonomy.category;
      candidate.subcategory = taxonomy.subcategory;
      candidate.categoryId = taxonomy.categoryId;
      candidate.subcategoryId = taxonomy.subcategoryId;
      updates.category = taxonomy.category;
      updates.subcategory = taxonomy.subcategory;
      updates.categoryId = taxonomy.categoryId;
      updates.subcategoryId = taxonomy.subcategoryId;
    }
    if (isPublished) {
      if (!await Shop.exists({ _id: candidate.shop, isActive: true })) {
        return res.status(400).json({ message: "This product cannot be published until it is assigned to an active shop.", issues: ["Choose an active shop."] });
      }
      const issues = validatePublishable(candidate);
      if (issues.length) return res.status(400).json({ message: "This product cannot be published yet", issues });
    }
    await assertUniqueProductSkus(candidate, req.params.id);
    const nextSkuCodes = [candidate.sku, ...(candidate.variants || []).map((variant) => variant.sku)]
      .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
    if (nextSkuCodes.length) updates.skuCodes = nextSkuCodes;
    else { delete updates.skuCodes; updates.$unset = { ...(updates.$unset || {}), skuCodes: 1 }; }
    const updateOperations = {};
    const setFields = Object.fromEntries(Object.entries(updates).filter(([key]) => !key.startsWith("$")));
    if (Object.keys(setFields).length) updateOperations.$set = setFields;
    if (updates.$unset) updateOperations.$unset = updates.$unset;
    addInventoryHistory(updateOperations, createInventoryChanges(currentProduct, candidate, "admin_adjustment", "product-editor"));
    const productWriteFilter = { _id: req.params.id, updatedAt: currentProduct.updatedAt };
    const stockWriteGuarded = updates.stock !== undefined;
    const variantsWriteGuarded = Array.isArray(updates.variants);
    if (stockWriteGuarded) {
      productWriteFilter.stockReservations = { $not: { $elemMatch: { orderId: { $exists: true } } } };
    }
    if (variantsWriteGuarded) {
      productWriteFilter["variants.stockReservations"] = { $not: { $elemMatch: { orderId: { $exists: true } } } };
    }
    const product = await Product.findOneAndUpdate(productWriteFilter, updateOperations, { new: true, runValidators: true });
    if (!product) {
      return res.status(409).json({ message: stockWriteGuarded || variantsWriteGuarded
        ? "The product changed or an order reserved its stock while you were editing. No changes were saved; refresh and try again."
        : "This product changed while you were editing. No changes were saved; refresh and review the latest details." });
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/archive", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { status: "archived", isActive: false, archivedAt: new Date() } }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product archived", product });
  } catch (err) { next(err); }
});

router.patch("/:id/restore", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate({ _id: req.params.id, status: "archived" }, { $set: { status: "draft", isActive: false }, $unset: { archivedAt: 1 } }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: "Archived product not found" });
    res.json({ message: "Product restored as a draft", product });
  } catch (err) { next(err); }
});

router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const target = await Product.findById(req.params.id).select("status isActive stock variants.stock +inventoryLocations");
    if (!target) return res.status(404).json({ message: "Product not found" });
    if (productStatus(target) !== "archived") return res.status(409).json({ message: "Archive this product before permanently deleting it." });
    const hasStock = !Number.isInteger(target.stock)
      || target.stock !== 0
      || (target.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0)
      || (target.inventoryLocations || []).some((location) => !Number.isInteger(location.stock)
        || location.stock !== 0
        || (location.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0));
    if (hasStock) return res.status(409).json({ message: "Reconcile all shop inventory before permanently deleting this product. Archive it instead." });
    const orderHistory = await require("../models/Order").exists({ "items.product": req.params.id });
    if (orderHistory) return res.status(409).json({ message: "This product has order history and cannot be permanently deleted. Archive it instead." });
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } },
      "variants.stockReservations": { $not: { $elemMatch: { orderId: { $exists: true } } } },
    });
    if (!product && await Product.exists({ _id: req.params.id })) {
      return res.status(409).json({ message: "This product has an active order reservation and cannot be deleted yet" });
    }
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/bulk-import/preview - admin only. Parses the CSV
// without importing anything, and returns the distinct categories found
// (with row counts) so the admin can map each one to a shop before
// committing to the actual import.
router.post("/bulk-import/preview", protect, requireRole("admin"), upload.single("csv"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No CSV file was uploaded" });
    let rows;
    try { rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true }); }
    catch { return res.status(400).json({ message: "Could not read that CSV. Check that it is a valid WooCommerce export." }); }
    if (!rows.length) return res.status(400).json({ message: "This CSV contains no product rows." });
    const mapped = mapWooCommerceRows(rows);
    const [floors, shops] = await Promise.all([
      Floor.find({ isActive: true }).select("_id name floorNumber").lean(),
      Shop.find({ isActive: true }).select("_id name shopNumber floor").populate("floor", "_id").lean(),
    ]);
    const activeFloorIds = new Set(floors.map((floor) => String(floor._id)));
    const shopsOnActiveFloors = shops.filter((shop) => activeFloorIds.has(String(shop.floor?._id || shop.floor || "")));
    const items = [];
    const reservedSkus = new Set(mapped.flatMap((entry) => entry.product
      ? [entry.product.sku, ...(entry.product.variants || []).map((variant) => variant.sku)]
        .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean)
      : []));
    const candidateProductsByEntry = new Map();
    const candidateEntries = mapped.filter((entry) => entry.product);
    for (let offset = 0; offset < candidateEntries.length; offset += IMPORT_MATCH_BATCH_SIZE) {
      const batch = candidateEntries.slice(offset, offset + IMPORT_MATCH_BATCH_SIZE);
      const batchSkus = [...new Set(batch.flatMap(({ product }) => [
        product.sku,
        ...(product.variants || []).map((variant) => variant.sku),
      ]).map((sku) => String(sku || "").trim()).filter(Boolean))];
      const regexes = batchSkus.map((sku) => new RegExp(`^${escapeRegExp(sku)}$`, "i"));
      const candidateConditions = [];
      if (regexes.length) candidateConditions.push(
        { sku: { $in: regexes } },
        { "variants.sku": { $in: regexes } },
        { skuCodes: { $in: batchSkus.map((sku) => sku.toUpperCase()) } },
      );
      const names = new Map();
      for (const { product } of batch) {
        if (!product.name) continue;
        const key = `${product.name.toLowerCase()}\u0000${String(product.brand || "").toLowerCase()}`;
        if (!names.has(key)) {
          names.set(key, {
            name: new RegExp(`^${escapeRegExp(product.name)}$`, "i"),
            ...(product.brand ? { brand: new RegExp(`^${escapeRegExp(product.brand)}$`, "i") } : {}),
          });
        }
      }
      candidateConditions.push(...names.values());
      if (!candidateConditions.length) continue;
      const matchingProducts = await Product.find({ $or: candidateConditions })
        .select("name sku skuCodes brand shop variants.sku variants.name status isActive")
        .populate({ path: "shop", select: "name shopNumber floor", populate: { path: "floor", select: "name floorNumber" } })
        .lean();
      for (const entry of batch) {
        const product = entry.product;
        const sourceSkus = new Set([product.sku, ...(product.variants || []).map((variant) => variant.sku)]
          .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean));
        const sourceName = String(product.name || "").trim().toLowerCase();
        const sourceBrand = String(product.brand || "").trim().toLowerCase();
        candidateProductsByEntry.set(entry.index, matchingProducts.filter((candidate) => {
          const candidateSkus = [candidate.sku, ...(candidate.variants || []).map((variant) => variant.sku), ...(candidate.skuCodes || [])]
            .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
          const matchesSku = candidateSkus.some((sku) => sourceSkus.has(sku));
          const matchesName = String(candidate.name || "").trim().toLowerCase() === sourceName
            && (!product.brand || String(candidate.brand || "").trim().toLowerCase() === sourceBrand);
          return matchesSku || matchesName;
        }).slice(0, 10));
      }
    }
    for (const entry of mapped) {
      if (!entry.product) {
        items.push({ index: entry.index, product: null, errors: [entry.reason || "This row could not be imported."], candidates: [] });
        continue;
      }
      const p = entry.product;
      const placementSuggestion = suggestImportPlacement(p.sourcePlacement, floors, shopsOnActiveFloors);
      const skus = [p.sku, ...(p.variants || []).map((variant) => variant.sku)].filter(Boolean).map((sku) => String(sku).trim());
      const candidates = candidateProductsByEntry.get(entry.index) || [];
      const generatedSkus = { product: false, variants: [] };
      if (!candidates.length) {
        if (p.variants?.length) {
          for (let index = 0; index < p.variants.length; index += 1) {
            if (!String(p.variants[index].sku || "").trim()) {
              p.variants[index].sku = await suggestUniqueProductSku(`${p.name} ${p.variants[index].name}`, reservedSkus);
              generatedSkus.variants.push(index);
            }
          }
        } else if (!String(p.sku || "").trim()) {
          p.sku = await suggestUniqueProductSku(p.name, reservedSkus);
          generatedSkus.product = true;
        }
      }
      const errors = [];
      if ((p.images || []).length > 12) errors.push("This product has more than 12 images. Remove extra images from the CSV before importing.");
      if (!String(p.name || "").trim()) errors.push("Add a product name before publishing.");
      const hasValidImage = (p.images || []).some(isValidProductImageUrl);
      if (!hasValidImage) errors.push("Add at least one valid HTTPS product image URL before publishing.");
      if (p.variants?.length) {
        const variantSkus = [];
        p.variants.forEach((variant, index) => {
          const label = String(variant.name || "").trim() || `Option ${index + 1}`;
          if (!String(variant.name || "").trim() || /^unnamed option$|^option\s*\(/i.test(String(variant.name || "").trim())) errors.push(`${label}: add its customer-facing option name.`);
          if (!String(variant.sku || "").trim()) errors.push(`${label}: add a unique SKU.`);
          else variantSkus.push(String(variant.sku).trim().toUpperCase());
          const price = variant.price ?? p.price;
          if (!Number.isFinite(Number(price)) || Number(price) <= 0) errors.push(`${label}: add a price greater than zero.`);
          if (!Number.isInteger(Number(variant.stock)) || Number(variant.stock) < 0) errors.push(`${label}: confirm whole-number stock (zero is allowed).`);
          const compareAtPrice = variant.compareAtPrice ?? p.compareAtPrice;
          if (compareAtPrice != null && Number(compareAtPrice) > 0 && Number(compareAtPrice) <= Number(price)) errors.push(`${label}: compare-at price must be higher than its selling price.`);
        });
        const allSkus = [p.sku, ...variantSkus].map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
        if (new Set(allSkus).size !== allSkus.length) errors.push("SKU codes must be unique across this product and its options.");
      } else {
        if (!String(p.sku || "").trim()) errors.push("Add a unique product SKU before publishing.");
        if (!Number.isFinite(Number(p.price)) || Number(p.price) <= 0) errors.push("Add a price greater than zero before publishing.");
        if (!Number.isInteger(Number(p.stock)) || Number(p.stock) < 0) errors.push("Confirm whole-number stock before publishing (zero is allowed).");
        if (p.compareAtPrice != null && Number(p.compareAtPrice) > 0 && Number(p.compareAtPrice) <= Number(p.price)) errors.push("Compare-at price must be higher than its selling price.");
      }
      if (entry.reason) errors.push(entry.reason);
      const category = cleanCategory(p.sourceCategory);
      items.push({ index: entry.index, product: p, generatedSkus, sourceCategory: category, sourcePublished: Boolean(entry.sourcePublished), placementSuggestion, errors, candidates: candidates.map((candidate) => {
        const candidateSkus = [candidate.sku, ...(candidate.variants || []).map((variant) => variant.sku)]
          .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
        const sourceSkus = skus.map((sku) => sku.toUpperCase());
        const sameName = String(candidate.name || "").trim().toLowerCase() === String(p.name || "").trim().toLowerCase()
          && (!p.brand || String(candidate.brand || "").trim().toLowerCase() === String(p.brand).trim().toLowerCase());
        return {
          id: candidate._id,
          name: candidate.name,
          sku: candidate.sku,
          variantSkus: candidateSkus.filter((sku) => sku !== String(candidate.sku || "").trim().toUpperCase()),
          brand: candidate.brand,
          matchedBySku: candidateSkus.some((sku) => sourceSkus.includes(sku)),
          matchedByName: sameName,
          shop: candidate.shop ? {
            id: candidate.shop._id,
            name: candidate.shop.name,
            shopNumber: candidate.shop.shopNumber,
            floor: candidate.shop.floor ? { id: candidate.shop.floor._id, name: candidate.shop.floor.name, floorNumber: candidate.shop.floor.floorNumber } : null,
          } : null,
          status: productStatus(candidate),
        };
      }) });
    }
    const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    res.json({ total: rows.length, fileHash, items });
  } catch (err) { next(err); }
});

// Import commit accepts an explicit per-row plan from the review screen.
// Missing stock is never synthesized; products without confirmed stock stay drafts.
router.post("/bulk-import", protect, requireRole("admin"), upload.single("csv"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No CSV file was uploaded" });
    const previewHash = String(req.body.previewHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(previewHash)) {
      return res.status(400).json({ message: "Analyze and review this CSV before importing it." });
    }
    const submittedHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    if (submittedHash !== previewHash) {
      return res.status(409).json({ message: "The CSV changed after preview. Analyze the current file again before importing." });
    }
    let rows;
    try { rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true }); }
    catch { return res.status(400).json({ message: "Could not read that CSV. Check that it is a valid WooCommerce export." }); }
    if (!rows.length) return res.status(400).json({ message: "This CSV contains no product rows." });
    let plan;
    try { plan = JSON.parse(req.body.plan || "[]"); }
    catch { return res.status(400).json({ message: "Import review plan is invalid" }); }
    if (!Array.isArray(plan) || plan.length > rows.length || plan.some((item) => !item || typeof item !== "object" || Array.isArray(item)) || new Set(plan.map((item) => Number(item.index))).size !== plan.length || plan.some((item) => !Number.isInteger(Number(item.index)) || Number(item.index) < 0 || Number(item.index) >= rows.length || !["create", "overwrite", "skip"].includes(item.action))) {
      return res.status(400).json({ message: "Import review plan does not match this CSV" });
    }
    const mappedEntries = mapWooCommerceRows(rows);
    const mappedIndexes = new Set(mappedEntries.map((entry) => entry.index));
    const planIssue = validateImportPlan(
      [...mappedIndexes],
      plan.filter((item) => item.action !== "skip"),
      plan.filter((item) => item.action === "skip").map((item) => item.index),
    );
    if (planIssue) return res.status(400).json({ message: planIssue });
    const skuPlanIssue = validatePlannedSkuUniqueness(plan);
    if (skuPlanIssue) return res.status(400).json({ message: skuPlanIssue });
    const mapped = new Map(mappedEntries.map((entry) => [entry.index, entry]));
    const managedBrands = await Brand.find().select("_id name").lean();
    const brandsById = new Map(managedBrands.map((brand) => [String(brand._id), brand]));
    const results = [];
    for (const decision of plan) {
      if (decision.action === "skip") { results.push({ index: decision.index, status: "skipped" }); continue; }
      const entry = mapped.get(Number(decision.index));
      if (!entry?.product) { results.push({ index: decision.index, status: "failed", message: entry?.reason || "Invalid product row" }); continue; }
      try {
        const reviewed = normalizeReviewedProduct(decision.product);
        if (reviewed.issues.length) throw Object.assign(new Error("Reviewed product details are invalid."), { statusCode: 400, issues: reviewed.issues });
        const imported = { ...reviewed.product, variants: reviewed.product.variants || [] };
        if (imported.reorderLevel === null) delete imported.reorderLevel;
        imported.variants = imported.variants.map((variant) => {
          if (variant.reorderLevel === null) delete variant.reorderLevel;
          return variant;
        });
        const selectedBrand = imported.brandId ? brandsById.get(String(imported.brandId)) : null;
        if (imported.brandId && !selectedBrand) {
          throw Object.assign(new Error("Choose an existing managed brand."), { statusCode: 400 });
        }
        if (imported.brand && !selectedBrand) {
          throw Object.assign(new Error("Map the CSV brand to a managed brand or clear it before importing."), { statusCode: 400 });
        }
        imported.brandId = selectedBrand?._id || null;
        imported.brand = selectedBrand?.name || "";
        if (!decision.floorId || !await Floor.exists({ _id: decision.floorId, isActive: true })) {
          throw Object.assign(new Error("Choose a valid active floor."), { statusCode: 400 });
        }
        const shop = await Shop.findOne({ _id: decision.shopId, isActive: true }).select("_id floor isActive");
        if (!shop) throw Object.assign(new Error("Choose a valid active shop."), { statusCode: 400 });
        if (String(shop.floor) !== String(decision.floorId)) {
          throw Object.assign(new Error("The selected shop does not belong to the selected floor."), { statusCode: 400 });
        }
        imported.shop = shop._id;
        imported.category = String(decision.category || "").trim();
        imported.subcategory = String(decision.subcategory || "").trim();
        imported.categoryId = decision.categoryId || null;
        imported.subcategoryId = decision.subcategoryId || null;
        if (decision.stock !== "" && decision.stock !== undefined && decision.stock !== null) imported.stock = Number(decision.stock);
        if (Array.isArray(decision.variantStock)) imported.variants = imported.variants.map((variant, index) => ({ ...variant, stock: decision.variantStock[index] === "" || decision.variantStock[index] === undefined ? variant.stock : Number(decision.variantStock[index]) }));
        const targetStatus = decision.status === "published" ? "published" : "draft";
        imported.status = targetStatus;
        imported.isActive = targetStatus === "published";
        if (targetStatus === "published" && !shop.isActive) {
          throw Object.assign(new Error("Choose an active shop before publishing this product."), { statusCode: 400, issues: ["The selected shop is inactive."] });
        }
        if (decision.action === "overwrite") {
          if (!decision.productId) throw Object.assign(new Error("Choose which existing product to overwrite."), { statusCode: 400 });
          const existing = await Product.findById(decision.productId).select("+inventoryLocations");
          if (!existing) throw Object.assign(new Error("The selected matching product no longer exists."), { statusCode: 409 });
          const skuRegexes = [entry.product.sku, ...(entry.product.variants || []).map((variant) => variant.sku)].filter(Boolean)
            .map((sku) => new RegExp(`^${escapeRegExp(sku)}$`, "i"));
          const matchConditions = [];
          if (skuRegexes.length) matchConditions.push({ sku: { $in: skuRegexes } }, { "variants.sku": { $in: skuRegexes } });
          matchConditions.push({
            name: new RegExp(`^${escapeRegExp(entry.product.name)}$`, "i"),
            ...(entry.product.brand ? { brand: new RegExp(`^${escapeRegExp(entry.product.brand)}$`, "i") } : {}),
          });
          const matchingQuery = { $or: matchConditions };
          if (!await Product.exists({ _id: existing._id, ...matchingQuery })) throw Object.assign(new Error("The selected product no longer matches this import row."), { statusCode: 409 });
          // Preserve existing values when the CSV leaves a field blank.
          const merged = existing.toObject();
          for (const key of ["name", "sku", "price", "compareAtPrice", "description", "longDescription", "images", "brandId", "brand", "categoryId", "subcategoryId", "category", "subcategory", "shop", "returnEligibility", "badge", "badges", "isFlashSale", "purposeTags", "flashSaleEndsAt", "reorderLevel", "variants"]) {
            const value = imported[key];
            if (key === "variants") {
              merged.variants = mergeImportedVariants(existing.variants || [], imported.variants || []);
              merged.variants.forEach((variant) => {
                if (!variant._id) variant._id = new mongoose.Types.ObjectId();
              });
              const removedStockedVariant = (existing.inventoryLocations || []).some((location) =>
                (location.variants || []).some((locationVariant) =>
                  (locationVariant.stock !== 0 || (locationVariant.stockReservations || []).length > 0)
                  && !merged.variants.some((variant) => String(variant._id || "") === String(locationVariant.variantId))
                )
              );
              if (removedStockedVariant) {
                throw Object.assign(new Error("A product option with stock or active reservations at another shop cannot be removed by import."), { statusCode: 409 });
              }
              if (existing.inventoryLocations?.length) {
                merged.inventoryLocations = existing.inventoryLocations.map((location) => {
                  const locationObject = location.toObject();
                  const currentVariants = new Map((location.variants || []).map((locationVariant) => [String(locationVariant.variantId), locationVariant]));
                  locationObject.variants = merged.variants.map((variant) => {
                    const locationVariant = currentVariants.get(String(variant._id));
                    return locationVariant ? locationVariant.toObject() : { variantId: variant._id };
                  });
                  return locationObject;
                });
              }
              continue;
            }
            if (value === undefined) continue;
            if (key === "sku" && !String(entry.product.sku || "").trim()) continue;
            merged[key] = value;
          }
          if (imported.stock !== undefined) {
            if ((existing.stockReservations || []).length && Number(imported.stock) !== Number(existing.stock)) {
              throw Object.assign(new Error("Stock cannot be overwritten while the product has active order reservations."), { statusCode: 409 });
            }
            merged.stock = imported.stock;
          }
          if (String(existing.shop) !== String(merged.shop)) {
            const hasAssignedInventory = !Number.isInteger(existing.stock)
              || existing.stock !== 0
              || (existing.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0)
              || (existing.inventoryLocations || []).some((location) => !Number.isInteger(location.stock)
                || location.stock !== 0
                || (location.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0));
            const hasReservations = (existing.stockReservations || []).length > 0
              || (existing.variants || []).some((variant) => (variant.stockReservations || []).length > 0)
              || (existing.inventoryLocations || []).some((location) => (location.stockReservations || []).length > 0
                || (location.variants || []).some((variant) => (variant.stockReservations || []).length > 0));
            if (hasAssignedInventory || hasReservations) {
              throw Object.assign(new Error("Reconcile all shop inventory before changing this product's catalog shop in an import."), { statusCode: 409 });
            }
            merged.inventoryLocations = [];
          }
          merged.status = targetStatus; merged.isActive = targetStatus === "published";
          merged.archivedAt = null;
          await assertUniqueProductSkus(merged, existing._id);
          const taxonomy = await normalizeProductTaxonomy(merged, { requireComplete: targetStatus === "published" });
          if ((targetStatus === "published" || decision.categoryId || decision.subcategoryId) && taxonomy.issues.length) {
            throw Object.assign(new Error("This item's category selection is invalid"), { statusCode: 400, issues: taxonomy.issues });
          }
          if (!taxonomy.issues.length) {
            merged.category = taxonomy.category;
            merged.subcategory = taxonomy.subcategory;
            merged.categoryId = taxonomy.categoryId;
            merged.subcategoryId = taxonomy.subcategoryId;
          }
          const issues = targetStatus === "published" ? validatePublishable(merged) : [];
          if (issues.length) throw Object.assign(new Error("This item cannot be published yet"), { statusCode: 400, issues });
          merged.skuCodes = [merged.sku, ...(merged.variants || []).map((variant) => variant.sku)].filter(Boolean).map((sku) => String(sku).trim().toUpperCase());
          const update = {};
          for (const key of ["name", "sku", "price", "compareAtPrice", "description", "longDescription", "images", "brandId", "brand", "categoryId", "subcategoryId", "category", "subcategory", "shop", "returnEligibility", "badge", "badges", "isFlashSale", "purposeTags", "flashSaleEndsAt", "reorderLevel", "variants", "inventoryLocations", "stock", "status", "isActive", "archivedAt", "skuCodes"]) {
            if (merged[key] !== undefined) update[key] = merged[key];
          }
          const updateOperations = { $set: update };
          if (!merged.skuCodes.length) { delete updateOperations.$set.skuCodes; updateOperations.$unset = { skuCodes: 1 }; }
          addInventoryHistory(updateOperations, createInventoryChanges(existing, merged, "csv_import", "csv-overwrite"));
          const overwrittenProduct = await Product.findOneAndUpdate({
            _id: existing._id,
            updatedAt: existing.updatedAt,
            stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } },
            "variants.stockReservations": { $not: { $elemMatch: { orderId: { $exists: true } } } },
          }, updateOperations, { new: true, runValidators: true });
          if (!overwrittenProduct) {
            throw Object.assign(new Error("This product changed or gained an active order reservation while the import was being applied. Nothing was overwritten; refresh the catalog and review the product again."), { statusCode: 409 });
          }
          results.push({ index: decision.index, status: "overwritten", productStatus: targetStatus });
        } else {
          const taxonomy = await normalizeProductTaxonomy(imported, { requireComplete: targetStatus === "published" });
          if ((targetStatus === "published" || decision.categoryId || decision.subcategoryId) && taxonomy.issues.length) {
            throw Object.assign(new Error("This item's category selection is invalid"), { statusCode: 400, issues: taxonomy.issues });
          }
          if (!taxonomy.issues.length) {
            imported.category = taxonomy.category;
            imported.subcategory = taxonomy.subcategory;
            imported.categoryId = taxonomy.categoryId;
            imported.subcategoryId = taxonomy.subcategoryId;
          }
          if (targetStatus === "published") {
            const issues = validatePublishable(imported);
            if (issues.length) throw Object.assign(new Error("This item cannot be published yet"), { statusCode: 400, issues });
          }
          await assertUniqueProductSkus(imported);
          const sameName = await Product.findOne({ name: new RegExp(`^${escapeRegExp(imported.name)}$`, "i"), ...(imported.brand ? { brand: new RegExp(`^${escapeRegExp(imported.brand)}$`, "i") } : {}), shop: imported.shop }).select("name");
          if (sameName) throw Object.assign(new Error("A product with this name, brand, and shop already exists. Choose the matching product to overwrite or skip this row."), { statusCode: 409 });
          imported.inventoryHistory = createInitialInventoryHistory(imported, "initial", "csv-import");
          const created = await Product.create(imported);
          results.push({ index: decision.index, status: "created", productId: created._id, productStatus: targetStatus });
        }
      } catch (err) {
        const message = err.code === 11000
          ? "A SKU or product identifier was claimed by another product while this import was running. Refresh the catalog, review the match, and try again."
          : err.message;
        results.push({ index: decision.index, status: "failed", message, issues: err.issues || [] });
      }
    }
    res.json({ total: plan.length, created: results.filter((item) => item.status === "created").length, overwritten: results.filter((item) => item.status === "overwritten").length, skipped: results.filter((item) => item.status === "skipped").length, failed: results.filter((item) => item.status === "failed").length, results });
  } catch (err) { next(err); }
});

// PATCH /api/products/bulk-edit - admin only. Applies the same change(s) to
// every product in `ids`. `set` overwrites given fields directly (shop,
// category, subcategory, badge, isFlashSale, isActive, stock). `priceAdjustment`
// handles price separately since "increase these by 10%" is a different
// operation from "set these all to KSh 500" — { type: "percent"|"flat"|"set", value }.
router.patch("/bulk-edit", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { ids, set, priceAdjustment } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No products selected" });
    }
    if (ids.length > MAX_BULK_EDIT_PRODUCTS) {
      return res.status(400).json({ message: `Select no more than ${MAX_BULK_EDIT_PRODUCTS} products for one bulk edit.` });
    }
    if (ids.some((id) => !/^[a-f\d]{24}$/i.test(String(id)))) {
      return res.status(400).json({ message: "The selected product list is invalid. Refresh the catalog and try again." });
    }
    if (set !== undefined && (!set || typeof set !== "object" || Array.isArray(set))) {
      return res.status(400).json({ message: "Bulk edit fields must be provided as an object." });
    }
    if (priceAdjustment !== undefined && (!priceAdjustment || typeof priceAdjustment !== "object" || Array.isArray(priceAdjustment))) {
      return res.status(400).json({ message: "Price adjustment must be provided as an object." });
    }
    const productIds = [...new Set(ids.map(String))];
    const selectedCount = await Product.countDocuments({ _id: { $in: productIds } });
    if (selectedCount !== productIds.length) {
      return res.status(409).json({ message: "One or more selected products are no longer available. Refresh the catalog before applying changes." });
    }

    // Bulk price/stock fields target the parent product. Variable products
    // sell from their variant fields, so applying these operations to a mixed
    // selection would report success while leaving those storefront values
    // unchanged.
    const changesParentInventory = Boolean(set && Object.prototype.hasOwnProperty.call(set, "stock"))
      || Boolean(priceAdjustment && priceAdjustment.value !== undefined && priceAdjustment.value !== "");
    if (changesParentInventory) {
      const variableProduct = await Product.findOne({ _id: { $in: productIds }, "variants.0": { $exists: true } }).select("name");
      if (variableProduct) {
        return res.status(409).json({
          message: `Bulk price and stock changes do not edit variants. Remove ${variableProduct.name} from the selection and update its options individually.`,
        });
      }
    }

    const update = {};
    let includesShopMove = false;
    if (set && Object.keys(set).length > 0) {
      const allowedFields = new Set(["shop", "categoryId", "subcategoryId", "category", "subcategory", "badge", "badges", "isFlashSale", "stock"]);
      const disallowed = Object.keys(set).filter((key) => !allowedFields.has(key));
      if (disallowed.length) return res.status(400).json({ message: `Bulk edit cannot change: ${disallowed.join(", ")}. Use the product editor for publishing and SKU changes.` });
      if (Object.prototype.hasOwnProperty.call(set, "shop")) {
        if (typeof set.shop !== "string" || !/^[a-f\d]{24}$/i.test(set.shop)) {
          return res.status(400).json({ message: "Choose a valid active shop before moving products." });
        }
      }
      for (const field of ["category", "subcategory"]) {
        if (Object.prototype.hasOwnProperty.call(set, field)) {
          if (typeof set[field] !== "string" || set[field].trim().length > 100) {
            return res.status(400).json({ message: `${field} must be text with no more than 100 characters.` });
          }
          set[field] = set[field].trim();
        }
      }
      if (set.badge !== undefined || set.badges !== undefined) {
        const badgeFields = normalizeProductBadges(set);
        if (badgeFields.error) return res.status(400).json({ message: badgeFields.error });
        Object.assign(set, badgeFields);
      }
      const hasTaxonomyChange = ["categoryId", "subcategoryId", "category", "subcategory"].some((field) => Object.prototype.hasOwnProperty.call(set, field));
      if (hasTaxonomyChange && (set.categoryId || set.subcategoryId)) {
        if (!/^[a-f\d]{24}$/i.test(String(set.categoryId || "")) || !/^[a-f\d]{24}$/i.test(String(set.subcategoryId || ""))) {
          return res.status(400).json({ message: "Choose a managed category and one of its subcategories." });
        }
        const taxonomy = await normalizeProductTaxonomy({ categoryId: set.categoryId, subcategoryId: set.subcategoryId });
        if (taxonomy.issues.length) return res.status(400).json({ message: "Choose a valid category and subcategory.", issues: taxonomy.issues });
        for (const field of ["categoryId", "subcategoryId", "category", "subcategory"]) set[field] = taxonomy[field];
      } else if (hasTaxonomyChange) {
        const selectedProducts = await Product.find({ _id: { $in: productIds } }).select("name categoryId subcategoryId category subcategory").lean();
        const resolved = [];
        for (const product of selectedProducts) {
          const taxonomy = await normalizeProductTaxonomy({
            categoryId: Object.prototype.hasOwnProperty.call(set, "category") ? null : product.categoryId,
            subcategoryId: Object.prototype.hasOwnProperty.call(set, "subcategory") ? null : product.subcategoryId,
            category: Object.prototype.hasOwnProperty.call(set, "category") ? set.category : product.category,
            subcategory: Object.prototype.hasOwnProperty.call(set, "subcategory") ? set.subcategory : product.subcategory,
          });
          if (taxonomy.issues.length) return res.status(400).json({ message: `Cannot apply this category change to ${product.name}.`, issues: taxonomy.issues });
          resolved.push(taxonomy);
        }
        const taxonomyKeys = new Set(resolved.map((taxonomy) => `${taxonomy.categoryId}:${taxonomy.subcategoryId}`));
        if (taxonomyKeys.size > 1) {
          return res.status(400).json({ message: "Choose a managed category and subcategory to apply the same assignment to every selected product." });
        }
        if (resolved[0]) {
          for (const field of ["categoryId", "subcategoryId", "category", "subcategory"]) set[field] = resolved[0][field];
        }
      }
      if (Object.prototype.hasOwnProperty.call(set, "isFlashSale") && typeof set.isFlashSale !== "boolean") {
        return res.status(400).json({ message: "Flash sale status must be true or false." });
      }
      if (Object.prototype.hasOwnProperty.call(set, "shop") && !await Shop.exists({ _id: set.shop, isActive: true })) {
        return res.status(400).json({ message: "Choose an active shop before moving products." });
      }
      if (set.shop) {
        const movingProducts = await Product.find({ _id: { $in: productIds } }).select("name brand shop stock stockReservations variants.stock variants.stockReservations +inventoryLocations").lean();
        includesShopMove = movingProducts.some((product) => String(product.shop) !== String(set.shop));
        if (includesShopMove && Object.prototype.hasOwnProperty.call(set, "stock")) {
          return res.status(400).json({ message: "Move products to another catalog shop separately from bulk stock changes." });
        }
        const productWithStock = includesShopMove && movingProducts.find((product) => (
          !Number.isInteger(product.stock)
          || product.stock !== 0
          || (product.variants || []).some((variant) => !Number.isInteger(variant.stock) || variant.stock !== 0)
          || (product.inventoryLocations || []).length > 0
          || (product.stockReservations || []).length > 0
          || (product.variants || []).some((variant) => (variant.stockReservations || []).length > 0)
        ));
        if (productWithStock) return res.status(409).json({ message: `Reconcile ${productWithStock.name}'s inventory before changing its catalog shop.` });
        const identities = new Set();
        for (const product of movingProducts) {
          const identity = `${String(product.name || "").trim().toLowerCase()}\u0000${String(product.brand || "").trim().toLowerCase()}`;
          if (identities.has(identity)) {
            return res.status(409).json({ message: "The selection contains duplicate product names. Resolve those duplicates before moving them together." });
          }
          identities.add(identity);
        }
        const duplicateConditions = movingProducts.filter((product) => String(product.name || "").trim()).map((product) => ({
          name: new RegExp(`^${escapeRegExp(product.name)}$`, "i"),
          ...(product.brand ? { brand: new RegExp(`^${escapeRegExp(product.brand)}$`, "i") } : {}),
        }));
        const duplicate = duplicateConditions.length ? await Product.findOne({
          _id: { $nin: productIds },
          shop: set.shop,
          $or: duplicateConditions,
        }).select("name") : null;
        if (duplicate) {
          return res.status(409).json({ message: `“${duplicate.name}” already exists in the destination shop. Review the duplicate before moving these products.` });
        }
      }
      if (Object.prototype.hasOwnProperty.call(set, "stock")) {
        if (!["string", "number"].includes(typeof set.stock)) {
          return res.status(400).json({ message: "Stock must be a whole number of zero or more." });
        }
        const stock = Number(set.stock);
        if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ message: "Stock must be a whole number of zero or more." });
        set.stock = stock;
      }
      update.$set = { ...set };
    }

    // A bulk absolute stock replacement does not know about stock held for
    // active orders. Reject it if any selected product has a reservation so
    // the reservation ledger and the available quantity cannot drift apart.
    if (set && Object.prototype.hasOwnProperty.call(set, "stock")) {
      const reservedProduct = await Product.findOne({
        _id: { $in: productIds },
        stockReservations: { $elemMatch: { orderId: { $exists: true } } },
      }).select("name");
      if (reservedProduct) {
        return res.status(409).json({
          message: `Bulk stock cannot be changed while a selected product has active order reservations (${reservedProduct.name}). Update that product individually after its active orders finish.`,
        });
      }
    }

    if (priceAdjustment && priceAdjustment.value !== undefined && priceAdjustment.value !== "") {
      if (!["string", "number"].includes(typeof priceAdjustment.value)) {
        return res.status(400).json({ message: "Price adjustment value must be a number." });
      }
      const value = Number(priceAdjustment.value);
      if (!Number.isFinite(value)) {
        return res.status(400).json({ message: "Invalid price adjustment value" });
      }
      if (priceAdjustment.type === "percent") {
        const selected = await Product.find({ _id: { $in: productIds } }).select("name price compareAtPrice").lean();
        const invalid = selected.find((product) => {
          const nextPrice = Number(product.price) * (1 + value / 100);
          const compareAtPrice = Number(product.compareAtPrice || 0);
          return !Number.isFinite(Number(product.price)) || Number(product.price) <= 0 || !Number.isFinite(nextPrice) || nextPrice <= 0
            || (compareAtPrice > 0 && compareAtPrice <= nextPrice);
        });
        if (invalid) return res.status(400).json({ message: `This adjustment would make ${invalid.name}'s price invalid or equal to its compare-at price. Update the sale price or compare-at price first.` });
        update.$mul = { price: 1 + value / 100 };
      } else if (priceAdjustment.type === "flat") {
        const selected = await Product.find({ _id: { $in: productIds } }).select("name price compareAtPrice").lean();
        const invalid = selected.find((product) => {
          const nextPrice = Number(product.price) + value;
          const compareAtPrice = Number(product.compareAtPrice || 0);
          return !Number.isFinite(Number(product.price)) || Number(product.price) <= 0 || !Number.isFinite(nextPrice) || nextPrice <= 0
            || (compareAtPrice > 0 && compareAtPrice <= nextPrice);
        });
        if (invalid) return res.status(400).json({ message: `This adjustment would make ${invalid.name}'s price invalid or equal to its compare-at price. Update the sale price or compare-at price first.` });
        update.$inc = { price: value };
      } else if (priceAdjustment.type === "set") {
        if (value <= 0) return res.status(400).json({ message: "Set price must be greater than KSh 0." });
        const invalid = await Product.findOne({
          _id: { $in: productIds },
          compareAtPrice: { $gt: 0, $lte: value },
        }).select("name").lean();
        if (invalid) return res.status(400).json({ message: `KSh ${value.toLocaleString()} would equal or exceed ${invalid.name}'s compare-at price. Update the sale price or compare-at price first.` });
        update.$set = { ...update.$set, price: value };
      } else {
        return res.status(400).json({ message: "Choose a valid price adjustment type." });
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No changes specified" });
    }

    const bulkFilter = { _id: { $in: productIds } };
    if (includesShopMove) {
      bulkFilter.$and = [
        { stock: 0 },
        { variants: { $not: { $elemMatch: { stock: { $ne: 0 } } } } },
        { $or: [{ inventoryLocations: { $size: 0 } }, { inventoryLocations: { $exists: false } }] },
      ];
    }
    const changesStock = Boolean(set && Object.prototype.hasOwnProperty.call(set, "stock"));
    if (changesStock) {
      // Keep the guard in the write predicate too, so a reservation created
      // after the preflight check cannot be overwritten by this bulk edit.
      bulkFilter.stockReservations = { $not: { $elemMatch: { orderId: { $exists: true } } } };
    }
    let result;
    if (changesStock) {
      const topologyType = Product.db.client?.topology?.description?.type;
      const supportsTransactions = ["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"].includes(topologyType);
      if (!supportsTransactions) {
        return res.status(503).json({ message: "Bulk stock changes require database transaction support. Update stock from each product’s editor instead." });
      }
      const session = await Product.db.startSession();
      try {
        await session.withTransaction(async () => {
          let matchedCount = 0;
          let modifiedCount = 0;
          for (const productId of productIds) {
            const current = await Product.findOne({
              _id: productId,
              stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } },
            }).select("stock").session(session);
            if (!current) {
              const conflict = new Error("A selected product gained an active order reservation. No bulk changes were saved; refresh the catalog and try again.");
              conflict.statusCode = 409;
              throw conflict;
            }
            const operations = { ...update };
            const previousStock = Number.isInteger(current.stock) ? current.stock : null;
            if (previousStock !== (set.stock ?? null)) {
              addInventoryHistory(operations, [createInventoryMovement("bulk_adjustment", current.stock, set.stock, { source: "bulk-edit" })]);
            }
            const writeFilter = {
              _id: productId,
              stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } },
              stock: previousStock,
            };
            const updated = await Product.updateOne(writeFilter, operations, { session, runValidators: true });
            if (!updated.matchedCount) {
              const conflict = new Error("A selected product changed while applying the bulk stock update. No bulk changes were saved; refresh the catalog and try again.");
              conflict.statusCode = 409;
              throw conflict;
            }
            matchedCount += updated.matchedCount;
            modifiedCount += updated.modifiedCount;
          }
          result = { matchedCount, modifiedCount };
        });
      } finally {
        await session.endSession();
      }
    } else {
      result = await Product.updateMany(bulkFilter, update);
    }
    if (result.matchedCount !== productIds.length) {
      return res.status(409).json({
        message: `Only ${result.matchedCount} of ${productIds.length} products were updated. A product may have gained an active order reservation. Refresh the catalog and review the selected products.`,
        matched: result.matchedCount,
        requested: productIds.length,
      });
    }

    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
