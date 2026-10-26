import { useEffect, useState } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Pencil,
  Star, Flame, Gem, Lock, Package, TrendingUp, Sparkles,
  Zap, Award, Heart, Tag, Gift, Crown, ThumbsUp, ShoppingBag,
} from "lucide-react";
import api from "../../api/client";
import { clearHomeCache } from "../../utils/homeCache";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";

// This whitelist is the single source of truth for which icon *names* an
// admin can pick — Home.jsx has its own matching lookup so a saved icon
// name always resolves to a real component there too. Keep the two in sync
// if you add options here.
export const ICON_OPTIONS = [
  { name: "Star", Icon: Star }, { name: "Flame", Icon: Flame }, { name: "Gem", Icon: Gem },
  { name: "Lock", Icon: Lock }, { name: "Package", Icon: Package }, { name: "TrendingUp", Icon: TrendingUp },
  { name: "Sparkles", Icon: Sparkles }, { name: "Zap", Icon: Zap }, { name: "Award", Icon: Award },
  { name: "Heart", Icon: Heart }, { name: "Tag", Icon: Tag }, { name: "Gift", Icon: Gift },
  { name: "Crown", Icon: Crown }, { name: "ThumbsUp", Icon: ThumbsUp }, { name: "ShoppingBag", Icon: ShoppingBag },
];
const ICON_BY_NAME = Object.fromEntries(ICON_OPTIONS.map((o) => [o.name, o.Icon]));

const EMPTY = { chipLabel: "", sectionHeading: "", sectionTag: "", icon: "Tag" };
const inputClass = "w-full bg-mall-800 border border-cream/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";

function BadgeForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save this badge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-mall-800/60 border border-cream/10 rounded-xl p-4 space-y-3 mb-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
            Chip label <span className="text-cream/25 normal-case">(shown on product cards)</span>
          </label>
          <input value={form.chipLabel} onChange={(e) => set("chipLabel", e.target.value)} placeholder="e.g. Best Seller" className={inputClass} required />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
            Homepage section heading
          </label>
          <input value={form.sectionHeading} onChange={(e) => set("sectionHeading", e.target.value)} placeholder="e.g. Best of the Mall" className={inputClass} required />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
            Section tag <span className="text-cream/25 normal-case">(optional)</span>
          </label>
          <input value={form.sectionTag} onChange={(e) => set("sectionTag", e.target.value)} placeholder="e.g. Top picks" className={inputClass} />
        </div>
        <div>
          <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Icon</label>
          <select value={form.icon} onChange={(e) => set("icon", e.target.value)} className={inputClass}>
            {ICON_OPTIONS.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
        </div>
      </div>
      {form.slug && (
        <p className="text-cream/25 text-[11px]">
          Internal id: <span className="font-mono-tag">{form.slug}</span> — set once when created, can't be renamed (renaming would disconnect it from products already tagged with it).
        </p>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="bg-mall-accent text-mall-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="text-cream/50 hover:text-cream text-sm px-3 py-2 transition">Cancel</button>
      </div>
    </form>
  );
}

export default function AdminBadges() {
  const [badges, setBadges] = useState([]);
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
    api.get("/badges").then((res) => setBadges(res.data))
      .catch(() => setLoadError("Badges could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [loadAttempt]);

  async function handleCreate(form) {
    await api.post("/badges", form);
    clearHomeCache();
    setAdding(false);
    load();
  }

  async function handleUpdate(id, form) {
    await api.put(`/badges/${id}`, form);
    clearHomeCache();
    setEditingId(null);
    load();
  }

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      await api.delete(`/badges/${deleteTarget._id}`);
      clearHomeCache();
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete this badge");
    } finally {
      setDeleting(false);
    }
  }

  async function handleMove(id, direction) {
    setError("");
    try {
      await api.patch(`/badges/${id}/move`, { direction });
      clearHomeCache();
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not change badge order.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-cream">Badges</h1>
          <p className="text-cream/40 text-sm mt-1">
            Manage the badges shown on product cards and their dedicated homepage sections. Order here is the order they appear on the homepage.
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 bg-mall-accent text-mall-900 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition shrink-0">
            <Plus size={15} /> New Badge
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {adding && (
        <BadgeForm onSave={handleCreate} onCancel={() => setAdding(false)} />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : badges.length === 0 && !adding ? (
        <p className="text-cream/25 text-sm py-10 text-center">No badges yet — add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {badges.map((badge, i) =>
            editingId === badge._id ? (
              <BadgeForm key={badge._id} initial={badge} onSave={(form) => handleUpdate(badge._id, form)} onCancel={() => setEditingId(null)} />
            ) : (
              <BadgeRow
                key={badge._id}
                badge={badge}
                isFirst={i === 0}
                isLast={i === badges.length - 1}
                onEdit={() => setEditingId(badge._id)}
                onDelete={() => { setError(""); setDeleteTarget(badge); }}
                onMove={(dir) => handleMove(badge._id, dir)}
              />
            )
          )}
        </div>
      )}
      {deleteTarget && <AdminConfirmDialog title={`Delete ${deleteTarget.chipLabel}?`} description={`Products already tagged with it will keep showing “${deleteTarget.slug}” as their chip, but it will no longer have its own homepage section.`} busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
    </div>
  );
}

function BadgeRow({ badge, isFirst, isLast, onEdit, onDelete, onMove }) {
  const Icon = ICON_BY_NAME[badge.icon] || Tag;
  return (
    <div className="flex items-center gap-3 bg-mall-800/60 border border-cream/10 rounded-xl p-3">
      <div className="flex flex-col shrink-0">
        <button onClick={() => onMove("up")} disabled={isFirst} className="text-cream/30 hover:text-cream disabled:opacity-20 disabled:hover:text-cream/30 transition p-0.5">
          <ChevronUp size={14} />
        </button>
        <button onClick={() => onMove("down")} disabled={isLast} className="text-cream/30 hover:text-cream disabled:opacity-20 disabled:hover:text-cream/30 transition p-0.5">
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="w-9 h-9 rounded-lg bg-mall-accent/10 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-mall-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-cream text-sm font-medium">{badge.chipLabel}</p>
          <span className="font-mono-tag text-[9px] text-cream/25">{badge.slug}</span>
        </div>
        <p className="text-cream/40 text-xs mt-0.5">
          "{badge.sectionHeading}"{badge.sectionTag ? ` · ${badge.sectionTag}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" aria-label={`Edit badge ${badge.chipLabel}`} title={`Edit ${badge.chipLabel}`} onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/40 hover:text-cream hover:bg-cream/5 transition">
          <Pencil size={14} />
        </button>
        <button type="button" aria-label={`Delete badge ${badge.chipLabel}`} title={`Delete ${badge.chipLabel}`} onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/40 hover:text-red-400 hover:bg-red-400/10 transition">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
