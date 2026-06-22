import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";
import ProductCard from "../components/ProductCard";

export default function Shop() {
  const { slug } = useParams();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/shops/${slug}`).then((res) => {
      setShop(res.data);
      api.get("/products", { params: { shop: res.data._id, limit: 50 } }).then((prodRes) => {
        setProducts(prodRes.data.products);
        setLoading(false);
      });
    });
  }, [slug]);

  if (loading) return <p className="text-center py-16 text-mall-900/40">Loading shop...</p>;
  if (!shop) return <p className="text-center py-16 text-mall-900/40">Shop not found.</p>;

  return (
    <div>
      {/* Shop storefront banner */}
      <div className="bg-mall-800 text-cream">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <Breadcrumbs
            crumbs={[
              { label: "Mall Directory", to: "/directory" },
              { label: `Floor ${shop.floor?.floorNumber}`, to: `/floor/${shop.floor?.slug}` },
              { label: `Shop #${shop.shopNumber}` },
            ]}
          />
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono-tag text-xs bg-mall-accent text-mall-900 rounded px-2 py-1">
              Shop #{shop.shopNumber}
            </span>
            {shop.status !== "open" && (
              <span className="font-mono-tag text-xs uppercase text-mall-accent">
                {shop.status.replace(/-/g, " ")}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl">{shop.name}</h1>
          <p className="text-cream/70 mt-2 max-w-xl">{shop.description}</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="font-display text-xl text-mall-900 mb-4">Products in this shop</h2>
        {products.length === 0 ? (
          <p className="text-mall-900/50">No products listed in this shop yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
