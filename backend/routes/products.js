const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { parse } = require("csv-parse/sync");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const Floor = require("../models/Floor");
const { protect, requireRole } = require("../middleware/auth");
const { mapWooCommerceRows, cleanCategory } = require("../utils/wooCommerceImport");
const { toCsv } = require("../utils/csvExport");
const { productStatus, validatePublishable, normalizeProductTaxonomy, assertUniqueProductSkus, isValidProductImageUrl } = require("../utils/productLifecycle");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");
const { buildAdminProductQuery, isValidExpectedProductCount, matchesExpectedProductCount } = require("../utils/adminProductQuery");
const { normalizeReviewedProduct, validateImportPlan, validatePlannedSkuUniqueness } = require("../utils/productImportReview");
const { suggestUniqueProductSku } = require("../utils/productSku");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB cap
const MAX_BULK_EDIT_PRODUCTS = 500;

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const { search, page: pageNumber, limit: pageSize } = parseListQuery(req.query);
    let availableShopIds = await Shop.find({ isActive: true }).distinct("_id");
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

    // Include legacy active products that predate the lifecycle status field,
    // but never expose drafts even if an old/manual write left isActive true.
    const filter = { isActive: true, shop: { $in: availableShopIds }, $or: [{ status: "published" }, { status: { $exists: false } }] };
    if (purpose) filter.purposeTags = purpose;
    if (badge) filter.badge = badge;
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

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate({ path: "shop", select: "name shopNumber slug floor", populate: { path: "floor", select: "name floorNumber slug" } })
        .skip(skip)
        .limit(pageSize)
        .sort(sortObj),
      Product.countDocuments(filter),
    ]);

    res.json({ products, total, page: pageNumber, pages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// Admin catalog includes drafts and archived items. Public catalog routes
// deliberately remain published-only.
router.get("/admin/list", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { search, filter } = buildAdminProductQuery(req.query);
    const { page: pageNumber, limit: pageSize } = parseListQuery(req.query);
    const [products, total] = await Promise.all([
      Product.find(filter).populate("shop", "name shopNumber isActive").sort({ updatedAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
      Product.countDocuments(filter),
    ]);
    res.json({ products: products.map((product) => ({ ...product.toJSON(), status: productStatus(product), publishIssues: validatePublishable(product) })), total, page: pageNumber, pages: Math.ceil(total / pageSize) });
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
    const { filter } = buildAdminProductQuery(req.body);
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
      { label: "Category", value: "category" },
      { label: "Subcategory", value: "subcategory" },
      { label: "Price", value: "price" },
      { label: "Compare At Price", value: "compareAtPrice" },
      { label: "Stock", value: "stock" },
      { label: "Status", value: (p) => productStatus(p) },
      { label: "Variants", value: (p) => JSON.stringify((p.variants || []).map((variant) => ({ name: variant.name, sku: variant.sku, price: variant.price, compareAtPrice: variant.compareAtPrice, stock: variant.stock, image: variant.image }))) },
      { label: "Badge", value: "badge" },
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
    }).populate({
      path: "shop",
      match: { isActive: true },
      select: "name shopNumber slug floor",
      populate: { path: "floor", select: "name floorNumber slug" },
    });
    if (!product || !product.shop) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const createFields = new Set([
      "name", "sku", "description", "longDescription", "price", "compareAtPrice", "images", "imageUrls", "shop",
      "category", "subcategory", "brand", "returnEligibility", "stock", "badge", "isFlashSale",
      "purposeTags", "variants", "flashSaleEndsAt", "status", "publish",
    ]);
    const safeBody = Object.fromEntries(Object.entries(body).filter(([key]) => createFields.has(key)));
    const images = parseImageUrls(safeBody.images || safeBody.imageUrls);
    delete safeBody.stockReservations;
    delete safeBody.skuCodes;
    delete safeBody.isActive;
    const variants = Array.isArray(safeBody.variants) ? safeBody.variants.map((variant) => {
      const cleanVariant = { ...variant };
      delete cleanVariant.stockReservations;
      cleanVariant.sku = String(cleanVariant.sku || "").trim().toUpperCase();
      return cleanVariant;
    }) : safeBody.variants;
    const status = safeBody.status === "published" || safeBody.publish === true ? "published" : "draft";
    delete safeBody.publish;
    if (status === "published" ? !await Shop.exists({ _id: safeBody.shop, isActive: true }) : !await Shop.exists({ _id: safeBody.shop })) {
      return res.status(400).json({ message: status === "published" ? "Choose an active shop before publishing this product." : "Choose an existing shop for this product." });
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
    if (status === "published") {
      const taxonomy = await normalizeProductTaxonomy(candidate);
      if (taxonomy.issues.length) return res.status(400).json({ message: "This product's category selection is invalid", issues: taxonomy.issues });
      candidate.category = taxonomy.category;
      candidate.subcategory = taxonomy.subcategory;
      const issues = validatePublishable(candidate);
      if (issues.length) return res.status(400).json({ message: "This product cannot be published yet", issues });
    }
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
      "category", "subcategory", "brand", "returnEligibility", "stock", "badge", "isFlashSale",
      "purposeTags", "variants", "flashSaleEndsAt", "status", "isActive", "publish",
    ]);
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => editableFields.has(key)));
    if (req.body.images !== undefined || req.body.imageUrls !== undefined) {
      updates.images = parseImageUrls(req.body.images || req.body.imageUrls);
    }
    if (Array.isArray(updates.variants)) {
      const current = await Product.findById(req.params.id).select("variants._id variants.stockReservations");
      if (!current) return res.status(404).json({ message: "Product not found" });
      const variants = updates.variants.map((variant) => {
        const cleanVariant = { ...variant };
        delete cleanVariant.stockReservations;
        cleanVariant.sku = String(cleanVariant.sku || "").trim().toUpperCase();
        return cleanVariant;
      });
      for (const currentVariant of current.variants) {
        const activeReservations = currentVariant.stockReservations || [];
        if (!activeReservations.length) continue;
        const nextVariant = variants.find((variant) => String(variant._id || "") === String(currentVariant._id));
        if (!nextVariant) return res.status(409).json({ message: "This product option has an active order reservation and cannot be removed yet" });
        nextVariant.stockReservations = activeReservations;
      }
      updates.variants = variants;
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
    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct) return res.status(404).json({ message: "Product not found" });
    if (currentProduct.updatedAt?.getTime() !== expectedUpdatedAt.getTime()) {
      return res.status(409).json({ message: "This product changed after you opened it. Refresh the product, review the latest details, and apply your changes again." });
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
        if (!(currentVariant.stockReservations || []).length) continue;
        const nextVariant = updates.variants.find((variant) => String(variant._id || "") === String(currentVariant._id));
        if (!nextVariant) return res.status(409).json({ message: `Option "${currentVariant.name}" has an active order reservation and cannot be removed yet.` });
        if (nextVariant.stock === undefined || nextVariant.stock === null || Number(nextVariant.stock) !== Number(currentVariant.stock)) {
          return res.status(409).json({ message: `Stock for option "${currentVariant.name}" cannot be changed while it has active order reservations.` });
        }
      }
    }
    const candidate = { ...currentProduct.toObject(), ...updates };
    if (updates.variants) candidate.variants = updates.variants;
    if (updates.images) candidate.images = updates.images;
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
    if (productStatus(candidate) === "published") {
      if (!await Shop.exists({ _id: candidate.shop, isActive: true })) {
        return res.status(400).json({ message: "This product cannot be published until it is assigned to an active shop.", issues: ["Choose an active shop."] });
      }
      const taxonomy = await normalizeProductTaxonomy(candidate);
      if (taxonomy.issues.length) return res.status(400).json({ message: "This product's category selection is invalid", issues: taxonomy.issues });
      candidate.category = taxonomy.category;
      candidate.subcategory = taxonomy.subcategory;
      updates.category = taxonomy.category;
      updates.subcategory = taxonomy.subcategory;
      const issues = validatePublishable(candidate);
      if (issues.length) return res.status(400).json({ message: "This product cannot be published yet", issues });
    }
    await assertUniqueProductSkus(candidate, req.params.id);
    const nextSkuCodes = [candidate.sku, ...(candidate.variants || []).map((variant) => variant.sku)]
      .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean);
    if (nextSkuCodes.length) updates.skuCodes = nextSkuCodes;
    else { delete updates.skuCodes; updates.$unset = { ...(updates.$unset || {}), skuCodes: 1 }; }
    const productWriteFilter = { _id: req.params.id, updatedAt: currentProduct.updatedAt };
    const stockWriteGuarded = updates.stock !== undefined;
    const variantsWriteGuarded = Array.isArray(updates.variants);
    if (stockWriteGuarded) {
      productWriteFilter.stockReservations = { $not: { $elemMatch: { orderId: { $exists: true } } } };
    }
    if (variantsWriteGuarded) {
      productWriteFilter["variants.stockReservations"] = { $not: { $elemMatch: { orderId: { $exists: true } } } };
    }
    const product = await Product.findOneAndUpdate(productWriteFilter, updates, { new: true, runValidators: true });
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
    const target = await Product.findById(req.params.id).select("status isActive");
    if (!target) return res.status(404).json({ message: "Product not found" });
    if (productStatus(target) !== "archived") return res.status(409).json({ message: "Archive this product before permanently deleting it." });
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
    const items = [];
    const reservedSkus = new Set(mapped.flatMap((entry) => entry.product
      ? [entry.product.sku, ...(entry.product.variants || []).map((variant) => variant.sku)]
        .map((sku) => String(sku || "").trim().toUpperCase()).filter(Boolean)
      : []));
    for (const entry of mapped) {
      if (!entry.product) {
        items.push({ index: entry.index, product: null, errors: [entry.reason || "This row could not be imported."], candidates: [] });
        continue;
      }
      const p = entry.product;
      const skus = [p.sku, ...(p.variants || []).map((variant) => variant.sku)].filter(Boolean).map((sku) => String(sku).trim());
      const regexes = skus.map((sku) => new RegExp(`^${escapeRegExp(sku)}$`, "i"));
      const candidateConditions = [];
      if (regexes.length) candidateConditions.push(
        { sku: { $in: regexes } },
        { "variants.sku": { $in: regexes } },
        { skuCodes: { $in: skus.map((sku) => sku.toUpperCase()) } },
      );
      if (p.name) candidateConditions.push({
        name: new RegExp(`^${escapeRegExp(p.name)}$`, "i"),
        ...(p.brand ? { brand: new RegExp(`^${escapeRegExp(p.brand)}$`, "i") } : {}),
      });
      const candidates = candidateConditions.length
        ? await Product.find({ $or: candidateConditions })
          .select("name sku brand shop variants.sku variants.name status isActive").populate("shop", "name shopNumber").limit(10)
        : [];
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
      items.push({ index: entry.index, product: p, generatedSkus, sourceCategory: category, sourcePublished: Boolean(entry.sourcePublished), errors, candidates: candidates.map((candidate) => {
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
          shop: candidate.shop ? { id: candidate.shop._id, name: candidate.shop.name, shopNumber: candidate.shop.shopNumber } : null,
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
    const results = [];
    for (const decision of plan) {
      if (decision.action === "skip") { results.push({ index: decision.index, status: "skipped" }); continue; }
      const entry = mapped.get(Number(decision.index));
      if (!entry?.product) { results.push({ index: decision.index, status: "failed", message: entry?.reason || "Invalid product row" }); continue; }
      try {
        const reviewed = normalizeReviewedProduct(decision.product);
        if (reviewed.issues.length) throw Object.assign(new Error("Reviewed product details are invalid."), { statusCode: 400, issues: reviewed.issues });
        const imported = { ...reviewed.product, variants: reviewed.product.variants || [] };
        const shop = await Shop.findById(decision.shopId).select("_id isActive");
        if (!shop) throw Object.assign(new Error("Choose a valid shop."), { statusCode: 400 });
        imported.shop = shop._id;
        imported.category = String(decision.category || "").trim();
        imported.subcategory = String(decision.subcategory || "").trim();
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
          const existing = await Product.findById(decision.productId);
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
          for (const key of ["name", "sku", "price", "compareAtPrice", "description", "longDescription", "images", "brand", "category", "subcategory", "shop", "returnEligibility", "badge", "isFlashSale", "purposeTags", "flashSaleEndsAt", "variants"]) {
            const value = imported[key];
            if (key === "variants") {
              merged.variants = mergeImportedVariants(existing.variants || [], imported.variants || []);
              continue;
            }
            if (key === "sku" && !String(entry.product.sku || "").trim()) continue;
            merged[key] = value;
          }
          if (imported.stock !== undefined) {
            if ((existing.stockReservations || []).length && Number(imported.stock) !== Number(existing.stock)) {
              throw Object.assign(new Error("Stock cannot be overwritten while the product has active order reservations."), { statusCode: 409 });
            }
            merged.stock = imported.stock;
          }
          merged.status = targetStatus; merged.isActive = targetStatus === "published";
          merged.archivedAt = null;
          await assertUniqueProductSkus(merged, existing._id);
          if (targetStatus === "published") {
            const taxonomy = await normalizeProductTaxonomy(merged);
            if (taxonomy.issues.length) throw Object.assign(new Error("This item's category selection is invalid"), { statusCode: 400, issues: taxonomy.issues });
            merged.category = taxonomy.category;
            merged.subcategory = taxonomy.subcategory;
          }
          const issues = targetStatus === "published" ? validatePublishable(merged) : [];
          if (issues.length) throw Object.assign(new Error("This item cannot be published yet"), { statusCode: 400, issues });
          merged.skuCodes = [merged.sku, ...(merged.variants || []).map((variant) => variant.sku)].filter(Boolean).map((sku) => String(sku).trim().toUpperCase());
          const update = {};
          for (const key of ["name", "sku", "price", "compareAtPrice", "description", "longDescription", "images", "brand", "category", "subcategory", "shop", "returnEligibility", "badge", "isFlashSale", "purposeTags", "flashSaleEndsAt", "variants", "stock", "status", "isActive", "archivedAt", "skuCodes"]) {
            if (merged[key] !== undefined) update[key] = merged[key];
          }
          if (!merged.skuCodes.length) { delete update.skuCodes; update.$unset = { skuCodes: 1 }; }
          const overwrittenProduct = await Product.findOneAndUpdate({
            _id: existing._id,
            updatedAt: existing.updatedAt,
            stockReservations: { $not: { $elemMatch: { orderId: { $exists: true } } } },
            "variants.stockReservations": { $not: { $elemMatch: { orderId: { $exists: true } } } },
          }, update, { new: true, runValidators: true });
          if (!overwrittenProduct) {
            throw Object.assign(new Error("This product changed or gained an active order reservation while the import was being applied. Nothing was overwritten; refresh the catalog and review the product again."), { statusCode: 409 });
          }
          results.push({ index: decision.index, status: "overwritten", productStatus: targetStatus });
        } else {
          if (targetStatus === "published") {
            const taxonomy = await normalizeProductTaxonomy(imported);
            if (taxonomy.issues.length) throw Object.assign(new Error("This item's category selection is invalid"), { statusCode: 400, issues: taxonomy.issues });
            imported.category = taxonomy.category;
            imported.subcategory = taxonomy.subcategory;
            const issues = validatePublishable(imported);
            if (issues.length) throw Object.assign(new Error("This item cannot be published yet"), { statusCode: 400, issues });
          }
          await assertUniqueProductSkus(imported);
          const sameName = await Product.findOne({ name: new RegExp(`^${escapeRegExp(imported.name)}$`, "i"), ...(imported.brand ? { brand: new RegExp(`^${escapeRegExp(imported.brand)}$`, "i") } : {}), shop: imported.shop }).select("name");
          if (sameName) throw Object.assign(new Error("A product with this name, brand, and shop already exists. Choose the matching product to overwrite or skip this row."), { statusCode: 409 });
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
    if (set && Object.keys(set).length > 0) {
      const allowedFields = new Set(["shop", "category", "subcategory", "badge", "isFlashSale", "stock"]);
      const disallowed = Object.keys(set).filter((key) => !allowedFields.has(key));
      if (disallowed.length) return res.status(400).json({ message: `Bulk edit cannot change: ${disallowed.join(", ")}. Use the product editor for publishing and SKU changes.` });
      if (Object.prototype.hasOwnProperty.call(set, "shop")) {
        if (typeof set.shop !== "string" || !/^[a-f\d]{24}$/i.test(set.shop)) {
          return res.status(400).json({ message: "Choose a valid active shop before moving products." });
        }
      }
      for (const field of ["category", "subcategory", "badge"]) {
        if (Object.prototype.hasOwnProperty.call(set, field)) {
          if (typeof set[field] !== "string" || set[field].trim().length > 100) {
            return res.status(400).json({ message: `${field} must be text with no more than 100 characters.` });
          }
          set[field] = set[field].trim();
        }
      }
      if (Object.prototype.hasOwnProperty.call(set, "category") || Object.prototype.hasOwnProperty.call(set, "subcategory")) {
        const selectedProducts = await Product.find({ _id: { $in: productIds } }).select("name category subcategory status isActive").lean();
        const taxonomyCache = new Map();
        for (const product of selectedProducts) {
          const category = Object.prototype.hasOwnProperty.call(set, "category") ? set.category : product.category;
          const subcategory = Object.prototype.hasOwnProperty.call(set, "subcategory") ? set.subcategory : product.subcategory;
          const taxonomyKey = `${String(category || "").trim().toLocaleLowerCase()}\u0000${String(subcategory || "").trim().toLocaleLowerCase()}`;
          let taxonomy = taxonomyCache.get(taxonomyKey);
          if (!taxonomy) {
            taxonomy = await normalizeProductTaxonomy({ category, subcategory });
            taxonomyCache.set(taxonomyKey, taxonomy);
          }
          if (taxonomy.issues.length) return res.status(400).json({ message: `Cannot apply this category change to ${product.name}.`, issues: taxonomy.issues });
          if (Object.prototype.hasOwnProperty.call(set, "category")) set.category = taxonomy.category;
          if (Object.prototype.hasOwnProperty.call(set, "subcategory")) set.subcategory = taxonomy.subcategory;
        }
      }
      if (Object.prototype.hasOwnProperty.call(set, "isFlashSale") && typeof set.isFlashSale !== "boolean") {
        return res.status(400).json({ message: "Flash sale status must be true or false." });
      }
      if (Object.prototype.hasOwnProperty.call(set, "shop") && !await Shop.exists({ _id: set.shop, isActive: true })) {
        return res.status(400).json({ message: "Choose an active shop before moving products." });
      }
      if (set.shop) {
        const movingProducts = await Product.find({ _id: { $in: productIds } }).select("name brand").lean();
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
          result = await Product.updateMany(bulkFilter, update, { session });
          if (result.matchedCount !== productIds.length) {
            const conflict = new Error("A selected product gained an active order reservation. No bulk changes were saved; refresh the catalog and try again.");
            conflict.statusCode = 409;
            throw conflict;
          }
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
