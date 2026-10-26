const mongoose = require("mongoose");

const heroSlideSchema = new mongoose.Schema(
  {
    headline: { type: String, required: true, trim: true, maxlength: 120 },
    supportingText: { type: String, default: "", trim: true, maxlength: 240 },
    ctaLabel: { type: String, required: true, trim: true, maxlength: 40 },
    destination: { type: String, required: true, trim: true, maxlength: 300 },
    mediaType: { type: String, enum: ["image", "video"], default: "image" },
    mediaUrl: { type: String, required: true, trim: true, maxlength: 1000 },
    posterUrl: { type: String, default: "", trim: true, maxlength: 1000 },
    altText: { type: String, default: "", trim: true, maxlength: 160 },
    isActive: { type: Boolean, default: false, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HeroSlide", heroSlideSchema);
