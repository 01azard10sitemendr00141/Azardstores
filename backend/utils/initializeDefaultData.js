require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");

async function initializeDefaultData({
  connect = connectDB,
  seedBadges = require("./seedDefaultBadges").seedDefaultBadgesIfEmpty,
  seedHeroSlides = require("./seedDefaultHeroSlides").seedDefaultHeroSlidesIfEmpty,
  seedHomepageContent = require("./seedHomepageContent").seedHomepageContentIfEmpty,
  seedHomeSections = require("./seedDefaultHomeSections").seedDefaultHomeSectionsIfEmpty,
} = {}) {
  await connect();
  await seedBadges();
  const seedResults = await Promise.allSettled([
    seedHeroSlides(),
    seedHomepageContent(),
  ]);
  const seedErrors = seedResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (seedErrors.length === 1) throw seedErrors[0];
  if (seedErrors.length > 1) {
    throw new AggregateError(seedErrors, "Multiple default-data seeders failed");
  }
  await seedHomeSections();
}

async function run() {
  try {
    await initializeDefaultData();
    console.log("Default homepage data is initialized.");
  } catch (error) {
    console.error("Default data initialization failed:", error);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (error) {
      console.error("MongoDB disconnect failed:", error.message);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { initializeDefaultData, run };
