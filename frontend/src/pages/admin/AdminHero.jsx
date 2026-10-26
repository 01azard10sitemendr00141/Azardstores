import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Image as ImageIcon, Pencil, Plus, Trash2, Video } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";
import { clearHomeCache } from "../../utils/homeCache";
import AdminStudioReturn from "../../components/admin/AdminStudioReturn";

const EMPTY = {
  headline: "", supportingText: "", ctaLabel: "Explore the mall", destination: "/directory",
  mediaType: "image", mediaUrl: "", posterUrl: "", altText: "", isActive: false, startsAt: "", endsAt: "",
};
const field = "min-h-11 w-full bg-mall-800 border border-cream/10 rounded-lg px-3 py-2.5 text-cream text-sm placeholder-cream/25 outline-none focus:border-mall-accent";

function toLocalDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function nairobiDateToIso(value) {
  if (!value) return null;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const inNairobi = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(wallTime)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const represented = Date.UTC(Number(inNairobi.year), Number(inNairobi.month) - 1, Number(inNairobi.day), Number(inNairobi.hour), Number(inNairobi.minute), Number(inNairobi.second));
  return new Date(wallTime - (represented - wallTime)).toISOString();
}
function toPayload(form) {
  return {
    ...form,
    startsAt: nairobiDateToIso(form.startsAt),
    endsAt: nairobiDateToIso(form.endsAt),
  };
}
function fromSlide(slide) {
  return { ...EMPTY, ...slide, startsAt: toLocalDate(slide.startsAt), endsAt: toLocalDate(slide.endsAt) };
}

function SlideForm({ initial, onSave, onCancel }) {
  const formId = useId().replace(/:/g, "");
  const fieldId = (name) => `${formId}-${name}`;
  const [form, setForm] = useState(() => initial ? fromSlide(initial) : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError("");
    try { await onSave(toPayload(form)); }
    catch (err) { setError(err.response?.data?.message || "Could not save this hero slide."); }
    finally { setSaving(false); }
  }
  return (
    <form onSubmit={submit} className="mb-5 rounded-2xl border border-mall-accent/25 bg-mall-800/60 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-cream">{initial ? "Edit hero slide" : "New hero slide"}</h2>
        <button type="button" onClick={onCancel} className="min-h-11 px-2 text-sm text-cream/50 hover:text-cream">Close</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={fieldId("headline")} className="text-xs text-cream/55">Headline <span className="text-cream/30">(max 120)</span></label>
          <input id={fieldId("headline")} required maxLength={120} value={form.headline} onChange={(e) => set("headline", e.target.value)} className={`${field} mt-1.5`} placeholder="A fresh reason to explore" />
        </div>
        <div>
          <label htmlFor={fieldId("supporting-text")} className="text-xs text-cream/55">Supporting text <span className="text-cream/30">(optional)</span></label>
          <input id={fieldId("supporting-text")} maxLength={240} value={form.supportingText} onChange={(e) => set("supportingText", e.target.value)} className={`${field} mt-1.5`} placeholder="A short detail about this week's offer" />
        </div>
        <div>
          <label htmlFor={fieldId("cta-label")} className="text-xs text-cream/55">Button label</label>
          <input id={fieldId("cta-label")} required maxLength={40} value={form.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} className={`${field} mt-1.5`} placeholder="Shop now" />
        </div>
        <div>
          <label htmlFor={fieldId("destination")} className="text-xs text-cream/55">Store page destination</label>
          <select id={fieldId("destination")} value={form.destination} onChange={(e) => set("destination", e.target.value)} className={`${field} mt-1.5`}>
            <option value="/directory">Mall directory</option>
            <option value="/search">All products</option>
            <option value="/search?flashSale=true">Flash sales</option>
            <option value="/how-it-works">How it works</option>
            <option value="/delivery">Delivery information</option>
            <option value="/contact">Contact Azard Stores</option>
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("media-type")} className="text-xs text-cream/55">Background type</label>
          <select id={fieldId("media-type")} value={form.mediaType} onChange={(e) => set("mediaType", e.target.value)} className={`${field} mt-1.5`}>
            <option value="image">Image</option><option value="video">Video</option>
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("media-url")} className="text-xs text-cream/55">{form.mediaType === "video" ? "Video URL (MP4)" : "Image URL"}</label>
          <input id={fieldId("media-url")} required type="text" value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} className={`${field} mt-1.5`} placeholder="https://… or /pics/hero-image.jpg" />
        </div>
        {form.mediaType === "video" && <div>
          <label htmlFor={fieldId("poster-url")} className="text-xs text-cream/55">Fallback image URL</label>
          <input id={fieldId("poster-url")} type="text" value={form.posterUrl} onChange={(e) => set("posterUrl", e.target.value)} className={`${field} mt-1.5`} placeholder="https://… or /pics/hero-poster.jpg" />
        </div>}
        <div>
          <label htmlFor={fieldId("alt-text")} className="text-xs text-cream/55">Image description <span className="text-cream/30">(accessibility)</span></label>
          <input id={fieldId("alt-text")} maxLength={160} value={form.altText} onChange={(e) => set("altText", e.target.value)} className={`${field} mt-1.5`} placeholder="Describe the image briefly" />
        </div>
      </div>
      <div className="rounded-xl border border-cream/10 bg-mall-900/60 p-3">
        <p className="font-mono-tag text-[10px] uppercase tracking-widest text-cream/45 mb-3">Schedule · East Africa Time (Nairobi)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={fieldId("starts-at")} className="text-xs text-cream/55">Start showing</label>
            <input id={fieldId("starts-at")} type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor={fieldId("ends-at")} className="text-xs text-cream/55">Stop showing</label>
            <input id={fieldId("ends-at")} type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={`${field} mt-1.5`} />
          </div>
        </div>
      </div>
      <label htmlFor={fieldId("is-active")} className="flex items-center gap-2 text-sm text-cream/70">
        <input id={fieldId("is-active")} type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="accent-[var(--mall-accent)]" />
        <span>Publish this slide (schedule dates still apply)</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={saving} className="min-h-11 rounded-lg bg-mall-accent px-4 py-2.5 text-sm font-semibold text-mall-900 disabled:opacity-50">{saving ? "Saving…" : initial ? "Save changes" : "Save slide"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg px-4 py-2.5 text-sm text-cream/55 hover:text-cream">Cancel</button>
      </div>
    </form>
  );
}

