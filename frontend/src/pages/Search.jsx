import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";
import Breadcrumbs from "../components/Breadcrumbs";

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/products", { params: q ? { search: q, limit: 40 } : { limit: 40 } })
      .then((res) => setProducts(res.data.products))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs crumbs={[{ label: "Search Results" }]} />
      <h1 className="font-display text-2xl text-mall-900 mb-6">
        {q ? `Results for "${q}"` : "All Products"}
      </h1>

      {loading ? (
        <p className="text-mall-900/40">Searching the mall...</p>
      ) : products.length === 0 ? (
        <p className="text-mall-900/50">No products found. Try a different search.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
