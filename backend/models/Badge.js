const mongoose = require("mongoose");

// Badges are fully admin-managed (add/edit/delete/reorder), and drive both
// the small badge chip shown on product cards and a dedicated section on
// the homepage. `slug` is the value actually stored on Product.badge, and
// is intentionally set once at creation and never changed afterward — if
// it could be edited, renaming a badge would silently orphan every product
// already tagged with the old slug (they'd vanish from that badge's
// homepage section and show a raw, unfamiliar string as their chip).
// Deleting a badge is non-destructive the same way Brand/Category deletion
// is: it only removes it from the managed list — existing products keep
// their (now orphaned) badge string, which just falls back to showing the
// raw slug as its chip text and no longer gets a dedicated homepage section.
const badgeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    chipLabel: { type: String, required: true, trim: true }, // small badge shown on product cards, e.g. "Best Seller"
    sectionHeading: { type: String, required: true, trim: true }, // homepage section heading, e.g. "Best of the Mall"
    sectionTag: { type: String, default: "", trim: true }, // small tag under the heading, e.g. "Top picks"
    icon: { type: String, default: "Tag" }, // one of a fixed whitelist of icon names — see ICON_OPTIONS
    order: { type: Number, default: 0 }, // ascending — controls both admin list and homepage section order
  },
  { timestamps: true }
);

module.exports = mongoose.model("Badge", badgeSchema);
