import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search, ChevronLeft, ChevronRight, Store,
  Shirt, Cpu, Sparkles, ShoppingBasket, Sofa,
  Dumbbell, Blocks, Gem, BookOpen, Wrench, Package, Tag,
} from "lucide-react";
import api from "../api/client";
import { getStartingPrice } from "../utils/productPricing";

const FLOOR_ICONS = {
  1: Shirt, 2: Cpu, 3: Sparkles, 4: ShoppingBasket,
  5: Sofa, 6: Dumbbell, 7: Blocks, 8: Gem, 9: BookOpen, 10: Wrench,
};

function FloorIcon({ floorNumber }) {
  const Icon = FLOOR_ICONS[floorNumber] || Store;
  return (
    <span className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-mall-800 text-mall-accent flex items-center justify-center shrink-0">
      <Icon size={18} />
    </span>
  );
}

function StatusBadge({ status }) {
  if (!status || status === "open") return null;
  const labels = { new: "New", "closing-down-sale": "Sale", closed: "Closed" };
  const colors = {
    new: "bg-emerald-500 text-white font-semibold",
    "closing-down-sale": "bg-mall-orange text-mall-900 font-semibold",
    closed: "bg-cream/20 text-cream/60",
  };
  return (
    <span className={`absolute top-2 right-2 font-mono-tag text-[9px] uppercase px-2 py-0.5 rounded-full ${colors[status] || "bg-white/20 text-white font-semibold"}`}>
      {labels[status] || status}
    </span>
  );
}

function ShopPlaceholder() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-mall-800">
      <Store size={24} className="text-cream/20" />
    </div>
  );
}

