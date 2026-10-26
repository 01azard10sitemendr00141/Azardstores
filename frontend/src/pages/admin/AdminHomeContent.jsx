import { useEffect, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Briefcase, BookOpen, Check, Cpu, Dumbbell, Gamepad2, Heart, Home, PanelsTopLeft, Plane, Plus, Shirt, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import { clearHomeCache } from "../../utils/homeCache";
import { normalizeHomepageContent } from "../../utils/homepageContent";
import AdminStudioReturn from "../../components/admin/AdminStudioReturn";

const ICONS = { Briefcase, Gamepad2, Plane, House: Home, Dumbbell, Shirt, Cpu, Sparkles, ShoppingBag, BookOpen, Activity, Heart };
const DEFAULT = {
  sectionLinkLabel: "See all", featuredShopLinkLabel: "Visit Shop",
  fallbackHeroHeadline: "Welcome to Azard Stores.", fallbackHeroSupportingText: "Explore products and shops across the mall.",
  fallbackHeroCtaLabel: "Explore the mall", fallbackHeroDestination: "/directory",
  flashSaleHeading: "Flash Sale", flashSaleTag: "Limited time",
  purposeHeading: "Shop by Purpose", purposeTagline: "Find what fits your life",
  exploreHeading: "Explore the Mall", exploreLinkLabel: "Full directory",
  featuredShopBackdropUrl: "https://images.pexels.com/photos/27677152/pexels-photo-27677152.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  exploreBackdropUrl: "https://images.pexels.com/photos/32340449/pexels-photo-32340449.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  statsFloorsLabel: "Floors", statsShopsLabel: "Shops Open", statsProductsLabel: "Products", statsFourthValue: "One", statsFourthLabel: "Mall-wide cart",
  closingEyebrow: "Azard Stores", closingHeadline: "Discover more.", closingAccent: "Shop it all.",
  closingPrimaryLabel: "Enter the Mall", closingPrimaryDestination: "/directory",
  closingSecondaryLabel: "Chat on WhatsApp", closingSecondaryDestination: "whatsapp",
  closingFooterLine: "The Whole Mall. One Cart. Zero Hassle.", closingMediaType: "video",
  closingMediaUrl: "https://videos.pexels.com/video-files/3243946/3243946-uhd_2560_1440_30fps.mp4",
  closingPosterUrl: "https://images.pexels.com/videos/3243946/free-video-3243946.jpg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  purposeTiles: [
    { label: "Work", tagline: "Tools for your workday", purposeTag: "work", icon: "Briefcase", color: "#0096D6", active: true },
    { label: "Gaming", tagline: "Gear up and play", purposeTag: "gaming", icon: "Gamepad2", color: "#FF6900", active: true },
    { label: "Travel", tagline: "Ready for the journey", purposeTag: "travel", icon: "Plane", color: "#00C853", active: true },
    { label: "Home", tagline: "Make home feel right", purposeTag: "home", icon: "House", color: "#E8A33D", active: true },
    { label: "Fitness", tagline: "Move with confidence", purposeTag: "fitness", icon: "Dumbbell", color: "#CC0000", active: true },
  ],
};
const INPUT = "min-h-11 w-full rounded-lg border border-cream/10 bg-mall-800 px-3 py-2.5 text-sm text-cream outline-none focus:border-mall-accent";
const TEXT_FIELDS = [
  ["closingEyebrow", "Small brand label", 60], ["closingHeadline", "Main headline", 100], ["closingAccent", "Accent line", 100],
  ["closingPrimaryLabel", "Main button label", 40], ["closingSecondaryLabel", "Second button label", 40], ["closingFooterLine", "Small footer line", 100],
];
const LABEL_FIELDS = [
  ["sectionLinkLabel", "Product section link label", 40], ["featuredShopLinkLabel", "Featured shop button label", 40],
  ["flashSaleHeading", "Flash sale heading", 60], ["flashSaleTag", "Flash sale label", 40],
  ["purposeHeading", "Purpose section heading", 60],
  ["purposeTagline", "Purpose section tagline", 80], ["exploreHeading", "Explore section heading", 60],
  ["exploreLinkLabel", "Explore link button", 40], ["statsFloorsLabel", "Floor count label", 30],
  ["statsShopsLabel", "Open shop count label", 30], ["statsProductsLabel", "Product count label", 30],
  ["statsFourthValue", "Fourth statistic value", 16], ["statsFourthLabel", "Fourth statistic label", 30],
];

