import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteUrl = String(process.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
const apiUrl = String(process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const socketUrl = String(process.env.VITE_SOCKET_URL || "").trim().replace(/\/+$/, "");
const allowEmptyCatalog = process.env.SEO_ALLOW_EMPTY_CATALOG === "true";
const isCiBuild = /^(true|1)$/i.test(String(process.env.CI || ""));
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

if (allowEmptyCatalog && !isCiBuild) {
  throw new Error("SEO_ALLOW_EMPTY_CATALOG=true is only allowed in CI builds; production builds must include the live catalog.");
}

function validateHttpsUrl(value, name, { originOnly = false } = {}) {
  if (!value) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      (originOnly && (parsed.origin !== value || parsed.pathname !== "/"))) {
    throw new Error(`${name} must be ${originOnly ? "an HTTPS origin without a path" : "an HTTPS URL"}`);
  }
}

validateHttpsUrl(apiUrl, "VITE_API_URL");
validateHttpsUrl(socketUrl, "VITE_SOCKET_URL", { originOnly: true });
const publicRoutes = [
  "/",
  "/directory",
  "/how-it-works",
  "/faq",
  "/contact",
  "/returns",
  "/delivery",
  "/privacy",
  "/terms",
  "/cookies",
];
const publicPageMetadata = {
  "/directory": ["Mall Directory", "Explore the floors and shops in the Azard Stores digital mall."],
  "/how-it-works": ["How It Works", "Learn how to browse, order, pay, and receive delivery from Azard Stores."],
  "/faq": ["Frequently Asked Questions", "Answers about ordering, payments, delivery, returns, and customer accounts at Azard Stores."],
  "/contact": ["Contact Azard Stores", "Get help with products, orders, delivery, or your Azard Stores account."],
  "/returns": ["Returns and Exchanges", "Review return eligibility and how to request help with an Azard Stores order."],
  "/delivery": ["Delivery Information", "Review delivery areas, available services, and delivery guidance from Azard Stores."],
  "/privacy": ["Privacy Policy", "Learn how Azard Stores collects, uses, and protects customer information."],
  "/terms": ["Terms of Service", "Read the terms for shopping and using the Azard Stores website."],
  "/cookies": ["Cookie Policy", "Learn how Azard Stores uses browser storage and cookies."],
};
const nonIndexableRoutes = {
  "/search": ["Search Products", "Search products across Azard Stores."],
  "/cart": ["Your Cart", "Review products in your Azard Stores shopping cart."],
  "/dashboard": ["My Account", "Manage your Azard Stores account and orders."],
  "/order-success": ["Order Status", "View your Azard Stores order confirmation."],
  "/payment/callback": ["Payment Status", "Check the status of your Azard Stores payment."],
  "/track-order": ["Track Your Order", "Check delivery and fulfillment updates for an Azard Stores order."],
  "/login": ["Log In", "Log in to your Azard Stores customer account."],
  "/signup": ["Create an Account", "Create an Azard Stores customer account."],
  "/forgot-password": ["Reset Your Password", "Request a password reset for your Azard Stores account."],
  "/reset-password": ["Choose a New Password", "Set a new password for your Azard Stores account."],
  "/verify-email": ["Verify Your Email", "Verify the email address on your Azard Stores account."],
};

function xmlEscape(value) {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;",
  })[character]);
}

