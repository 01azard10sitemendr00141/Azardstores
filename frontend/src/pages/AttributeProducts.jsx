import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Package, Tag } from "lucide-react";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";
import StripProductCard from "../components/StripProductCard";

// ─── Browse-by-attribute page ──────────────────────────────────────────────────
// Used for brand, category, and subcategory routes — "attribute" tells it which
// product field to match against. The backend
// filters exactly (case-insensitively) on this field, so unlike the old
// version of this page, results aren't capped by however many products
// happened to fit in one over-fetched batch.
export default function AttributeProducts({ attribute, parentAttribute, label }) {
  const { name, category } = useParams();
  // React Router already URL-decodes route params, so use it as-is.
  // (Re-decoding here would throw on names containing a literal "%".)
  const decoded = (name || "").trim();
  const decodedParent = (category || "").trim();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadingMore(false);
    setLoadError("");
    setLoadMoreError("");
    setProducts([]);
    setPage(1);
    window.scrollTo(0, 0);
    api.get("/products", { params: { [attribute]: decoded, ...(parentAttribute && decodedParent ? { [parentAttribute]: decodedParent } : {}), limit: 40, page: 1 } })
      .then((res) => {
        if (generation !== requestGeneration.current) return;
        setProducts(res.data.products || []);
        setTotalPages(res.data.pages || 1);
        setTotal(res.data.total || 0);
      })
      .catch(() => {
        if (generation === requestGeneration.current) setLoadError("Products could not be loaded. Check your connection and try again.");
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
    return () => {
      if (requestGeneration.current === generation) requestGeneration.current += 1;
    };
  }, [attribute, parentAttribute, decoded, decodedParent, retry]);

  function loadMore() {
    setLoadingMore(true);
    setLoadMoreError("");
    const nextPage = page + 1;
    const generation = requestGeneration.current;
    api.get("/products", { params: { [attribute]: decoded, ...(parentAttribute && decodedParent ? { [parentAttribute]: decodedParent } : {}), limit: 40, page: nextPage } })
      .then((res) => {
        if (generation !== requestGeneration.current) return;
        setProducts((prev) => [...prev, ...(res.data.products || [])]);
        setPage(nextPage);
      })
      .catch(() => {
        if (generation === requestGeneration.current) setLoadMoreError("More products could not be loaded. Please try again.");
      })
      .finally(() => {
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

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Breadcrumbs */}
        <Breadcrumbs crumbs={[
          { label: "Home", to: "/" },
          { label: "Directory", to: "/directory" },
          ...(parentAttribute && decodedParent ? [{ label: decodedParent, to: `/categories/${encodeURIComponent(decodedParent)}` }] : []),
          { label: decoded },
        ]} />

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mt-6 mb-8 sm:mb-10 pb-8 border-b border-cream/10">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">
            {label}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-cream leading-tight mb-3">
            {decoded}
          </h1>
          <div className="flex items-center gap-1.5 text-cream/50 text-sm">
            <Package size={13} className="text-mall-accent shrink-0" />
            <span>{total} product{total !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* ── Products ───────────────────────────────────────────────── */}
        {loadError ? (
          <div className="py-20 text-center">
            <Package size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/60 font-display text-xl">We couldn’t load these products</p>
            <p className="text-cream/35 text-sm mt-1">{loadError}</p>
            <button onClick={() => setRetry((value) => value + 1)} className="inline-flex items-center gap-2 mt-4 text-mall-accent hover:underline text-sm">
              Try again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center">
            <Tag size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/40 font-display text-xl">No products found</p>
            <p className="text-cream/30 text-sm mt-1">
              Nothing matches this {label.toLowerCase()} right now.
            </p>
            <Link to="/directory" className="inline-block mt-4 text-mall-accent hover:underline text-sm">
              Browse the mall →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {products.map((p) => <StripProductCard key={p._id} product={p} />)}
            </div>
            {page < totalPages && (
              <div className="flex flex-col items-center mt-8 gap-2">
                {loadMoreError && <p role="status" className="text-sm text-red-300">{loadMoreError}</p>}
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-full border border-cream/15 text-cream/70 text-sm font-medium hover:border-mall-accent hover:text-cream transition disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : loadMoreError ? "Retry loading more" : `Load more (${products.length} of ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
