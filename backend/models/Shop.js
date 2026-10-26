const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");
const { Schema } = mongoose;

const shopSchema = new Schema(
  {
    shopNumber: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: "Shop number must be a positive whole number." } },
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    floor: { type: Schema.Types.ObjectId, ref: "Floor", required: true, index: true },
    description: { type: String, default: "" },
    banner: { type: String, default: "" },
    logo: { type: String, default: "" },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["open", "closed", "new", "closing-down-sale"], default: "open" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// shopNumber only needs to be unique within a floor, not mall-wide
shopSchema.index({ floor: 1, shopNumber: 1 }, { unique: true });

shopSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = makeSlug(this.name, Date.now().toString().slice(-6));
  }
  next();
});

// insertMany() skips pre('save') hooks, so we need this separately.
// Random suffix avoids collisions when multiple shops are inserted in the same millisecond.
shopSchema.pre("insertMany", function (next, docs) {
  docs.forEach((doc) => {
    if (!doc.slug) {
      doc.slug = makeSlug(doc.name, Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000));
    }
  });
  next();
});

module.exports = mongoose.model("Shop", shopSchema);
