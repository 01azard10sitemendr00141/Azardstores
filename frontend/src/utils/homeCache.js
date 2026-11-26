const STORAGE_KEY = "azard-homepage-cache-v1";
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function getHomeCache() {
  if (!cachedData) {
    try {
      const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "null");
      if (stored?.version === 1 && stored.data && Number.isFinite(stored.cachedAt)) {
        cachedData = stored.data;
        cachedAt = stored.cachedAt;
      }
    } catch {
      try {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
      } catch {
        // Ignore inaccessible browser storage.
      }
    }
  }

  return cachedData;
}

export function isHomeCacheFresh() {
  return Boolean(cachedData && !cachedData.sectionsPending && Date.now() - cachedAt <= CACHE_TTL_MS);
}

export function setHomeCache(data) {
  cachedData = data;
  cachedAt = Date.now();
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cachedAt, data }));
  } catch {
    // Keep the in-memory cache even when browser storage is unavailable or full.
  }
}

export function clearHomeCache() {
  cachedData = null;
  cachedAt = 0;
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
