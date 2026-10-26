// Lives for the lifetime of the tab (resets on a hard refresh, which is fine —
// the goal is just to stop refetching everything every time the user
// navigates back to Home within the same session).
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function getHomeCache() {
  if (cachedData && Date.now() - cachedAt > CACHE_TTL_MS) clearHomeCache();
  return cachedData;
}

export function setHomeCache(data) {
  cachedData = data;
  cachedAt = Date.now();
}

export function clearHomeCache() {
  cachedData = null;
  cachedAt = 0;
}