async function readCatalogUrls() {
  const configuredApi = String(process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (!configuredApi) return [];
  const apiBase = /\/api$/i.test(configuredApi) ? configuredApi : `${configuredApi}/api`;
  const [floors, shops] = await Promise.all([
    fetchJson(`${apiBase}/floors`, 10000),
    fetchJson(`${apiBase}/shops`, 10000),
  ]);
  return { floors, shops };
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textOnly(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchJson(url, timeoutMs = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${lastError?.message || "Catalog request failed"}${lastError?.cause?.code ? ` (${lastError.cause.code})` : ""}: ${url}`);
}

function absoluteAssetUrl(value, siteUrl) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, `${siteUrl}/`);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function productDocument(template, product, siteUrl) {
  const name = textOnly(product.name) || "Product";
  const description = textOnly(product.description).slice(0, 300)
    || `Shop ${name} at Azard Stores, Kenya's digital mall.`;
  const url = `${siteUrl}/product/${encodeURIComponent(product.slug)}`;
  const image = absoluteAssetUrl(product.images?.[0], siteUrl) || `${siteUrl}/pics/azard-stores-banner.png`;
  const returnPolicyCategory = product.returnEligibility === "final_sale" || product.returnEligibility === "perishable" || product.returnEligibility === "digital_product"
    ? "https://schema.org/MerchantReturnNotPermitted"
    : "https://schema.org/MerchantReturnFiniteReturnWindow";
  const imageTags = image
    ? `<meta property="og:image" content="${htmlEscape(image)}" />\n    <meta property="og:image:alt" content="${htmlEscape(name)}" />\n    <meta name="twitter:image" content="${htmlEscape(image)}" />\n    <meta name="twitter:image:alt" content="${htmlEscape(name)}" />\n    <meta name="twitter:card" content="summary_large_image" />`
    : '<meta name="twitter:card" content="summary" />';
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    url,
    ...(product.sku ? { sku: textOnly(product.sku) } : {}),
    ...(product.category ? { category: textOnly(product.category) } : {}),
    ...(image ? { image: [image] } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: textOnly(product.brand) } } : {}),
    ...(product.price !== undefined && product.price !== null && Number.isFinite(Number(product.price)) ? {
      offers: {
        "@type": "Offer",
        price: Number(product.price),
        priceCurrency: "KES",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: "Azard Stores", url: siteUrl },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "KE",
          returnPolicyCategory,
          ...(returnPolicyCategory === "https://schema.org/MerchantReturnFiniteReturnWindow" ? { merchantReturnDays: 7 } : {}),
          returnMethod: "https://schema.org/ReturnByMail",
        },
        ...(Number.isFinite(Number(product.stock)) ? {
          availability: Number(product.stock) > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        } : {}),
        url,
      },
    } : {}),
  };
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  const head = [
    `<title>${htmlEscape(name)} | Azard Stores</title>`,
    `<meta name="description" content="${htmlEscape(description)}" />`,
    `<link rel="canonical" href="${htmlEscape(url)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="Azard Stores" />`,
    `<meta property="og:locale" content="en_KE" />`,
    `<meta property="og:title" content="${htmlEscape(name)} | Azard Stores" />`,
    `<meta property="og:description" content="${htmlEscape(description)}" />`,
    `<meta property="og:url" content="${htmlEscape(url)}" />`,
    imageTags,
    `<meta name="twitter:title" content="${htmlEscape(name)} | Azard Stores" />`,
    `<meta name="twitter:description" content="${htmlEscape(description)}" />`,
    `<script type="application/ld+json">${safeJsonLd}</script>`,
  ].join("\n    ");
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<!-- PAGE_METADATA_START -->[\s\S]*?<!-- PAGE_METADATA_END -->/, head);
}

function routeDocument(template, { title, description, url, image, type = "website", schema, robots }) {
  const absoluteImage = absoluteAssetUrl(image, new URL(url).origin) || `${new URL(url).origin}/pics/azard-stores-banner.png`;
  const imageTags = absoluteImage
    ? `<meta property="og:image" content="${htmlEscape(absoluteImage)}" />\n    <meta property="og:image:alt" content="${htmlEscape(title)}" />\n    <meta name="twitter:image" content="${htmlEscape(absoluteImage)}" />\n    <meta name="twitter:image:alt" content="${htmlEscape(title)}" />\n    <meta name="twitter:card" content="summary_large_image" />`
    : '<meta name="twitter:card" content="summary" />';
  const tags = [
    `<title>${htmlEscape(title)} | Azard Stores</title>`,
    `<meta name="description" content="${htmlEscape(description)}" />`,
    `<link rel="canonical" href="${htmlEscape(url)}" />`,
    `<meta property="og:type" content="${htmlEscape(type)}" />`,
    `<meta property="og:site_name" content="Azard Stores" />`,
    `<meta property="og:locale" content="en_KE" />`,
    `<meta property="og:title" content="${htmlEscape(title)} | Azard Stores" />`,
    `<meta property="og:description" content="${htmlEscape(description)}" />`,
    `<meta property="og:url" content="${htmlEscape(url)}" />`,
    ...(robots ? [`<meta name="robots" content="${htmlEscape(robots)}" />`] : []),
    imageTags,
    `<meta name="twitter:title" content="${htmlEscape(title)} | Azard Stores" />`,
    `<meta name="twitter:description" content="${htmlEscape(description)}" />`,
    ...(schema ? [`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`] : []),
  ].join("\n    ");
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<!-- PAGE_METADATA_START -->[\s\S]*?<!-- PAGE_METADATA_END -->/, tags);
}

async function writeRoutePage(distDir, template, route, metadata) {
  const segments = route.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\/]/.test(segment))) {
    throw new Error(`Unsafe generated route path: ${route}`);
  }
  const outputPath = resolve(distDir, ...segments, "index.html");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, routeDocument(template, metadata));
}

