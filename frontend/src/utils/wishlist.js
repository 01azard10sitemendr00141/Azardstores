const WISHLIST_KEY = "azard_wishlist";
const WISHLIST_EVENT = "azard:wishlist-updated";

let volatileWishlist = null;
let storageUnavailable = false;

function normalizeWishlist(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim()))];
}

function notifyWishlistChanged(slugs) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: { slugs } }));
  }
}

export function getWishlist() {
  try {
    const saved = localStorage.getItem(WISHLIST_KEY);
    if (saved === null) {
      storageUnavailable = false;
      return volatileWishlist || [];
    }
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Saved wishlist is invalid");
    storageUnavailable = false;
    return normalizeWishlist(parsed);
  } catch {
    storageUnavailable = true;
    return volatileWishlist || [];
  }
}

export function toggleWishlist(slug) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return { added: false, persisted: !storageUnavailable, slugs: getWishlist() };

  const current = getWishlist();
  const exists = current.includes(normalizedSlug);
  if (!exists && current.length >= 500) {
    return { added: false, persisted: false, limitReached: true, slugs: current };
  }
  const slugs = exists ? current.filter((item) => item !== normalizedSlug) : [...current, normalizedSlug];
  volatileWishlist = slugs;

  let persisted = false;
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(slugs));
    storageUnavailable = false;
    persisted = true;
  } catch {
    storageUnavailable = true;
  }

  notifyWishlistChanged(slugs);
  return { added: !exists, persisted, slugs };
}

export function replaceWishlist(slugs) {
  const normalized = normalizeWishlist(slugs);
  volatileWishlist = normalized;
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(normalized));
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  notifyWishlistChanged(normalized);
  return { slugs: normalized, persisted: !storageUnavailable };
}

export function clearWishlist() {
  volatileWishlist = [];
  try {
    localStorage.removeItem(WISHLIST_KEY);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  notifyWishlistChanged([]);
}

export function isWishlistStorageAvailable() {
  try {
    localStorage.getItem(WISHLIST_KEY);
    return !storageUnavailable;
  } catch {
    storageUnavailable = true;
    return false;
  }
}

export function subscribeToWishlist(callback) {
  if (typeof window === "undefined") return () => {};
  const onWishlistChanged = (event) => callback(normalizeWishlist(event.detail?.slugs));
  const onStorageChanged = (event) => {
    if (event.key !== WISHLIST_KEY) return;
    try {
      const slugs = event.newValue === null ? [] : normalizeWishlist(JSON.parse(event.newValue));
      volatileWishlist = slugs;
      storageUnavailable = false;
      notifyWishlistChanged(slugs);
    } catch {
      // Ignore malformed storage written by another tab; the next read can retry.
    }
  };
  window.addEventListener(WISHLIST_EVENT, onWishlistChanged);
  window.addEventListener("storage", onStorageChanged);
  return () => {
    window.removeEventListener(WISHLIST_EVENT, onWishlistChanged);
    window.removeEventListener("storage", onStorageChanged);
  };
}
