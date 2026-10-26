const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");

// Subcategories are embedded rather than a separate collection — they only
// ever make sense in the context of their parent category, and the list per
// category is small enough that embedding is simpler than a second model.
const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String },
  },
  { _id: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, sparse: true },
    subcategories: [subcategorySchema],
  },
  { timestamps: true }
);

// This model is deliberately independent of Product.category/subcategory —
// those remain plain strings on Product for backward compatibility with
// products imported or added before this model existed. This list exists
// to constrain what the *admin UI* offers as options, not to enforce a
// foreign-key relationship at the database level.
categorySchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = makeSlug(this.name, Date.now().toString(36));
  }
  this.subcategories.forEach((sub) => {
    if (!sub.slug) sub.slug = makeSlug(sub.name);
  });
  next();
});

module.exports = mongoose.model("Category", categorySchema);