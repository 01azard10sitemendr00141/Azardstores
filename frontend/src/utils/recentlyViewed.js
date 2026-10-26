export const RECENTLY_VIEWED_STORAGE_KEY = "azardstores_recently_viewed";
export const RECENTLY_VIEWED_LIMIT = 8;
export const RECENTLY_VIEWED_EVENT = "azardstores:recently-viewed";

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function normalizeEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const slug = cleanText(value.slug, 160);
  const name = cleanText(value.name, 120);
  const image = cleanText(value.image, 2048);
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug) || !name) return null;
  return { slug, name, image };
}

export function validateRecentlyViewed(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const entries = [];
  for (const item of value) {
    const entry = normalizeEntry(item);
    if (!entry) continue;
    const key = entry.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length === RECENTLY_VIEWED_LIMIT) break;
  }
  return entries;
}

export function readRecentlyViewed(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const stored = target?.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    return stored ? validateRecentlyViewed(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(product, storage) {
  const entry = normalizeEntry({
    slug: product?.slug,
    name: product?.name,
    image: Array.isArray(product?.images) ? product.images[0] : product?.image,
  });
  if (!entry) return readRecentlyViewed(storage);

  try {
    const target = storage ?? globalThis.localStorage;
    const next = validateRecentlyViewed([
      entry,
      ...readRecentlyViewed(target),
    ]);
    target?.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
    }
    return next;
  } catch {
    return [];
  }
}
