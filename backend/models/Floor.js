const mongoose = require("mongoose");
const slugify = require("slugify");

// Floors are the fixed top-level structure of the mall (e.g. Floor 1 - Fashion & Clothing).
// floorNumber is permanent and never reused - it's part of the mall's physical-digital identity.
const floorSchema = new mongoose.Schema(
  {
    floorNumber: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true, unique: true }, // e.g. "Electronics & Tech"
    slug: { type: String, unique: true },
    icon: { type: String, default: "" }, // emoji or icon name for nav/directory
    image: { type: String, default: "" },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 }, // usually mirrors floorNumber, but kept separate for flexibility
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

floorSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

module.exports = mongoose.model("Floor", floorSchema);