async function generatePublicRoutePages(distDir, template, siteUrl, catalog) {
  const routes = [...publicRoutes.filter((route) => route !== "/")];
  for (const route of routes) {
    const [title, description] = publicPageMetadata[route];
    const url = `${siteUrl}${route}`;
    const schema = route === "/directory" ? {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url,
    } : undefined;
    await writeRoutePage(distDir, template, route, { title, description, url, schema });
  }

  for (const [route, [title, description]] of Object.entries(nonIndexableRoutes)) {
    const url = `${siteUrl}${route}`;
    await writeRoutePage(distDir, template, route, { title, description, url, robots: "noindex,follow" });
  }

  const sitemapRoutes = [...routes];
  for (const floor of catalog.floors) {
    if (!floor.slug || !/^[a-z0-9][a-z0-9-]*$/i.test(floor.slug)) continue;
    const route = `/floor/${floor.slug}`;
    const title = `Floor ${floor.floorNumber}: ${floor.name}`;
    const description = textOnly(floor.description).slice(0, 300)
      || `Explore shops and products on Floor ${floor.floorNumber}: ${floor.name} at Azard Stores.`;
    const url = `${siteUrl}${route}`;
    await writeRoutePage(distDir, template, route, {
      title, description, url, image: floor.image, type: "website",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url },
    });
    sitemapRoutes.push(route);
  }

  for (const shop of catalog.shops) {
    if (!shop.slug || !/^[a-z0-9][a-z0-9-]*$/i.test(shop.slug)) continue;
    const route = `/shop/${shop.slug}`;
    const title = shop.name;
    const description = textOnly(shop.description).slice(0, 300)
      || `Browse products from ${shop.name}, Shop #${shop.shopNumber}, at Azard Stores.`;
    const url = `${siteUrl}${route}`;
    await writeRoutePage(distDir, template, route, {
      title, description, url, image: shop.banner || shop.logo, type: "website",
      schema: { "@context": "https://schema.org", "@type": "Store", name: title, description, url, ...(shop.banner || shop.logo ? { image: absoluteAssetUrl(shop.banner || shop.logo, siteUrl) } : {}) },
    });
    sitemapRoutes.push(route);
  }
  return sitemapRoutes;
}

async function generateAttributePages(distDir, template, siteUrl, products) {
  const definitions = [
    { field: "brand", prefix: "/brand/", noun: "products", label: "Brand" },
    { field: "subcategory", prefix: "/subcategory/", noun: "products", label: "Subcategory" },
    { field: "category", prefix: "/categories/", noun: "products", label: "Category" },
  ];
  const routes = [];
  for (const definition of definitions) {
    const values = new Map();
    for (const product of products) {
      const value = textOnly(product[definition.field]).slice(0, 80);
      if (value && !values.has(value.toLocaleLowerCase())) values.set(value.toLocaleLowerCase(), value);
    }
    for (const value of values.values()) {
      // These values become path segments and then local directories. Keep
      // valid catalog labels from breaking builds on Windows or creating
      // ambiguous routes such as /brand/../.
      if (value === "." || value === ".." || /[<>:"/\\|?*\u0000-\u001f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
        console.warn(`Skipping SEO facet page for a path-unsafe ${definition.label.toLowerCase()} value.`);
        continue;
      }
      const route = `${definition.prefix}${encodeURIComponent(value)}`;
      const title = definition.field === "brand" ? `${value} products` : `${value} ${definition.label}`;
      const description = `Browse ${value} ${definition.noun} at Azard Stores, Kenya's digital mall.`;
      const url = `${siteUrl}${route}`;
      await writeRoutePage(distDir, template, route, {
        title,
        description,
        url,
        schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url },
      });
      routes.push(route);
    }
  }

  const taxonomyPairs = new Map();
  for (const product of products) {
    const category = textOnly(product.category).slice(0, 80);
    const subcategory = textOnly(product.subcategory).slice(0, 80);
    if (!category || !subcategory) continue;
    const key = `${category.toLocaleLowerCase()}\u0000${subcategory.toLocaleLowerCase()}`;
    if (!taxonomyPairs.has(key)) taxonomyPairs.set(key, { category, subcategory });
  }
  for (const { category, subcategory } of taxonomyPairs.values()) {
    const unsafe = (value) => value === "." || value === ".." || /[<>:"/\\|?*\u0000-\u001f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
    if (unsafe(category) || unsafe(subcategory)) {
      console.warn("Skipping SEO subcategory page for a path-unsafe taxonomy value.");
      continue;
    }
    const route = `/categories/${encodeURIComponent(category)}/subcategories/${encodeURIComponent(subcategory)}`;
    const title = `${subcategory} in ${category}`;
    const description = `Browse ${subcategory} products in ${category} at Azard Stores, Kenya's digital mall.`;
    const url = `${siteUrl}${route}`;
    await writeRoutePage(distDir, template, route, {
      title,
      description,
      url,
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url },
    });
    routes.push(route);
  }
  return routes;
}

