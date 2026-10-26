import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Award } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";

function NameForm({ initial = "", placeholder, onSave, onCancel, saveLabel = "Save" }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (!value.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      await onSave(value.trim());
    } catch (err) {
      setError(err.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-mall-800 border border-cream/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
      <button type="submit" disabled={saving}
        className="flex items-center gap-1 bg-mall-accent text-mall-900 font-semibold text-xs px-3 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50 shrink-0">
        <Check size={12} /> {saving ? "..." : saveLabel}
      </button>
      <button type="button" onClick={onCancel}
        className="flex items-center gap-1 border border-cream/15 text-cream/50 text-xs px-3 py-2 rounded-lg hover:text-cream transition shrink-0">
        <X size={12} />
      </button>
    </form>
  );
}

export default function AdminBrands() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    api.get("/brands").then((res) => setBrands(res.data))
      .catch(() => setLoadError("Brands could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [loadAttempt]);

  async function handleAdd(name) {
    await api.post("/brands", { name });
    setShowAdd(false);
    load();
  }

  async function handleRename(id, name) {
    await api.put(`/brands/${id}`, { name });
    setEditId(null);
    load();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/brands/${deleteTarget._id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this brand.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream/10">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Brands</h1>
        </div>
        <button onClick={() => { setShowAdd(true); setEditId(null); }}
          className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition">
          <Plus size={13} /> Add Brand
        </button>
      </div>

      <p className="text-cream/40 text-xs mb-5 leading-relaxed max-w-xl">
        This is the managed list the product form's Brand dropdown pulls from — keeping it here instead of
        free-typed text stops "Oraimo," "oraimo," and "ORAIMO" from ending up as three different brands.
      </p>

      {deleteError && <p role="alert" className="mb-4 text-sm text-red-400">{deleteError}</p>}

      {showAdd && (
        <div className="border border-cream/10 rounded-2xl p-4 bg-mall-800/50 mb-4">
          <NameForm placeholder="e.g. Oraimo" onSave={handleAdd} onCancel={() => setShowAdd(false)} saveLabel="Add" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : brands.length === 0 ? (
        <div className="py-16 text-center">
          <Award size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No brands yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {brands.map((brand) => (
            <div key={brand._id} className="py-3">
              {editId === brand._id ? (
                <NameForm
                  initial={brand.name}
                  placeholder="Brand name"
                  onSave={(name) => handleRename(brand._id, name)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-cream text-sm font-medium flex-1">{brand.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" aria-label={`Edit ${brand.name}`} title={`Edit ${brand.name}`} onClick={() => { setEditId(brand._id); setShowAdd(false); }}
                      className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-cream flex items-center justify-center transition">
                      <Pencil size={13} />
                    </button>
                    <button type="button" aria-label={`Delete ${brand.name}`} title={`Delete ${brand.name}`} onClick={() => { setDeleteError(""); setDeleteTarget(brand); }}
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
      {deleteTarget && <AdminConfirmDialog title={`Delete ${deleteTarget.name}?`} description="Products already using this brand will keep the name as free text." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
    </div>
  );
}
