const express = require("express");
const HomepageContent = require("../models/HomepageContent");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
const ICONS = new Set(["Briefcase", "Gamepad2", "Plane", "House", "Dumbbell", "Shirt", "Cpu", "Sparkles", "ShoppingBag", "BookOpen", "Activity", "Heart"]);
const COLORS = /^#[0-9a-f]{6}$/i;
const DESTINATION = /^\/(?:$|directory(?:[/?#]|$)|search(?:[/?#]|$)|how-it-works(?:[/?#]|$)|delivery(?:[/?#]|$)|contact(?:[/?#]|$)|faq(?:[/?#]|$)|returns(?:[/?#]|$)|collection\/|shop\/|floor\/|product\/)/i;

function isInternalPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && DESTINATION.test(value) && !/^\/admin(?:[/?#]|$)/i.test(value);
}
function validMedia(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) return false;
  const media = value.trim();
  if (media.startsWith("/")) return !media.startsWith("//") && !media.includes("\\");
  try {
    const url = new URL(media);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Homepage content must be an object.";
  for (const [key, label, max] of [
    ["sectionLinkLabel", "Section link label", 40], ["featuredShopLinkLabel", "Featured shop link label", 40],
    ["fallbackHeroHeadline", "Fallback hero headline", 100], ["fallbackHeroSupportingText", "Fallback hero supporting text", 200],
    ["fallbackHeroCtaLabel", "Fallback hero button", 40],
    ["flashSaleHeading", "Flash sale heading", 60], ["flashSaleTag", "Flash sale tag", 40],
    ["purposeHeading", "Purpose section heading", 60],
    ["purposeTagline", "Purpose section tagline", 80], ["exploreHeading", "Explore section heading", 60],
    ["exploreLinkLabel", "Explore link label", 40], ["statsFloorsLabel", "Floor statistic label", 30],
    ["statsShopsLabel", "Shop statistic label", 30], ["statsProductsLabel", "Product statistic label", 30],
    ["statsFourthValue", "Fourth statistic value", 16], ["statsFourthLabel", "Fourth statistic label", 30],
    ["closingEyebrow", "Closing eyebrow", 60], ["closingHeadline", "Closing headline", 100],
    ["closingAccent", "Closing accent line", 100], ["closingPrimaryLabel", "Primary button", 40],
    ["closingSecondaryLabel", "Secondary button", 40], ["closingFooterLine", "Closing footer line", 100],
  ]) if (typeof body[key] !== "string" || !body[key].trim() || body[key].length > max) return `${label} is required and must be ${max} characters or fewer.`;
  if (!isInternalPath(body.closingPrimaryDestination) || body.closingPrimaryDestination.length > 300) return "Choose a valid internal page for the primary button.";
  if (!isInternalPath(body.fallbackHeroDestination) || body.fallbackHeroDestination.length > 300) return "Choose a valid internal page for the fallback hero button.";
  if (body.closingSecondaryDestination !== "whatsapp" && (!isInternalPath(body.closingSecondaryDestination) || body.closingSecondaryDestination.length > 300)) return "Choose WhatsApp or a valid internal page for the secondary button.";
  for (const key of ["closingPosterUrl", "featuredShopBackdropUrl", "exploreBackdropUrl"]) {
    if (body[key] !== undefined && typeof body[key] !== "string") return "Media URLs must be text values.";
  }
  if (!["image", "video"].includes(body.closingMediaType) || !validMedia(body.closingMediaUrl)) return "Choose a valid closing image or video URL.";
  if (body.closingPosterUrl && !validMedia(body.closingPosterUrl)) return "Choose a valid fallback image URL.";
  for (const key of ["featuredShopBackdropUrl", "exploreBackdropUrl"]) if (body[key] && !validMedia(body[key])) return "Use a valid HTTPS URL or a site path for homepage background images.";
  if (!Array.isArray(body.purposeTiles) || body.purposeTiles.length > 12) return "Add between 0 and 12 purpose tiles.";
  const seen = new Set();
  for (const tile of body.purposeTiles) {
    if (!tile || typeof tile !== "object" || Array.isArray(tile)) return "Each purpose tile must be a valid object.";
    const tag = String(tile.purposeTag || "").trim().toLowerCase();
    if (!String(tile.label || "").trim() || String(tile.label).length > 40) return "Each purpose tile needs a label of 40 characters or fewer.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) return "Purpose tags can use lowercase letters, numbers, and hyphens.";
    if (seen.has(tag)) return `The purpose tag “${tag}” is used more than once.`;
    seen.add(tag);
    if (!ICONS.has(tile.icon)) return `Choose a supported icon for “${tile.label}”.`;
    if (!COLORS.test(tile.color)) return `Choose a valid color for “${tile.label}”.`;
    if (typeof tile.tagline !== "string" || tile.tagline.length > 80) return "Purpose tile descriptions must be 80 characters or fewer.";
    if (tile.active !== undefined && typeof tile.active !== "boolean") return "Purpose tile visibility must be enabled or disabled.";
  }
  return "";
}

function getDocument() { return HomepageContent.findOne().sort({ createdAt: 1 }); }

router.get("/", async (_req, res, next) => {
  try {
    const doc = await getDocument();
    if (!doc) return res.json(null);
    res.json({ ...doc.toObject(), purposeTiles: (doc.purposeTiles || []).filter((tile) => tile.active).sort((a, b) => a.order - b.order) });
  } catch (err) { next(err); }
});

router.get("/admin", protect, requireRole("admin"), async (_req, res, next) => {
  try { res.json(await getDocument()); }
  catch (err) { next(err); }
});

router.put("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ message: error });
    let doc = await getDocument();
    if (!doc) doc = new HomepageContent();
    for (const key of ["sectionLinkLabel", "featuredShopLinkLabel", "fallbackHeroHeadline", "fallbackHeroSupportingText", "fallbackHeroCtaLabel", "fallbackHeroDestination", "flashSaleHeading", "flashSaleTag", "purposeHeading", "purposeTagline", "exploreHeading", "exploreLinkLabel", "featuredShopBackdropUrl", "exploreBackdropUrl", "statsFloorsLabel", "statsShopsLabel", "statsProductsLabel", "statsFourthValue", "statsFourthLabel", "closingEyebrow", "closingHeadline", "closingAccent", "closingPrimaryLabel", "closingPrimaryDestination", "closingSecondaryLabel", "closingSecondaryDestination", "closingFooterLine", "closingMediaType", "closingMediaUrl", "closingPosterUrl"]) doc[key] = String(req.body[key] ?? "").trim();
    doc.purposeTiles = req.body.purposeTiles.map((tile, order) => ({
      label: tile.label.trim(), tagline: tile.tagline.trim(), purposeTag: tile.purposeTag.trim().toLowerCase(),
      icon: tile.icon, color: tile.color, active: tile.active !== false, order,
    }));
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

module.exports = router;
