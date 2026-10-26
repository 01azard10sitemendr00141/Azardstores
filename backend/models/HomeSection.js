const mongoose = require("mongoose");

// One admin-managed entry per homepage content block (see AdminHomeSections.jsx).
// `type` decides what it actually shows and which reference field is used:
//  - "badge"             -> pulls products tagged with the referenced Badge
//  - "featured-shop"     -> spotlights one specific shop and its products
//  - "featured-category" -> pulls products from one managed Category
// `order` controls top-to-bottom placement on the homepage — same
// swap-based reordering pattern already used for Badge.order.
// Unlike Badge, nothing else in the app references a HomeSection by id, so
// every field here (including which badge/shop/category it points to) is
// freely editable without any orphaning risk.
const homeSectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["badge", "featured-shop", "featured-category"], required: true },
    badge: { type: mongoose.Schema.Types.ObjectId, ref: "Badge" }, // set when type === "badge"
    shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" }, // set when type === "featured-shop"
    category: { type: String, trim: true, default: "" }, // set when type === "featured-category" — matches Category.name / Product.category
    // Optional overrides — when blank, the frontend falls back to a
    // sensible default derived from whatever this section references (the
    // badge's own heading, the shop's own name, "Featured: <category>").
    heading: { type: String, trim: true, default: "" },
    tag: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HomeSection", homeSectionSchema);
