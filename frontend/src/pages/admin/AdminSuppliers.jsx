import { useEffect, useState } from "react";
import { Plus, Store, X } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", contact: "", email: "", note: "" });

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await api.get("/suppliers", { params: { limit: 100 } });
      setSuppliers(response.data.suppliers || []);
    } catch {
      setLoadError("Suppliers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/suppliers", { ...form, products: [] });
      setForm({ name: "", contactName: "", contact: "", email: "", note: "" });
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Supplier could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-4">
        <div>
          <p className="mb-0.5 font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Admin only</p>
          <h1 className="font-display text-2xl text-cream">Suppliers</h1>
        </div>
        <button type="button" onClick={() => setShowForm((current) => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-mall-accent px-4 text-xs font-semibold text-mall-900">
          {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? "Close" : "Add supplier"}
        </button>
      </div>
      <p className="mb-5 max-w-3xl text-xs leading-relaxed text-cream/45">Manage supplier contacts and internal stock sources. Customer-facing order pages never expose supplier names or costs.</p>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-300/15 bg-red-300/5 p-3 text-xs text-red-200">{error}</p>}
      {showForm && (
        <form onSubmit={submit} className="mb-5 grid gap-3 rounded-2xl border border-cream/10 bg-mall-800/50 p-4 sm:grid-cols-2">
          <label className="text-xs text-cream/60">Supplier name *<input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <label className="text-xs text-cream/60">Contact name<input maxLength={160} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <label className="text-xs text-cream/60">Phone / WhatsApp<input maxLength={200} value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <label className="text-xs text-cream/60">Email<input type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <label className="text-xs text-cream/60 sm:col-span-2">Internal note<textarea maxLength={1000} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1.5 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 py-2 text-sm text-cream" /></label>
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-mall-accent px-4 text-sm font-semibold text-mall-900 sm:col-span-2 disabled:opacity-50">{saving ? "Saving…" : "Save supplier"}</button>
        </form>
      )}
      {loading ? (
        <p className="py-16 text-center text-xs text-cream/40">Loading suppliers…</p>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : suppliers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream/10 py-16 text-center">
          <Store size={28} className="mx-auto mb-3 text-cream/20" />
          <p className="text-sm text-cream/60">No suppliers added</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {suppliers.map((supplier) => (
            <article key={supplier._id} className="rounded-2xl border border-cream/8 bg-mall-800/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg text-cream">{supplier.name}</h2>
                  <p className="mt-1 text-xs text-cream/45">{supplier.contactName || "No contact name"} · {supplier.contact || "No phone"}{supplier.email ? ` · ${supplier.email}` : ""}</p>
                </div>
                <span className={`rounded-full px-2 py-1 font-mono-tag text-[9px] uppercase ${supplier.isActive ? "bg-emerald-400/10 text-emerald-300" : "bg-cream/5 text-cream/40"}`}>{supplier.isActive ? "Active" : "Inactive"}</span>
              </div>
              {supplier.note && <p className="mt-3 text-xs text-cream/45">{supplier.note}</p>}
              <p className="mt-3 text-[11px] text-cream/35">{supplier.products?.length || 0} product assignments</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
