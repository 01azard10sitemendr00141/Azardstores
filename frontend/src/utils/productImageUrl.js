const UNSPLASH_IMAGE_HOSTS = new Set(["images.unsplash.com"]);

// Unsplash supports format negotiation and width/quality transforms directly.
// Leave other hosts untouched because their URL transformation syntax varies.
export function productImageUrl(value, { width = 800, quality = 80 } = {}) {
  const source = String(value || "").trim();
  if (!source) return "";

  try {
    const url = new URL(source, typeof window === "undefined" ? "https://azardstores.example" : window.location.origin);
    if (!UNSPLASH_IMAGE_HOSTS.has(url.hostname)) return source;
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "max");
    url.searchParams.set("w", String(Math.max(64, Math.min(2000, Math.round(width)))));
    url.searchParams.set("q", String(Math.max(40, Math.min(90, Math.round(quality)))));
    return url.toString();
  } catch {
    return source;
  }
}
