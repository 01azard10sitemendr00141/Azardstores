const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");

// A flat managed list, same reasoning as Category: Product.brand stays a
// plain string for backward compatibility with existing/imported products —
// this model exists to constrain what the admin UI offers as options, not
// to enforce a foreign-key relationship at the database level.
const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    slug: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

brandSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = makeSlug(this.name, Date.now().toString(36));
  }
  next();
});

module.exports = mongoose.model("Brand", brandSchema);
