const express = require("express");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const { protect, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// GET /api/products
// Supports filtering so the frontend never has to hardcode product lists:
//   ?shop=<shopId>&floor=<floorId>&purpose=gaming&badge=hot-deal&flashSale=true&search=iphone&page=1&limit=20
router.get("/", async (req, res, next) => {
  try {
    const { shop, floor, purpose, badge, flashSale, search, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true };
    if (shop) filter.shop = shop;
    if (floor) {
      const shopsOnFloor = await Shop.find({ floor }).select("_id");
      filter.shop = { $in: shopsOnFloor.map((s) => s._id) };
    }
    if (purpose) filter.purposeTags = purpose;
    if (badge) filter.badge = badge;
    if (flashSale === "true") filter.isFlashSale = true;
    if (search) filter.$text = { $search: search };

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate({ path: "shop", select: "name shopNumber slug floor", populate: { path: "floor", select: "name floorNumber slug" } })
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      Product.countDocuments(filter),
    ]);

    res.json({
      products,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:slug
router.get("/:slug", async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true }).populate({
      path: "shop",
      select: "name shopNumber slug floor",
      populate: { path: "floor", select: "name floorNumber slug" },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/products - admin only, supports up to 5 images
router.post("/", protect, requireRole("admin"), upload.array("images", 5), async (req, res, next) => {
  try {
    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);
    const product = await Product.create({ ...req.body, images });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id - admin only
router.put("/:id", protect, requireRole("admin"), upload.array("images", 5), async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (req.files && req.files.length > 0) {
      updates.images = req.files.map((f) => `/uploads/${f.filename}`);
    }
    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
