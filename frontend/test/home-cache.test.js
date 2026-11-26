import test from "node:test";
import assert from "node:assert/strict";

test("homepage cache restores a persistent snapshot and marks stale data for refresh", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
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

    stored.cachedAt = Date.now() - 2 * 60 * 60 * 1000;
    values.set(storageKey, JSON.stringify(stored));
    const oldSnapshotCache = await import(`../src/utils/homeCache.js?stale=${Date.now()}`);
    assert.deepEqual(oldSnapshotCache.getHomeCache(), bundle);
    assert.equal(oldSnapshotCache.isHomeCacheFresh(), false);
    assert.equal(values.has(storageKey), true);

    reloadedCache.clearHomeCache();
    assert.equal(values.has(storageKey), false);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
});
