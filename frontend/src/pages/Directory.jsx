import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";

export default function Directory() {
  const [floors, setFloors] = useState([]);
  const [shopsByFloor, setShopsByFloor] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/floors"), api.get("/shops")]).then(([floorsRes, shopsRes]) => {
      setFloors(floorsRes.data);
      const grouped = {};
      shopsRes.data.forEach((shop) => {
        const floorId = shop.floor?._id;
        if (!grouped[floorId]) grouped[floorId] = [];
        grouped[floorId].push(shop);
      });
      setShopsByFloor(grouped);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs crumbs={[{ label: "Mall Directory" }]} />
      <h1 className="font-display text-3xl text-mall-900 mb-2">Mall Directory</h1>
      <p className="text-mall-900/60 mb-8">Every floor, every shop, every number — just like the real thing.</p>

      {loading && <p className="text-mall-900/40">Loading directory...</p>}

      <div className="space-y-8">
        {floors.map((floor) => {
          const shops = shopsByFloor[floor._id] || [];
          return (
            <div key={floor._id} className="bg-white rounded-xl border border-mall-900/10 p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{floor.icon}</span>
                <div>
                  <span className="font-mono-tag text-xs text-mall-accentDark">FLOOR {floor.floorNumber}</span>
                  <Link to={`/floor/${floor.slug}`} className="block font-display text-xl text-mall-900 hover:text-mall-accentDark transition">
                    {floor.name}
                  </Link>
                </div>
              </div>

              {shops.length === 0 ? (
                <p className="text-sm text-mall-900/40">No shops on this floor yet.</p>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {shops.map((shop) => (
                    <Link
                      key={shop._id}
                      to={`/shop/${shop.slug}`}
                      className="flex items-start gap-3 border border-mall-900/10 rounded-lg p-3 hover:border-mall-accent transition"
                    >
                      <span className="font-mono-tag text-xs bg-mall-900 text-cream rounded px-2 py-1 shrink-0">
                        #{shop.shopNumber}
                      </span>
                      <div>
                        <div className="font-medium text-sm text-mall-900">{shop.name}</div>
                        <div className="text-xs text-mall-900/50 line-clamp-1">{shop.description}</div>
                        {shop.status !== "open" && (
                          <span className="text-[10px] uppercase font-mono-tag text-mall-accentDark">
                            {shop.status.replace(/-/g, " ")}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
