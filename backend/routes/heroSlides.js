const express = require("express");
const HeroSlide = require("../models/HeroSlide");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

function validateSlide(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Campaign details must be submitted as an object.";
  const { headline, ctaLabel, destination, mediaType, mediaUrl, posterUrl, startsAt, endsAt } = body;
  if (typeof headline !== "string" || !headline.trim() || headline.length > 120) return "Add a headline of 120 characters or fewer.";
  if (typeof ctaLabel !== "string" || !ctaLabel.trim() || ctaLabel.length > 40) return "Add a button label of 40 characters or fewer.";
  if (typeof body.supportingText !== "string" || body.supportingText.length > 240) return "Supporting text must be 240 characters or fewer.";
  if (typeof destination !== "string" || destination.length > 300) return "Choose a valid destination inside this store.";
  if (body.altText !== undefined && (typeof body.altText !== "string" || body.altText.length > 160)) return "Image description must be 160 characters or fewer.";
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") return "Campaign visibility must be true or false.";
  const path = destination.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "Choose a destination inside this store.";
  }
  if (!/^\/(?:$|directory(?:[/?#]|$)|search(?:[/?#]|$)|how-it-works(?:[/?#]|$)|delivery(?:[/?#]|$)|contact(?:[/?#]|$)|faq(?:[/?#]|$)|returns(?:[/?#]|$)|collection\/|shop\/|floor\/|product\/)/i.test(path) || /^\/admin(?:[/?#]|$)/i.test(path)) {
    return "Choose a valid store page for the button.";
  }
  if (!["image", "video"].includes(mediaType)) return "Choose an image or video background.";
  const media = typeof mediaUrl === "string" ? mediaUrl.trim() : "";
  if (!validMedia(media)) {
    return "Use a secure https media URL or a path to a file hosted by this store.";
  }
  const poster = typeof posterUrl === "string" ? posterUrl.trim() : "";
  if (posterUrl !== undefined && typeof posterUrl !== "string") return "Use a secure https URL for the video fallback image.";
  if (poster && !validMedia(poster)) {
    return "Use a secure https URL for the video fallback image.";
  }
  if (startsAt && (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt)))) return "The start date is invalid.";
  if (endsAt && (typeof endsAt !== "string" || Number.isNaN(Date.parse(endsAt)))) return "The end date is invalid.";
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return "The end date must be after the start date.";
  return "";
}

function validMedia(value) {
  if (typeof value !== "string" || !value || value.length > 1000) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.includes("\\");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function slideFields(body) {
  return {
    headline: String(body.headline || "").trim(),
    supportingText: String(body.supportingText || "").trim(),
    ctaLabel: String(body.ctaLabel || "").trim(),
    destination: String(body.destination || "").trim(),
    mediaType: body.mediaType,
    mediaUrl: String(body.mediaUrl || "").trim(),
    posterUrl: String(body.posterUrl || "").trim(),
    altText: String(body.altText || "").trim(),
    isActive: body.isActive === true,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
  };
}

// Public homepage feed: only currently active and in-window campaign slides.
router.get("/", async (_req, res, next) => {
  try {
    const now = new Date();
    const slides = await HeroSlide.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }] },
      ],
    }).sort({ order: 1, createdAt: 1 }).lean();
    res.json(slides);
  } catch (err) { next(err); }
});

router.get("/admin/list", protect, requireRole("admin"), async (_req, res, next) => {
  try { res.json(await HeroSlide.find().sort({ order: 1, createdAt: 1 }).lean()); }
  catch (err) { next(err); }
});

router.post("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const error = validateSlide(req.body);
    if (error) return res.status(400).json({ message: error });
    const last = await HeroSlide.findOne().sort({ order: -1 }).select("order").lean();
    const slide = await HeroSlide.create({ ...slideFields(req.body), order: (last?.order ?? -1) + 1 });
    res.status(201).json(slide);
  } catch (err) { next(err); }
});

router.put("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const error = validateSlide(req.body);
    if (error) return res.status(400).json({ message: error });
    const slide = await HeroSlide.findByIdAndUpdate(req.params.id, slideFields(req.body), { new: true, runValidators: true });
    if (!slide) return res.status(404).json({ message: "Hero slide not found." });
    res.json(slide);
  } catch (err) { next(err); }
});

router.patch("/:id/move", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!["up", "down"].includes(req.body.direction)) return res.status(400).json({ message: "Choose up or down." });
    const slide = await HeroSlide.findById(req.params.id);
    if (!slide) return res.status(404).json({ message: "Hero slide not found." });
    const neighbor = req.body.direction === "up"
      ? await HeroSlide.findOne({ order: { $lt: slide.order } }).sort({ order: -1 })
      : await HeroSlide.findOne({ order: { $gt: slide.order } }).sort({ order: 1 });
    if (!neighbor) return res.json({ ok: true });
    [slide.order, neighbor.order] = [neighbor.order, slide.order];
    await Promise.all([slide.save(), neighbor.save()]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const slide = await HeroSlide.findByIdAndDelete(req.params.id);
    if (!slide) return res.status(404).json({ message: "Hero slide not found." });
    res.json({ message: "Hero slide deleted." });
  } catch (err) { next(err); }
});

module.exports = router;
