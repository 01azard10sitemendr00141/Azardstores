const configuredApi = String(process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
if (!configuredApi) {
  console.error("Set VITE_API_URL to a reachable public API before auditing catalog media.");
  process.exit(1);
}

const apiBase = /\/api$/i.test(configuredApi) ? configuredApi : `${configuredApi}/api`;
const requestJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}): ${url}`);
  return response.json();
};

const products = [];
let page = 1;
while (page <= 100) {
  const data = await requestJson(`${apiBase}/products?limit=100&page=${page}`);
  products.push(...(data.products || []));
  if (page >= Number(data.pages || 1)) break;
  page += 1;
}
if (page > 100) throw new Error("Catalog exceeds the 10,000 item media-audit limit");

const [floors, shops, heroSlides, homepage] = await Promise.all([
  requestJson(`${apiBase}/floors`),
  requestJson(`${apiBase}/shops`),
  requestJson(`${apiBase}/hero-slides`),
  requestJson(`${apiBase}/homepage-content`),
]);

const references = new Map();
const videos = new Map();
function addMedia(value, label, kind = "image") {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("/")) return;
  const collection = kind === "video" ? videos : references;
  if (!collection.has(raw)) collection.set(raw, []);
  collection.get(raw).push(label);
}
for (const product of products) {
  for (const [index, value] of (product.images || []).entries()) {
    addMedia(value, `${product.name || product.slug} (image ${index + 1})`);
  }
}
for (const floor of floors) addMedia(floor.image, `Floor: ${floor.name}`);
for (const shop of shops) {
  addMedia(shop.banner, `Shop banner: ${shop.name}`);
  addMedia(shop.logo, `Shop logo: ${shop.name}`);
}
for (const slide of heroSlides) {
  addMedia(slide.mediaUrl, `Hero slide: ${slide.headline}`, slide.mediaType);
  addMedia(slide.posterUrl, `Hero slide poster: ${slide.headline}`);
}
if (homepage) {
  addMedia(homepage.featuredShopBackdropUrl, "Homepage featured shop backdrop");
  addMedia(homepage.exploreBackdropUrl, "Homepage explore backdrop");
  addMedia(homepage.closingMediaUrl, "Homepage closing media", homepage.closingMediaType);
  addMedia(homepage.closingPosterUrl, "Homepage closing poster");
}

const queue = [...references.entries()];
const videoQueue = [...videos.entries()];
const issues = [];
const largeImages = [];
const concurrency = 6;
async function inspect([rawUrl, usedBy]) {
  let url;
  try { url = new URL(rawUrl); }
  catch { issues.push({ url: rawUrl, reason: "invalid URL" }); return; }
  if (url.protocol !== "https:") {
    issues.push({ url: rawUrl, reason: "media URL must use HTTPS" });
    return;
  }

  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
      await response.body?.cancel().catch(() => {});
    }
    if (new URL(response.url || url).protocol !== "https:") {
      issues.push({ url: rawUrl, reason: "image redirected to a non-HTTPS URL", usedBy });
      return;
    }
    if (!response.ok) {
      issues.push({ url: rawUrl, reason: `HTTP ${response.status}`, usedBy });
      return;
    }
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) {
      issues.push({ url: rawUrl, reason: `unexpected content type ${contentType || "(missing)"}`, usedBy });
      return;
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 1_500_000) {
      largeImages.push({ url: rawUrl, megabytes: (length / 1_000_000).toFixed(2), usedBy });
    }
  } catch (error) {
    const reason = error.cause?.code || error.name || error.message;
    if (reason === "TimeoutError" || reason === "UND_ERR_CONNECT_TIMEOUT" || reason === "UND_ERR_HEADERS_TIMEOUT") {
      issues.push({ url: rawUrl, reason: "request timed out; verify this image host manually", usedBy });
      return;
    }
    issues.push({ url: rawUrl, reason, usedBy });
  }
}

async function inspectVideo([rawUrl, usedBy]) {
  let url;
  try { url = new URL(rawUrl); }
  catch { issues.push({ url: rawUrl, reason: "invalid video URL", usedBy }); return; }
  if (url.protocol !== "https:") {
    issues.push({ url: rawUrl, reason: "video URL must use HTTPS", usedBy });
    return;
  }
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (new URL(response.url || url).protocol !== "https:") issues.push({ url: rawUrl, reason: "video redirected to a non-HTTPS URL", usedBy });
    else if (!response.ok) issues.push({ url: rawUrl, reason: `HTTP ${response.status}`, usedBy });
    else {
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!contentType.startsWith("video/")) issues.push({ url: rawUrl, reason: `unexpected video content type ${contentType || "(missing)"}`, usedBy });
    }
  } catch (error) {
    const reason = error.cause?.code || error.name || error.message;
    issues.push({ url: rawUrl, reason: reason === "TimeoutError" ? "request timed out; verify this media host manually" : reason, usedBy });
  }
}

for (let start = 0; start < queue.length; start += concurrency) {
  await Promise.all(queue.slice(start, start + concurrency).map(inspect));
}
for (let start = 0; start < videoQueue.length; start += 2) {
  await Promise.all(videoQueue.slice(start, start + 2).map(inspectVideo));
}

console.log(`Checked ${queue.length} unique image URLs and ${videoQueue.length} unique video URLs across ${products.length} products, ${floors.length} floors, ${shops.length} shops, ${heroSlides.length} active hero slides, and homepage content.`);
for (const issue of issues) console.error(`FAIL ${issue.reason}: ${issue.url}${issue.usedBy ? ` (used by ${issue.usedBy.join(", ")})` : ""}`);
for (const image of largeImages) console.warn(`LARGE ${image.megabytes} MB: ${image.url} (used by ${image.usedBy.join(", ")})`);
if (issues.length) process.exitCode = 1;
else console.log(`All catalog image URLs use HTTPS and return image content. Large files: ${largeImages.length}.`);
