import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(frontendDir, "dist");
const siteUrl = String(process.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");

if (!siteUrl) {
  throw new Error("VITE_SITE_URL must be set; SEO output validation cannot be skipped for a production build.");
}

const configuredSiteUrl = new URL(siteUrl);
if (configuredSiteUrl.protocol !== "https:" || configuredSiteUrl.origin !== siteUrl) {
  throw new Error("VITE_SITE_URL must be the HTTPS storefront origin, without a path or trailing slash");
}
const expectedOrigin = configuredSiteUrl.origin;
const robots = await readFile(resolve(distDir, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) {
  throw new Error("robots.txt does not point to the generated sitemap");
}

const sitemap = await readFile(resolve(distDir, "sitemap.xml"), "utf8");
if (!sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
  throw new Error("sitemap.xml has an invalid root element");
}
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'"));
if (!locations.length) throw new Error("sitemap.xml contains no URLs");
if (new Set(locations).size !== locations.length) throw new Error("sitemap.xml contains duplicate URLs");

function htmlPathFor(url) {
  const parsed = new URL(url);
  if (parsed.origin !== expectedOrigin || parsed.search || parsed.hash) {
    throw new Error(`Sitemap URL is not a clean URL on the configured site origin: ${url}`);
  }
  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.some((segment) => segment === "." || segment === ".." || /[\\/]/.test(segment))) {
    throw new Error(`Sitemap URL contains an unsafe path: ${url}`);
  }
  const outputPath = resolve(distDir, ...segments, "index.html");
  if (!outputPath.startsWith(`${distDir}${sep}`) && outputPath !== resolve(distDir, "index.html")) {
    throw new Error(`Sitemap path escapes the build output: ${url}`);
  }
  return outputPath;
}

function htmlAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function validateBundledEntrypoint(page, url) {
  const script = page.match(/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+\.js)")[^>]*>/i);
  if (!script) throw new Error(`Generated page is missing its bundled JavaScript entrypoint: ${url}`);
  const assetUrl = new URL(script[1], expectedOrigin);
  const assetsPath = assetUrl.pathname.indexOf("/assets/");
  if (assetUrl.origin !== expectedOrigin || assetsPath < 0) {
    throw new Error(`Generated page points to a non-production JavaScript entrypoint: ${url}`);
  }
  const assetPath = resolve(distDir, `.${decodeURIComponent(assetUrl.pathname.slice(assetsPath))}`);
  if (!assetPath.startsWith(`${distDir}${sep}`)) throw new Error(`Unsafe JavaScript asset path in generated page: ${url}`);
  await stat(assetPath).catch(() => {
    throw new Error(`Generated page references a missing JavaScript asset: ${url}`);
  });
}

for (const url of locations) {
  const file = htmlPathFor(url);
  const page = await readFile(file, "utf8").catch(() => {
    throw new Error(`Sitemap URL has no generated HTML file: ${url}`);
  });
  await validateBundledEntrypoint(page, url);
  const canonical = page.match(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?\s*>/i)?.[1];
  if (canonical !== htmlAttribute(url)) throw new Error(`Missing or mismatched canonical URL for ${url}`);
  if (!/<title>[^<]+<\/title>/i.test(page)) throw new Error(`Missing page title for ${url}`);
  if (!/<meta\s+name="description"\s+content="[^"]+"\s*\/?\s*>/i.test(page)) {
    throw new Error(`Missing page description for ${url}`);
  }
  for (const [, imageUrl] of page.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"\s*\/?\s*>/gi)) {
    let image;
    try { image = new URL(imageUrl); } catch { throw new Error(`Invalid social preview image URL: ${url}`); }
    if (image.protocol !== "https:") throw new Error(`Social preview image must use HTTPS: ${url}`);
  }
  if (/\/product\//.test(new URL(url).pathname) && !/<script\s+type="application\/ld\+json">[\s\S]*?"@type":"Product"/i.test(page)) {
    throw new Error(`Product page is missing Product structured data: ${url}`);
  }
}

const homepageHtml = await readFile(resolve(distDir, "index.html"), "utf8");
const homepageSchemas = [...homepageHtml.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
  .map((match) => {
    try { return JSON.parse(match[1]); } catch { return null; }
  });
const websiteSchema = homepageSchemas.find((schema) => schema?.["@type"] === "WebSite");
if (!websiteSchema) throw new Error("Homepage is missing its WebSite structured data");
if (websiteSchema.potentialAction?.target !== `${siteUrl}/search?q={search_term_string}`) {
  throw new Error("WebSite search action must target the canonical /search URL");
}

const privateRoutes = ["search", "cart", "dashboard", "order-success", "payment/callback", "track-order", "login", "signup", "forgot-password", "reset-password", "verify-email"];
for (const route of privateRoutes) {
  const file = resolve(distDir, ...route.split("/"), "index.html");
  const page = await readFile(file, "utf8").catch(() => {
    throw new Error(`Missing generated noindex page for /${route}`);
  });
  await validateBundledEntrypoint(page, `${siteUrl}/${route}`);
  if (!/<meta\s+name="robots"\s+content="noindex,follow"\s*\/?\s*>/i.test(page)) {
    throw new Error(`Utility route is missing noindex metadata: /${route}`);
  }
  if (locations.includes(`${siteUrl}/${route}`)) throw new Error(`Utility route must not appear in sitemap: /${route}`);
}

const productRoot = resolve(distDir, "product");
let productCount = 0;
try {
  for (const entry of await readdir(productRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && (await stat(resolve(productRoot, entry.name))).isDirectory()) productCount += 1;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (productCount && locations.filter((url) => new URL(url).pathname.startsWith("/product/")).length !== productCount) {
  throw new Error("Product sitemap entries do not match generated product pages");
}
console.log(`SEO output verified: ${locations.length} sitemap URLs, ${productCount} product pages, and ${privateRoutes.length} noindex routes.`);
