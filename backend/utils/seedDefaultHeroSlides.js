const HeroSlide = require("../models/HeroSlide");

async function seedDefaultHeroSlidesIfEmpty() {
  const count = await HeroSlide.countDocuments();
  if (count) return;
  await HeroSlide.insertMany([
    {
      headline: "One cart. Every brand you want.",
      supportingText: "Explore Azard Stores and find your next favourite.",
      ctaLabel: "Explore the mall",
      destination: "/directory",
      mediaType: "video",
      mediaUrl: "https://videos.pexels.com/video-files/4750056/4750056-hd_1920_1080_25fps.mp4",
      posterUrl: "https://images.pexels.com/videos/4750056/pexels-photo-4750056.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
      altText: "Customers browsing a shopping mall",
      isActive: true,
      order: 0,
    },
    {
      headline: "Flash deals worth moving quickly for.",
      supportingText: "See current offers from shops across the mall.",
      ctaLabel: "Shop the deals",
      destination: "/search?flashSale=true",
      mediaType: "video",
      mediaUrl: "https://videos.pexels.com/video-files/4750056/4750056-hd_1920_1080_25fps.mp4",
      posterUrl: "https://images.pexels.com/videos/4750056/pexels-photo-4750056.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
      altText: "Customers browsing a shopping mall",
      isActive: true,
      order: 1,
    },
  ]);
}

module.exports = { seedDefaultHeroSlidesIfEmpty };
