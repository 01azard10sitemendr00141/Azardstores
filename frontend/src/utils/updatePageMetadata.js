export function updatePageMetadata({ title, description, url, image = "", type = "website" }) {
  document.title = title;
  document.querySelector('meta[name="robots"]')?.remove();
  const set = (selector, content) => document.querySelector(selector)?.setAttribute("content", content);
  set('meta[name="description"]', description);
  set('meta[property="og:type"]', type);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', description);
  set('meta[property="og:url"]', url);
  set('meta[name="twitter:title"]', title);
  set('meta[name="twitter:description"]', description);
  set('meta[name="twitter:card"]', image ? "summary_large_image" : "summary");

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  for (const [attribute, key] of [["property", "og:image"], ["name", "twitter:image"]]) {
    const selector = `meta[${attribute}="${key}"]`;
    let tag = document.querySelector(selector);
    if (image && !tag) {
      tag = document.createElement("meta");
      tag.setAttribute(attribute, key);
      document.head.appendChild(tag);
    }
    if (image) tag?.setAttribute("content", image);
    else tag?.remove();
  }
}
