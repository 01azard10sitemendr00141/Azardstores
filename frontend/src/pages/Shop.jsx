import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MapPin, Package, ChevronRight, Store } from "lucide-react";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";
import StripProductCard from "../components/StripProductCard";
import { updatePageMetadata } from "../utils/updatePageMetadata";
import { useBadges } from "../context/BadgesContext";

// ─── Horizontal product strip ─────────────────────────────────────────────────
function ProductStrip({ title, tag, products }) {
  if (!products?.length) return null;
  return (
    <div className="mb-10 sm:mb-12">
      <div className="flex items-baseline justify-between mb-4 border-b border-cream/10 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg sm:text-xl text-cream">{title}</h2>
          {tag && (
            <span className="font-mono-tag text-[9px] uppercase bg-mall-orange/20 text-mall-orange px-2 py-0.5 rounded-full">
              {tag}
            </span>
          )}
        </div>
        <span className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest">
          {products.length} {products.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {products.map((p) => <StripProductCard key={p._id} product={p} />)}
        <div className="shrink-0 w-2 sm:hidden" />
      </div>
    </div>
  );
}

// ─── Other shops on the floor ─────────────────────────────────────────────────
function OtherShops({ currentShopId, floorId, floorSlug, floorNumber }) {
  const [shops, setShops] = useState([]);

  useEffect(() => {
    let active = true;
    setShops([]);
    if (!floorId) return () => { active = false; };
    api.get("/shops", { params: { floor: floorId } }).then((res) => {
      if (active) setShops(res.data.filter((s) => s._id !== currentShopId));
    }).catch(() => {
      if (active) setShops([]);
    });
    return () => { active = false; };
  }, [floorId, currentShopId]);

  if (!shops.length) return null;

  return (
    <div className="mt-12 sm:mt-16 border-t border-cream/10 pt-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">
            Floor {floorNumber}
          </p>
          <h2 className="font-display text-lg sm:text-xl text-cream">More shops on this floor</h2>
        </div>
        <Link
          to={`/floor/${floorSlug}`}
          className="flex items-center gap-1 text-xs text-cream/40 hover:text-mall-accent transition"
        >
          See floor <ChevronRight size={12} />
        </Link>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {shops.map((shop) => (
          <Link
            key={shop._id}
            to={`/shop/${shop.slug}`}
            className="group shrink-0 w-44 sm:w-52 rounded-xl overflow-hidden bg-mall-800 hover:ring-2 hover:ring-mall-accent transition"
          >
            <div className="aspect-[4/3] overflow-hidden bg-mall-700 relative">
              {shop.banner ? (
                <img src={shop.banner} alt={shop.name} onError={(e) => e.currentTarget.remove()} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Store size={28} className="text-cream/20" />
                </div>
              )}
              <span className="absolute top-2 left-2 font-mono-tag text-[9px] uppercase bg-mall-900/80 text-mall-orange px-2 py-0.5 rounded-full">
                #{shop.shopNumber}
              </span>
              {shop.status !== "open" && (
                <span className="absolute top-2 right-2 font-mono-tag text-[9px] uppercase bg-mall-accent text-mall-900 px-2 py-0.5 rounded-full font-semibold">
                  {shop.status === "new" ? "New" : shop.status === "closing-down-sale" ? "Sale" : shop.status}
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="text-cream text-sm font-medium line-clamp-1">{shop.name}</p>
              <p className="text-cream/40 text-[10px] mt-0.5 line-clamp-1">{shop.description}</p>
            </div>
          </Link>
        ))}
        <div className="shrink-0 w-2 sm:hidden" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Shop() {
  const { badges } = useBadges();
  const { slug } = useParams();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState(false);
  const [shopLoadError, setShopLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!shop) return;
    const title = `${shop.name} | Azard Stores`;
    const description = String(shop.description || `Browse products from ${shop.name}, Shop #${shop.shopNumber}, at Azard Stores.`)
      .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    const url = `${window.location.origin}/shop/${encodeURIComponent(shop.slug || slug)}`;
    let image = "";
    if (shop.banner || shop.logo) try { image = new URL(shop.banner || shop.logo, window.location.origin).href; } catch { image = ""; }
    updatePageMetadata({ title, description, url, image });
  }, [shop, slug]);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    let active = true;
    let shopLoaded = false;
    setLoading(true);
    setShop(null);
    setProducts([]);
    setProductsLoadError(false);
    setShopLoadError(false);
    setLoadingMore(false);
    setLoadMoreError(false);
    setPage(1);
    window.scrollTo(0, 0);
    api.get(`/shops/${slug}`).then((res) => {
      if (!active) return null;
      setShop(res.data);
      shopLoaded = true;
      return api.get("/products", { params: { shop: res.data._id, limit: 50, page: 1 } });
    }).then((prodRes) => {
        if (!active || !prodRes) return;
        setProducts(prodRes.data.products);
        setTotalPages(prodRes.data.pages || 1);
        setTotalProducts(prodRes.data.total || 0);
    }).catch((err) => {
      if (!active) return;
      if (shopLoaded) setProductsLoadError(true);
      else if (err.response?.status !== 404) setShopLoadError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (requestGeneration.current === generation) requestGeneration.current += 1;
    };
  }, [slug, retry]);

  function loadMoreProducts() {
    setLoadingMore(true);
    setLoadMoreError(false);
    const nextPage = page + 1;
    const generation = requestGeneration.current;
    api.get("/products", { params: { shop: shop._id, limit: 50, page: nextPage } }).then((res) => {
      if (generation !== requestGeneration.current) return;
      setProducts((prev) => [...prev, ...(res.data.products || [])]);
      setPage(nextPage);
    }).catch(() => {
      if (generation === requestGeneration.current) setLoadMoreError(true);
    }).finally(() => {
      if (generation === requestGeneration.current) setLoadingMore(false);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-mall-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center gap-3 px-4">
        <Store size={40} className="text-cream/20" />
        <p className="font-display text-xl text-cream/40">{shopLoadError ? "This shop couldn’t be loaded" : "Shop not found"}</p>
        {shopLoadError && <button onClick={() => setRetry((value) => value + 1)} className="text-mall-accent hover:underline text-sm">Try again</button>}
        <Link to="/directory" className="text-mall-accent hover:underline text-sm">Back to directory</Link>
      </div>
    );
  }

  const STRIP_THRESHOLD = 8; // below this many products, organized strips aren't worth it — just show the grid

  const flashSale = products.filter((p) => p.isFlashSale);
  const badgeGroups = badges
    .map((b) => ({ badge: b, products: products.filter((p) => p.badge === b.slug && !p.isFlashSale) }))
    .filter((g) => g.products.length > 0);

  const featuredIds = new Set(
    [...flashSale, ...badgeGroups.flatMap((g) => g.products)].map((p) => p._id)
  );
  const hasOrganized = featuredIds.size > 0;
  const showStrips = hasOrganized && products.length >= STRIP_THRESHOLD;

  // Everything not already shown in a strip above — avoids showing the same product twice
  const remaining = showStrips ? products.filter((p) => !featuredIds.has(p._id)) : products;

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Breadcrumbs */}
        <Breadcrumbs crumbs={[
          { label: "Mall Directory", to: "/directory" },
          ...(shop.floor ? [{ label: `Floor ${shop.floor.floorNumber}: ${shop.floor.name}`, to: `/floor/${shop.floor.slug}` }] : []),
          { label: `Shop #${shop.shopNumber}: ${shop.name}` },
        ]} />

        {/* ── Shop identity ──────────────────────────────────────────── */}
        <div className="mt-6 mb-8 sm:mb-10 pb-8 border-b border-cream/10">
          {/* Shop number + status */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-mono-tag text-[10px] uppercase bg-mall-800 text-mall-orange border border-cream/10 px-2.5 py-1 rounded-full">
              Shop #{shop.shopNumber}
            </span>
            {shop.status === "new" && (
              <span className="font-mono-tag text-[10px] uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full font-semibold">New</span>
            )}
            {shop.status === "closing-down-sale" && (
              <span className="font-mono-tag text-[10px] uppercase bg-mall-orange text-mall-900 px-2.5 py-1 rounded-full font-semibold">Closing Down Sale</span>
            )}
            {shop.status === "closed" && (
              <span className="font-mono-tag text-[10px] uppercase bg-cream/10 text-cream/40 px-2.5 py-1 rounded-full">Closed</span>
            )}
          </div>

          {/* Shop name */}
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-cream leading-tight mb-3">
            {shop.name}
          </h1>

          {/* Floor tag */}
          {shop.floor && (
            <Link
              to={`/floor/${shop.floor.slug}`}
              className="inline-flex items-center gap-1.5 text-cream/50 hover:text-mall-accent transition text-sm mb-4"
            >
              <MapPin size={13} className="text-mall-accent shrink-0" />
              Floor {shop.floor.floorNumber} · {shop.floor.name}
              <ChevronRight size={12} />
            </Link>
          )}

          {/* Description */}
          {shop.description && (
            <p className="text-cream/60 text-sm sm:text-base leading-relaxed max-w-2xl mb-5">
              {shop.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 sm:gap-6 text-sm">
            <div className="flex items-center gap-1.5 text-cream/50">
              <Package size={13} className="text-mall-accent shrink-0" />
              <span>{totalProducts} product{totalProducts !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1.5 text-cream/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>{shop.status === "open" || shop.status === "new" ? "Open now" : shop.status.replace(/-/g, " ")}</span>
            </div>
          </div>
        </div>

        {/* ── Products ───────────────────────────────────────────────── */}
        {productsLoadError ? (
          <div role="alert" className="py-16 text-center">
            <Package size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/50 font-display text-xl">Products couldn’t be loaded</p>
            <p className="text-cream/30 text-sm mt-1">Please try again in a moment.</p>
            <button onClick={() => setRetry((value) => value + 1)} className="text-mall-accent hover:underline text-sm mt-4">Try again</button>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center">
            <Package size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/40 font-display text-xl">No products yet</p>
            <p className="text-cream/30 text-sm mt-1">Check back soon — this shop is stocking up.</p>
          </div>
        ) : showStrips ? (
          <>
            <ProductStrip title="Flash Sale" tag="Limited time" products={flashSale} />
            {badgeGroups.map((g) => (
              <ProductStrip key={g.badge._id} title={g.badge.sectionHeading} tag={g.badge.sectionTag} products={g.products} />
            ))}
            {remaining.length > 0 && (
              <div className="mb-10 sm:mb-12">
                <div className="flex items-baseline justify-between mb-4 border-b border-cream/10 pb-3">
                  <h2 className="font-display text-lg sm:text-xl text-cream">More from this shop</h2>
                  <span className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest">
                    {remaining.length} {remaining.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {remaining.map((p) => <StripProductCard key={p._id} product={p} />)}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mb-10 sm:mb-12">
            <div className="flex items-baseline justify-between mb-4 border-b border-cream/10 pb-3">
              <h2 className="font-display text-lg sm:text-xl text-cream">All Products</h2>
              <span className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest">
                {products.length} {products.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {products.map((p) => <StripProductCard key={p._id} product={p} />)}
            </div>
          </div>
        )}

        {page < totalPages && (
          <div className="flex justify-center mb-10 sm:mb-12 -mt-4">
            <div className="text-center">
              {loadMoreError && <p role="alert" className="mb-2 text-xs text-red-300">Couldn’t load more products. Please try again.</p>}
              <button
                onClick={loadMoreProducts}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-full border border-cream/15 text-cream/70 text-sm font-medium hover:border-mall-accent hover:text-cream transition disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : loadMoreError ? "Retry loading products" : `Load more (${products.length} of ${totalProducts})`}
              </button>
            </div>
          </div>
        )}

        {/* ── More shops on this floor ───────────────────────────────── */}
        <OtherShops
          currentShopId={shop._id}
          floorId={shop.floor?._id}
          floorSlug={shop.floor?.slug}
          floorNumber={shop.floor?.floorNumber}
        />
      </div>
    </div>
  );
}
