const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeDefaultData } = require("../utils/initializeDefaultData");

test("initializes defaults in dependency order", async () => {
  const steps = [];
  await initializeDefaultData({
    connect: async () => steps.push("connect"),
    seedBadges: async () => steps.push("badges"),
    seedHeroSlides: async () => steps.push("hero slides"),
    seedHomepageContent: async () => steps.push("homepage content"),
    seedHomeSections: async () => steps.push("homepage sections"),
  });

  assert.deepEqual(steps.slice(0, 2), ["connect", "badges"]);
  assert.deepEqual(steps.slice(2).sort(), ["homepage content", "homepage sections", "hero slides"].sort());
  assert.equal(steps[steps.length - 1], "homepage sections");
});

test("does not seed homepage sections if a prerequisite seed fails", async () => {
  let sectionsSeeded = false;
  await assert.rejects(
    initializeDefaultData({
      connect: async () => {},
      seedBadges: async () => {},
      seedHeroSlides: async () => {
        throw new Error("seed failed");
      },
      seedHomepageContent: async () => {},
      seedHomeSections: async () => {
        sectionsSeeded = true;
      },
    }),
    /seed failed/,
  );
  assert.equal(sectionsSeeded, false);
});
