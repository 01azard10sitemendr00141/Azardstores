import { useEffect, useState } from "react";
import { Users, Mail, Phone, CheckCircle, XCircle, ChevronRight, ArrowLeft, ArrowUpRight, Package } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import AdminPagination from "../../components/AdminPagination";
import AdminLoadError from "../../components/AdminLoadError";

// ─── Customer detail view — profile + order history ────────────────────────
function CustomerDetail({ userId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    api.get(`/auth/admin/users/${userId}`).then((res) => setData(res.data))
      .catch(() => setLoadError("Customer details could not be loaded."))
      .finally(() => setLoading(false));
  }, [userId, loadAttempt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return <AdminLoadError message={loadError || "Customer details are unavailable."} onRetry={() => setLoadAttempt((n) => n + 1)} />;
  const { user, orders } = data;
  const completedSpend = orders.reduce((sum, order) => {
    if (order.paymentStatus !== "paid" || !["delivered", "collected"].includes(order.status)) return sum;
    return sum + (Number(order.totalAmount) || 0);
  }, 0);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-cream/50 hover:text-cream text-xs mb-5 transition">
        <ArrowLeft size={13} /> Back to customers
      </button>

      <div className="border border-cream/10 rounded-2xl p-5 mb-6">
        <h2 className="font-display text-xl text-cream mb-3">{user.name}</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-cream/60">
            <Mail size={13} className="text-mall-accent shrink-0" />
            {user.email}
            {user.isEmailVerified
              ? <CheckCircle size={12} className="text-emerald-400 shrink-0" />
              : <XCircle size={12} className="text-cream/30 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-cream/60">
            <Phone size={13} className="text-mall-accent shrink-0" />
            {user.phone || "—"}
            {user.phone && (user.isPhoneVerified
              ? <CheckCircle size={12} className="text-emerald-400 shrink-0" />
              : <XCircle size={12} className="text-cream/30 shrink-0" />)}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-cream/10 text-sm">
          <div>
            <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-0.5">Orders</p>
            <p className="text-cream font-medium">{orders.length}</p>
          </div>
          <div>
            <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-0.5">Completed spend</p>
            <p className="text-cream font-medium">KSh {completedSpend.toLocaleString()}</p>
            <p className="text-cream/40 text-xs mt-1">Paid and delivered or collected orders only.</p>
          </div>
          <div>
            <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-0.5">Joined</p>
            <p className="text-cream font-medium">
              {new Date(user.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
      </div>

      <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">Order History</p>
      {orders.length === 0 ? (
        <p className="text-cream/30 text-sm py-8 text-center">No orders yet.</p>
      ) : (
        <div className="divide-y divide-cream/8">
          {orders.map((order) => (
            <div key={order._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 py-4">
              <div>
                <p className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest">
                  #{order._id.slice(-6).toUpperCase()}
                </p>
                <p className="text-cream/40 text-xs mt-0.5">
                  {new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}{order.status}
                </p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4">
                <p className="font-display text-base text-cream">KSh {order.totalAmount?.toLocaleString()}</p>
                <Link
                  to={`/admin/orders?search=${encodeURIComponent(order._id)}`}
                  className="inline-flex items-center gap-1 text-xs text-mall-accent hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent rounded-sm transition"
                >
                  Open in Orders <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main customer list ──────────────────────────────────────────────────────
export default function AdminCustomers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    api.get("/auth/admin/users", { params: { search: search || undefined, page, limit: 20 } })
      .then((res) => {
        setUsers(res.data.users);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch(() => setLoadError("Customers could not be loaded."))
      .finally(() => setLoading(false));
  }, [search, page, loadAttempt]);

  if (selectedId) {
    return <CustomerDetail userId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream/10">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Customers</h1>
        </div>
        <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest">{total} total</p>
      </div>

      <div className="mb-5">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email..."
          className="w-full sm:w-72 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : users.length === 0 ? (
        <div className="py-16 text-center">
          <Users size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No customers found.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => setSelectedId(user.id)}
              className="w-full flex items-center justify-between gap-4 py-4 text-left hover:bg-cream/5 transition rounded-lg px-2 -mx-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-cream text-sm font-medium">{user.name}</p>
                  {user.role === "admin" && (
                    <span className="font-mono-tag text-[9px] uppercase bg-mall-orange/20 text-mall-orange px-2 py-0.5 rounded-full">Admin</span>
                  )}
                </div>
                <p className="text-cream/40 text-xs mt-0.5">{user.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {user.isEmailVerified
                  ? <CheckCircle size={14} className="text-emerald-400" />
                  : <XCircle size={14} className="text-cream/20" />}
                <ChevronRight size={14} className="text-cream/20" />
              </div>
            </button>
          ))}
        </div>
      )}
      <AdminPagination page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
