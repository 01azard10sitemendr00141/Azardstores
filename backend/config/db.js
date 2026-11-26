const mongoose = require("mongoose");

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not set in .env");
}

mongoose.set("strictQuery", false);

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected");
}

module.exports = { connectDB };