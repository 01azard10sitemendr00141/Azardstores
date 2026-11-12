const MAX_PRODUCT_BADGES = 3;
const MAX_BADGE_SLUG_LENGTH = 100;

function normalizeProductBadges({ badges, badge } = {}) {
  const values = badges === undefined ? (badge ? [badge] : []) : badges;
  if (!Array.isArray(values)) {
    return { error: "Badges must be a list." };
  }
  if (values.some((value) => typeof value !== "string" || value.trim().length > MAX_BADGE_SLUG_LENGTH)) {
    return { error: `Each badge must be text no longer than ${MAX_BADGE_SLUG_LENGTH} characters.` };
  }

  const normalizedBadges = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalizedBadges.length > MAX_PRODUCT_BADGES) {
    return { error: `A product can have up to ${MAX_PRODUCT_BADGES} badges.` };
  }
  return { badges: normalizedBadges, badge: normalizedBadges[0] || "" };
}

module.exports = { MAX_PRODUCT_BADGES, normalizeProductBadges };
