const express = require("express");
const mongoose = require("mongoose");
const HomeSection = require("../models/HomeSection");
const Badge = require("../models/Badge");
const Shop = require("../models/Shop");
const Category = require("../models/Category");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
const SECTION_TYPES = new Set(["badge", "featured-shop", "featured-category"]);

function validateCopy(type, heading, tag) {
  if (!SECTION_TYPES.has(type)) return "Unknown section type";
  if (heading !== undefined && (typeof heading !== "string" || heading.trim().length > 100)) {
    return "Heading must be text no longer than 100 characters";
  }
  if (tag !== undefined && (typeof tag !== "string" || tag.trim().length > 60)) {
    return "Tag must be text no longer than 60 characters";
  }
  return null;
}

// GET /api/home-sections - public. Ordered, populated with just enough
// badge/shop detail for the frontend to render each section — actual
// product fetching per section happens separately (same pattern Home.jsx
// already used for badges), so this stays fast and simple.
router.get("/", async (req, res, next) => {
  try {
    const sections = await HomeSection.find()
      .sort({ order: 1, createdAt: 1 })
      .populate("badge")
      .populate("shop", "name slug banner logo isActive");
    res.json(sections);
  } catch (err) {
    next(err);
  }
});

async function validateReference(type, badge, shop, category) {
  if (type === "badge") {
    if (!badge) return "A badge must be selected";
    if (!mongoose.isValidObjectId(badge)) return "Select a valid badge";
    const exists = await Badge.findById(badge);
    if (!exists) return "That badge no longer exists";
  } else if (type === "featured-shop") {
    if (!shop) return "A shop must be selected";
    if (!mongoose.isValidObjectId(shop)) return "Select a valid shop";
    const exists = await Shop.findOne({ _id: shop, isActive: true });
    if (!exists) return "Choose an active shop for a homepage feature";
  } else if (type === "featured-category") {
    if (typeof category !== "string" || !category.trim()) return "A category must be selected";
    const exists = await Category.findOne({ name: category.trim() });
    if (!exists) return "That category no longer exists";
  } else {
    return "Unknown section type";
  }
  return null;
}

// POST /api/home-sections - admin only.
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { type, badge, shop, category, heading, tag } = body;
    const copyError = validateCopy(type, heading, tag);
    if (copyError) return res.status(400).json({ message: copyError });
    const error = await validateReference(type, badge, shop, category);
    if (error) return res.status(400).json({ message: error });

    const last = await HomeSection.findOne().sort({ order: -1 }).select("order");
    const section = await HomeSection.create({
      type,
      badge: type === "badge" ? badge : undefined,
      shop: type === "featured-shop" ? shop : undefined,
      category: type === "featured-category" ? category.trim() : "",
      heading: (heading || "").trim(),
      tag: (tag || "").trim(),
      order: (last?.order ?? -1) + 1,
    });
    const populated = await section.populate([{ path: "badge" }, { path: "shop", select: "name slug banner logo" }]);
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

// PUT /api/home-sections/:id - admin only. Every field is freely editable —
// unlike Badge.slug, nothing else references a HomeSection by id, so
// changing what it points to carries no orphaning risk.
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const section = await HomeSection.findById(req.params.id);
    if (!section) return res.status(404).json({ message: "Section not found" });

    const type = body.type ?? section.type;
    const badge = body.badge ?? section.badge;
    const shop = body.shop ?? section.shop;
    const category = body.category ?? section.category;
    const copyError = validateCopy(type, body.heading, body.tag);
    if (copyError) return res.status(400).json({ message: copyError });

    // Only re-validate if the reference is actually changing. Re-validating
    // unconditionally would block an admin from editing a section's heading
    // or tag if the badge/shop it originally pointed to was deleted since —
    // an unrelated edit shouldn't require first picking a new reference.
    const referenceChanged =
      type !== section.type ||
      (type === "badge" && String(badge) !== String(section.badge)) ||
      (type === "featured-shop" && String(shop) !== String(section.shop)) ||
      (type === "featured-category" && category !== section.category);

    if (referenceChanged) {
      const error = await validateReference(type, badge, shop, category);
      if (error) return res.status(400).json({ message: error });
    }

    section.type = type;
    section.badge = type === "badge" ? badge : undefined;
    section.shop = type === "featured-shop" ? shop : undefined;
    section.category = type === "featured-category" ? category.trim() : "";
    if (body.heading !== undefined) section.heading = body.heading.trim();
    if (body.tag !== undefined) section.tag = body.tag.trim();

    await section.save();
    const populated = await section.populate([{ path: "badge" }, { path: "shop", select: "name slug banner logo" }]);
    res.json(populated);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/home-sections/:id/move - admin only. Swaps this section's
// order with its immediate neighbor — same reordering pattern as badges.
router.patch("/:id/move", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { direction } = body;
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ message: "direction must be \"up\" or \"down\"" });
    }
    const section = await HomeSection.findById(req.params.id);
    if (!section) return res.status(404).json({ message: "Section not found" });

    const neighbor = direction === "up"
      ? await HomeSection.findOne({ order: { $lt: section.order } }).sort({ order: -1 })
      : await HomeSection.findOne({ order: { $gt: section.order } }).sort({ order: 1 });

    if (!neighbor) return res.json({ ok: true }); // already at that edge — no-op

    const thisOrder = section.order;
    section.order = neighbor.order;
    neighbor.order = thisOrder;
    await Promise.all([section.save(), neighbor.save()]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/home-sections/:id - admin only.
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const section = await HomeSection.findById(req.params.id);
    if (!section) return res.status(404).json({ message: "Section not found" });
    await section.deleteOne();
    res.json({ message: "Section deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
