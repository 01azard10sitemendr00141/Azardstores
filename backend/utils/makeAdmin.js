// One-off CLI tool to promote an existing user to admin, by email.
// Usage:  node utils/makeAdmin.js someone@example.com
//
// Safer than hand-editing the document in Atlas's Data Explorer — this
// reads MONGO_URI from your real .env, finds the exact user by email, and
// only ever touches the one `role` field. Reusable any time you need to
// promote a new staff account later too, not just for the very first admin.

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node utils/makeAdmin.js someone@example.com");
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set — make sure you're running this from the project root with your real .env in place.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email "${email}". Sign up with this email on the live site first, then run this again.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (user.role === "admin") {
    console.log(`${email} is already an admin — nothing to do.`);
  } else {
    user.role = "admin";
    await user.save();
    console.log(`✅ ${email} is now an admin. Log out and back in on the live site to see the admin panel.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});