function ShopCard({ shop }) {
  return (
    <Link
      to={`/shop/${shop.slug}`}
      className="group relative shrink-0 w-36 sm:w-40 md:w-44 rounded-xl overflow-hidden bg-mall-800 aspect-[3/4] flex flex-col hover:ring-2 hover:ring-mall-accent transition"
    >
      <div className="flex-1 overflow-hidden">
        {shop.banner ? (
          <img src={shop.banner} alt={shop.name} loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        ) : (
          <ShopPlaceholder />
        )}
      </div>
      <span className="absolute top-2 left-2 font-mono-tag text-[9px] sm:text-[10px] uppercase bg-mall-900/80 text-mall-orange px-2 py-0.5 rounded-full">
        #{shop.shopNumber}
      </span>
      <StatusBadge status={shop.status} />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 sm:px-3 py-2 sm:py-3">
        <p className="text-cream text-xs sm:text-sm font-medium leading-tight line-clamp-2">{shop.name}</p>
        {shop.productCount > 0 && (
          <p className="flex items-center gap-1 text-cream/50 text-[10px] mt-0.5">
            <Package size={9} />
            {shop.productCount} product{shop.productCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

function ShopStrip({ shops }) {
  const stripRef = useRef(null);
  function scroll(direction) {
    if (!stripRef.current) return;
    stripRef.current.scrollBy({ left: direction * 200, behavior: "smooth" });
  }
  if (shops.length === 0) {
    return (
      <p className="text-xs text-cream/20 italic py-4 pl-1">Coming soon — no shops on this floor yet.</p>
    );
  }
  return (
    <div className="relative">
      <button onClick={() => scroll(-1)} aria-label="Scroll left" className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-mall-800 text-cream shadow-lg items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition">
        <ChevronLeft size={16} />
      </button>
      <div ref={stripRef} className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 px-0.5" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {shops.map((shop) => <ShopCard key={shop._id} shop={shop} />)}
      </div>
      <button onClick={() => scroll(1)} aria-label="Scroll right" className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-mall-800 text-cream shadow-lg items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function FloorRow({ floor, shops }) {
  return (
    <div className="py-5 sm:py-7 border-b border-cream/10 last:border-0">
      <Link to={`/floor/${floor.slug}`} className="inline-flex items-center gap-2 sm:gap-3 mb-4 group">
        {floor.image ? (
          <span className="w-9 h-9 md:w-10 md:h-10 rounded-xl overflow-hidden shrink-0 ring-1 ring-cream/10">
            <img src={floor.image} alt={floor.name} loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} className="w-full h-full object-cover" />
          </span>
        ) : (
          <FloorIcon floorNumber={floor.floorNumber} />
        )}
        <div>
          <p className="font-mono-tag text-[10px] text-mall-orange uppercase tracking-widest">Floor {floor.floorNumber}</p>
          <h2 className="font-display text-lg sm:text-xl text-cream group-hover:text-mall-accent transition leading-tight">{floor.name}</h2>
        </div>
        <span className="ml-1 font-mono-tag text-[10px] text-cream/20 bg-cream/5 px-2 py-0.5 rounded-full">
          {shops.length} {shops.length === 1 ? "shop" : "shops"}
        </span>
        <ChevronRight size={14} className="text-cream/20 group-hover:text-mall-accent group-hover:translate-x-0.5 transition ml-auto" />
      </Link>
      <ShopStrip shops={shops} />
    </div>
  );
}

function ProductResult({ product }) {
  const startingPrice = getStartingPrice(product);
  return (
    <Link
      to={`/product/${product.slug}`}
      className="flex items-center gap-3 py-3 border-b border-cream/5 last:border-0 hover:bg-cream/5 transition group px-1 rounded-lg"
    >
      {product.images?.[0] ? (
        <img src={product.images[0]} alt={product.name} loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} className="w-12 h-12 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-mall-800 rounded-lg shrink-0 flex items-center justify-center">
          <Package size={16} className="text-cream/30" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-cream line-clamp-1 group-hover:text-mall-accent transition">{product.name}</p>
        <p className="text-xs text-cream/40">{product.shop?.name} · Floor {product.shop?.floor?.floorNumber}</p>
      </div>
      <p className="font-display text-sm text-cream shrink-0">{startingPrice ? `${product.variants?.length ? "From " : ""}KSh ${startingPrice.toLocaleString()}` : "Price unavailable"}</p>
    </Link>
  );
}

export default function Directory() {
  const [floors, setFloors] = useState([]);
  const [shopsByFloor, setShopsByFloor] = useState({});
  const [categories, setCategories] = useState([]);
  const [categoriesLoadError, setCategoriesLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState(false);
  const searchRef = useRef(null);
  const productSearchTimer = useRef(null);
  const productSearchRequest = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setCategories([]);
    setCategoriesLoadError(false);
    api.get("/categories", { timeout: 10_000 }).then((res) => {
      if (active) setCategories(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {
      if (active) setCategoriesLoadError(true);
    });
    Promise.all([
      api.get("/floors"),
      api.get("/shops"),
    ]).then(([floorsRes, shopsRes]) => {
      if (!active) return;
      setFloors(floorsRes.data);
      const grouped = {};
      shopsRes.data.forEach((shop) => {
        const floorId = shop.floor?._id;
        if (!grouped[floorId]) grouped[floorId] = [];
        grouped[floorId].push(shop);
      });
      setShopsByFloor(grouped);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setLoadError(true);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [loadAttempt]);

  const searchProducts = useCallback((q) => {
    clearTimeout(productSearchTimer.current);
    const requestId = ++productSearchRequest.current;
    if (!q || q.length < 2) { setProductResults([]); setSearchingProducts(false); setProductSearchError(false); return; }
    setProductResults([]);
    setSearchingProducts(true);
    setProductSearchError(false);
    productSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get("/products", { params: { search: q, limit: 8 }, timeout: 10_000 });
        if (requestId === productSearchRequest.current) setProductResults(res.data.products || []);
      } catch {
        if (requestId === productSearchRequest.current) {
          setProductResults([]);
          setProductSearchError(true);
        }
      } finally {
        if (requestId === productSearchRequest.current) setSearchingProducts(false);
      }
    }, 300);
  }, []);

  useEffect(() => () => {
    clearTimeout(productSearchTimer.current);
    productSearchRequest.current += 1;
  }, []);

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    searchProducts(val);
  }

  const q = query.trim().toLowerCase();
  const filteredFloors = floors.map((floor) => {
    const shops = shopsByFloor[floor._id] || [];
    if (!q) return { floor, shops };
    const floorMatches = floor.name.toLowerCase().includes(q);
    const matchingShops = shops.filter((s) => s.name.toLowerCase().includes(q));
    if (floorMatches) return { floor, shops };
    if (matchingShops.length > 0) return { floor, shops: matchingShops };
    return null;
  }).filter(Boolean);

  const filteredCategories = categories.map((category) => {
    const subcategories = category.subcategories || [];
    if (!q) return { ...category, visibleSubcategories: subcategories };
    if (String(category.name || "").toLowerCase().includes(q)) return { ...category, visibleSubcategories: subcategories };
    const matches = subcategories.filter((subcategory) => String(subcategory.name || "").toLowerCase().includes(q));
    return matches.length ? { ...category, visibleSubcategories: matches } : null;
  }).filter(Boolean);

  const hasFloorResults = filteredFloors.length > 0;
  const hasProductResults = productResults.length > 0;
  const hasCategoryResults = filteredCategories.length > 0;
  const hasAnyResults = hasFloorResults || hasProductResults || hasCategoryResults;

  return (
    <div className="min-h-screen bg-mall-900">
      {/* Search hero */}
      <div className="bg-mall-900 pt-8 pb-12 px-4 border-b border-cream/5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="font-mono-tag text-xs text-mall-orange uppercase tracking-widest mb-2">Mall Directory</p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl text-cream mb-6 sm:mb-7">
            Find a category, floor, or shop.
          </h1>
          <div
            className="flex items-center gap-3 bg-mall-800 rounded-full px-4 sm:px-5 py-3 sm:py-3.5 outline-none focus-within:ring-2 focus-within:ring-mall-accent transition cursor-text"
            onClick={() => searchRef.current?.focus()}
          >
            <Search size={16} className="text-cream/40 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search floors, shops, categories, products..."
              className="flex-1 bg-transparent text-cream placeholder-cream/35 text-sm outline-none border-none focus:outline-none focus:ring-0"
              autoComplete="off"
            />
            {searchingProducts && <span className="text-cream/30 text-xs shrink-0">Searching...</span>}
            {query && !searchingProducts && (
              <button onClick={() => { setQuery(""); setProductResults([]); setProductSearchError(false); searchProducts(""); }}
                className="text-cream/40 hover:text-cream transition text-sm leading-none shrink-0" aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
          {productSearchError && (
            <p role="alert" className="mt-3 text-xs text-red-300">
              Product search couldn’t load. <button onClick={() => searchProducts(query.trim())} className="text-mall-accent hover:underline">Try again</button>
            </p>
          )}
          {query && (
            <p className="text-cream/35 text-xs mt-3">
              {productSearchError ? `Showing category, floor, and shop matches for "${query}"` : !hasAnyResults ? "No results found" : `Showing results for "${query}"`}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
        {loading && <p className="text-cream/30 text-sm py-16 text-center">Loading directory...</p>}

        {!loading && loadError && (
          <div className="flex flex-col items-center text-center gap-3 py-16">
            <p className="text-cream/60 text-sm">Something went wrong loading the directory.</p>
            <button
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="text-mall-accent text-sm font-medium hover:text-mall-accentDark transition"
            >
              Try again
            </button>
          </div>
        )}

        {/* Product results — flat, no card */}
        {!loading && categoriesLoadError && (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-cream/10 bg-mall-800/50 px-4 py-3">
            <p className="text-xs text-cream/50">Categories couldn’t be loaded. The floor and shop directory is still available.</p>
            <button onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="shrink-0 text-xs text-mall-accent hover:underline">Retry</button>
          </div>
        )}

        {!loading && filteredCategories.length > 0 && (
          <section aria-labelledby="directory-categories-heading" className="py-6 sm:py-8 border-b border-cream/10">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">Browse by category</p>
                <h2 id="directory-categories-heading" className="font-display text-xl sm:text-2xl text-cream">Shop the global catalog</h2>
              </div>
              {q && <span className="text-xs text-cream/35">{filteredCategories.length} match{filteredCategories.length === 1 ? "" : "es"}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCategories.map((category) => (
                <article key={category._id} className="rounded-2xl border border-cream/10 bg-mall-800/45 p-4">
                  <Link to={`/categories/${encodeURIComponent(category.name)}`} className="group flex items-center gap-2 text-cream hover:text-mall-accent transition">
                    <Tag size={14} className="shrink-0 text-mall-accent" />
                    <span className="font-display text-base sm:text-lg">{category.name}</span>
                    <ChevronRight size={14} className="ml-auto text-cream/25 transition group-hover:translate-x-0.5 group-hover:text-mall-accent" />
                  </Link>
                  {category.visibleSubcategories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {category.visibleSubcategories.slice(0, 8).map((subcategory) => (
                        <Link key={subcategory._id} to={`/categories/${encodeURIComponent(category.name)}/subcategories/${encodeURIComponent(subcategory.name)}`} className="rounded-full border border-cream/10 px-2.5 py-1 text-[10px] text-cream/55 hover:border-mall-accent/40 hover:text-cream transition">
                          {subcategory.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {!loading && hasProductResults && (
          <div className="mt-6 mb-2 border-b border-cream/10 pb-4">
            <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
              Products matching "{query}"
            </p>
            {productResults.map((product) => <ProductResult key={product._id} product={product} />)}
          </div>
        )}

        {!loading && !hasAnyResults && query && !productSearchError && (
          <div className="py-16 sm:py-20 text-center">
            <p className="font-display text-xl sm:text-2xl text-cream/30 mb-2">No matches found</p>
            <p className="text-sm text-cream/30">
              Try something else — or{" "}
              <button onClick={() => { setQuery(""); setProductResults([]); }} className="text-mall-accent hover:underline">
                browse all floors
              </button>
            </p>
          </div>
        )}

        {!loading && filteredFloors.map(({ floor, shops }) => (
          <FloorRow key={floor._id} floor={floor} shops={shops} />
        ))}
      </div>
    </div>
  );
}
