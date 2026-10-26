const mongoose = require("mongoose");

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env");
  process.exit(1);
}

mongoose.set("strictQuery", false);

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };