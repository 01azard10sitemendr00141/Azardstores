import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Truck, Pencil, Trash2, Check, X, Clock, Search, CircleCheck, CirclePause, ChevronRight, ArrowLeft } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import { useSettings } from "../../context/SettingsContext";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const EMPTY_ROUTE = { county: "", town: "", serviceType: "parcel", carrier: "", officeName: "", officeAddress: "", fee: 0, estimatedDays: "", active: true };

export default function AdminDelivery() {
  const { updateSettings } = useSettings();
  const [settings, setSettings] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [deliveryCounties, setDeliveryCounties] = useState(["Nairobi"]);
  const [deliveryTowns, setDeliveryTowns] = useState([]);
  const [cbdFee, setCbdFee] = useState(0);
  const [cbdFreeDeliveryThreshold, setCbdFreeDeliveryThreshold] = useState(0);
  const [editor, setEditor] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedCounty, setSelectedCounty] = useState("");
  const [catalogEditor, setCatalogEditor] = useState(null);
  const [catalogName, setCatalogName] = useState("");
  const [routeRemovalIndex, setRouteRemovalIndex] = useState(null);
  const routeRemovalDialogRef = useRef(null);
  const catalogDialogRef = useRef(null);
  const routeEditorDialogRef = useRef(null);

  useModalAccessibility(routeRemovalDialogRef, () => setRouteRemovalIndex(null), saving, routeRemovalIndex != null && Boolean(routes[routeRemovalIndex]));
  useModalAccessibility(catalogDialogRef, () => setCatalogEditor(null), saving, Boolean(catalogEditor));
  useModalAccessibility(routeEditorDialogRef, () => setEditor(null), saving, Boolean(editor));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get("/settings/admin").then(({ data }) => {
      if (!active) return;
      setSettings(data);
      setRoutes(data.deliveryRoutes || []);
      setDeliveryCounties(data.deliveryCounties || ["Nairobi"]);
      setDeliveryTowns(data.deliveryTowns || []);
      setCbdFee(data.deliveryFee ?? 0);
      setCbdFreeDeliveryThreshold(data.freeDeliveryThreshold ?? 0);
    }).catch(() => { if (active) setError("Delivery settings could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  async function saveDelivery(nextRoutes = routes) {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/settings", {
        deliveryFee: Number(cbdFee),
        freeDeliveryThreshold: Number(cbdFreeDeliveryThreshold),
        deliveryCounties,
        deliveryTowns,
        deliveryRoutes: nextRoutes,
      });
      updateSettings(data);
      setSettings(data);
      setRoutes(data.deliveryRoutes || []);
      setDeliveryCounties(data.deliveryCounties || ["Nairobi"]);
      setDeliveryTowns(data.deliveryTowns || []);
      setCbdFee(data.deliveryFee ?? 0);
      setCbdFreeDeliveryThreshold(data.freeDeliveryThreshold ?? 0);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save delivery settings.");
    } finally { setSaving(false); }
  }

  function openNewRoute() {
    setCatalogEditor(null);
    setRouteRemovalIndex(null);
    setEditorError("");
    setEditingIndex(-1);
    setEditor({ ...EMPTY_ROUTE });
  }

  function openEditRoute(index) {
    setCatalogEditor(null);
    setRouteRemovalIndex(null);
    setEditorError("");
    setEditingIndex(index);
    setEditor({ ...routes[index], estimatedDays: routes[index].estimatedDays ?? "" });
  }

  function openCatalogEditor(type) {
    setEditor(null);
    setRouteRemovalIndex(null);
    setCatalogEditor(type);
    setCatalogName("");
    setEditorError("");
  }

  function applyRoute(e) {
    e.preventDefault();
    if (!editor.county.trim() || !editor.town.trim()) {
      setEditorError("Enter the county and town or area.");
      return;
    }
    if (editor.serviceType === "direct" && editor.county.trim().toLowerCase() !== "nairobi") {
      setEditorError("Direct delivery zones can only be added within Nairobi County.");
      return;
    }
    if (editor.serviceType !== "direct" && (!editor.carrier.trim() || !editor.officeName.trim() || editor.officeAddress.trim().length < 8)) {
      setEditorError("Enter the parcel company, collection office, and a complete office address.");
      return;
    }
    if (!Number.isFinite(Number(editor.fee)) || Number(editor.fee) < 0) {
      setEditorError("Enter a valid delivery charge.");
      return;
    }
    const estimatedDays = String(editor.estimatedDays ?? "").trim();
    if (estimatedDays && (!Number.isInteger(Number(estimatedDays)) || Number(estimatedDays) < 1 || Number(estimatedDays) > 30)) {
      setEditorError("Estimated delivery must be a whole number from 1 to 30 days.");
      return;
    }
    const nextRoute = { ...editor, fee: Number(editor.fee), estimatedDays: estimatedDays ? Number(estimatedDays) : null };
    setRoutes((current) => editingIndex >= 0
      ? current.map((route, index) => index === editingIndex ? nextRoute : route)
      : [...current, nextRoute]);
    setDeliveryCounties((current) => current.some((county) => county.toLowerCase() === editor.county.trim().toLowerCase()) ? current : [...current, editor.county.trim()]);
    setDeliveryTowns((current) => current.some((destination) => destination.county.toLowerCase() === editor.county.trim().toLowerCase() && destination.town.toLowerCase() === editor.town.trim().toLowerCase()) ? current : [...current, { county: editor.county.trim(), town: editor.town.trim() }]);
    setEditor(null);
    setEditorError("");
    setError("");
  }

  function removeRoute(index) {
    setCatalogEditor(null);
    setEditor(null);
    setRouteRemovalIndex(index);
  }

  function confirmRemoveRoute() {
    if (routeRemovalIndex == null || !routes[routeRemovalIndex]) return;
    const index = routeRemovalIndex;
    setRoutes((current) => current.filter((_, routeIndex) => routeIndex !== index));
    setRouteRemovalIndex(null);
  }

  function saveCatalogEntry(e) {
    e.preventDefault();
    const value = catalogName.trim();
    if (!value) return;
    if (catalogEditor === "county") {
      if (counties.some((county) => county.toLowerCase() === value.toLowerCase())) return setEditorError("That county is already listed.");
      setDeliveryCounties((current) => [...current, value]);
    } else {
      if (towns.some((town) => town.toLowerCase() === value.toLowerCase())) return setEditorError("That town is already listed in this county.");
      setDeliveryTowns((current) => [...current, { county: selectedCounty, town: value }]);
    }
    setCatalogEditor(null);
    setCatalogName("");
    setEditorError("");
  }

  const inputClass = "w-full bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";
  const normalizedRoutes = (list) => list.map((route) => ({
    id: route._id || "",
    county: route.county,
    town: route.town,
    carrier: route.carrier,
    serviceType: route.serviceType || "parcel",
    officeName: route.officeName,
    officeAddress: route.officeAddress,
    fee: Number(route.fee),
    estimatedDays: route.estimatedDays ? Number(route.estimatedDays) : null,
    active: route.active !== false,
  }));
  const hasChanges = Boolean(settings) && (
    Number(cbdFee) !== Number(settings.deliveryFee || 0)
    || Number(cbdFreeDeliveryThreshold) !== Number(settings.freeDeliveryThreshold || 0)
    || JSON.stringify([...deliveryCounties].sort()) !== JSON.stringify([...(settings.deliveryCounties || ["Nairobi"])].sort())
    || JSON.stringify(deliveryTowns.map((destination) => `${destination.county}|${destination.town}`).sort()) !== JSON.stringify((settings.deliveryTowns || []).map((destination) => `${destination.county}|${destination.town}`).sort())
    || JSON.stringify(normalizedRoutes(routes)) !== JSON.stringify(normalizedRoutes(settings.deliveryRoutes || []))
  );
  const counties = [...new Map(["Nairobi", ...deliveryCounties, ...routes.map((route) => route.county.trim()).filter(Boolean)].map((county) => [county.toLowerCase(), county.toLowerCase() === "nairobi" ? "Nairobi" : county])).values()].sort((a, b) => a.localeCompare(b));
  const countyRoutes = routes.map((route, index) => ({ route, index })).filter(({ route }) => route.county.toLowerCase() === selectedCounty.toLowerCase());
  const towns = [...new Set([...deliveryTowns.filter((destination) => destination.county.toLowerCase() === selectedCounty.toLowerCase()).map((destination) => destination.town), ...countyRoutes.map(({ route }) => route.town)])].sort((a, b) => a.localeCompare(b));
  const visibleRoutes = countyRoutes.filter(({ route }) => `${route.town} ${route.carrier} ${route.officeName}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" /></div>;
  if (error && !settings) return <AdminLoadError message={error} onRetry={() => setAttempt((value) => value + 1)} />;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-cream/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div><p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p><h1 className="font-display text-2xl text-cream">Delivery</h1><p className="text-cream/40 text-sm mt-1">Nairobi is configured like every county; CBD direct delivery is the special case.</p></div>
        <div className="flex gap-2"><button onClick={() => openCatalogEditor("county")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cream/15 px-3 py-2.5 text-xs text-cream/70 hover:border-cream/30"><Plus size={14}/>Add county</button><button onClick={openNewRoute} className="inline-flex items-center justify-center gap-2 rounded-xl bg-mall-accent px-4 py-2.5 text-xs font-semibold text-mall-900 hover:bg-mall-accentDark transition"><Plus size={14} /> Add delivery option</button></div>
      </div>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4"><MapPin size={15} className="text-mall-accent"/><h2 className="font-display text-lg text-cream">Nairobi CBD direct delivery</h2></div>
        <div className="max-w-3xl rounded-2xl border border-cream/8 bg-mall-800/50 p-5">
          <p className="text-cream/40 text-xs mb-4">This is Azard Stores’ direct delivery area. COD is available only for eligible addresses here; all other zones require online payment before delivery or dispatch.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest">Nairobi CBD delivery fee (KSh)<input type="number" min="0" step="1" value={cbdFee} onChange={(e) => setCbdFee(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest">Free delivery above (KSh)<input type="number" min="0" step="1" value={cbdFreeDeliveryThreshold} onChange={(e) => setCbdFreeDeliveryThreshold(e.target.value)} className={`${inputClass} mt-1.5`} /><span className="mt-1 block font-sans text-[11px] normal-case tracking-normal text-cream/35">0 disables the threshold. It applies to Nairobi CBD orders only.</span></label>
          </div>
        </div>
      </section>

      <section>
        {!selectedCounty ? <>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4"><div><div className="flex items-center gap-2"><Truck size={15} className="text-mall-accent"/><h2 className="font-display text-lg text-cream">Counties</h2></div></div><span className="font-mono-tag text-[10px] uppercase text-cream/35">{counties.length} counties</span></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{counties.map((county) => { const options = routes.filter((route) => route.county.toLowerCase() === county.toLowerCase()); const townsCount = new Set([...deliveryTowns.filter((destination) => destination.county.toLowerCase() === county.toLowerCase()).map((destination) => destination.town.toLowerCase()), ...options.map((route) => route.town.toLowerCase())]).size; const activeCount = options.filter((route) => route.active !== false).length; return <button key={county} onClick={() => { setSelectedCounty(county); setSearch(""); }} className="group rounded-2xl border border-cream/10 bg-mall-800/40 p-4 text-left hover:border-mall-accent/35 transition"><div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-mall-900 text-mall-accent"><MapPin size={16}/></span><h3 className="font-display text-lg text-cream">{county}</h3></div><ChevronRight size={16} className="text-cream/30 group-hover:text-mall-accent"/></div><p className="mt-3 text-xs text-cream/45">{townsCount} {townsCount === 1 ? "town" : "towns"} · {options.length} {options.length === 1 ? "option" : "options"}</p><p className="mt-1 text-[10px] text-cream/30">{options.length ? `${activeCount} available at checkout` : county.toLowerCase() === "nairobi" ? "CBD direct delivery · no other areas configured" : "No delivery options configured"}</p></button>; })}</div>
        </> : <>
        <button onClick={() => { setSelectedCounty(""); setSearch(""); }} className="mb-4 inline-flex items-center gap-1.5 text-xs text-cream/45 hover:text-cream"><ArrowLeft size={13}/>All counties</button>
        <button onClick={() => openCatalogEditor("town")} className="mb-4 ml-3 inline-flex items-center gap-1.5 text-xs text-mall-accent"><Plus size={13}/>Add town</button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4"><div><p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">County</p><h2 className="font-display text-2xl text-cream">{selectedCounty}</h2><p className="text-cream/35 text-xs mt-1">{towns.length} towns · {countyRoutes.length} delivery options</p></div><button onClick={() => { setEditor({ ...EMPTY_ROUTE, county: selectedCounty }); setEditingIndex(-1); setEditorError(""); }} className="rounded-xl bg-mall-accent px-3 py-2.5 text-xs font-semibold text-mall-900"><Plus size={13} className="inline mr-1"/>Add town or option</button></div>
        {countyRoutes.length > 0 && <div className="relative mb-4 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/25"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search town, carrier, office..." className={`${inputClass} pl-9`}/></div>}
        {!towns.length ? (
          <div className="rounded-2xl border border-dashed border-cream/15 px-5 py-12 text-center"><p className="text-cream/75 text-sm font-medium">No towns or delivery areas listed</p><p className="text-cream/35 text-xs mt-1 mb-5">Add destinations customers can select within {selectedCounty}.</p><button onClick={() => openCatalogEditor("town")} className="inline-flex items-center gap-2 rounded-xl border border-cream/15 px-4 py-2.5 text-xs text-cream/75 hover:border-cream/30"><Plus size={13}/> Add first town</button></div>
        ) : (
          <div className="space-y-5">
            {towns.filter((town) => !search || visibleRoutes.some(({ route }) => route.town === town)).map((town) => {
              const townOptions = visibleRoutes.filter(({ route }) => route.town === town);
              return <div key={town} className="overflow-hidden rounded-2xl border border-cream/10 bg-mall-800/30">
                <div className="flex items-center justify-between border-b border-cream/8 bg-mall-800/45 px-4 py-3"><div><h3 className="font-display text-base text-cream">{town}</h3><p className="text-[10px] text-cream/35">{townOptions.length} delivery options</p></div><button onClick={() => { setEditor({ ...EMPTY_ROUTE, county: selectedCounty, town }); setEditingIndex(-1); setEditorError(""); }} className="inline-flex items-center gap-1 rounded-lg border border-cream/12 px-2.5 py-2 text-[10px] text-cream/60"><Plus size={11}/>Add option</button></div>
                <div className="divide-y divide-cream/6">{townOptions.map(({ route, index }) => (
              <article key={route._id || `route-${index}`} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center ${route.active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${route.active ? "bg-emerald-400/10 text-emerald-300" : "bg-cream/5 text-cream/35"}`}><MapPin size={17}/></div>
                  <div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg text-cream">{route.town}, {route.county}</h3><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] uppercase tracking-wide ${route.active ? "bg-emerald-400/10 text-emerald-300" : "bg-cream/5 text-cream/35"}`}>{route.active ? <CircleCheck size={10}/> : <CirclePause size={10}/>} {route.active ? "Active" : "Paused"}</span></div><p className="text-cream/50 text-xs mt-1">{route.serviceType === "direct" ? "Azard direct delivery · online payment" : `${route.carrier} · ${route.officeName}`}</p></div>
                  <div className="text-right shrink-0"><p className="font-display text-lg text-cream">KSh {Number(route.fee).toLocaleString()}</p><p className="text-cream/25 text-[9px] uppercase tracking-wide">per order</p></div>
                </div>
                {route.serviceType !== "direct" && <div className="mt-4 rounded-xl bg-mall-900/55 px-3 py-2.5"><p className="text-cream/45 text-xs">{route.officeAddress}</p></div>}
                <div className="flex items-center justify-between mt-4"><span className="inline-flex items-center gap-1.5 text-[10px] text-cream/35">{route.estimatedDays ? <><Clock size={11}/> Approx. {route.estimatedDays} day{route.estimatedDays === 1 ? "" : "s"}</> : "Delivery estimate not set"}</span><div className="flex gap-1.5"><button onClick={() => openEditRoute(index)} aria-label={`Edit ${route.town} route`} className="inline-flex items-center gap-1.5 rounded-lg border border-cream/10 px-2.5 py-2 text-[10px] text-cream/55 hover:text-cream hover:border-cream/20"><Pencil size={12}/> Edit</button><button onClick={() => removeRoute(index)} aria-label={`Remove ${route.town} route`} className="rounded-lg border border-red-400/10 p-2 text-red-300/60 hover:text-red-300 hover:border-red-400/25"><Trash2 size={13}/></button></div></div>
              </article>
            ))}</div>
              </div>;
            })}
            {!visibleRoutes.length && search && <div className="rounded-xl border border-cream/8 p-8 text-center text-xs text-cream/40">No options match “{search}”.</div>}
          </div>
        )}
        </>}
      </section>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
      {hasChanges && <div className="sticky bottom-4 mt-8 flex items-center justify-between gap-3 rounded-2xl border border-mall-accent/20 bg-mall-900/95 p-3 backdrop-blur shadow-xl"><p className="text-cream/55 text-xs">Unsaved delivery changes</p><button onClick={() => saveDelivery()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-mall-accent px-4 py-2.5 text-sm font-semibold text-mall-900 disabled:opacity-50"><Check size={14}/>{saving ? "Saving…" : "Save changes"}</button></div>}
      {!hasChanges && saved && <p role="status" className="mt-5 inline-flex items-center gap-2 text-xs text-emerald-300"><CircleCheck size={14}/> Delivery settings saved</p>}

      {routeRemovalIndex != null && routes[routeRemovalIndex] && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="presentation"><section ref={routeRemovalDialogRef} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="remove-route-title" className="w-full max-w-md rounded-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl"><p className="font-mono-tag text-[10px] uppercase tracking-widest text-red-300">Delivery option</p><h2 id="remove-route-title" className="mt-1 font-display text-xl text-cream">Remove {routes[routeRemovalIndex].town}, {routes[routeRemovalIndex].county}?</h2><p className="mt-3 text-xs leading-relaxed text-cream/55">Removing this option takes it out of checkout after you save delivery settings. Existing orders keep their saved carrier and office details.</p><div className="mt-5 flex justify-end gap-2"><button type="button" data-dialog-initial-focus onClick={() => setRouteRemovalIndex(null)} className="rounded-xl border border-cream/15 px-4 py-2.5 text-xs text-cream/65">Keep route</button><button type="button" onClick={confirmRemoveRoute} className="rounded-xl bg-red-300 px-4 py-2.5 text-xs font-semibold text-mall-900">Remove option</button></div></section></div>}

      {catalogEditor && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="presentation"><form ref={catalogDialogRef} role="dialog" aria-modal="true" aria-labelledby="catalog-entry-title" onSubmit={saveCatalogEntry} className="w-full max-w-md rounded-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl"><p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">Delivery directory</p><h2 id="catalog-entry-title" className="mt-1 font-display text-xl text-cream">Add {catalogEditor}</h2>{catalogEditor === "town" && <p className="mt-1 text-xs text-cream/40">County: {selectedCounty}</p>}<label className="mt-4 block text-xs text-cream/45">{catalogEditor === "county" ? "County name" : "Town or delivery area"}<input data-dialog-initial-focus value={catalogName} onChange={(e) => { setCatalogName(e.target.value); setEditorError(""); }} maxLength={100} className={`${inputClass} mt-1.5`}/></label>{editorError && <p role="alert" className="mt-2 text-xs text-red-300">{editorError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCatalogEditor(null)} className="rounded-xl border border-cream/15 px-4 py-2.5 text-xs text-cream/60">Cancel</button><button type="submit" className="rounded-xl bg-mall-accent px-4 py-2.5 text-xs font-semibold text-mall-900">Add {catalogEditor}</button></div></form></div>}

      {editor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <form ref={routeEditorDialogRef} role="dialog" aria-modal="true" aria-labelledby="delivery-route-title" onSubmit={applyRoute} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cream/10 bg-mall-900 p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-5"><div><p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">County delivery</p><h2 id="delivery-route-title" className="font-display text-xl text-cream mt-1">{editingIndex >= 0 ? "Edit delivery option" : "Add a delivery option"}</h2></div><button type="button" onClick={() => setEditor(null)} aria-label="Close" className="text-cream/40 hover:text-cream"><X size={18}/></button></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2 text-cream/45 text-xs">Delivery type<select value={editor.serviceType || "parcel"} onChange={(e) => setEditor({ ...editor, serviceType: e.target.value })} className={`${inputClass} mt-1.5`}><option value="parcel">Parcel collection office</option><option value="direct">Direct delivery zone (Nairobi County)</option></select></label>
              <label className="text-cream/45 text-xs">County<input data-dialog-initial-focus value={editor.county} onChange={(e) => setEditor({ ...editor, county: e.target.value })} placeholder="e.g. Meru" className={`${inputClass} mt-1.5`} /></label>
              <label className="text-cream/45 text-xs">Town or area<input value={editor.town} onChange={(e) => setEditor({ ...editor, town: e.target.value })} placeholder="e.g. Meru Town" className={`${inputClass} mt-1.5`} /></label>
              {editor.serviceType !== "direct" && <>
              <label className="text-cream/45 text-xs">Parcel company<input value={editor.carrier} onChange={(e) => setEditor({ ...editor, carrier: e.target.value })} placeholder="Company or matatu service" className={`${inputClass} mt-1.5`} /></label>
              <label className="text-cream/45 text-xs">Collection office<input value={editor.officeName} onChange={(e) => setEditor({ ...editor, officeName: e.target.value })} placeholder="Destination office" className={`${inputClass} mt-1.5`} /></label>
              <label className="sm:col-span-2 text-cream/45 text-xs">Office address or landmark<input value={editor.officeAddress} onChange={(e) => setEditor({ ...editor, officeAddress: e.target.value })} placeholder="Where the customer collects the parcel" className={`${inputClass} mt-1.5`} /></label>
              </>}
              <label className="text-cream/45 text-xs">Customer charge (KSh)<input type="number" min="0" value={editor.fee} onChange={(e) => setEditor({ ...editor, fee: e.target.value })} className={`${inputClass} mt-1.5`} /></label>
              <label className="text-cream/45 text-xs">Estimated days (optional)<input type="number" min="1" max="30" step="1" value={editor.estimatedDays} onChange={(e) => { const value = e.target.value; setEditor({ ...editor, estimatedDays: value }); setEditorError(value && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 30) ? "Estimated delivery must be a whole number from 1 to 30 days." : ""); }} className={`${inputClass} mt-1.5`} /><span className="mt-1 block text-[11px] text-cream/35">Enter a whole number from 1 to 30 days, or leave blank.</span></label>
            </div>
            {editorError && <p role="alert" className="mt-3 text-xs text-red-300">{editorError}</p>}
            <label className="mt-4 flex items-center gap-2 text-xs text-cream/60"><input type="checkbox" checked={editor.active !== false} onChange={(e) => setEditor({ ...editor, active: e.target.checked })} className="accent-mall-accent"/>Offer this route at checkout</label>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditor(null)} className="rounded-xl border border-cream/15 px-4 py-2.5 text-xs text-cream/60">Cancel</button><button type="submit" className="rounded-xl bg-mall-accent px-4 py-2.5 text-xs font-semibold text-mall-900">{editingIndex >= 0 ? "Apply changes" : "Add route"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
