const HomeSection = require("../models/HomeSection");
const Badge = require("../models/Badge");
const Shop = require("../models/Shop");

// Before this feature, Home.jsx built its own layout: the first badge
// section, then an auto-picked "Featured Shop" (whichever shop had a
// banner image, or just the first shop), then the rest of the badges.
// Homepage layout is now fully admin-managed instead — this recreates
// that exact same layout, once, only if no HomeSections exist yet, so
// upgrading is invisible. Must run AFTER seedDefaultBadgesIfEmpty, since
// it needs badges to already exist to reference them.
async function seedDefaultHomeSectionsIfEmpty() {
  try {
    const count = await HomeSection.countDocuments();
    if (count > 0) return;

    const badges = await Badge.find().sort({ order: 1, createdAt: 1 });
    const shops = await Shop.find({ isActive: true });
    const featuredShop = shops.find((s) => s.banner) || shops[0] || null;

    const sections = [];
    if (badges[0]) sections.push({ type: "badge", badge: badges[0]._id });
    if (featuredShop) sections.push({ type: "featured-shop", shop: featuredShop._id });
    for (const b of badges.slice(1)) sections.push({ type: "badge", badge: b._id });

    if (sections.length === 0) return; // nothing to seed yet (no badges, no shops)

    await HomeSection.insertMany(sections.map((s, i) => ({ ...s, order: i })));
    console.log("✅ Seeded default homepage sections (first run after the homepage-curation migration)");
  } catch (err) {
    console.error("⚠️  Could not seed default homepage sections:", err.message);
  }
}

module.exports = { seedDefaultHomeSectionsIfEmpty };
