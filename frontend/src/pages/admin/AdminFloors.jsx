import { useEffect, useId, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Layers } from "lucide-react";
import api from "../../api/client";
import { clearHomeCache } from "../../utils/homeCache";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";

const EMPTY = { floorNumber: "", name: "", icon: "", image: "", order: "", isActive: true };

function FloorForm({ initial, onSave, onCancel }) {
  const formId = useId().replace(/:/g, "");
  const fieldId = (name) => `${formId}-${name}`;
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (!form.floorNumber || !form.name) { setError("Floor number and name are required"); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save floor");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";

  return (
    <form onSubmit={handleSave} className="border border-cream/10 rounded-2xl p-5 bg-mall-800/50 mb-4">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label htmlFor={fieldId("number")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Floor Number</label>
          <input id={fieldId("number")} type="number" min="1" step="1" value={form.floorNumber} onChange={(e) => set("floorNumber", e.target.value)} placeholder="e.g. 1" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("name")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Floor Name</label>
          <input id={fieldId("name")} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Fashion & Clothing" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("icon")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Icon (emoji)</label>
          <input id={fieldId("icon")} value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="e.g. 👗" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("order")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Display Order</label>
          <input id={fieldId("order")} type="number" value={form.order} onChange={(e) => set("order", e.target.value)} placeholder="e.g. 1" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("image")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Cover Image URL</label>
          <input id={fieldId("image")} value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://..." className={inputClass} />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <input
            id={fieldId("active")}
            type="checkbox"
            checked={form.isActive !== false}
            onChange={(e) => set("isActive", e.target.checked)}
            className="w-4 h-4 rounded accent-mall-accent"
          />
          <label htmlFor={fieldId("active")} className="text-cream/70 text-sm">
            Active <span className="text-cream/30 text-xs">(unchecking removes it from Directory/homepage navigation and shows a "temporarily closed" page on its own floor page — its shops stay reachable everywhere else)</span>
          </label>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50">
          <Check size={13} /> {saving ? "Saving..." : "Save Floor"}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 border border-cream/15 text-cream/50 text-xs px-4 py-2 rounded-lg hover:text-cream transition">
          <X size={13} /> Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminFloors() {
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    api.get("/floors/admin/list", { params: { search: search || undefined } })
      .then((res) => setFloors(res.data))
      .catch(() => setLoadError("Floors could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [search, loadAttempt]);

  async function handleAdd(form) {
    await api.post("/floors", form);
    clearHomeCache();
    setShowAdd(false);
    load();
  }

  async function handleEdit(id, form) {
    await api.put(`/floors/${id}`, form);
    clearHomeCache();
    setEditId(null);
    load();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/floors/${deleteTarget._id}`);
      clearHomeCache();
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this floor.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream/10">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Floors</h1>
        </div>
        <button onClick={() => { setShowAdd(true); setEditId(null); }}
          className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition">
          <Plus size={13} /> Add Floor
        </button>
      </div>

      {deleteError && <p role="alert" className="mb-4 text-sm text-red-400">{deleteError}</p>}
      {showAdd && <FloorForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />}

      <div className="mb-5">
        <label htmlFor="floor-search" className="sr-only">Search floors</label>
        <input
          id="floor-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search floors..."
          className="w-full sm:w-72 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : floors.length === 0 ? (
        <div className="py-16 text-center">
          <Layers size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No floors yet. Add your first floor above.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {floors.map((floor) => (
            <div key={floor._id}>
              {editId === floor._id ? (
                <div className="py-3">
                  <FloorForm initial={floor} onSave={(form) => handleEdit(floor._id, form)} onCancel={() => setEditId(null)} />
                </div>
              ) : (
                <div className="flex items-center gap-4 py-4">
                  {floor.image ? (
                    <img src={floor.image} alt={floor.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-mall-800 flex items-center justify-center shrink-0 text-xl">{floor.icon}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">Floor {floor.floorNumber}</p>
                      {floor.isActive === false && (
                        <span className="font-mono-tag text-[9px] uppercase bg-cream/10 text-cream/40 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-cream text-sm font-medium">{floor.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" aria-label={`Edit ${floor.name}`} title={`Edit ${floor.name}`} onClick={() => { setEditId(floor._id); setShowAdd(false); }}
                      className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-cream flex items-center justify-center transition">
                      <Pencil size={13} />
                    </button>
                      <button type="button" aria-label={`Delete ${floor.name}`} title={`Delete ${floor.name}`} onClick={() => { setDeleteError(""); setDeleteTarget(floor); }}
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
      {deleteTarget && <AdminConfirmDialog title={`Delete ${deleteTarget.name || "this floor"}?`} description="This action cannot be undone. Any linked shop constraints will be reported by the server." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
    </div>
  );
}
