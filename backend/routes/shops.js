const express = require("express");
const Shop = require("../models/Shop");
const Floor = require("../models/Floor");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");

const router = express.Router();

// GET /api/shops - mall directory; optionally filter by floor
//   ?floor=<floorId or slug>
router.get("/", async (req, res, next) => {
  try {
    const filter = { isActive: true };

    const floor = queryText(req.query.floor, 100);
    if (floor) {
      const floorDoc = /^[0-9a-fA-F]{24}$/.test(floor)
        ? await Floor.findById(floor)
        : await Floor.findOne({ slug: floor });
      if (!floorDoc) return res.status(404).json({ message: "Floor not found" });
      filter.floor = floorDoc._id;
    }

    const shops = await Shop.find(filter).populate("floor", "name floorNumber slug").sort({ shopNumber: 1 });

    // productCount is the true count across ALL of a shop's active products,
    // not an approximation from a capped/paginated product fetch — the
    // frontend directory page used to compute this itself from a
    // limit-100 product list, which silently undercounted once the
    // catalog passed 100 items.
    const counts = await Product.aggregate([
      { $match: { isActive: true, $or: [{ status: "published" }, { status: { $exists: false } }], shop: { $in: shops.map((s) => s._id) } } },
      { $group: { _id: "$shop", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));
    const shopsWithCounts = shops.map((s) => ({ ...s.toObject(), productCount: countMap[s._id.toString()] || 0 }));

    res.json(shopsWithCounts);
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/admin/list - admin only. Paginated, searchable, and
// includes inactive shops (the public GET / above deliberately hides
// those, so admins need their own listing to actually manage them).
router.get("/admin/list", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { search, page, limit } = parseListQuery(req.query);
    const floor = typeof req.query.floor === "string" ? req.query.floor : "";
    const filter = {};
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };
    if (floor) filter.floor = floor;

    const skip = (page - 1) * limit;
    const [shops, total] = await Promise.all([
      Shop.find(filter)
        .populate("floor", "name floorNumber slug")
        .sort({ shopNumber: 1 })
        .skip(skip)
        .limit(limit),
      Shop.countDocuments(filter),
    ]);

    res.json({ shops, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/shops/:slug - a shop's own storefront page
router.get("/:slug", async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ slug: req.params.slug, isActive: true }).populate("floor", "name floorNumber slug");
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json(shop);
  } catch (err) {
    next(err);
  }
});

// POST /api/shops - admin only. shopNumber must be unique within its floor.
router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const shopNumber = Number(body.shopNumber);
    const floorId = String(body.floor?._id || body.floor || "");
    const name = String(body.name || "").trim();
    if (!Number.isInteger(shopNumber) || shopNumber < 1) return res.status(400).json({ message: "Shop number must be a positive whole number." });
    if (!name) return res.status(400).json({ message: "Shop name is required." });
    if (!/^[a-f\d]{24}$/i.test(floorId)) return res.status(400).json({ message: "Choose a valid floor." });
    const floor = await Floor.findOne({ _id: floorId, isActive: true }).select("_id");
    if (!floor) return res.status(400).json({ message: "Choose an active floor before creating a shop." });
    if (await Shop.exists({ floor: floorId, shopNumber })) {
      return res.status(409).json({ message: `Shop #${shopNumber} already exists on this floor. Choose another shop number.` });
    }
    const fields = ["description", "banner", "logo", "status", "isActive"];
    const shopData = { shopNumber, name, floor: floorId, owner: req.user._id };
    for (const field of fields) if (body[field] !== undefined) shopData[field] = body[field];
    const shop = await Shop.create(shopData);
    res.status(201).json(shop);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That shop number or shop URL is already in use. Refresh and choose a different value." });
    next(err);
  }
});

// PUT /api/shops/:id - admin only
router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    const body = req.body || {};
    const shopNumber = Number(body.shopNumber);
    const floorId = String(body.floor?._id || body.floor || "");
    const name = String(body.name || "").trim();
    if (!Number.isInteger(shopNumber) || shopNumber < 1) return res.status(400).json({ message: "Shop number must be a positive whole number." });
    if (!name) return res.status(400).json({ message: "Shop name is required." });
    if (!/^[a-f\d]{24}$/i.test(floorId)) return res.status(400).json({ message: "Choose a valid floor." });
    const floor = await Floor.findById(floorId).select("_id isActive");
    if (!floor) return res.status(400).json({ message: "Choose an existing floor." });
    const currentFloorId = String(shop.floor);
    if (!floor.isActive && String(floor._id) !== currentFloorId) {
      return res.status(400).json({ message: "Move the shop to an active floor before changing its floor assignment." });
    }
    if (await Shop.exists({ _id: { $ne: shop._id }, floor: floorId, shopNumber })) {
      return res.status(409).json({ message: `Shop #${shopNumber} already exists on this floor. Choose another shop number.` });
    }
    shop.shopNumber = shopNumber;
    shop.name = name;
    shop.floor = floorId;
    for (const field of ["description", "banner", "logo", "status", "isActive"]) {
      if (body[field] !== undefined) shop[field] = body[field];
    }
    await shop.save();
    res.json(shop);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That shop number or shop URL is already in use. Refresh and choose a different value." });
    next(err);
  }
});

// DELETE /api/shops/:id - admin only
router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const productCount = await Product.countDocuments({ shop: shop._id });
    if (productCount > 0) {
      return res.status(409).json({ message: `This shop still has ${productCount} product${productCount === 1 ? "" : "s"}. Move or remove the products before deleting the shop.` });
    }

    await shop.deleteOne();
    res.json({ message: "Shop deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