function SlidePreview({ slide }) {
  return (
    <div className="relative min-h-40 overflow-hidden rounded-xl border border-cream/10 bg-mall-900 p-4 flex items-end">
      {slide.mediaType === "video" && slide.mediaUrl ? <video src={slide.mediaUrl} poster={slide.posterUrl || undefined} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" /> : slide.mediaUrl ? <img src={slide.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-mall-900/90 via-mall-900/60 to-mall-900/20" />
      <div className="relative max-w-md">
        <p className="font-display text-xl text-cream">{slide.headline || "Your headline preview"}</p>
        {slide.supportingText && <p className="mt-1 text-xs text-cream/70">{slide.supportingText}</p>}
        <span className="mt-3 inline-flex rounded-full bg-mall-accent px-3 py-1.5 text-xs font-semibold text-mall-900">{slide.ctaLabel || "Button"}</span>
      </div>
    </div>
  );
}

export default function AdminHero() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  function load() {
    setLoading(true); setLoadError("");
    api.get("/hero-slides/admin/list").then((res) => setSlides(res.data)).catch(() => {
      setSlides([]);
      setLoadError("Hero campaigns could not be loaded.");
    }).finally(() => setLoading(false));
  }
  useEffect(load, [attempt]);
  async function save(payload) {
    if (editing?.id) await api.put(`/hero-slides/${editing.id}`, payload);
    else await api.post("/hero-slides", payload);
    clearHomeCache();
    setActionError("");
    setEditing(null); load();
  }
  async function move(slide, direction) {
    setActionError("");
    try { await api.patch(`/hero-slides/${slide._id}/move`, { direction }); clearHomeCache(); load(); }
    catch (err) { setActionError(err.response?.data?.message || "Could not change hero campaign order."); }
  }
  async function remove() {
    setBusy(true);
    setActionError("");
    try { await api.delete(`/hero-slides/${deleteTarget._id}`); clearHomeCache(); setDeleteTarget(null); load(); }
    catch (err) { setActionError(err.response?.data?.message || "Could not remove this slide."); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <AdminStudioReturn />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Storefront</p><h1 className="font-display text-2xl text-cream">Hero campaigns</h1><p className="mt-1 max-w-2xl text-sm text-cream/45">Manage the homepage’s opening message, media and call to action. Use hosted HTTPS image or MP4 links; the site does not upload media files.</p></div>
        {!editing && <button type="button" onClick={() => setEditing({ id: null })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-mall-accent px-4 py-2.5 text-sm font-semibold text-mall-900"><Plus size={15} /> Add slide</button>}
      </div>
      {editing && <SlideForm key={editing.id || "new"} initial={slides.find((s) => s._id === editing.id)} onSave={save} onCancel={() => setEditing(null)} />}
      {actionError && <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{actionError}</p>}
      {loading ? <div role="status" aria-label="Loading hero campaigns" className="py-16 text-center text-sm text-cream/40">Loading hero campaigns…</div> : loadError ? <AdminLoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} /> : slides.length === 0 ? <div className="rounded-2xl border border-dashed border-cream/15 py-14 text-center"><ImageIcon className="mx-auto mb-3 text-cream/30" /><p className="text-cream">No hero slides yet</p><p className="mt-1 text-sm text-cream/40">Add an image or video campaign to control the homepage hero.</p></div> : (
        <div className="space-y-4">{slides.map((slide, i) => (
          <article key={slide._id} className="rounded-2xl border border-cream/10 bg-mall-800/35 p-3 sm:p-4">
            <SlidePreview slide={slide} />
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-cream/45">
                <span className={`rounded-full px-2 py-1 ${slide.isActive ? "bg-emerald-400/10 text-emerald-300" : "bg-cream/5 text-cream/45"}`}>{slide.isActive ? <><Eye size={12} className="mr-1 inline" />Published</> : <><EyeOff size={12} className="mr-1 inline" />Paused</>}</span>
                <span className="inline-flex items-center gap-1">{slide.mediaType === "video" ? <Video size={12} /> : <ImageIcon size={12} />}{slide.mediaType}</span>
                {slide.startsAt && <span>Starts {new Date(slide.startsAt).toLocaleString()}</span>}
                {slide.endsAt && <span>Ends {new Date(slide.endsAt).toLocaleString()}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button aria-label="Move slide up" disabled={i === 0} onClick={() => move(slide, "up")} className="min-h-11 min-w-11 rounded-lg p-2 text-cream/55 hover:bg-cream/5 disabled:opacity-25"><ArrowUp size={15} /></button>
                <button aria-label="Move slide down" disabled={i === slides.length - 1} onClick={() => move(slide, "down")} className="min-h-11 min-w-11 rounded-lg p-2 text-cream/55 hover:bg-cream/5 disabled:opacity-25"><ArrowDown size={15} /></button>
                <button aria-label="Edit slide" onClick={() => setEditing({ id: slide._id })} className="min-h-11 min-w-11 rounded-lg p-2 text-cream/55 hover:bg-cream/5"><Pencil size={15} /></button>
                <button aria-label="Delete slide" onClick={() => setDeleteTarget(slide)} className="min-h-11 min-w-11 rounded-lg p-2 text-cream/55 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={15} /></button>
              </div>
            </div>
          </article>
        ))}</div>
      )}
      {deleteTarget && <AdminConfirmDialog title="Delete this hero slide?" description="It will stop appearing in the homepage hero. This cannot be undone." busy={busy} onClose={() => !busy && setDeleteTarget(null)} onConfirm={remove} />}
    </div>
  );
}
