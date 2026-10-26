import { useRef, useState } from "react";
import { X, MapPin, PackageCheck } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function ParcelStatusForm({ order, status, submitting = false, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const route = order.deliveryRoute || {};
  const configuredBranch = [route.officeName, route.officeAddress].filter(Boolean).join(", ");
  const initialReference = order.parcelReference || "";
  const initialBranch = order.collectionBranch || configuredBranch;
  const [reference, setReference] = useState(initialReference);
  const [branch, setBranch] = useState(initialBranch);
  const [error, setError] = useState("");
  const dispatching = status === "shipped";
  function requestClose() {
    if (submitting) return;
    const isDirty = dispatching
      ? reference.trim() !== initialReference.trim()
      : branch.trim() !== initialBranch.trim();
    if (isDirty && !window.confirm("Discard your unsaved parcel update?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting);

  async function submit(event) {
    event.preventDefault();
    if (dispatching && !reference.trim()) return setError("Enter the parcel company’s booking or tracking reference.");
    if (!dispatching && !branch.trim()) return setError("Confirm the exact parcel office where the customer will collect the order.");
    setError("");
    try {
      await onSubmit(dispatching
        ? { status, parcelReference: reference.trim() }
        : { status, collectionBranch: branch.trim() });
    } catch (submitError) {
      setError(submitError?.message || "Could not update the parcel status. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="parcel-status-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order._id).slice(-6).toUpperCase()}</p><h2 id="parcel-status-title" className="mt-1 font-display text-2xl text-cream">{dispatching ? "Record parcel dispatch" : "Confirm collection office"}</h2><p className="mt-1 text-xs text-cream/45">The customer will receive an email and see this update on their order.</p></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-cream/8 bg-mall-800 p-3 text-xs"><MapPin size={15} className="mt-0.5 shrink-0 text-mall-accent"/><div><p className="font-medium text-cream/80">{route.carrier || "Parcel carrier"}{route.officeName ? ` · ${route.officeName}` : ""}</p><p className="mt-1 text-cream/45">{[order.deliveryTown, order.deliveryCounty].filter(Boolean).join(", ")}{route.officeAddress ? ` · ${route.officeAddress}` : ""}</p>{Number(route.estimatedDays) > 0 && <p className="mt-1 text-cream/35">Configured transit estimate: about {route.estimatedDays} day{Number(route.estimatedDays) === 1 ? "" : "s"}</p>}{!dispatching && order.parcelReference && <p className="mt-1 text-cream/55">Carrier reference: {order.parcelReference}</p>}</div></div>
        {dispatching
          ? <label className="block text-xs text-cream/65">Parcel booking or tracking reference<input required value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Enter the carrier’s reference"/><span className="mt-1 block text-[11px] text-cream/35">This reference will be included in the dispatch email and order tracking details.</span></label>
          : <label className="block text-xs text-cream/65">Customer collection office<input required value={branch} onChange={(event) => setBranch(event.target.value)} maxLength={300} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Confirm office name and address"/><span className="mt-1 block text-[11px] text-cream/35">The customer will be told to collect from this office using the parcel reference.</span></label>}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-mall-accent/5 p-3 text-[11px] leading-relaxed text-cream/50"><PackageCheck size={14} className="mt-0.5 shrink-0 text-mall-accent"/>{dispatching ? "Only mark this parcel dispatched after the carrier has accepted it and issued this reference." : "Only mark the parcel ready after the carrier confirms it has arrived at this collection office."}</div>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting} className="flex-1 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Saving…" : dispatching ? "Confirm dispatch" : "Confirm ready for collection"}</button></div>
      </form>
    </div>
  );
}