export default function AdminHomeContent() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setLoading(true); setError("");
    api.get("/homepage-content/admin").then(({ data }) => setForm(normalizeHomepageContent(data ? { ...DEFAULT, ...data, purposeTiles: Array.isArray(data.purposeTiles) ? data.purposeTiles : DEFAULT.purposeTiles } : structuredClone(DEFAULT))))
      .catch(() => setError("Homepage content could not be loaded."))
      .finally(() => setLoading(false));
  }, [attempt]);
  function set(key, value) { setForm((prev) => ({ ...prev, [key]: value })); setSaved(false); }
  function updateTile(index, key, value) {
    setForm((prev) => ({ ...prev, purposeTiles: prev.purposeTiles.map((tile, i) => i === index ? { ...tile, [key]: value } : tile) }));
    setSaved(false);
  }
  function moveTile(index, direction) {
    setForm((prev) => {
      const next = [...prev.purposeTiles];
      const destination = index + direction;
      if (destination < 0 || destination >= next.length) return prev;
      [next[index], next[destination]] = [next[destination], next[index]];
      return { ...prev, purposeTiles: next };
    });
    setSaved(false);
  }
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      const { data } = await api.put("/homepage-content", form);
      setForm({ ...DEFAULT, ...data, purposeTiles: Array.isArray(data.purposeTiles) ? data.purposeTiles : [] });
      clearHomeCache(); setSaved(true);
    } catch (err) { setError(err.response?.data?.message || "Could not save homepage content."); }
    finally { setSaving(false); }
  }
  if (loading) return <><AdminStudioReturn /><div className="py-16 text-center text-sm text-cream/40">Loading homepage content…</div></>;
  if (error && !form) return <><AdminStudioReturn /><AdminLoadError message={error} onRetry={() => setAttempt((n) => n + 1)} /></>;

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-8">
      <AdminStudioReturn />
      <header className="mb-6">
        <p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Storefront</p>
        <h1 className="font-display text-2xl text-cream">Home content</h1>
        <p className="mt-1 text-sm text-cream/45">Control the homepage section copy, imagery, closing panel, and Shop by Purpose tiles.</p>
      </header>

      <section className="rounded-2xl border border-cream/10 bg-mall-800/35 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-lg text-cream">Section labels and imagery</h2>
        <p className="mb-4 text-xs text-cream/40">These headings and background images appear around the homepage’s product and floor sections.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LABEL_FIELDS.map(([key, label, max]) => <label key={key} className="text-xs text-cream/55">{label}<input required maxLength={max} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className={`${INPUT} mt-1.5`} /></label>)}
          <label className="text-xs text-cream/55">Featured shop background image URL<input value={form.featuredShopBackdropUrl || ""} onChange={(e) => set("featuredShopBackdropUrl", e.target.value)} className={`${INPUT} mt-1.5`} placeholder="https://… or /pics/featured-shop.jpg" /></label>
          <label className="text-xs text-cream/55">Explore floors background image URL<input value={form.exploreBackdropUrl || ""} onChange={(e) => set("exploreBackdropUrl", e.target.value)} className={`${INPUT} mt-1.5`} placeholder="https://… or /pics/explore-floors.jpg" /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-cream/10 bg-mall-800/35 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-lg text-cream">Hero fallback</h2>
        <p className="mb-4 text-xs text-cream/40">Shown only when there are no active hero slides.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[ ["fallbackHeroHeadline", "Headline", 100], ["fallbackHeroSupportingText", "Supporting text", 200], ["fallbackHeroCtaLabel", "Button label", 40] ].map(([key, label, max]) => <label key={key} className="text-xs text-cream/55">{label}<input required maxLength={max} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className={`${INPUT} mt-1.5`} /></label>)}
          <label className="text-xs text-cream/55">Button destination<select value={form.fallbackHeroDestination} onChange={(e) => set("fallbackHeroDestination", e.target.value)} className={`${INPUT} mt-1.5`}>
            <option value="/directory">Mall directory</option><option value="/search">All products</option><option value="/search?flashSale=true">Flash sales</option><option value="/delivery">Delivery information</option><option value="/contact">Contact</option>
          </select></label>
        </div>
      </section>

      <section className="rounded-2xl border border-cream/10 bg-mall-800/35 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><PanelsTopLeft size={16} className="text-mall-accent" /><h2 className="font-display text-lg text-cream">Closing section</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map(([key, label, max]) => <label key={key} className="text-xs text-cream/55">{label}<input required maxLength={max} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} className={`${INPUT} mt-1.5`} /></label>)}
          <label className="text-xs text-cream/55">Main button destination<select value={form.closingPrimaryDestination} onChange={(e) => set("closingPrimaryDestination", e.target.value)} className={`${INPUT} mt-1.5`}>
            <option value="/directory">Mall directory</option><option value="/search">All products</option><option value="/search?flashSale=true">Flash sales</option><option value="/delivery">Delivery information</option><option value="/contact">Contact</option>
          </select></label>
          <label className="text-xs text-cream/55">Second button destination<select value={form.closingSecondaryDestination} onChange={(e) => set("closingSecondaryDestination", e.target.value)} className={`${INPUT} mt-1.5`}>
            <option value="whatsapp">WhatsApp</option><option value="/directory">Mall directory</option><option value="/search">All products</option><option value="/delivery">Delivery information</option><option value="/contact">Contact</option>
          </select></label>
          <label className="text-xs text-cream/55">Background type<select value={form.closingMediaType} onChange={(e) => set("closingMediaType", e.target.value)} className={`${INPUT} mt-1.5`}><option value="video">Video</option><option value="image">Image</option></select></label>
          <label className="text-xs text-cream/55">{form.closingMediaType === "video" ? "Video URL (MP4)" : "Image URL"}<input required value={form.closingMediaUrl || ""} onChange={(e) => set("closingMediaUrl", e.target.value)} className={`${INPUT} mt-1.5`} placeholder="https://… or /pics/closing.mp4" /></label>
          {form.closingMediaType === "video" && <label className="text-xs text-cream/55">Fallback image URL<input value={form.closingPosterUrl || ""} onChange={(e) => set("closingPosterUrl", e.target.value)} className={`${INPUT} mt-1.5`} placeholder="https://… or /pics/closing-poster.jpg" /></label>}
        </div>
        <p className="mt-3 text-[11px] text-cream/35">Use hosted HTTPS media URLs or files already served by your site. Media uploads are not enabled.</p>
      </section>

      <section className="rounded-2xl border border-cream/10 bg-mall-800/35 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-lg text-cream">Shop by Purpose</h2><p className="text-xs text-cream/40">Each purpose tag must match product purpose tags used by search.</p></div>
          <button type="button" disabled={form.purposeTiles.length >= 12} onClick={() => set("purposeTiles", [...form.purposeTiles, { label: "", tagline: "Shop by purpose", purposeTag: "", icon: "Sparkles", color: "#0096D6", active: false }])} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/70 hover:text-cream disabled:opacity-30"><Plus size={14} /> Add tile</button>
        </div>
        <div className="space-y-3">
          {form.purposeTiles.map((tile, index) => {
            const Icon = ICONS[tile.icon] || Sparkles;
            return <article key={`${tile.purposeTag}-${index}`} className="rounded-xl border border-cream/10 bg-mall-900/40 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-cream"><Icon size={15} style={{ color: tile.color }} />Tile {index + 1}{!tile.active && <span className="text-[10px] uppercase text-cream/35">Paused</span>}</div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move tile up" disabled={index === 0} onClick={() => moveTile(index, -1)} className="min-h-11 min-w-11 rounded p-1.5 text-cream/50 hover:bg-cream/5 disabled:opacity-20"><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Move tile down" disabled={index === form.purposeTiles.length - 1} onClick={() => moveTile(index, 1)} className="min-h-11 min-w-11 rounded p-1.5 text-cream/50 hover:bg-cream/5 disabled:opacity-20"><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Remove tile" onClick={() => set("purposeTiles", form.purposeTiles.filter((_, i) => i !== index))} className="min-h-11 min-w-11 rounded p-1.5 text-cream/50 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] text-cream/50">Label<input required maxLength={40} value={tile.label} onChange={(e) => updateTile(index, "label", e.target.value)} className={`${INPUT} mt-1`} placeholder="Photography" /></label>
                <label className="text-[11px] text-cream/50">Purpose tag<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={tile.purposeTag} onChange={(e) => updateTile(index, "purposeTag", e.target.value.toLowerCase())} className={`${INPUT} mt-1`} placeholder="photography" /></label>
                <label className="text-[11px] text-cream/50">Short description<input maxLength={80} value={tile.tagline || ""} onChange={(e) => updateTile(index, "tagline", e.target.value)} className={`${INPUT} mt-1`} placeholder="Find your next camera" /></label>
                <label className="text-[11px] text-cream/50">Icon<select value={tile.icon} onChange={(e) => updateTile(index, "icon", e.target.value)} className={`${INPUT} mt-1`}>{Object.keys(ICONS).map((name) => <option key={name}>{name}</option>)}</select></label>
                <label className="text-[11px] text-cream/50">Accent color<input type="color" value={tile.color} onChange={(e) => updateTile(index, "color", e.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-cream/10 bg-mall-800 p-1" /></label>
                <label className="flex min-h-11 items-center gap-2 self-end pb-2 text-xs text-cream/65"><input type="checkbox" checked={tile.active !== false} onChange={(e) => updateTile(index, "active", e.target.checked)} />Show on homepage</label>
              </div>
            </article>;
          })}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl border border-cream/10 bg-mall-900/95 p-3 backdrop-blur">
        <button disabled={saving} className="min-h-11 rounded-lg bg-mall-accent px-4 py-2.5 text-sm font-semibold text-mall-900 disabled:opacity-50">{saving ? "Saving…" : "Save homepage content"}</button>
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-300"><Check size={14} />Changes saved</span>}
      </div>
    </form>
  );
}
