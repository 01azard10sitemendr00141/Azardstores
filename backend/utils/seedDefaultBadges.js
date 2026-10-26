const Badge = require("../models/Badge");

// Badges used to be six hardcoded slugs baked into the frontend. Now that
// they're admin-managed (see models/Badge.js, routes/badges.js), a fresh
// deploy would otherwise have an empty Badge collection — meaning zero
// homepage sections — even though products already carry these exact
// slugs from before. This recreates the original six, once, only if none
// exist yet, so upgrading is invisible: the homepage looks identical right
// after deploy, and only changes once an admin actually edits something in
// Admin → Badges. Never runs again after that first badge is created,
// including if an admin later deletes all of them on purpose.
const DEFAULT_BADGES = [
  { slug: "new-arrival", chipLabel: "New Arrival", sectionHeading: "New Arrivals", sectionTag: "Just landed", icon: "Package", order: 0 },
  { slug: "trending", chipLabel: "Trending", sectionHeading: "Trending Now", sectionTag: "Popular now", icon: "TrendingUp", order: 1 },
  { slug: "hot-deal", chipLabel: "Hot Deal", sectionHeading: "Hot Deals", sectionTag: "Save big", icon: "Flame", order: 2 },
  { slug: "best-seller", chipLabel: "Best Seller", sectionHeading: "Best of the Mall", sectionTag: "Top picks", icon: "Star", order: 3 },
  { slug: "exclusive", chipLabel: "Exclusive", sectionHeading: "Exclusive Picks", sectionTag: "Only here", icon: "Gem", order: 4 },
  { slug: "limited-stock", chipLabel: "Limited Stock", sectionHeading: "Limited Stock", sectionTag: "Almost gone", icon: "Lock", order: 5 },
];

async function seedDefaultBadgesIfEmpty() {
  try {
    const count = await Badge.countDocuments();
    if (count > 0) return;
    await Badge.insertMany(DEFAULT_BADGES);
    console.log("✅ Seeded default badges (first run after the badges migration)");
  } catch (err) {
    // Never block server startup over this — worst case, an admin adds
    // badges manually via Admin → Badges.
    console.error("⚠️  Could not seed default badges:", err.message);
  }
}

module.exports = { seedDefaultBadgesIfEmpty };
