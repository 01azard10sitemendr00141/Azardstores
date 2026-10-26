import { useRef, useState } from "react";
import { X } from "lucide-react";
import useModalAccessibility from "../hooks/useModalAccessibility";

export default function CustomerCancellationForm({ order, submitting = false, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  useModalAccessibility(dialogRef, onClose, submitting);
  const isPaid = order?.paymentStatus === "paid";
  const title = isPaid ? "Request cancellation" : "Cancel this order";

  async function submit(event) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 8) return setError("Please explain the reason in at least 8 characters.");
    setError("");
    try {
      await onSubmit(cleanReason);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Could not submit the cancellation. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <form ref={dialogRef} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="customer-cancellation-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl outline-none sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-red-300">Order #{String(order?._id || "").slice(-6).toUpperCase()}</p><h2 id="customer-cancellation-title" className="mt-1 font-display text-2xl text-cream">{title}</h2></div><button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        <div className="mb-5 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-relaxed text-cream/65">{isPaid ? "This is a request for Azard Stores to review before dispatch. If approved, the paid order value is added to your Store Balance; cash refunds are not offered." : "This order will be cancelled now. Any stock reservation or Store Balance reserved for it will be released."}</div>
        <label className="block text-xs text-cream/65">Reason for {isPaid ? "the request" : "cancellation"}<textarea autoFocus required value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} rows={4} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Tell us why you need to cancel this order." /></label>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Keep order</button><button type="submit" disabled={submitting || reason.trim().length < 8} className="flex-1 rounded-xl bg-red-300 px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Sending…" : title}</button></div>
      </form>
    </div>
  );
}
