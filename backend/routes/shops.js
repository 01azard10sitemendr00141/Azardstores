const express = require("express");
const Shop = require("../models/Shop");
const Floor = require("../models/Floor");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/shops - mall directory; optionally filter by floor
//   ?floor=<floorId or slug>
router.get("/", async (req, res, next) => {
  try {
    const filter = { isActive: true };

    if (req.query.floor) {
      const floorDoc = req.query.floor.match(/^[0-9a-fA-F]{24}$/)
        ? await Floor.findById(req.query.floor)
        : await Floor.findOne({ slug: req.query.floor });
      if (!floorDoc) return res.status(404).json({ message: "Floor not found" });
      filter.floor = floorDoc._id;
    }

    const shops = await Shop.find(filter).populate("floor", "name floorNumber slug").sort({ shopNumber: 1 });
    res.json(shops);
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:slug - a shop's own storefront page
router.get("/:slug", async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ slug: req.params.slug }).populate("floor", "name floorNumber slug");
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json(shop);
  } catch (err) {
    next(err);
  }
});

// POST /api/shops - admin only. shopNumber must be unique within its floor.
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const shop = await Shop.create({ ...req.body, owner: req.body.owner || req.user._id });
    res.status(201).json(shop);
  } catch (err) {
    next(err);
  }
});

// PUT /api/shops/:id - admin only
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json(shop);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shops/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const shop = await Shop.findByIdAndDelete(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json({ message: "Shop deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
