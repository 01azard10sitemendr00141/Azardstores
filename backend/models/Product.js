const mongoose = require("mongoose");
const slugify = require("slugify");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: null }, // "was" price, for showing discount
    images: [{ type: String }], // paths under /uploads
    shop: { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true }, // Floor is reached via shop.floor
    brand: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
    sku: { type: String, default: "" },

    // Merchandising flags - drives homepage sections without hardcoding HTML
    badge: {
      type: String,
      enum: ["", "best-seller", "hot-deal", "new-arrival", "exclusive", "trending", "limited-stock"],
      default: "",
    },
    isFlashSale: { type: Boolean, default: false },
    flashSaleEndsAt: { type: Date, default: null },
    purposeTags: [{ type: String }], // e.g. "work", "gaming", "travel", "home", "fitness"

    isActive: { type: Boolean, default: true },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", brand: "text" });

productSchema.pre("save", function (next) {
  if (!this.slug || this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true }) + "-" + this._id.toString().slice(-6);
  }
  next();
});

productSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});

productSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
