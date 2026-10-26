const express = require("express");
const Category = require("../models/Category");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

function readName(body, label) {
  const value = body && typeof body === "object" && !Array.isArray(body) ? body.name : undefined;
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${label} is required` };
  }
  const name = value.trim();
  if (name.length > 80) return { error: `${label} must be 80 characters or fewer` };
  return { name };
}

// GET /api/categories - public (used by both the admin dropdowns and the
// public site for browsing/filtering by category)
router.get("/", async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories - admin only. body: { name }
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readName(req.body, "Category name");
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const trimmed = parsed.name;
    const exists = await Category.findOne({ name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (exists) {
      return res.status(400).json({ message: "A category with this name already exists" });
    }
    const category = await Category.create({ name: trimmed });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A category with this name already exists." });
    next(err);
  }
});

// PUT /api/categories/:id - admin only. body: { name }
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readName(req.body, "Category name");
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const trimmed = parsed.name;
    const exists = await Category.findOne({
      _id: { $ne: category._id },
      name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (exists) {
      return res.status(400).json({ message: "A category with this name already exists" });
    }

    const assignedProducts = await Product.countDocuments({ category: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (assignedProducts) return res.status(409).json({ message: `Move the ${assignedProducts} product${assignedProducts === 1 ? "" : "s"} to another category before renaming this one.` });

    category.name = trimmed;
    await category.save();
    res.json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A category with this name already exists." });
    next(err);
  }
});

// DELETE /api/categories/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    const assignedProducts = await Product.countDocuments({ category: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (assignedProducts) return res.status(409).json({ message: `Move the ${assignedProducts} product${assignedProducts === 1 ? "" : "s"} to another category before deleting this one.` });
    await category.deleteOne();
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories/:id/subcategories - admin only. body: { name }
router.post("/:id/subcategories", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readName(req.body, "Subcategory name");
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const trimmed = parsed.name;
    const exists = category.subcategories.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      return res.status(400).json({ message: "That subcategory already exists on this category" });
    }

    category.subcategories.push({ name: trimmed });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A category or subcategory with this name already exists." });
    next(err);
  }
});

// PUT /api/categories/:id/subcategories/:subId - admin only. body: { name }
router.put("/:id/subcategories/:subId", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readName(req.body, "Subcategory name");
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const sub = category.subcategories.id(req.params.subId);
    if (!sub) return res.status(404).json({ message: "Subcategory not found" });

    const duplicate = category.subcategories.some((candidate) =>
      String(candidate._id) !== String(sub._id) && candidate.name.toLowerCase() === parsed.name.toLowerCase()
    );
    if (duplicate) return res.status(400).json({ message: "That subcategory already exists on this category" });

    const assignedProducts = await Product.countDocuments({
      category: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      subcategory: new RegExp(`^${sub.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (assignedProducts) return res.status(409).json({ message: `Move the ${assignedProducts} product${assignedProducts === 1 ? "" : "s"} to another subcategory before renaming this one.` });

    sub.name = parsed.name;
    sub.slug = undefined; // recompute on save
    await category.save();
    res.json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A category or subcategory with this name already exists." });
    next(err);
  }
});

// DELETE /api/categories/:id/subcategories/:subId - admin only
router.delete("/:id/subcategories/:subId", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const sub = category.subcategories.id(req.params.subId);
    if (!sub) return res.status(404).json({ message: "Subcategory not found" });

    const assignedProducts = await Product.countDocuments({
      category: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      subcategory: new RegExp(`^${sub.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (assignedProducts) return res.status(409).json({ message: `Move the ${assignedProducts} product${assignedProducts === 1 ? "" : "s"} to another subcategory before deleting this one.` });

    sub.deleteOne();
    await category.save();
    res.json(category);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
