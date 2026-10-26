const express = require("express");
const Badge = require("../models/Badge");
const { protect, requireRole } = require("../middleware/auth");
const { makeSlug } = require("../utils/slug");

const router = express.Router();

// GET /api/badges - public. Returns every badge, ordered — this is what
// both the storefront (product chips, homepage sections) and the admin
// product form's badge dropdown read from.
router.get("/", async (req, res, next) => {
  try {
    const badges = await Badge.find().sort({ order: 1, createdAt: 1 });
    res.json(badges);
  } catch (err) {
    next(err);
  }
});

// POST /api/badges - admin only.
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { chipLabel, sectionHeading, sectionTag, icon } = req.body;
    if (!chipLabel || !chipLabel.trim() || !sectionHeading || !sectionHeading.trim()) {
      return res.status(400).json({ message: "Chip label and section heading are required" });
    }

    const slug = makeSlug(chipLabel.trim());
    const exists = await Badge.findOne({ slug });
    if (exists) {
      return res.status(400).json({ message: "A badge with this name already exists" });
    }

    const last = await Badge.findOne().sort({ order: -1 }).select("order");
    const badge = await Badge.create({
      slug,
      chipLabel: chipLabel.trim(),
      sectionHeading: sectionHeading.trim(),
      sectionTag: (sectionTag || "").trim(),
      icon: icon || "Tag",
      order: (last?.order ?? -1) + 1,
    });
    res.status(201).json(badge);
  } catch (err) {
    next(err);
  }
});

// PUT /api/badges/:id - admin only. `slug` is deliberately not editable here
// — see the model comment for why.
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });

    const { chipLabel, sectionHeading, sectionTag, icon } = req.body;
    if (chipLabel !== undefined) {
      if (!chipLabel.trim()) return res.status(400).json({ message: "Chip label is required" });
      badge.chipLabel = chipLabel.trim();
    }
    if (sectionHeading !== undefined) {
      if (!sectionHeading.trim()) return res.status(400).json({ message: "Section heading is required" });
      badge.sectionHeading = sectionHeading.trim();
    }
    if (sectionTag !== undefined) badge.sectionTag = sectionTag.trim();
    if (icon !== undefined) badge.icon = icon;

    await badge.save();
    res.json(badge);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/badges/:id/move - admin only. Swaps this badge's order with its
// immediate neighbor in the given direction — the simplest reliable way to
// let an admin reorder a short list without a full drag-and-drop endpoint.
router.patch("/:id/move", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { direction } = req.body;
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ message: "direction must be \"up\" or \"down\"" });
    }
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });

    const neighbor = direction === "up"
      ? await Badge.findOne({ order: { $lt: badge.order } }).sort({ order: -1 })
      : await Badge.findOne({ order: { $gt: badge.order } }).sort({ order: 1 });

    if (!neighbor) return res.json({ ok: true }); // already at that edge — no-op, not an error

    const thisOrder = badge.order;
    badge.order = neighbor.order;
    neighbor.order = thisOrder;
    await Promise.all([badge.save(), neighbor.save()]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/badges/:id - admin only. Non-destructive toward products —
// see the model comment.
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });
    await badge.deleteOne();
    res.json({ message: "Badge deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
