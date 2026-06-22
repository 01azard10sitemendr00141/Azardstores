import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";

export default function Floor() {
  const { slug } = useParams();
  const [floor, setFloor] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/floors/${slug}`).then((res) => {
      setFloor(res.data);
      api.get("/shops", { params: { floor: res.data._id } }).then((shopsRes) => {
        setShops(shopsRes.data);
        setLoading(false);
      });
    });
  }, [slug]);

  if (loading) return <p className="text-center py-16 text-mall-900/40">Loading floor...</p>;
  if (!floor) return <p className="text-center py-16 text-mall-900/40">Floor not found.</p>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs crumbs={[{ label: "Mall Directory", to: "/directory" }, { label: `Floor ${floor.floorNumber}: ${floor.name}` }]} />

      <div className="flex items-center gap-3 mb-8">
        <span className="text-4xl">{floor.icon}</span>
        <div>
          <span className="font-mono-tag text-xs text-mall-accentDark">FLOOR {floor.floorNumber}</span>
          <h1 className="font-display text-3xl text-mall-900">{floor.name}</h1>
        </div>
      </div>

      {shops.length === 0 ? (
        <p className="text-mall-900/50">No shops have opened on this floor yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {shops.map((shop) => (
            <Link
              key={shop._id}
              to={`/shop/${shop.slug}`}
              className="bg-white rounded-xl border border-mall-900/10 p-5 hover:border-mall-accent hover:shadow-sm transition"
            >
              <span className="font-mono-tag text-xs bg-mall-900 text-cream rounded px-2 py-1">
                Shop #{shop.shopNumber}
              </span>
              <h3 className="font-display text-lg text-mall-900 mt-3">{shop.name}</h3>
              <p className="text-sm text-mall-900/60 mt-1 line-clamp-2">{shop.description}</p>
              {shop.status !== "open" && (
                <span className="inline-block mt-2 text-[10px] uppercase font-mono-tag text-mall-accentDark">
                  {shop.status.replace(/-/g, " ")}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
