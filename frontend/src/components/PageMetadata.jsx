import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ROUTE_TITLES = {
  "/": "Shop the digital mall",
  "/directory": "Mall Directory",
  "/search": "Search Products",
  "/cart": "Your Cart",
  "/dashboard": "My Account",
  "/faq": "Frequently Asked Questions",
  "/contact": "Contact Us",
  "/delivery": "Delivery Information",
  "/returns": "Returns and Exchanges",
  "/privacy": "Privacy Policy",
  "/terms": "Terms of Service",
  "/cookies": "Cookie Policy",
  "/login": "Log In",
  "/signup": "Create an Account",
};

const ROUTE_DESCRIPTIONS = {
  "/": "Browse shops and products at Azard Stores, Kenya's digital mall.",
  "/directory": "Explore floors and shops in the Azard Stores digital mall.",
  "/search": "Search products across Azard Stores shops.",
  "/delivery": "Review delivery areas, available services, and delivery guidance from Azard Stores.",
  "/returns": "Review return eligibility, time limits, and how to request help with an order.",
  "/faq": "Find answers about ordering, payment, delivery, returns, and customer accounts.",
};

function readablePath(pathname) {
  const segment = pathname.split("/").filter(Boolean).at(-1) || "";
  let decoded = segment;
  try { decoded = decodeURIComponent(segment); } catch { /* Keep malformed path text readable without breaking navigation. */ }
  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PageMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Product pages provide their own data-backed metadata once the product loads.
    // Keep the prerendered tags intact during the API request.
    if (/^\/(product|floor|shop)\//.test(pathname)) return;
    const nestedSubcategoryRoute = pathname.match(/^\/categories\/([^/]+)\/subcategories\/([^/]+)$/);
    const attributeRoute = pathname.match(/^\/(brand|category|categories|collection|subcategory)\/([^/]+)$/);
    let attributeLabel = nestedSubcategoryRoute?.[2] || attributeRoute?.[2] || "";
    try { attributeLabel = decodeURIComponent(attributeLabel); } catch { /* Preserve the visible route text. */ }
    attributeLabel = attributeLabel.replace(/[-_]+/g, " ");
    let parentLabel = nestedSubcategoryRoute?.[1] || "";
    try { parentLabel = decodeURIComponent(parentLabel); } catch { /* Preserve the visible route text. */ }
    parentLabel = parentLabel.replace(/[-_]+/g, " ");
    const attributeTitle = nestedSubcategoryRoute
      ? `${attributeLabel} in ${parentLabel}`
      : attributeRoute
        ? `${attributeLabel} ${attributeRoute[1] === "brand" ? "Products" : attributeRoute[1] === "category" ? "Subcategory" : "Category"}`
      : "";
    const label = ROUTE_TITLES[pathname] || attributeTitle || readablePath(pathname);
    const title = `${label} | Azard Stores`;
    const attributeDescription = nestedSubcategoryRoute
      ? `Browse ${attributeLabel} in ${parentLabel} at Azard Stores.`
      : attributeRoute
        ? attributeRoute[1] === "brand"
        ? `Shop products from ${attributeLabel} at Azard Stores.`
        : attributeRoute[1] === "subcategory" || attributeRoute[1] === "category"
          ? `Browse ${attributeLabel} products at Azard Stores.`
          : `Browse the ${attributeLabel} category at Azard Stores.`
      : "";
    const description = ROUTE_DESCRIPTIONS[pathname] || attributeDescription || "Shop products and browse stores at Azard Stores, Kenya's digital mall.";
    document.title = title;
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
    const noIndex = /^\/(search|cart|dashboard|order-success|payment\/callback|track-order|login|signup|forgot-password|reset-password|verify-email|admin)(\/|$)/.test(pathname);
    let robots = document.querySelector('meta[name="robots"]');
    if (noIndex && !robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    if (robots) {
      if (noIndex) robots.content = "noindex,follow";
      else robots.remove();
    }
    document.querySelector('meta[property="og:type"]')?.setAttribute("content", "website");
    document.querySelector('meta[name="twitter:card"]')?.setAttribute("content", "summary");
    document.querySelector('meta[property="og:image"]')?.remove();
    document.querySelector('meta[name="twitter:image"]')?.remove();
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${pathname}`;
  }, [pathname]);

  return null;
}
