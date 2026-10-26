const express = require("express");
const Floor = require("../models/Floor");
const Shop = require("../models/Shop");
const { protect, requireRole } = require("../middleware/auth");
const { parseListQuery, escapeRegex } = require("../utils/listQuery");

const router = express.Router();

// GET /api/floors - the mall's fixed top-level structure, used for nav + directory
router.get("/", async (req, res, next) => {
  try {
    const floors = await Floor.find({ isActive: true }).sort({ order: 1, floorNumber: 1 });
    res.json(floors);
  } catch (err) {
    next(err);
  }
});

// GET /api/floors/admin/list - admin only. Includes inactive floors (the
// public GET / above hides those) and supports search by name.
router.get("/admin/list", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { search } = parseListQuery(req.query);
    const filter = {};
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

    const floors = await Floor.find(filter).sort({ order: 1, floorNumber: 1 });
    res.json(floors);
  } catch (err) {
    next(err);
  }
});

// GET /api/floors/:slug - returns the floor even if inactive, so the
// frontend can show "temporarily closed" rather than a generic not-found —
// only a genuinely nonexistent slug 404s. Shops on an inactive floor stay
// fully reachable elsewhere (Search, direct shop links); this endpoint
// alone is what powers the floor's own dedicated page.
router.get("/:slug", async (req, res, next) => {
  try {
    const floor = await Floor.findOne({ slug: req.params.slug });
    if (!floor) return res.status(404).json({ message: "Floor not found" });
    res.json(floor);
  } catch (err) {
    next(err);
  }
});

// POST /api/floors - admin only
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const floorNumber = Number(req.body?.floorNumber);
    if (!Number.isInteger(floorNumber) || floorNumber < 1) return res.status(400).json({ message: "Floor number must be a positive whole number." });
    if (await Floor.exists({ floorNumber })) return res.status(409).json({ message: `Floor ${floorNumber} already exists. Choose another floor number.` });
    const floor = await Floor.create(req.body);
    res.status(201).json(floor);
  } catch (err) {
    next(err);
  }
});

// PUT /api/floors/:id - admin only
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (req.body?.floorNumber !== undefined) {
      const floorNumber = Number(req.body.floorNumber);
      if (!Number.isInteger(floorNumber) || floorNumber < 1) return res.status(400).json({ message: "Floor number must be a positive whole number." });
      if (await Floor.exists({ _id: { $ne: req.params.id }, floorNumber })) return res.status(409).json({ message: `Floor ${floorNumber} already exists. Choose another floor number.` });
    }
    const floor = await Floor.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!floor) return res.status(404).json({ message: "Floor not found" });
    res.json(floor);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/floors/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const floor = await Floor.findById(req.params.id);
    if (!floor) return res.status(404).json({ message: "Floor not found" });

    const shopCount = await Shop.countDocuments({ floor: floor._id });
    if (shopCount > 0) {
      return res.status(409).json({ message: `This floor still has ${shopCount} shop${shopCount === 1 ? "" : "s"}. Move or remove the shops before deleting the floor.` });
    }

    await floor.deleteOne();
    res.json({ message: "Floor deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
