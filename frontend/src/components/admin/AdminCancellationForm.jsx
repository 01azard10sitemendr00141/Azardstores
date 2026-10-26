import { useRef, useState } from "react";
import { X } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function AdminCancellationForm({ order, request, decision, mode, submitting = false, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  useModalAccessibility(dialogRef, requestClose, submitting);
  const isPaidRequest = mode === "request" && decision === "approved";
  const isRejecting = mode === "request" && decision === "rejected";
  const title = mode === "status" ? "Cancel order" : isPaidRequest ? "Approve cancellation" : "Decline cancellation";

  function requestClose() {
    if (note.trim() && !window.confirm("Discard the cancellation decision note?")) return;
    onClose();
  }

  async function submit(event) {
    event.preventDefault();
    const cleanNote = note.trim();
    if (cleanNote.length < 8) return setError("Add at least 8 characters so the reason is clear in the order record.");
    setError("");
    try {
      await onSubmit(cleanNote);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Could not save this decision. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="admin-cancellation-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order?._id || "").slice(-6).toUpperCase()}</p><h2 id="admin-cancellation-title" className="mt-1 font-display text-2xl text-cream">{title}</h2></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        {request && <div className="mb-4 rounded-xl bg-mall-800 p-3 text-xs"><p className="font-semibold text-cream/75">Customer’s reason</p><p className="mt-1 whitespace-pre-wrap text-cream/55">{request.reason}</p></div>}
        <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-relaxed text-cream/65">{isPaidRequest ? "Approving cancels the order and adds the eligible paid order value to Store Balance. Cash refunds are not offered." : isRejecting ? "The order remains active. Explain why the cancellation request cannot be approved." : "This cancels the order. If payment was received, the paid value must be issued to Store Balance. Stock reservations will be released."}</div>
        <label htmlFor="cancellation-reason" className="block text-xs text-cream/65">{isRejecting ? "Reason sent to the customer" : "Reason recorded on the order"}</label>
        <textarea id="cancellation-reason" data-dialog-initial-focus required value={note} onChange={(event) => setNote(event.target.value)} minLength={8} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder={isRejecting ? "Explain why the order must continue." : "Record the reason for this cancellation decision."}/>
        <p className="mt-2 text-[11px] text-cream/40">Enter at least 8 characters to enable saving.</p>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Keep active</button><button type="submit" disabled={submitting || note.trim().length < 8} className="flex-1 rounded-xl bg-red-300 px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Saving…" : title}</button></div>
      </form>
    </div>
  );
}
