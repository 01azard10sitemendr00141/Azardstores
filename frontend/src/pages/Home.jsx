import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";

export default function Home() {
  const [floors, setFloors] = useState([]);
  const [flashSale, setFlashSale] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/floors"),
      api.get("/products", { params: { flashSale: true, limit: 8 } }),
      api.get("/products", { params: { badge: "best-seller", limit: 8 } }),
    ])
      .then(([floorsRes, flashRes, bestRes]) => {
        setFloors(floorsRes.data);
        setFlashSale(flashRes.data.products);
        setBestSellers(bestRes.data.products);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero - the mall's thesis: this is a real place with real floors */}
      <section className="bg-mall-900 text-cream">
        <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="font-mono-tag text-xs uppercase text-mall-accent mb-3">
              10 Floors · Every Shop Numbered
            </p>
            <h1 className="font-display text-4xl md:text-5xl leading-tight mb-4">
              One mall. Every floor. Everything you need.
            </h1>
            <p className="text-cream/70 mb-6 max-w-md">
              Browse ShopRight Mall the way you'd walk through a real one — floor by floor, shop by
              shop. Find your product, find its address, and order it your way.
            </p>
            <div className="flex gap-3">
              <Link
                to="/directory"
                className="bg-mall-accent text-mall-900 font-medium px-5 py-3 rounded-md hover:bg-mall-accentDark transition"
              >
                View Mall Directory
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="grid grid-cols-2 gap-2">
              {floors.slice(0, 6).map((floor) => (
                <Link
                  key={floor._id}
                  to={`/floor/${floor.slug}`}
                  className="bg-mall-800 border border-mall-700 rounded-lg p-4 hover:border-mall-accent transition"
                >
                  <div className="text-2xl mb-1">{floor.icon}</div>
                  <div className="font-mono-tag text-[10px] text-mall-accent">FLOOR {floor.floorNumber}</div>
                  <div className="text-sm font-medium">{floor.name}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4">
        {/* Flash Sale */}
        {flashSale.length > 0 && (
          <section className="py-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-2xl text-mall-900">⚡ Flash Sale</h2>
              <Link to="/search?q=" className="text-sm text-mall-accentDark hover:underline">
                See all
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {flashSale.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <section className="py-10">
            <h2 className="font-display text-2xl text-mall-900 mb-4">Best Sellers Across the Mall</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {bestSellers.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Browse by Floor - full list */}
        <section className="py-10">
          <h2 className="font-display text-2xl text-mall-900 mb-4">Browse by Floor</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {floors.map((floor) => (
              <Link
                key={floor._id}
                to={`/floor/${floor.slug}`}
                className="bg-white border border-mall-900/10 rounded-lg p-4 text-center hover:border-mall-accent hover:shadow-sm transition"
              >
                <div className="text-3xl mb-2">{floor.icon}</div>
                <div className="font-mono-tag text-[10px] text-mall-accentDark">FLOOR {floor.floorNumber}</div>
                <div className="text-sm font-medium text-mall-900">{floor.name}</div>
              </Link>
            ))}
          </div>
        </section>

        {loading && <p className="text-center text-mall-900/40 py-10">Loading the mall...</p>}
      </div>
    </div>
  );
}
