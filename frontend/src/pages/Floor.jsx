import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Shirt, Cpu, Sparkles, ShoppingBasket, Sofa,
  Dumbbell, Blocks, Gem, BookOpen, Wrench,
  Store, Package, ChevronRight, Clock,
} from "lucide-react";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";
import { updatePageMetadata } from "../utils/updatePageMetadata";

const FLOOR_ICONS = {
  1: Shirt, 2: Cpu, 3: Sparkles, 4: ShoppingBasket,
  5: Sofa, 6: Dumbbell, 7: Blocks, 8: Gem, 9: BookOpen, 10: Wrench,
};

// ─── Shop card — large image, full presence ───────────────────────────────────
function ShopCard({ shop }) {
  return (
    <Link
      to={`/shop/${shop.slug}`}
      className="group relative rounded-2xl overflow-hidden bg-mall-800 hover:ring-2 hover:ring-mall-accent transition block"
    >
      {/* Banner — tall aspect ratio so image is prominent */}
      <div className="aspect-[4/3] overflow-hidden bg-mall-700 relative">
        {shop.banner ? (
          <img
            src={shop.banner}
            alt={shop.name}
            onError={(e) => e.currentTarget.remove()}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store size={40} className="text-cream/20" />
          </div>
        )}

        {/* Shop number — top left */}
        <span className="absolute top-3 left-3 font-mono-tag text-[10px] uppercase bg-mall-900/80 backdrop-blur-sm text-mall-orange px-2.5 py-1 rounded-full">
          Shop #{shop.shopNumber}
        </span>

        {/* Status — top right */}
        {shop.status === "new" && (
          <span className="absolute top-3 right-3 font-mono-tag text-[10px] uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full font-semibold">New</span>
        )}
        {shop.status === "closing-down-sale" && (
          <span className="absolute top-3 right-3 font-mono-tag text-[10px] uppercase bg-mall-orange text-mall-900 px-2.5 py-1 rounded-full font-semibold">Sale</span>
        )}
        {shop.status === "closed" && (
          <span className="absolute top-3 right-3 font-mono-tag text-[10px] uppercase bg-cream/20 text-cream/60 px-2.5 py-1 rounded-full">Closed</span>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      {/* Shop info below image */}
      <div className="p-4">
        <h3 className="font-display text-cream text-lg sm:text-xl group-hover:text-mall-accent transition leading-tight mb-1">
          {shop.name}
        </h3>
        {shop.description && (
          <p className="text-cream/50 text-sm leading-relaxed line-clamp-2">{shop.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-3 text-mall-accent text-xs font-medium">
          Visit shop <ChevronRight size={12} className="group-hover:translate-x-1 transition" />
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Floor() {
  const { slug } = useParams();
  const [floor, setFloor] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopsLoadError, setShopsLoadError] = useState(false);
  const [floorLoadError, setFloorLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!floor) return;
    const title = `Floor ${floor.floorNumber}: ${floor.name} | Azard Stores`;
    const description = String(floor.description || `Explore shops and products on Floor ${floor.floorNumber}: ${floor.name} at Azard Stores.`)
      .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    const url = `${window.location.origin}/floor/${encodeURIComponent(floor.slug || slug)}`;
    let image = "";
    if (floor.image) try { image = new URL(floor.image, window.location.origin).href; } catch { image = ""; }
    updatePageMetadata({ title, description, url, image });
  }, [floor, slug]);

  useEffect(() => {
    let active = true;
    let floorLoaded = false;
    setLoading(true);
    setFloor(null);
    setShops([]);
    setShopsLoadError(false);
    setFloorLoadError(false);
    window.scrollTo(0, 0);
    api.get(`/floors/${slug}`).then((res) => {
      if (!active) return null;
      setFloor(res.data);
      floorLoaded = true;
      if (res.data.isActive === false) return null;
      return api.get("/shops", { params: { floor: res.data._id } });
    }).then((shopsRes) => {
      if (active && shopsRes) setShops(shopsRes.data);
    }).catch((err) => {
      if (!active) return;
      if (floorLoaded) setShopsLoadError(true);
      else if (err.response?.status !== 404) setFloorLoadError(true);
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

  if (!floor) {
    return (
      <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center gap-3 px-4">
        <Package size={40} className="text-cream/20" />
        <p className="font-display text-xl text-cream/40">{floorLoadError ? "This floor couldn’t be loaded" : "Floor not found"}</p>
        {floorLoadError && <button onClick={() => setRetry((value) => value + 1)} className="text-mall-accent hover:underline text-sm">Try again</button>}
        <Link to="/directory" className="text-mall-accent hover:underline text-sm">Back to directory</Link>
      </div>
    );
  }

  const Icon = FLOOR_ICONS[floor.floorNumber] || Store;
  const openShops = shops.filter((s) => s.status !== "closed");
  const closedShops = shops.filter((s) => s.status === "closed");

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Breadcrumbs */}
        <Breadcrumbs crumbs={[
          { label: "Mall Directory", to: "/directory" },
          { label: `Floor ${floor.floorNumber}: ${floor.name}` },
        ]} />

        {/* ── Floor identity ─────────────────────────────────────────── */}
        <div className="mt-6 mb-8 sm:mb-10 pb-8 border-b border-cream/10">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-12 h-12 rounded-2xl bg-mall-800 text-mall-accent flex items-center justify-center shrink-0">
              <Icon size={22} />
            </span>
            <span className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest">
              Floor {floor.floorNumber}
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-cream leading-tight mb-4">
            {floor.name}
          </h1>

          {/* Floor cover image */}
          {floor.image && (
            <div className="aspect-[21/9] rounded-2xl overflow-hidden mb-5">
              <img src={floor.image} alt={floor.name} onError={(e) => e.currentTarget.remove()} className="w-full h-full object-cover" />
            </div>
          )}

          {floor.isActive !== false && (
            <div className="flex items-center gap-4 sm:gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-cream/50">
                <Store size={13} className="text-mall-accent shrink-0" />
                <span>{shops.length} shop{shops.length !== 1 ? "s" : ""} on this floor</span>
              </div>
              {openShops.length > 0 && (
                <div className="flex items-center gap-1.5 text-cream/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>{openShops.length} open now</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Shops grid ─────────────────────────────────────────────── */}
        {floor.isActive === false ? (
          <div className="py-20 text-center">
            <Clock size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="font-display text-xl text-cream/60">This floor is temporarily closed</p>
            <p className="text-cream/30 text-sm mt-1">Check back soon, or browse the rest of the mall in the meantime.</p>
            <Link to="/directory" className="inline-flex items-center gap-1.5 text-mall-accent text-sm mt-6 hover:underline">
              Browse other floors <ChevronRight size={13} />
            </Link>
          </div>
        ) : shopsLoadError ? (
          <div role="alert" className="py-20 text-center">
            <Store size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/40 font-display text-xl">Shops couldn’t be loaded</p>
            <p className="text-cream/30 text-sm mt-1">Please try again in a moment.</p>
            <button onClick={() => setRetry((value) => value + 1)} className="text-mall-accent hover:underline text-sm mt-4">Try again</button>
          </div>
        ) : shops.length === 0 ? (
          <div className="py-20 text-center">
            <Store size={40} className="text-cream/20 mx-auto mb-3" />
            <p className="text-cream/40 font-display text-xl">No shops yet</p>
            <p className="text-cream/30 text-sm mt-1">This floor is being set up — check back soon.</p>
            <Link to="/directory" className="inline-flex items-center gap-1.5 text-mall-accent text-sm mt-6 hover:underline">
              Browse other floors <ChevronRight size={13} />
            </Link>
          </div>
        ) : (
          <>
            {/* Open shops */}
            {openShops.length > 0 && (
              <div className="mb-10">
                <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-5">
                  Open now · {openShops.length} {openShops.length === 1 ? "shop" : "shops"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {openShops.map((shop) => <ShopCard key={shop._id} shop={shop} />)}
                </div>
              </div>
            )}

            {/* Closed shops */}
            {closedShops.length > 0 && (
              <div className="opacity-50 mt-8">
                <p className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest mb-5">
                  Closed · {closedShops.length} {closedShops.length === 1 ? "shop" : "shops"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {closedShops.map((shop) => <ShopCard key={shop._id} shop={shop} />)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Back to directory ──────────────────────────────────────── */}
        <div className="border-t border-cream/10 pt-8 mt-12">
          <Link to="/directory" className="inline-flex items-center gap-2 text-cream/40 hover:text-mall-accent transition text-sm">
            <ChevronRight size={13} className="rotate-180" />
            Back to Mall Directory
          </Link>
        </div>
      </div>
    </div>
  );
}
