import { useRef, useState } from "react";
import { X } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function AvailabilityResolutionForm({ order, submitting = false, onClose, onSubmit, restoreFocusRef }) {
  const dialogRef = useRef(null);
  const paid = order.paymentStatus === "paid";
  const initialOutcome = ["store_credit", "store_balance"].includes(order.availabilityIssue?.customerChoice) && paid ? "store_balance_issued" : "replacement_arranged";
  const [outcome, setOutcome] = useState(initialOutcome);
  const [customerMessage, setCustomerMessage] = useState("");
  const [error, setError] = useState("");
  function requestClose() {
    if (submitting) return;
    if ((customerMessage.trim() || outcome !== initialOutcome) && !window.confirm("Discard your unsaved availability resolution?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting, true, restoreFocusRef);

  async function submit(event) {
    event.preventDefault();
    if (customerMessage.trim().length < 8) return setError("Add a clear customer update of at least 8 characters, excluding leading and trailing spaces.");
    setError("");
    try {
      await onSubmit({ outcome, customerMessage: customerMessage.trim() });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Could not record this resolution.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="availability-resolution-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order._id).slice(-6).toUpperCase()}</p><h2 id="availability-resolution-title" className="mt-1 font-display text-2xl text-cream">Resolve unavailable items</h2></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        <div className="mb-5 rounded-xl bg-mall-800 p-3 text-xs"><p className="font-semibold text-cream/75">Unavailable items</p><p className="mt-1 text-cream/55">{(order.availabilityIssue?.itemIndexes || []).map((index) => order.items?.[index]?.name || `Item ${index + 1}`).join(", ")}</p>{order.availabilityIssue?.customerChoice && <p className="mt-2 text-cream/45">Customer preference: {order.availabilityIssue.customerChoice === "replacement" ? "Replacement" : "Store Balance"}</p>}</div>
        <fieldset disabled={submitting} className="space-y-2 disabled:opacity-70"><legend className="mb-2 text-xs text-cream/65">Agreed outcome</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-xs"><input type="radio" name="availability-outcome" value="replacement_arranged" checked={outcome === "replacement_arranged"} onChange={() => { setOutcome("replacement_arranged"); setError(""); }} className="mt-0.5 accent-mall-accent"/><span><span className="block font-semibold text-cream/85">Replacement arranged</span><span className="mt-1 block text-cream/45">Record the agreement, then create the replacement order from this order’s details.</span></span></label>
          {paid && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-xs"><input type="radio" name="availability-outcome" value="store_balance_issued" checked={outcome === "store_balance_issued"} onChange={() => { setOutcome("store_balance_issued"); setError(""); }} className="mt-0.5 accent-mall-accent"/><span><span className="block font-semibold text-cream/85">Issue paid value to Store Balance</span><span className="mt-1 block text-cream/45">Only use this when the customer agreed. No cash refund is issued.</span></span></label>}
        </fieldset>
        <label className="mt-4 block text-xs text-cream/65">Customer update<textarea required value={customerMessage} onChange={(event) => { setCustomerMessage(event.target.value); setError(""); }} disabled={submitting} minLength={8} maxLength={500} rows={4} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent disabled:opacity-60" placeholder={outcome === "replacement_arranged" ? "Confirm what was agreed and that Azard will arrange the replacement." : "Confirm the Store Balance amount and how the customer can use it."}/><span className="mt-2 block text-[11px] text-cream/40">Enter at least 8 characters, excluding leading and trailing spaces, to enable recording.</span></label>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting || customerMessage.trim().length < 8} className="flex-1 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Saving…" : "Record resolution"}</button></div>
      </form>
    </div>
  );
}
