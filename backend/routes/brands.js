const express = require("express");
const Brand = require("../models/Brand");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

function readBrandName(body) {
  const name = body && typeof body === "object" && !Array.isArray(body) ? body.name : undefined;
  if (typeof name !== "string" || !name.trim()) return { error: "Brand name is required" };
  const trimmed = name.trim();
  if (trimmed.length > 100) return { error: "Brand name must be 100 characters or fewer" };
  return { name: trimmed };
}

// GET /api/brands - public (admin dropdowns + potential public brand filtering)
router.get("/", async (req, res, next) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.json(brands);
  } catch (err) {
    next(err);
  }
});

// POST /api/brands - admin only. body: { name }
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readBrandName(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const trimmed = parsed.name;
    const exists = await Brand.findOne({ name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (exists) {
      return res.status(400).json({ message: "A brand with this name already exists" });
    }
    const brand = await Brand.create({ name: trimmed });
    res.status(201).json(brand);
  } catch (err) {
    next(err);
  }
});

// PUT /api/brands/:id - admin only. body: { name }
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = readBrandName(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ message: "Brand not found" });

    const trimmed = parsed.name;
    const exists = await Brand.findOne({
      _id: { $ne: brand._id },
      name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (exists) {
      return res.status(400).json({ message: "A brand with this name already exists" });
    }

    brand.name = trimmed;
    await brand.save();
    res.json(brand);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/brands/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ message: "Brand not found" });
    res.json({ message: "Brand deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
