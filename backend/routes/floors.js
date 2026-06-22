const express = require("express");
const Floor = require("../models/Floor");
const { protect, requireRole } = require("../middleware/auth");

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

// GET /api/floors/:slug
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
    const floor = await Floor.create(req.body);
    res.status(201).json(floor);
  } catch (err) {
    next(err);
  }
});

// PUT /api/floors/:id - admin only
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
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
    const floor = await Floor.findByIdAndDelete(req.params.id);
    if (!floor) return res.status(404).json({ message: "Floor not found" });
    res.json({ message: "Floor deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
