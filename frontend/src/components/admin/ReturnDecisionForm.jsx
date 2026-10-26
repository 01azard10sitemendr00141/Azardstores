import { useRef, useState } from "react";
import { X } from "lucide-react";
import { getReturnRequestLines } from "../../utils/returnQuantities";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function ReturnDecisionForm({ order, request, status, submitting = false, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const [method, setMethod] = useState("drop-off");
  const [destination, setDestination] = useState("");
  const [contact, setContact] = useState("");
  const [packing, setPacking] = useState("");
  const [reason, setReason] = useState("");
  const [inspection, setInspection] = useState("");
  const [error, setError] = useState("");
  function requestClose() {
    if (submitting) return;
    const isDirty = status === "approved"
      ? method !== "drop-off" || Boolean(destination.trim() || contact.trim() || packing.trim())
      : status === "rejected"
        ? Boolean(reason.trim())
        : Boolean(destination.trim() || inspection.trim());
    if (isDirty && !window.confirm("Discard your unsaved return decision?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting);
  const items = getReturnRequestLines(request, order).map((line) => `${line.name} × ${line.quantity}`).join(", ");
  const title = status === "approved" ? "Approve request" : status === "rejected" ? "Decline request" : "Record receipt and inspection";

  async function submit(event) {
    event.preventDefault();
    let note = "";
    if (status === "approved") {
      if (!destination.trim() || !contact.trim()) return setError("Enter the exact return destination and a customer contact number.");
      note = `Return method: ${method}. Return destination: ${destination.trim()}. Customer contact: ${contact.trim()}.${packing.trim() ? ` Packing or reference requirements: ${packing.trim()}.` : ""}`;
    } else if (status === "rejected") {
      if (!reason.trim()) return setError("Add the reason for declining this request.");
      note = reason.trim();
    } else {
      if (!destination.trim() || !inspection.trim()) return setError("Enter where the item was received and the inspection result.");
      note = `Received at: ${destination.trim()}. Inspection: ${inspection.trim()}`;
    }
    setError("");
    try { await onSubmit(note); }
    catch (submitError) { setError(submitError?.message || "Could not save this decision. Please try again."); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="return-decision-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">{request.type} · {request.status}</p><h2 id="return-decision-title" className="mt-1 font-display text-2xl text-cream">{title}</h2></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        <div className="mb-5 rounded-xl bg-mall-800 p-3 text-xs"><p className="text-cream/75">{items}</p><p className="mt-1 text-cream/45">Customer reason: {request.reason}</p><p className="mt-2 text-cream/35">Estimated Store Balance value: KSh {Number(request.storeBalanceAmount || 0).toLocaleString()} · confirmed after inspection</p></div>

        {status === "approved" && <div className="space-y-4">
          <label className="block text-xs text-cream/65">Return method<select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent"><option value="drop-off">Drop off</option><option value="parcel">Send by parcel</option></select></label>
          <label className="block text-xs text-cream/65">Exact destination or parcel office<input data-dialog-initial-focus required value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={300} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Office name, street, town, county"/></label>
          <label className="block text-xs text-cream/65">Customer contact number<input required value={contact} onChange={(event) => setContact(event.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Phone number for handover coordination"/></label>
          <label className="block text-xs text-cream/65">Packing or parcel reference requirements <span className="text-cream/30">(optional)</span><textarea value={packing} onChange={(event) => setPacking(event.target.value)} maxLength={500} rows={2} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="For example, include the order number in the parcel"/></label>
        </div>}
        {status === "rejected" && <label className="block text-xs text-cream/65">Reason for declining<textarea data-dialog-initial-focus required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Explain the decision clearly for the customer"/></label>}
        {status === "completed" && <div className="space-y-4"><label className="block text-xs text-cream/65">Where was the item received?<input data-dialog-initial-focus required value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={300} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Store, office, or parcel branch"/></label><label className="block text-xs text-cream/65">Inspection result<textarea required value={inspection} onChange={(event) => setInspection(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Record condition and whether it met the return requirements"/></label><p className="rounded-xl border border-mall-accent/15 bg-mall-accent/5 p-3 text-xs leading-relaxed text-cream/55">Saving completes the request and adds the eligible item value to Store Balance for a future order. No replacement is shipped automatically. Delivery charges are excluded; cash refunds are not offered.</p></div>}

        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50 ${status === "rejected" ? "bg-red-300" : "bg-mall-accent"}`}>{submitting ? "Saving…" : title}</button></div>
      </form>
    </div>
  );
}
