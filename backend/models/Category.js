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

// Product documents keep managed-record IDs for new assignments plus their
// names for existing storefront routes and legacy catalog compatibility.
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