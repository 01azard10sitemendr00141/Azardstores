import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Store } from "lucide-react";
import api from "../../api/client";
import { clearHomeCache } from "../../utils/homeCache";
import AdminLoadError from "../../components/AdminLoadError";
import AdminPagination from "../../components/AdminPagination";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";

const STATUSES = ["open", "closed", "new", "closing-down-sale"];
const EMPTY = { shopNumber: "", name: "", description: "", banner: "", logo: "", status: "open", floor: "", isActive: true };

function ShopForm({ initial, floors, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (!form.shopNumber || !form.name || !form.floor) { setError("Shop number, name and floor are required"); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save shop");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";

  return (
    <form onSubmit={handleSave} className="border border-cream/10 rounded-2xl p-5 bg-mall-800/50 mb-4">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Shop Number</label>
          <input type="number" min="1" step="1" value={form.shopNumber} onChange={(e) => set("shopNumber", e.target.value)} placeholder="e.g. 1" className={inputClass} />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Floor</label>
          <select value={form.floor?._id || form.floor} onChange={(e) => set("floor", e.target.value)} className={inputClass}>
            <option value="">Select floor</option>
            {floors.map((f) => {
              const currentFloorId = form.floor?._id || form.floor;
              const inactive = f.isActive === false;
              return <option key={f._id} value={f._id} disabled={inactive && String(currentFloorId) !== String(f._id)}>
                Floor {f.floorNumber}: {f.name}{inactive ? " (Inactive)" : ""}
              </option>;
            })}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Shop Name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Phone Accessories Hub" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short shop description..." rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Banner Image URL</label>
          <input value={form.banner} onChange={(e) => set("banner", e.target.value)} placeholder="https://..." className={inputClass} />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <input
            id="shop-active"
            type="checkbox"
            checked={form.isActive !== false}
            onChange={(e) => set("isActive", e.target.checked)}
            className="w-4 h-4 rounded accent-mall-accent"
          />
          <label htmlFor="shop-active" className="text-cream/70 text-sm">
            Active <span className="text-cream/30 text-xs">(unchecking removes this shop from the public directory entirely — "Status" above only changes how it's labeled while still visible)</span>
          </label>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50">
          <Check size={13} /> {saving ? "Saving..." : "Save Shop"}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 border border-cream/15 text-cream/50 text-xs px-4 py-2 rounded-lg hover:text-cream transition">
          <X size={13} /> Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminShops() {
  const [shops, setShops] = useState([]);
  const [floors, setFloors] = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(true);
  const [floorsError, setFloorsError] = useState("");
  const [floorsAttempt, setFloorsAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Include inactive floors so existing shop assignments remain visible while
  // preventing inactive floors from being selected for new assignments.
  useEffect(() => {
    let active = true;
    setFloorsLoading(true);
    setFloorsError("");
    api.get("/floors/admin/list")
      .then((res) => { if (active) setFloors(res.data); })
      .catch(() => { if (active) setFloorsError("Floor options could not be loaded."); })
      .finally(() => { if (active) setFloorsLoading(false); });
    return () => { active = false; };
  }, [floorsAttempt]);

  function load() {
    setLoading(true);
    setLoadError("");
    api.get("/shops/admin/list", { params: { search: search || undefined, page, limit: 20 } })
      .then((res) => {
        setShops(res.data.shops);
        setPages(res.data.pages);
      })
      .catch(() => setLoadError("Shops could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [search, page, loadAttempt]);

  async function handleAdd(form) { await api.post("/shops", form); clearHomeCache(); setShowAdd(false); load(); }
  async function handleEdit(id, form) { await api.put(`/shops/${id}`, form); clearHomeCache(); setEditId(null); load(); }
  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/shops/${deleteTarget._id}`);
      clearHomeCache();
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this shop.");
    } finally {
      setDeleting(false);
    }
  }

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  const STATUS_COLOR = { open: "text-emerald-400", closed: "text-cream/40", new: "text-emerald-400", "closing-down-sale": "text-mall-orange" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream/10">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Shops</h1>
        </div>
        <button onClick={() => { setShowAdd(true); setEditId(null); }} disabled={floorsLoading || Boolean(floorsError) || floors.length === 0}
          className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={13} /> Add Shop
        </button>
      </div>

      {floorsLoading && <p role="status" className="mb-4 text-xs text-cream/45">Loading floor options…</p>}
      {floorsError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3">
          <p className="text-sm text-red-200">{floorsError} Shop creation and editing are paused until the options are available.</p>
          <button onClick={() => setFloorsAttempt((attempt) => attempt + 1)} className="shrink-0 text-sm text-mall-accent hover:underline">Retry</button>
        </div>
      )}
      {!floorsLoading && !floorsError && floors.length === 0 && <p className="mb-4 text-xs text-amber-200/80">Create a floor before adding a shop.</p>}

      {deleteError && <p role="alert" className="mb-4 text-sm text-red-400">{deleteError}</p>}
      {showAdd && <ShopForm floors={floors} onSave={handleAdd} onCancel={() => setShowAdd(false)} />}

      <div className="mb-5">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search shops..."
          className="w-full sm:w-72 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : shops.length === 0 ? (
        <div className="py-16 text-center">
          <Store size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No shops yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {shops.map((shop) => (
            <div key={shop._id}>
              {editId === shop._id ? (
                <div className="py-3">
                  <ShopForm initial={shop} floors={floors} onSave={(form) => handleEdit(shop._id, form)} onCancel={() => setEditId(null)} />
                </div>
              ) : (
                <div className="flex items-center gap-4 py-4">
                  {shop.banner ? (
                    <img src={shop.banner} alt={shop.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-mall-800 flex items-center justify-center shrink-0">
                      <Store size={18} className="text-cream/20" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">Shop #{shop.shopNumber}</p>
                      <span className={`font-mono-tag text-[9px] uppercase ${STATUS_COLOR[shop.status] || "text-cream/40"}`}>{shop.status}</span>
                      {shop.isActive === false && (
                        <span className="font-mono-tag text-[9px] uppercase bg-cream/10 text-cream/40 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-cream text-sm font-medium">{shop.name}</p>
                    <p className="text-cream/40 text-xs">Floor {shop.floor?.floorNumber}: {shop.floor?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" aria-label={`Edit ${shop.name}`} title={`Edit ${shop.name}`} onClick={() => { setEditId(shop._id); setShowAdd(false); }} disabled={floorsLoading || Boolean(floorsError) || floors.length === 0}
                      className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-cream flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed">
                      <Pencil size={13} />
                    </button>
                    <button type="button" aria-label={`Delete ${shop.name}`} title={`Delete ${shop.name}`} onClick={() => { setDeleteError(""); setDeleteTarget(shop); }}
                      className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-red-400 flex items-center justify-center transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <AdminPagination page={page} pages={pages} onChange={setPage} />
      {deleteTarget && <AdminConfirmDialog title={`Delete ${deleteTarget.name}?`} description="This shop will be removed from the mall directory." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
    </div>
  );
}
