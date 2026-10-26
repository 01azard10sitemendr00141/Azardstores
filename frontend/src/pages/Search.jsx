import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, X, SlidersHorizontal, ArrowUpDown, ShoppingBasket } from "lucide-react";
import api from "../api/client";
import StripProductCard from "../components/StripProductCard";
import { useBadges } from "../context/BadgesContext";

const PURPOSES = [
  { value: "work",    label: "Work" },
  { value: "gaming",  label: "Gaming" },
  { value: "travel",  label: "Travel" },
  { value: "home",    label: "Home" },
  { value: "fitness", label: "Fitness" },
];

const SORT_OPTIONS = [
  { value: "",          label: "Relevance" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc",label: "Price: High → Low" },
  { value: "newest",    label: "Newest First" },
];

// ─── Filter pill ──────────────────────────────────────────────────────────────
function Pill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 font-mono-tag text-[10px] uppercase px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold"
          : "bg-mall-800 text-cream/60 border-cream/10 hover:border-mall-accent hover:text-cream"
      }`}
    >
      {label}
      {active && <X size={10} />}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const { badges } = useBadges();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeBadge, setActiveBadge] = useState(searchParams.get("badge") || "");
  const [activeFlashSale, setActiveFlashSale] = useState(searchParams.get("flashSale") === "true");
  const [activePurpose, setActivePurpose] = useState(searchParams.get("purpose") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [showSort, setShowSort] = useState(false);
  const searchRef = useRef(null);
  const timerRef = useRef(null);
  const requestSequence = useRef(0);

  // Keep the controls in sync with browser back/forward and shared search URLs.
  useEffect(() => {
    setQuery(searchParams.get("q") || "");
    setActiveBadge(searchParams.get("badge") || "");
    setActiveFlashSale(searchParams.get("flashSale") === "true");
    setActivePurpose(searchParams.get("purpose") || "");
    setSort(searchParams.get("sort") || "");
  }, [searchParams]);

  // Fetch products when filters change
  const fetchProducts = useCallback((q, badge, purpose, sortVal, flashSale, pageNum = 1) => {
    const requestId = pageNum === 1 ? ++requestSequence.current : requestSequence.current;
    if (pageNum === 1) {
      setLoading(true);
      setLoadingMore(false);
      setLoadError("");
      setLoadMoreError("");
    } else {
      setLoadingMore(true);
      setLoadMoreError("");
    }

    const params = { limit: 60, page: pageNum };
    if (q) params.search = q;
    if (flashSale) params.flashSale = true;
    else if (badge) params.badge = badge;
    if (purpose) params.purpose = purpose;
    if (sortVal === "price-asc") { params.sort = "price"; params.order = "asc"; }
    if (sortVal === "price-desc") { params.sort = "price"; params.order = "desc"; }
    if (sortVal === "newest") { params.sort = "createdAt"; params.order = "desc"; }

    api.get("/products", { params })
      .then((res) => {
        if (requestId !== requestSequence.current) return;
        setProducts((prev) => (pageNum === 1 ? res.data.products || [] : [...prev, ...(res.data.products || [])]));
        setPage(res.data.page || pageNum);
        setTotalPages(res.data.pages || 1);
        setTotalResults(res.data.total || 0);
      })
      .catch((error) => {
        if (requestId !== requestSequence.current) return;
        const message = error.response?.data?.message || "Products could not be loaded. Check your connection and try again.";
        if (pageNum === 1) setLoadError(message);
        else setLoadMoreError(message);
      })
      .finally(() => {
        if (requestId !== requestSequence.current) return;
        if (pageNum === 1) setLoading(false);
        else setLoadingMore(false);
      });
  }, []);

  function loadMore() {
    if (loadingMore || page >= totalPages) return;
    fetchProducts(query, activeBadge, activePurpose, sort, activeFlashSale, page + 1);
  }

  // Debounced search on query change
  useEffect(() => {
    clearTimeout(timerRef.current);
    requestSequence.current += 1;
    timerRef.current = setTimeout(() => {
      fetchProducts(query, activeBadge, activePurpose, sort, activeFlashSale);
      // Update URL
      const p = {};
      if (query) p.q = query;
      if (activeFlashSale) p.flashSale = "true";
      else if (activeBadge) p.badge = activeBadge;
      if (activePurpose) p.purpose = activePurpose;
      if (sort) p.sort = sort;
      setSearchParams(p, { replace: true });
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query, activeBadge, activePurpose, sort, activeFlashSale, fetchProducts, setSearchParams]);

  function toggleBadge(val) {
    setActiveBadge((prev) => (prev === val ? "" : val));
    setActiveFlashSale(false);
  }

  function toggleFlashSale() {
    setActiveFlashSale((prev) => !prev);
    setActiveBadge("");
  }

  function togglePurpose(val) {
    setActivePurpose((prev) => (prev === val ? "" : val));
  }

  function clearAll() {
    setQuery("");
    setActiveBadge("");
    setActiveFlashSale(false);
    setActivePurpose("");
    setSort("");
  }

  const hasFilters = query || activeBadge || activeFlashSale || activePurpose || sort;
  const pageTitle = query
    ? `Results for "${query}"`
    : activeFlashSale
    ? "Flash Sale"
    : activeBadge
    ? badges.find((b) => b.slug === activeBadge)?.chipLabel || "Products"
    : activePurpose
    ? `Shop for ${PURPOSES.find((p) => p.value === activePurpose)?.label || ""}`
    : "All Products";

  return (
    <div className="min-h-screen bg-mall-900">

      {/* ── Search hero ────────────────────────────────────────────── */}
      <div className="bg-mall-900 border-b border-cream/5 px-4 sm:px-6 pt-8 pb-6">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2 text-center">
            Search
          </p>
          <h1 className="font-display text-2xl sm:text-3xl text-cream text-center mb-5">
            {pageTitle}
          </h1>

          {/* Search input */}
          <div
            className="flex items-center gap-3 bg-mall-800 rounded-full px-4 sm:px-5 py-3 sm:py-3.5 outline-none focus-within:ring-2 focus-within:ring-mall-accent transition cursor-text mb-5"
            onClick={() => searchRef.current?.focus()}
          >
            <Search size={16} className="text-cream/40 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, brands..."
              className="flex-1 bg-transparent text-cream placeholder-cream/30 text-sm outline-none border-none focus:outline-none focus:ring-0"
              autoComplete="off"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-cream/40 hover:text-cream transition shrink-0">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Badge filters */}
          <div className="mb-3">
            <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-2">Deals</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <Pill label="Flash Sale" active={activeFlashSale} onClick={toggleFlashSale} />
              {badges.map((b) => (
                <Pill key={b._id} label={b.chipLabel} active={activeBadge === b.slug} onClick={() => toggleBadge(b.slug)} />
              ))}
            </div>
          </div>

          {/* Purpose filters */}
          <div className="mb-4">
            <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-2">Purpose</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {PURPOSES.map((p) => (
                <Pill key={p.value} label={p.label} active={activePurpose === p.value} onClick={() => togglePurpose(p.value)} />
              ))}
            </div>
          </div>

          {/* Sort + clear row */}
          <div className="flex items-center justify-between gap-3">
            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSort((s) => !s)}
                className="flex items-center gap-2 text-xs text-cream/50 hover:text-cream transition"
              >
                <ArrowUpDown size={13} />
                {SORT_OPTIONS.find((s) => s.value === sort)?.label || "Sort"}
              </button>
              {showSort && (
                <div className="absolute top-full left-0 mt-2 bg-mall-800 border border-cream/10 rounded-xl overflow-hidden z-20 min-w-[180px] shadow-xl">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSort(opt.value); setShowSort(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs transition ${
                        sort === opt.value ? "text-mall-accent bg-mall-accent/10" : "text-cream/60 hover:text-cream hover:bg-mall-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear all */}
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-xs text-cream/40 hover:text-mall-accent transition"
              >
                <X size={11} /> Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Result count */}
        {!loading && !loadError && (
          <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest mb-5">
            {totalResults === 0 ? "No results" : `${totalResults} product${totalResults !== 1 ? "s" : ""} found`}
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
          </div>
        )}

        {loadError && !loading && (
          <div role="alert" className="py-16 text-center">
            <p className="text-cream/70 text-sm mb-4">{loadError}</p>
            <button onClick={() => fetchProducts(query, activeBadge, activePurpose, sort, activeFlashSale)} className="rounded-full bg-mall-accent px-5 py-2.5 text-sm font-semibold text-mall-900">Retry search</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && products.length === 0 && (
          <div className="py-20 text-center">
            <ShoppingBasket size={48} className="text-cream/10 mx-auto mb-4" />
            <p className="font-display text-2xl text-cream/30 mb-2">Nothing found</p>
            <p className="text-cream/25 text-sm mb-6">
              Try a different search term or remove some filters.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {hasFilters && (
                <button onClick={clearAll} className="text-mall-accent hover:underline text-sm">
                  Clear all filters
                </button>
              )}
              <Link to="/directory" className="text-cream/40 hover:text-mall-accent text-sm transition">
                Browse the directory →
              </Link>
            </div>
          </div>
        )}

        {/* Product grid */}
        {!loading && !loadError && products.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {products.map((p) => (
                <StripProductCard key={p._id} product={p} />
              ))}
            </div>
            {page < totalPages && (
              <div className="flex justify-center mt-8">
                <div className="text-center">
                  {loadMoreError && <p role="alert" className="text-red-300 text-xs mb-3">{loadMoreError}</p>}
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 rounded-full border border-cream/15 text-cream/70 text-sm font-medium hover:border-mall-accent hover:text-cream transition disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : loadMoreError ? "Retry loading more" : `Load more (${products.length} of ${totalResults})`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
