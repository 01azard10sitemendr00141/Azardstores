import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShoppingBag, ArrowRight, ChevronLeft, ChevronRight,
  MapPin, AlertCircle, CheckCircle, Minus, Plus,
  Share2, Truck, RotateCcw, Shield, Package,
} from "lucide-react";
import api from "../api/client";
import { useCart } from "../context/CartContext";
import { useSettings } from "../context/SettingsContext";
import StripProductCard from "../components/StripProductCard";
import Breadcrumbs from "../components/Breadcrumbs";
import { getStartingPrice } from "../utils/productPricing";
import { productImageUrl } from "../utils/productImageUrl";
import { getProductSeoDescription } from "../utils/productSeo";
import { recordRecentlyViewed } from "../utils/recentlyViewed";

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size, height: size, flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.86L.057 23.857l6.174-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.664.86.876-3.565-.233-.375A9.818 9.818 0 1112 21.818z"/>
    </svg>
  );
}

// ─── Image gallery ────────────────────────────────────────────────────────────
function ImageGallery({ images, name }) {
  const [active, setActive] = useState(0);
  const [failedImages, setFailedImages] = useState({});
  const imgs = images?.length ? images : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-mall-800 group">
        {imgs[active] && !failedImages[active] ? (
          <img src={productImageUrl(imgs[active], { width: 1200, quality: 82 })} alt={name} fetchPriority="high" decoding="async" onError={() => setFailedImages((current) => ({ ...current, [active]: true }))} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={48} className="text-cream/20" />
          </div>
        )}
        {imgs.length > 1 && (
          <>
            <button aria-label="Show previous product image" onClick={() => setActive((i) => (i - 1 + imgs.length) % imgs.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-mall-900/70 backdrop-blur-sm text-cream flex items-center justify-center hover:bg-mall-900 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Show next product image" onClick={() => setActive((i) => (i + 1) % imgs.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-mall-900/70 backdrop-blur-sm text-cream flex items-center justify-center hover:bg-mall-900 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
      {imgs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {imgs.map((img, i) => (
            <button key={i} aria-label={`Show product image ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${i === active ? "border-mall-accent" : "border-transparent opacity-60 hover:opacity-100"}`}>
              {failedImages[i] ? <Package size={20} aria-hidden="true" className="mx-auto mt-5 text-cream/20" /> : <img src={productImageUrl(img, { width: 160, quality: 70 })} alt="" loading="lazy" decoding="async" onError={() => setFailedImages((current) => ({ ...current, [i]: true }))} className="w-full h-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Related strip ────────────────────────────────────────────────────────────
function RelatedStrip({ title, products }) {
  if (!products?.length) return null;
  return (
    <div className="mb-12 sm:mb-16">
      <div className="flex items-baseline justify-between mb-5 border-b border-cream/10 pb-3">
        <h2 className="font-display text-lg sm:text-xl text-cream">{title}</h2>
        <span className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest">{products.length} items</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
        {products.map((p) => <StripProductCard key={p._id} product={p} />)}
        <div className="shrink-0 w-2 sm:hidden" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Product() {
  const { slug } = useParams();
  const { items, addItem } = useCart();
  const { settings } = useSettings();
  const WHATSAPP_NUMBER = settings.whatsappNumber;
  const [product, setProduct] = useState(null);
  const [shopProducts, setShopProducts] = useState([]);
  const [floorProducts, setFloorProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  const [selectedVariant, setSelectedVariant] = useState(null);

  useEffect(() => {
    if (!product) return;
    const title = `${product.name} | Azard Stores`;
    document.querySelector('meta[name="robots"]')?.remove();
    const description = getProductSeoDescription(product);
    const canonicalUrl = `${window.location.origin}/product/${encodeURIComponent(product.slug || slug)}`;
    const image = productImageUrl(product.images?.[0], { width: 1200, quality: 82 }) || `${window.location.origin}/pics/azard-stores-banner.png`;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:type"]')?.setAttribute("content", "product");
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
    document.querySelector('meta[name="twitter:card"]')?.setAttribute("content", image ? "summary_large_image" : "summary");
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
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
    document.querySelector('meta[property="og:image:alt"]')?.setAttribute("content", product.name);
    document.querySelector('meta[name="twitter:image:alt"]')?.setAttribute("content", product.name);
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description,
      url: canonicalUrl,
      image: [image],
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.category ? { category: product.category } : {}),
      ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
      ...(Number.isFinite(Number(product.price)) ? {
        offers: {
          "@type": "Offer",
          price: Number(product.price),
          priceCurrency: "KES",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: "Azard Stores", url: window.location.origin },
          ...(Number.isFinite(Number(product.stock)) ? {
            availability: Number(product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          } : {}),
          url: canonicalUrl,
        },
      } : {}),
    };
    let jsonLd = document.querySelector('script[data-product-jsonld="true"]');
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.type = "application/ld+json";
      jsonLd.dataset.productJsonld = "true";
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(structuredData).replace(/</g, "\\u003c");
  }, [product, slug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setProduct(null);
    setShopProducts([]);
    setFloorProducts([]);
    setTrendingProducts([]);
    setShareMessage("");
    setSelectedVariant(null);
    setQty(1);
    window.scrollTo(0, 0);
    api.get(`/products/${slug}`, { timeout: 15_000 }).then(async (res) => {
      if (!active) return;
      const prod = res.data;
      recordRecentlyViewed(prod);
      setProduct(prod);
      // Product details and purchase controls should not wait for optional
      // recommendation rows to finish loading.
      setLoading(false);
      const shopId = prod.shop?._id;
      const floorId = prod.shop?.floor?._id;
      Promise.all([
        shopId ? api.get("/products", { params: { shop: shopId, limit: 10 }, timeout: 10_000 }).catch(() => null) : null,
        floorId ? api.get("/products", { params: { floor: floorId, limit: 10 }, timeout: 10_000 }).catch(() => null) : null,
        api.get("/products", { params: { badge: "trending", limit: 10 }, timeout: 10_000 }).catch(() => null),
      ]).then(([shopRes, floorRes, trendRes]) => {
        if (!active) return;
        const exclude = (list) => list.filter((p) => p._id !== prod._id);
        if (shopRes) setShopProducts(exclude(shopRes.data.products || []));
        if (floorRes) setFloorProducts(exclude(floorRes.data.products || []));
        if (trendRes) setTrendingProducts(exclude(trendRes.data.products || []));
      });
    }).catch((err) => {
      if (active && err.response?.status !== 404) setLoadError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, retry]);


  if (loading) {
    return (
      <div className="min-h-screen bg-mall-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle size={40} className={loadError ? "text-red-300/70" : "text-cream/20"} />
        <p className="font-display text-xl text-cream/60">{loadError ? "This product couldn’t be loaded" : "Product not found"}</p>
        {loadError && <button onClick={() => setRetry((value) => value + 1)} className="text-mall-accent hover:underline text-sm">Try again</button>}
        <Link to="/directory" className="text-mall-accent hover:underline text-sm">Back to directory</Link>
      </div>
    );
  }

  const hasVariants = product.variants?.length > 0;
  const startingPrice = getStartingPrice(product);
  // A variant's own price/compareAtPrice/stock override the product's when
  // set — undefined/null on the variant means "use the product's own value".
  const effectivePrice = selectedVariant?.price ?? startingPrice;
  const effectiveCompareAtPrice = selectedVariant
    ? (selectedVariant.compareAtPrice ?? product.compareAtPrice)
    : product.compareAtPrice;
  // With variants, stock isn't known until one is picked — treat as 0 so
  // Add to Cart stays disabled and nothing is falsely shown as in-stock.
  const effectiveStock = hasVariants ? (selectedVariant ? selectedVariant.stock : 0) : product.stock;
  const hasConfirmedStock = effectiveStock !== undefined && effectiveStock !== null && Number.isInteger(Number(effectiveStock));
  const stockCount = hasConfirmedStock ? Math.max(0, Number(effectiveStock)) : 0;
  const needsVariantSelection = hasVariants && !selectedVariant;
  const cartQuantity = items.find((item) => item.productId === product._id && (item.variantId || null) === (selectedVariant?._id || null))?.quantity || 0;
  const remainingStock = Math.max(0, stockCount - cartQuantity);
  const cartStockLimitReached = !needsVariantSelection && stockCount > 0 && remainingStock === 0;

  const hasDiscount = effectiveCompareAtPrice && effectiveCompareAtPrice > effectivePrice;
  const discountPct = hasDiscount ? Math.round((1 - effectivePrice / effectiveCompareAtPrice) * 100) : null;
  const isLowStock = stockCount > 0 && remainingStock > 0 && remainingStock <= 5;
  const isOutOfStock = !hasConfirmedStock || stockCount === 0;
  const whatsappMsg = encodeURIComponent(
    `Hello Azard Stores, is this product available?\n\nProduct: ${product.name}${selectedVariant ? `\nOption: ${selectedVariant.name}` : ""}\nPrice shown: KSh ${effectivePrice?.toLocaleString()}\nShop: ${product.shop?.shopNumber ?? "-"}\n\nPlease confirm current availability before I place an order.`
  );

  function handleAddToCart() {
    if (isOutOfStock || needsVariantSelection || cartStockLimitReached) return;
    addItem(product, Math.min(qty, remainingStock), selectedVariant);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  async function handleShare() {
    setShareMessage("");
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url: window.location.href });
        setShareMessage("Product shared");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareMessage("Product link copied");
      }
    } catch (error) {
      if (error.name !== "AbortError") setShareMessage("Sharing is unavailable here. Copy the page address to share this product.");
    }
  }

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Breadcrumbs */}
        <Breadcrumbs crumbs={[
          { label: "Home", to: "/" },
          ...(product.shop?.floor ? [{ label: `Floor ${product.shop.floor.floorNumber}: ${product.shop.floor.name}`, to: `/floor/${product.shop.floor.slug}` }] : []),
          ...(product.shop ? [{ label: `Shop #${product.shop.shopNumber}: ${product.shop.name}`, to: `/shop/${product.shop.slug}` }] : []),
          { label: product.name },
        ]} />

        {/* ── Main section ──────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-16 mt-6 mb-16 sm:mb-20">

          {/* Left — Image */}
          <ImageGallery
            key={selectedVariant?._id || "base"}
            images={
              selectedVariant?.image
                ? [selectedVariant.image, ...(product.images || []).filter((i) => i !== selectedVariant.image)]
                : product.images
            }
            name={product.name}
          />

          {/* Right — Info */}
          <div>

            {/* Brand + badge */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {product.brand && (
                <Link to={`/brand/${encodeURIComponent(product.brand)}`}
                  className="font-mono-tag text-[10px] uppercase text-mall-accent tracking-widest hover:underline">
                  {product.brand}
                </Link>
              )}
              {product.badge && (
                <span className="font-mono-tag text-[10px] uppercase bg-mall-accent text-mall-900 px-2.5 py-1 rounded-full font-semibold">
                  {product.badge.replace(/-/g, " ")}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl text-cream leading-tight mb-3">
              {product.name}
            </h1>

            {/* Shop + floor */}
            {product.shop && (
              <div className="flex items-center gap-1.5 text-cream/40 text-sm flex-wrap mb-4">
                <MapPin size={13} className="text-mall-accent shrink-0" />
                <Link to={`/shop/${product.shop.slug}`} className="hover:text-mall-accent transition">
                  Shop #{product.shop.shopNumber} · {product.shop.name}
                </Link>
                {product.shop.floor && (
                  <>
                    <span>·</span>
                    <Link to={`/floor/${product.shop.floor.slug}`} className="hover:text-mall-accent transition">
                      Floor {product.shop.floor.floorNumber}: {product.shop.floor.name}
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-cream/10 mb-4" />

            {/* Price */}
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <span className="font-display text-3xl sm:text-4xl text-cream">
                {effectivePrice ? `${needsVariantSelection && hasVariants ? "From " : ""}KSh ${effectivePrice.toLocaleString()}` : "Price unavailable"}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-cream/30 text-lg line-through">
                    KSh {effectiveCompareAtPrice?.toLocaleString()}
                  </span>
                  <span className="font-mono-tag text-xs text-red-400 font-semibold">
                    -{discountPct}% off
                  </span>
                </>
              )}
            </div>

            {/* Variant picker */}
            {hasVariants && (
              <div className="mb-4">
                <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-2">
                  {needsVariantSelection ? "Select an option" : "Option"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const active = selectedVariant?._id === v._id;
                    const variantHasStock = v.stock !== undefined && v.stock !== null && Number.isInteger(Number(v.stock));
                    const outOfStock = !variantHasStock || Number(v.stock) <= 0;
                    return (
                      <button
                        key={v._id}
                        type="button"
                        disabled={outOfStock}
                        onClick={() => { setSelectedVariant(v); setQty(1); }}
                        className={`px-3.5 py-2 rounded-lg text-sm border transition ${
                          outOfStock ? "border-cream/10 text-cream/25 cursor-not-allowed line-through"
                          : active ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold"
                          : "border-cream/20 text-cream/70 hover:border-cream/40 hover:text-cream"
                        }`}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock status */}
            {product.returnEligibility && product.returnEligibility !== "standard" && (
              <p className="mb-4 rounded-lg border border-cream/10 bg-mall-800/60 px-3 py-2 text-xs text-cream/55">
                {product.returnEligibility === "final_sale" ? "Final sale: this item is not eligible for return or exchange." : product.returnEligibility === "perishable" ? "Perishable item: this item is not eligible for return or exchange." : "Digital product or gift card: this item is not eligible for return or exchange."}
              </p>
            )}
            <div className="flex items-center gap-2 mb-4">
              {needsVariantSelection ? (
                <span className="text-sm text-cream/40">Select an option to see availability</span>
              ) : cartStockLimitReached ? (
                <><AlertCircle size={14} className="text-mall-accent shrink-0" /><span className="text-sm text-mall-accent font-medium">All currently available units are already in your cart</span></>
              ) : isOutOfStock ? (
                <><AlertCircle size={14} className="text-red-400 shrink-0" /><span className="text-sm text-red-400 font-medium">{hasConfirmedStock ? "Out of Stock" : "Availability not confirmed"}</span></>
              ) : isLowStock ? (
                <><AlertCircle size={14} className="text-mall-accent shrink-0" /><span className="text-sm text-mall-accent font-medium">Only {effectiveStock} left — order soon</span></>
              ) : (
                <><CheckCircle size={14} className="text-emerald-400 shrink-0" /><span className="text-sm text-emerald-400 font-medium">In stock · order availability is confirmed before dispatch</span></>
              )}
            </div>

            {/* Short description */}
            {product.description && (
              <p className="text-cream/60 text-sm sm:text-base leading-relaxed mb-5">
                {product.description}
              </p>
            )}

            {/* Divider */}
            <div className="border-t border-cream/10 mb-5" />

            {/* Quantity */}
            {!isOutOfStock && !needsVariantSelection && !cartStockLimitReached && (
              <div className="flex items-center gap-4 mb-5">
                <span className="text-sm text-cream/50">Quantity</span>
                <div className="flex items-center gap-3">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 text-cream/60 transition hover:border-cream hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center font-display text-lg text-cream">{qty}</span>
                  <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(remainingStock, q + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 text-cream/60 transition hover:border-cream hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <button onClick={handleAddToCart} disabled={isOutOfStock || needsVariantSelection || cartStockLimitReached}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-sm transition ${
                  isOutOfStock || needsVariantSelection || cartStockLimitReached ? "bg-cream/10 text-cream/30 cursor-not-allowed"
                  : added ? "bg-emerald-500 text-white"
                  : "bg-mall-accent text-mall-900 hover:bg-mall-accentDark"
                }`}>
                <ShoppingBag size={16} />
                {added ? "Added to Cart ✓" : needsVariantSelection ? "Select an Option" : !hasConfirmedStock ? "Availability Unconfirmed" : isOutOfStock ? "Out of Stock" : cartStockLimitReached ? "Available Quantity in Cart" : "Add to Cart"}
              </button>
              <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-sm bg-[#25D366] text-white hover:bg-[#20b858] transition">
                <WhatsAppIcon size={16} />
                Ask about availability
              </a>
            </div>

            {/* Trust signals */}
            <div className="border-t border-cream/10 pt-4 space-y-2.5 mb-4">
              <div className="flex items-center gap-2.5 text-sm text-cream/50">
                <Truck size={14} className="text-mall-accent shrink-0" />
                Delivery options and charges shown at checkout
              </div>
              <div className="flex items-center gap-2.5 text-sm text-cream/50">
                <RotateCcw size={14} className="text-mall-accent shrink-0" />
                5-day return requests on eligible items
              </div>
              <div className="flex items-center gap-2.5 text-sm text-cream/50">
                <Shield size={14} className="text-mall-accent shrink-0" />
                Payment methods shown before you place your order
              </div>
            </div>

            {/* Share */}
            <button onClick={handleShare}
              className="flex items-center gap-2 text-cream/30 hover:text-cream text-xs transition">
              <Share2 size={13} /> Share this product
            </button>
            {shareMessage && <p role="status" aria-live="polite" className="mt-2 text-xs text-cream/45">{shareMessage}</p>}

            {/* Divider */}
            <div className="border-t border-cream/10 mt-6 mb-6" />

            {product.longDescription && (
              <>
                <section aria-labelledby="about-product-heading" className="mb-6">
                  <h2 id="about-product-heading" className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
                    About this product
                  </h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-cream/65">
                    {product.longDescription}
                  </p>
                </section>
                <div className="border-t border-cream/10 mb-6" />
              </>
            )}

            {/* Product details — flat, no card */}
            <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">
              Product Details
            </p>
            <div className="space-y-3">
              {product.brand && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cream/40">Brand</span>
                  <Link to={`/brand/${encodeURIComponent(product.brand)}`}
                    className="text-cream font-medium hover:text-mall-accent transition">
                    {product.brand}
                  </Link>
                </div>
              )}
              {product.category && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cream/40">Collection</span>
                  <Link to={`/categories/${encodeURIComponent(product.category)}`}
                    className="text-cream font-medium hover:text-mall-accent transition">
                    {product.category}
                  </Link>
                </div>
              )}
              {product.subcategory && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cream/40">Category</span>
                  <Link to={`/categories/${encodeURIComponent(product.category)}/subcategories/${encodeURIComponent(product.subcategory)}`}
                    className="text-cream font-medium hover:text-mall-accent transition">
                    {product.subcategory}
                  </Link>
                </div>
              )}
              {product.purposeTags?.length > 0 && (
                <div className="flex items-start justify-between text-sm gap-4">
                  <span className="text-cream/40 shrink-0">Best for</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {product.purposeTags.map((tag) => (
                      <Link key={tag} to={`/search?purpose=${tag}`}
                        className="font-mono-tag text-[9px] uppercase text-mall-accent hover:underline">
                        {tag}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {!needsVariantSelection && effectiveStock > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cream/40">Stock</span>
                  <span className="text-cream font-medium">{effectiveStock} units available</span>
                </div>
              )}
              {product.shop && (
                <div className="flex items-center justify-between text-sm pt-2 border-t border-cream/8">
                  <span className="text-cream/40">Sold by</span>
                  <Link to={`/shop/${product.shop.slug}`}
                    className="flex items-center gap-1 text-mall-accent hover:underline font-medium">
                    {product.shop.name} <ArrowRight size={11} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Related sections ───────────────────────────────────────── */}
        <RelatedStrip title={`More from ${product.shop?.name || "this shop"}`} products={shopProducts} />
        <RelatedStrip title={`More on Floor ${product.shop?.floor?.floorNumber || ""}: ${product.shop?.floor?.name || ""}`} products={floorProducts} />
        <RelatedStrip title="Trending in the Store" products={trendingProducts} />
      </div>
    </div>
  );
}
