const mongoose = require("mongoose");
const slugify = require("slugify");

// A Shop is a named, numbered section inside a Floor (e.g. "Shop 6: Phone Accessories" on Floor 2).
// Right now every shop is owned by the mall's single admin owner. The `owner` field exists from
// day one so this model doesn't need a painful migration later when Click Haven Mall (the future
// multi-vendor version) lets independent traders own and rent their own shops.
const shopSchema = new mongoose.Schema(
  {
    shopNumber: { type: Number, required: true }, // permanent within its floor, never reused
    name: { type: String, required: true, trim: true }, // e.g. "Phone Accessories"
    slug: { type: String, unique: true },
    floor: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", required: true },
    description: { type: String, default: "" },
    banner: { type: String, default: "" }, // shop storefront banner image
    logo: { type: String, default: "" },

    // Future-proofing for Click Haven Mall (multi-vendor). For now this always points to the
    // single mall-owner admin account.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: {
      type: String,
      enum: ["open", "new", "closing-down-sale", "closed"],
      default: "open",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// shopNumber only needs to be unique within a floor, not mall-wide
shopSchema.index({ floor: 1, shopNumber: 1 }, { unique: true });

shopSchema.pre("save", function (next) {
  if (!this.slug || this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true }) + "-" + this._id.toString().slice(-6);
  }
  next();
});

module.exports = mongoose.model("Shop", shopSchema);
