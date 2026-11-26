const express = require("express");
const mongoose = require("mongoose");
const Supplier = require("../models/Supplier");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");
const { parseListQuery, escapeRegex } = require("../utils/listQuery");

const router = express.Router();
router.use(protect, requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, search } = parseListQuery(req.query);
    const filter = {};
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };
    const [suppliers, total] = await Promise.all([
      Supplier.find(filter).populate("products.product", "name sku variants").sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      Supplier.countDocuments(filter),
    ]);
    res.json({ suppliers, total, page, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name || name.length > 160) return res.status(400).json({ message: "Enter a supplier name of 160 characters or fewer." });

    const products = [];
    if (Array.isArray(body.products)) {
      for (const entry of body.products) {
        const productId = String(entry.product || "");
        if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ message: "A supplier product ID is invalid." });
        const product = await Product.findById(productId).select("name variants._id");
        if (!product) return res.status(400).json({ message: "A supplier product no longer exists." });
        const variantId = entry.variantId ? String(entry.variantId) : null;
        if (variantId && !product.variants.some((variant) => String(variant._id) === variantId)) {
          return res.status(400).json({ message: `An option for "${product.name}" no longer exists.` });
        }
        const estimatedStock = entry.estimatedStock == null ? null : Number(entry.estimatedStock);
        const estimatedUnitCost = entry.estimatedUnitCost == null ? null : Number(entry.estimatedUnitCost);
        const transferTimeHours = entry.transferTimeHours == null ? null : Number(entry.transferTimeHours);
        if (estimatedStock != null && (!Number.isInteger(estimatedStock) || estimatedStock < 0)) return res.status(400).json({ message: "Estimated stock must be a whole number." });
        if (estimatedUnitCost != null && (!Number.isFinite(estimatedUnitCost) || estimatedUnitCost < 0)) return res.status(400).json({ message: "Estimated unit cost is invalid." });
        if (transferTimeHours != null && (!Number.isFinite(transferTimeHours) || transferTimeHours < 1)) return res.status(400).json({ message: "Transfer time must be at least 1 hour." });
        products.push({ product: productId, variantId, estimatedStock, estimatedUnitCost, transferTimeHours });
      }
    }

    const supplier = await Supplier.create({
      name,
      contactName: String(body.contactName || "").trim(),
      contact: String(body.contact || "").trim(),
      email: String(body.email || "").trim(),
      note: String(body.note || "").trim(),
      isActive: body.isActive !== false,
      products,
    });
    res.status(201).json(supplier);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "A supplier with this name already exists." });
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid supplier ID." });
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found." });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name || name.length > 160) return res.status(400).json({ message: "Enter a supplier name of 160 characters or fewer." });
      supplier.name = name;
    }
    for (const field of ["contactName", "contact", "email", "note"]) {
      if (req.body[field] !== undefined) supplier[field] = String(req.body[field] || "").trim();
    }
    if (req.body.isActive !== undefined) supplier.isActive = Boolean(req.body.isActive);
    if (Array.isArray(req.body.products)) {
      const products = [];
      for (const entry of req.body.products) {
        const productId = String(entry.product || "");
        if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ message: "A supplier product ID is invalid." });
        const product = await Product.findById(productId).select("name variants._id");
        if (!product) return res.status(400).json({ message: "A supplier product no longer exists." });
        const variantId = entry.variantId ? String(entry.variantId) : null;
        if (variantId && !product.variants.some((variant) => String(variant._id) === variantId)) {
          return res.status(400).json({ message: `An option for "${product.name}" no longer exists.` });
        }
        const estimatedStock = entry.estimatedStock == null ? null : Number(entry.estimatedStock);
        const estimatedUnitCost = entry.estimatedUnitCost == null ? null : Number(entry.estimatedUnitCost);
        const transferTimeHours = entry.transferTimeHours == null ? null : Number(entry.transferTimeHours);
        if (estimatedStock != null && (!Number.isInteger(estimatedStock) || estimatedStock < 0)) return res.status(400).json({ message: "Estimated stock must be a whole number." });
        if (estimatedUnitCost != null && (!Number.isFinite(estimatedUnitCost) || estimatedUnitCost < 0)) return res.status(400).json({ message: "Estimated unit cost is invalid." });
        if (transferTimeHours != null && (!Number.isFinite(transferTimeHours) || transferTimeHours < 1)) return res.status(400).json({ message: "Transfer time must be at least 1 hour." });
        products.push({ product: productId, variantId, estimatedStock, estimatedUnitCost, transferTimeHours });
      }
      supplier.products = products;
    }
    await supplier.save();
    res.json(supplier);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "A supplier with this name already exists." });
    next(error);
  }
});

module.exports = router;
