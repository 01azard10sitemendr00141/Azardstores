const HomepageContent = require("../models/HomepageContent");

async function seedHomepageContentIfEmpty() {
  const exists = await HomepageContent.exists({});
  if (exists) return;
  await HomepageContent.create({
    purposeTiles: [
      { label: "Work", tagline: "Tools for your workday", purposeTag: "work", icon: "Briefcase", color: "#0096D6", order: 0 },
      { label: "Gaming", tagline: "Gear up and play", purposeTag: "gaming", icon: "Gamepad2", color: "#FF6900", order: 1 },
      { label: "Travel", tagline: "Ready for the journey", purposeTag: "travel", icon: "Plane", color: "#00C853", order: 2 },
      { label: "Home", tagline: "Make home feel right", purposeTag: "home", icon: "House", color: "#E8A33D", order: 3 },
      { label: "Fitness", tagline: "Move with confidence", purposeTag: "fitness", icon: "Dumbbell", color: "#CC0000", order: 4 },
    ],
  });
}

module.exports = { seedHomepageContentIfEmpty };
