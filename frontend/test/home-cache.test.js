import test from "node:test";
import assert from "node:assert/strict";

test("homepage cache restores a session snapshot and marks stale data for refresh", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });

  try {
    const cache = await import(`../src/utils/homeCache.js?write=${Date.now()}`);
    const bundle = { floors: [{ _id: "floor-1" }], homeSections: [] };
    cache.clearHomeCache();
    cache.setHomeCache({ ...bundle, sectionsPending: true });
    assert.equal(cache.isHomeCacheFresh(), false);
    cache.setHomeCache(bundle);
    assert.equal(cache.isHomeCacheFresh(), true);

    const storageKey = "azard-homepage-cache-v1";
    const stored = JSON.parse(values.get(storageKey));
    stored.cachedAt = Date.now() - 31_000;
    values.set(storageKey, JSON.stringify(stored));

    const reloadedCache = await import(`../src/utils/homeCache.js?read=${Date.now()}`);
    assert.deepEqual(reloadedCache.getHomeCache(), bundle);
    assert.equal(reloadedCache.isHomeCacheFresh(), false);
    reloadedCache.clearHomeCache();
    assert.equal(values.has(storageKey), false);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage);
    else delete globalThis.sessionStorage;
  }
});