async function generateProductPages(siteUrl) {
  const configuredApi = String(process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  const apiBase = configuredApi
    ? /\/api$/i.test(configuredApi) ? configuredApi : `${configuredApi}/api`
    : `${siteUrl}/api`;
  const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
  const templatePath = resolve(distDir, "index.html");
  const template = await (await import("node:fs/promises")).readFile(templatePath, "utf8");
  if (!template.includes("<!-- PAGE_METADATA_START -->") || !template.includes("<!-- PAGE_METADATA_END -->")) {
    throw new Error("The built dist/index.html is missing the page metadata insertion markers");
  }
  if (!/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/assets\/[^\"]+\.js")[^>]*>/i.test(template)) {
    throw new Error("The built dist/index.html is missing its bundled JavaScript entrypoint");
  }

  const homeUrl = `${siteUrl}/`;
  const homeSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Azard Stores",
    url: homeUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const homeHtml = routeDocument(template, {
    title: "Shop the digital mall",
    description: "Browse shops and products at Azard Stores, Kenya's digital mall.",
    url: homeUrl,
    type: "website",
    schema: homeSchema,
  });
  await writeFile(resolve(distDir, "index.html"), homeHtml);
  if (!configuredApi && allowEmptyCatalog) {
    const routePaths = await generatePublicRoutePages(distDir, template, siteUrl, { floors: [], shops: [] });
    console.warn("SEO_ALLOW_EMPTY_CATALOG=true; catalog previews are omitted from this build.");
    return routePaths;
  }
  const catalog = await readCatalogUrls();

  let page = 1;
  let total = 0;
  const generatedPaths = [];
  const catalogProducts = [];
  while (page <= 100) {
    const data = await fetchJson(`${apiBase}/products?limit=100&page=${page}`);
    total = Number(data.total ?? total);
    for (const product of data.products || []) {
      catalogProducts.push(product);
      if (!product.slug) continue;
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(product.slug)) {
        throw new Error(`Product has an unsafe URL slug: ${product.slug}`);
      }
      const outputPath = resolve(distDir, `product/${product.slug}/index.html`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, productDocument(template, product, siteUrl));
      generatedPaths.push(`/product/${encodeURIComponent(product.slug)}`);
    }
    if (page >= Number(data.pages || 1)) {
      if (total > 0 && generatedPaths.length === 0) throw new Error("Product API returned no products despite reporting a non-empty catalog");
      const routePaths = await generatePublicRoutePages(distDir, template, siteUrl, catalog);
      const attributeRoutes = await generateAttributePages(distDir, template, siteUrl, catalogProducts);
      console.log(`Prerendered metadata for ${generatedPaths.length} products, ${catalog.floors.length} floors, ${catalog.shops.length} shops, and ${attributeRoutes.length} catalog browse pages.`);
      return [...generatedPaths, ...routePaths, ...attributeRoutes];
    }
    page += 1;
  }
  throw new Error("Product catalog exceeded the 10,000 item prerender limit");
}

const robots = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /admin",
  "Disallow: /dashboard",
  "Disallow: /cart",
  "Disallow: /payment/",
  "Disallow: /order-success",
];

if (siteUrl) {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:" || parsed.origin !== siteUrl) {
    throw new Error("VITE_SITE_URL must be the HTTPS storefront origin, without a path or trailing slash");
  }
  robots.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  let catalogRoutes = [];
  try {
    const productsAndPages = await generateProductPages(siteUrl);
    catalogRoutes = productsAndPages;
    const locations = [...new Set([...publicRoutes, ...catalogRoutes])];
    const urls = locations.map((route) => `  <url><loc>${xmlEscape(siteUrl)}${xmlEscape(route)}</loc></url>`).join("\n");
    await writeFile(resolve(distDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  } catch (error) {
    throw new Error(`SEO catalog generation failed: ${error.message}`);
  }
} else {
  throw new Error("VITE_SITE_URL must be set to the public HTTPS storefront origin before building.");
}

await mkdir(distDir, { recursive: true });
await writeFile(resolve(distDir, "robots.txt"), `${robots.join("\n")}\n`);
