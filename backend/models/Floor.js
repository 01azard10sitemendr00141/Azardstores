const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");
const { Schema } = mongoose;

const floorSchema = new Schema(
  {
    floorNumber: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: "Floor number must be a positive whole number." } },
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    icon: { type: String, default: "" },
    image: { type: String, default: "" },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

floorSchema.index({ floorNumber: 1 }, { unique: true });

// Generate slug before save if name changed
floorSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = makeSlug(this.name);
  }
  next();
});

// insertMany() skips pre('save') hooks, so we need this separately
// to make sure seeded/bulk-inserted floors still get a slug
floorSchema.pre("insertMany", function (next, docs) {
  docs.forEach((doc) => {
    if (!doc.slug) doc.slug = makeSlug(doc.name);
  });
  next();
});

module.exports = mongoose.model("Floor", floorSchema);
