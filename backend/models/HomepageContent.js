const mongoose = require("mongoose");

const purposeTileSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 40 },
  tagline: { type: String, default: "Shop by purpose", trim: true, maxlength: 80 },
  purposeTag: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
  icon: { type: String, default: "Sparkles", trim: true, maxlength: 30 },
  color: { type: String, default: "#0096D6", trim: true },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const homepageContentSchema = new mongoose.Schema({
  sectionLinkLabel: { type: String, default: "See all", trim: true, maxlength: 40 },
  featuredShopLinkLabel: { type: String, default: "Visit Shop", trim: true, maxlength: 40 },
  fallbackHeroHeadline: { type: String, default: "Welcome to Azard Stores.", trim: true, maxlength: 100 },
  fallbackHeroSupportingText: { type: String, default: "Explore products and shops across the mall.", trim: true, maxlength: 200 },
  fallbackHeroCtaLabel: { type: String, default: "Explore the mall", trim: true, maxlength: 40 },
  fallbackHeroDestination: { type: String, default: "/directory", trim: true, maxlength: 300 },
  flashSaleHeading: { type: String, default: "Flash Sale", trim: true, maxlength: 60 },
  flashSaleTag: { type: String, default: "Limited time", trim: true, maxlength: 40 },
  purposeHeading: { type: String, default: "Shop by Purpose", trim: true, maxlength: 60 },
  purposeTagline: { type: String, default: "Find what fits your life", trim: true, maxlength: 80 },
  exploreHeading: { type: String, default: "Explore the Mall", trim: true, maxlength: 60 },
  exploreLinkLabel: { type: String, default: "Full directory", trim: true, maxlength: 40 },
  featuredShopBackdropUrl: { type: String, default: "https://images.pexels.com/photos/27677152/pexels-photo-27677152.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920", trim: true, maxlength: 1000 },
  exploreBackdropUrl: { type: String, default: "https://images.pexels.com/photos/32340449/pexels-photo-32340449.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920", trim: true, maxlength: 1000 },
  statsFloorsLabel: { type: String, default: "Floors", trim: true, maxlength: 30 },
  statsShopsLabel: { type: String, default: "Shops Open", trim: true, maxlength: 30 },
  statsProductsLabel: { type: String, default: "Products", trim: true, maxlength: 30 },
  statsFourthValue: { type: String, default: "One", trim: true, maxlength: 16 },
  statsFourthLabel: { type: String, default: "Mall-wide cart", trim: true, maxlength: 30 },
  closingEyebrow: { type: String, default: "Azard Stores", trim: true, maxlength: 60 },
  closingHeadline: { type: String, default: "Discover more.", trim: true, maxlength: 100 },
  closingAccent: { type: String, default: "Shop it all.", trim: true, maxlength: 100 },
  closingPrimaryLabel: { type: String, default: "Enter the Mall", trim: true, maxlength: 40 },
  closingPrimaryDestination: { type: String, default: "/directory", trim: true, maxlength: 300 },
  closingSecondaryLabel: { type: String, default: "Chat on WhatsApp", trim: true, maxlength: 40 },
  closingSecondaryDestination: { type: String, default: "whatsapp", trim: true, maxlength: 300 },
  closingFooterLine: { type: String, default: "The Whole Mall. One Cart. Zero Hassle.", trim: true, maxlength: 100 },
  closingMediaType: { type: String, enum: ["image", "video"], default: "video" },
  closingMediaUrl: { type: String, default: "https://videos.pexels.com/video-files/3243946/3243946-uhd_2560_1440_30fps.mp4", trim: true, maxlength: 1000 },
  closingPosterUrl: { type: String, default: "https://images.pexels.com/videos/3243946/free-video-3243946.jpg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920", trim: true, maxlength: 1000 },
  purposeTiles: { type: [purposeTileSchema], default: undefined },
}, { timestamps: true });

module.exports = mongoose.model("HomepageContent", homepageContentSchema);
