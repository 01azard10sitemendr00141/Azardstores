import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Store, Package, ShoppingBag, Bell, ArrowRight, TrendingUp, Activity } from "lucide-react";
import api from "../../api/client";
import { connectRealtime } from "../../api/realtime";
import AdminLoadError from "../../components/AdminLoadError";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [liveNotice, setLiveNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [health, setHealth] = useState({ status: "checking", database: "unknown" });

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const response = await api.get("/health", { timeout: 5000 });
        if (active) setHealth(response.data);
      } catch (error) {
        if (!active) return;
        const details = error.response?.data;
        setHealth({
          status: details?.status === "degraded" ? "degraded" : "unavailable",
          database: details?.database || "unknown",
        });
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([
      api.get("/floors"),
      api.get("/shops"),
      api.get("/products", { params: { limit: 1 } }),
      api.get("/orders", { params: { limit: 5 } }),
    ]).then(([floors, shops, products, orders]) => {
      setStats({
        floors: floors.data.length,
        shops: shops.data.length,
        products: products.data.total,
        orders: orders.data.total,
      });
      setRecentOrders(orders.data.orders.slice(0, 5));
    }).catch(() => setLoadError("Overview data could not be loaded."))
      .finally(() => setLoading(false));

  }, [loadAttempt]);

  useEffect(() => {
    const socket = connectRealtime();
    const refreshOverview = () => {
      if (!document.hidden) setLoadAttempt((attempt) => attempt + 1);
    };
    const handleNewOrder = (data) => {
      setLiveNotice(`New order — KSh ${data.totalAmount?.toLocaleString()} via ${data.channel}`);
      setTimeout(() => setLiveNotice(null), 6000);
      refreshOverview();
    };
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshOverview();
      else hasConnectedOnce = true;
    });
    socket.on("new-order", handleNewOrder);
    [
      "order-status-updated",
      "order-details-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
      "store-balance-updated",
    ].forEach((eventName) => socket.on(eventName, refreshOverview));

    const onVisibilityChange = () => {
      if (!document.hidden) refreshOverview();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => {
      if (!socket.connected && !document.hidden) refreshOverview();
    }, 15000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket.disconnect();
    };
  }, []);

  const STATS = [
    { label: "Floors",   key: "floors",   icon: Layers,      to: "/admin/floors"   },
    { label: "Shops",    key: "shops",    icon: Store,       to: "/admin/shops"    },
    { label: "Products", key: "products", icon: Package,     to: "/admin/products" },
    { label: "Orders",   key: "orders",   icon: ShoppingBag, to: "/admin/orders"   },
  ];

  const STATUS_COLOR = {
    pending:   "text-mall-accent",
    confirmed: "text-blue-400",
    shipped:   "text-purple-400",
    delivered: "text-emerald-400",
    cancelled: "text-red-400",
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-cream/10">
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">Admin</p>
        <h1 className="font-display text-3xl text-cream">Mall Overview</h1>
        <p className="text-cream/40 text-sm mt-1">Manage your floors, shops, products and orders.</p>
      </div>

      <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-cream/10 bg-mall-800/50 px-4 py-3">
        <Activity size={15} className={`mt-0.5 shrink-0 ${health.status === "ok" ? "text-emerald-300" : health.status === "checking" ? "text-cream/40" : "text-amber-200"}`} />
        <div>
          <p className="text-xs font-medium text-cream/75">
            {health.status === "ok" ? "API connected · database connected" : health.status === "degraded" ? "API responding · database disconnected" : health.status === "checking" ? "Checking API and database…" : "API health unavailable"}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-cream/35">This checks the API and database connection only. It does not test payment, email, or live delivery services.</p>
        </div>
      </div>

      {loadError && <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />}

      {/* Live order notification */}
      {!loadError && liveNotice && (
        <div className="flex items-center gap-3 bg-mall-accent/10 border border-mall-accent/20 text-mall-accent rounded-xl px-4 py-3 mb-6 text-sm">
          <Bell size={15} className="shrink-0 animate-pulse" />
          {liveNotice}
        </div>
      )}

      {/* Stats grid */}
      {!loadError && (loading ? (
        <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4" role="status" aria-label="Loading overview statistics">
          <span className="sr-only">Loading overview statistics…</span>
          {STATS.map(({ label }) => (
            <div key={label} aria-hidden="true" className="animate-pulse rounded-xl border border-cream/8 bg-mall-800 p-4 sm:p-5">
              <div className="mb-5 h-4 w-4 rounded bg-cream/10" />
              <div className="mb-2 h-8 w-16 rounded bg-cream/10" />
              <div className="h-2 w-20 rounded bg-cream/5" />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.label}
                to={s.to}
                className="group rounded-xl border border-cream/8 bg-mall-800 p-4 transition hover:border-mall-accent sm:p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Icon size={16} className="text-mall-accent" />
                  <ArrowRight size={12} className="text-cream/20 transition group-hover:text-mall-accent" />
                </div>
                <p className="mb-1 font-display text-3xl text-cream">{stats[s.key]}</p>
                <p className="font-mono-tag text-[10px] uppercase tracking-widest text-cream/40">{s.label}</p>
              </Link>
            );
          })}
        </div>
      ))}

      {/* Recent orders */}
      {!loadError && <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-cream/10">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-mall-accent" />
            <h2 className="font-display text-lg text-cream">Recent Orders</h2>
          </div>
          <Link to="/admin/orders" className="flex items-center gap-1 text-xs text-cream/40 hover:text-mall-accent transition">
            View all <ArrowRight size={11} />
          </Link>
        </div>

        {loading ? (
          <div role="status" aria-label="Loading recent orders" className="flex items-center justify-center py-12">
            <span className="sr-only">Loading recent orders…</span>
            <div aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-mall-accent/30 border-t-mall-accent" />
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="text-cream/30 text-sm py-8 text-center">No orders yet.</p>
        ) : (
          <div className="divide-y divide-cream/8">
            {recentOrders.map((order) => (
              <div key={order._id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-mono-tag text-[10px] uppercase text-cream/40 mb-0.5">
                    #{order._id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-cream text-sm">
                    {order.user?.name || order.guestInfo?.name || "Guest"}
                  </p>
                  <p className="text-cream/30 text-xs">
                    {new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                    {" · "}{order.items?.length} item{order.items?.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-base text-cream">KSh {order.totalAmount?.toLocaleString()}</p>
                  <p className={`font-mono-tag text-[9px] uppercase ${STATUS_COLOR[order.status] || "text-cream/40"}`}>
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
