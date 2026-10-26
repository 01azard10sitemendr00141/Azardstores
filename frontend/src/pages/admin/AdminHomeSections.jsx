import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Sparkles, Store, Tag } from "lucide-react";
import api from "../../api/client";
import { clearHomeCache } from "../../utils/homeCache";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";
import AdminStudioReturn from "../../components/admin/AdminStudioReturn";

const TYPE_META = {
  "badge": { label: "Badge Section", Icon: Sparkles },
  "featured-shop": { label: "Featured Shop", Icon: Store },
  "featured-category": { label: "Featured Category", Icon: Tag },
};

const inputClass = "min-h-11 w-full bg-mall-800 border border-cream/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";

function SectionForm({ initial, badges, shops, categories, onSave, onCancel }) {
  const [type, setType] = useState(initial?.type || "badge");
  const [badge, setBadge] = useState(initial?.badge?._id || "");
  const [shop, setShop] = useState(initial?.shop?._id || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [heading, setHeading] = useState(initial?.heading || "");
  const [tag, setTag] = useState(initial?.tag || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ type, badge, shop, category, heading, tag });
    } catch (err) {
      setError(err.response?.data?.message || "Could not save this section");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-mall-800/60 border border-cream/10 rounded-xl p-4 space-y-3 mb-3">
      <div>
        <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Section type</label>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(TYPE_META).map(([key, { label, Icon }]) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
                type === key ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold" : "border-cream/15 text-cream/60 hover:border-cream/30"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {type === "badge" && (
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Badge</label>
          <select value={badge} onChange={(e) => setBadge(e.target.value)} className={inputClass} required>
            <option value="">Select a badge...</option>
            {badges.map((b) => <option key={b._id} value={b._id}>{b.chipLabel}</option>)}
          </select>
        </div>
      )}

      {type === "featured-shop" && (
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Shop</label>
          <select value={shop} onChange={(e) => setShop(e.target.value)} className={inputClass} required>
            <option value="">Select a shop...</option>
            {shops.map((s) => <option key={s._id} value={s._id}>Shop #{s.shopNumber} — {s.name}</option>)}
          </select>
        </div>
      )}

      {type === "featured-category" && (
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} required>
            <option value="">Select a category...</option>
            {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
            Heading override <span className="text-cream/25 normal-case">(optional)</span>
          </label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="Falls back to a sensible default" className={inputClass} />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
            Tag override <span className="text-cream/25 normal-case">(optional)</span>
          </label>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Small label under the heading" className={inputClass} />
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="min-h-11 bg-mall-accent text-mall-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 text-cream/50 hover:text-cream text-sm px-3 py-2 transition">Cancel</button>
      </div>
    </form>
  );
}

function SectionRow({ section, isFirst, isLast, onEdit, onDelete, onMove }) {
  const meta = TYPE_META[section.type];
  const Icon = meta?.Icon || Sparkles;
  const refLabel =
    section.type === "badge" ? section.badge?.chipLabel || "(deleted badge)" :
    section.type === "featured-shop" ? section.shop?.name || "(deleted shop)" :
    section.category || "(deleted category)";

  return (
    <div className="flex flex-wrap items-center gap-2 bg-mall-800/60 border border-cream/10 rounded-xl p-3 sm:flex-nowrap sm:gap-3">
      <div className="flex flex-col shrink-0">
        <button type="button" aria-label={`Move ${refLabel} up`} onClick={() => onMove("up")} disabled={isFirst} className="min-h-11 min-w-11 text-cream/30 hover:text-cream disabled:opacity-20 disabled:hover:text-cream/30 transition p-0.5">
          <ChevronUp size={14} />
        </button>
        <button type="button" aria-label={`Move ${refLabel} down`} onClick={() => onMove("down")} disabled={isLast} className="min-h-11 min-w-11 text-cream/30 hover:text-cream disabled:opacity-20 disabled:hover:text-cream/30 transition p-0.5">
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="w-9 h-9 rounded-lg bg-mall-accent/10 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-mall-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono-tag text-[9px] uppercase text-cream/30">{meta?.label}</span>
        </div>
        <p className="break-words text-cream text-sm font-medium">{refLabel}</p>
        {(section.heading || section.tag) && (
          <p className="break-words text-cream/40 text-xs mt-0.5">
            {section.heading && `"${section.heading}"`}{section.heading && section.tag ? " · " : ""}{section.tag}
          </p>
        )}
      </div>
      <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-1 sm:ml-0 sm:w-auto">
        <button type="button" aria-label={`Edit ${refLabel}`} title={`Edit ${refLabel}`} onClick={onEdit} className="min-h-11 min-w-11 rounded-lg flex items-center justify-center text-cream/40 hover:text-cream hover:bg-cream/5 transition">
          <Pencil size={14} />
        </button>
        <button type="button" aria-label={`Remove ${refLabel}`} title={`Remove ${refLabel}`} onClick={onDelete} className="min-h-11 min-w-11 rounded-lg flex items-center justify-center text-cream/40 hover:text-red-400 hover:bg-red-400/10 transition">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function AdminHomeSections() {
  const [sections, setSections] = useState([]);
  const [badges, setBadges] = useState([]);
  const [shops, setShops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setLoadError("");
    Promise.all([
      api.get("/home-sections"),
      api.get("/badges"),
      api.get("/shops"),
      api.get("/categories"),
    ]).then(([sectionsRes, badgesRes, shopsRes, categoriesRes]) => {
      setSections(sectionsRes.data);
      setBadges(badgesRes.data);
      setShops(shopsRes.data);
      setCategories(categoriesRes.data);
    }).catch(() => setLoadError("Homepage data could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [loadAttempt]);

  async function handleCreate(form) {
    await api.post("/home-sections", form);
    clearHomeCache();
    setAdding(false);
    load();
  }

  async function handleUpdate(id, form) {
    await api.put(`/home-sections/${id}`, form);
    clearHomeCache();
    setEditingId(null);
    load();
  }

  async function handleDelete(section) {
    setError("");
    setDeleting(true);
    try {
      await api.delete(`/home-sections/${section._id}`);
      clearHomeCache();
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete this section");
    } finally {
      setDeleting(false);
    }
  }

  async function handleMove(id, direction) {
    setError("");
    try {
      await api.patch(`/home-sections/${id}/move`, { direction });
      clearHomeCache();
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not change homepage section order.");
    }
  }

  return (
    <div>
      <AdminStudioReturn />
      <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Homepage Studio / Browseable sections</p>
          <h1 className="font-display text-2xl text-cream">Homepage sections</h1>
          <p className="mt-1 max-w-2xl break-words text-cream/40 text-sm">
            Manage every section on the homepage in one place — badge-driven sections, a featured shop, or a featured category. Order here is the order they appear.
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex min-h-11 w-fit shrink-0 items-center gap-1.5 bg-mall-accent text-mall-900 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition">
            <Plus size={15} /> New Section
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {adding && (
        <SectionForm badges={badges} shops={shops} categories={categories} onSave={handleCreate} onCancel={() => setAdding(false)} />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : sections.length === 0 && !adding ? (
        <p className="text-cream/25 text-sm py-10 text-center">No homepage sections yet — add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {sections.map((section, i) =>
            editingId === section._id ? (
              <SectionForm
                key={section._id}
                initial={section}
                badges={badges}
                shops={shops}
                categories={categories}
                onSave={(form) => handleUpdate(section._id, form)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <SectionRow
                key={section._id}
                section={section}
                isFirst={i === 0}
                isLast={i === sections.length - 1}
                onEdit={() => setEditingId(section._id)}
                onDelete={() => { setError(""); setDeleteTarget(section); }}
                onMove={(dir) => handleMove(section._id, dir)}
              />
            )
          )}
        </div>
      )}
      {deleteTarget && <AdminConfirmDialog title="Remove this homepage section?" description="The section will no longer appear on the store homepage. Its linked badge, shop, or category remains unchanged." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget)} />}
    </div>
  );
}
