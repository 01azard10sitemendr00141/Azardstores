const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");

// Product.brandId is the canonical link; Product.brand remains synchronized
// as a compatibility value for existing storefront filters and CSVs.
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
