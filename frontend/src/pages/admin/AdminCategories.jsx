import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag, ChevronDown, ChevronRight } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";

// ─── Inline rename/add form for a category name or subcategory name ────────
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
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          aria-label={placeholder}
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

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [addingSubTo, setAddingSubTo] = useState(null);
  const [editingSub, setEditingSub] = useState(null); // { categoryId, subId }
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    api.get("/categories").then((res) => setCategories(res.data))
      .catch(() => setLoadError("Categories could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [loadAttempt]);

  async function handleAddCategory(name) {
    await api.post("/categories", { name });
    setShowAddCategory(false);
    load();
  }

  async function handleRenameCategory(id, name) {
    await api.put(`/categories/${id}`, { name });
    setEditCategoryId(null);
    load();
  }

  async function handleDeleteCategory() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/categories/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this category.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddSubcategory(categoryId, name) {
    await api.post(`/categories/${categoryId}/subcategories`, { name });
    setAddingSubTo(null);
    load();
  }

  async function handleRenameSubcategory(categoryId, subId, name) {
    await api.put(`/categories/${categoryId}/subcategories/${subId}`, { name });
    setEditingSub(null);
    load();
  }

  async function handleDeleteSubcategory() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/categories/${deleteTarget.categoryId}/subcategories/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this subcategory.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream/10">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Categories</h1>
        </div>
        <button onClick={() => { setShowAddCategory(true); setEditCategoryId(null); }}
          className="flex items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition">
          <Plus size={13} /> Add Category
        </button>
      </div>

      <p className="text-cream/40 text-xs mb-5 leading-relaxed max-w-xl">
        This is the managed list product forms pull from — keeping categories here instead of free-typed
        text is what stops "Laptops," "laptop," and "Laptop " from quietly becoming three different categories.
      </p>

      <p className="text-cream/35 text-xs mb-5 leading-relaxed max-w-xl">
        Before renaming or removing a category or subcategory, move its products to another managed category in Products. Changes are blocked while products still use that entry.
      </p>
      {deleteError && <p role="alert" className="mb-4 text-sm text-red-400">{deleteError}</p>}
      {showAddCategory && (
        <div className="border border-cream/10 rounded-2xl p-4 bg-mall-800/50 mb-4">
          <NameForm placeholder="e.g. Electronics" onSave={handleAddCategory} onCancel={() => setShowAddCategory(false)} saveLabel="Add" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : categories.length === 0 ? (
        <div className="py-16 text-center">
          <Tag size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No categories yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {categories.map((cat) => {
            const isOpen = expanded === cat._id;
            return (
              <div key={cat._id} className="py-3">
                {editCategoryId === cat._id ? (
                  <NameForm
                    initial={cat.name}
                    placeholder="Category name"
                    onSave={(name) => handleRenameCategory(cat._id, name)}
                    onCancel={() => setEditCategoryId(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(isOpen ? null : cat._id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {isOpen ? <ChevronDown size={14} className="text-cream/40 shrink-0" /> : <ChevronRight size={14} className="text-cream/40 shrink-0" />}
                      <span className="text-cream text-sm font-medium">{cat.name}</span>
                      <span className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest shrink-0">
                        {cat.subcategories.length} sub{cat.subcategories.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" aria-label={`Edit category ${cat.name}`} title={`Edit ${cat.name}`} onClick={() => { setEditCategoryId(cat._id); setShowAddCategory(false); }}
                        className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-cream flex items-center justify-center transition">
                        <Pencil size={13} />
                      </button>
                      <button type="button" aria-label={`Delete category ${cat.name}`} title={`Delete ${cat.name}`} onClick={() => { setDeleteError(""); setDeleteTarget({ type: "category", id: cat._id, label: cat.name }); }}
                        className="w-8 h-8 rounded-lg bg-mall-800 text-cream/50 hover:text-red-400 flex items-center justify-center transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div className="mt-3 ml-6 pl-4 border-l border-cream/10 space-y-2">
                    {cat.subcategories.map((sub) => (
                      <div key={sub._id}>
                        {editingSub?.categoryId === cat._id && editingSub?.subId === sub._id ? (
                          <NameForm
                            initial={sub.name}
                            placeholder="Subcategory name"
                            onSave={(name) => handleRenameSubcategory(cat._id, sub._id, name)}
                            onCancel={() => setEditingSub(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-cream/70 text-sm flex-1">{sub.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button type="button" aria-label={`Edit subcategory ${sub.name}`} title={`Edit ${sub.name}`} onClick={() => setEditingSub({ categoryId: cat._id, subId: sub._id })}
                                className="w-7 h-7 rounded-lg bg-mall-800 text-cream/40 hover:text-cream flex items-center justify-center transition">
                                <Pencil size={11} />
                              </button>
                              <button type="button" aria-label={`Delete subcategory ${sub.name}`} title={`Delete ${sub.name}`} onClick={() => { setDeleteError(""); setDeleteTarget({ type: "subcategory", id: sub._id, categoryId: cat._id, label: sub.name }); }}
                                className="w-7 h-7 rounded-lg bg-mall-800 text-cream/40 hover:text-red-400 flex items-center justify-center transition">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {addingSubTo === cat._id ? (
                      <NameForm
                        placeholder="e.g. Laptops"
                        onSave={(name) => handleAddSubcategory(cat._id, name)}
                        onCancel={() => setAddingSubTo(null)}
                        saveLabel="Add"
                      />
                    ) : (
                      <button onClick={() => setAddingSubTo(cat._id)}
                        className="flex items-center gap-1.5 text-mall-accent text-xs font-medium hover:text-mall-accentDark transition mt-1">
                        <Plus size={11} /> Add subcategory
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {deleteTarget && <AdminConfirmDialog title={`Delete ${deleteTarget.label}?`} description={deleteTarget.type === "category" ? "This removes the category and its subcategories from the managed list. Deletion is blocked while any products use this category." : "This removes the subcategory from its parent category. Deletion is blocked while any products use this subcategory."} busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={deleteTarget.type === "category" ? handleDeleteCategory : handleDeleteSubcategory} />}
    </div>
  );
}
