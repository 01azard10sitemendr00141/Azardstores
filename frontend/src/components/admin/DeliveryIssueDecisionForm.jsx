import { useRef, useState } from "react";
import { X } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function DeliveryIssueDecisionForm({ order, issue, status, submitting = false, onClose, onSubmit, restoreFocusRef }) {
  const dialogRef = useRef(null);
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const isResolving = status === "resolved";
  const title = isResolving ? "Record resolution" : "Update customer";
  function requestClose() {
    if (submitting) return;
    if (response.trim() && !window.confirm("Discard your unsaved customer update?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting, true, restoreFocusRef);

  async function submit(event) {
    event.preventDefault();
    const note = response.trim();
    if (note.length < 8) return setError("Write at least 8 characters, excluding leading and trailing spaces, so the customer receives a useful update.");
    setError("");
    try {
      await onSubmit(note);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Could not save this update. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="delivery-issue-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order.orderNumber || order._id).slice(-6)}</p><h2 id="delivery-issue-title" className="mt-1 font-display text-2xl text-cream">{title}</h2></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>

        <div className="mb-5 space-y-3 rounded-xl bg-mall-800 p-3 text-xs">
          <div><p className="font-semibold text-cream/75">Customer report</p><p className="mt-1 whitespace-pre-wrap text-cream/55">{issue.reason}</p><p className="mt-1 text-cream/30">Reported {new Date(issue.requestedAt || issue.createdAt).toLocaleString("en-KE")}</p></div>
          {order.deliveryConfirmation?.confirmedAt && <div className="border-t border-cream/10 pt-3"><p className="font-semibold text-cream/75">Recorded handover</p><p className="mt-1 text-cream/50">{order.deliveryConfirmation.recipientName} · {new Date(order.deliveryConfirmation.confirmedAt).toLocaleString("en-KE")}</p>{order.deliveryConfirmation.note && <p className="mt-1 text-cream/40">Staff note: {order.deliveryConfirmation.note}</p>}</div>}
          {issue.response && <div className="border-t border-cream/10 pt-3"><p className="font-semibold text-cream/75">Previous Azard update</p><p className="mt-1 whitespace-pre-wrap text-cream/50">{issue.response}</p></div>}
        </div>

        <label className="block text-xs text-cream/65">{isResolving ? "Resolution and next steps for the customer" : "What Azard is checking"}<textarea required value={response} onChange={(event) => setResponse(event.target.value)} minLength={8} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder={isResolving ? "Explain what was confirmed, the outcome, and any next step." : "Explain what you have checked and what you are following up on."}/><span className="mt-2 block text-[11px] text-cream/40">Enter at least 8 characters, excluding leading and trailing spaces, to enable saving.</span></label>
        {isResolving && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-relaxed text-cream/55">This closes the report and notifies the customer. It does not change the order’s delivery status or recorded handover.</p>}
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting || response.trim().length < 8} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50 ${isResolving ? "bg-emerald-300" : "bg-mall-accent"}`}>{submitting ? "Saving…" : title}</button></div>
      </form>
    </div>
  );
}
