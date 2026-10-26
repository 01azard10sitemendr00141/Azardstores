import { useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function DeliveryCompletionForm({ order, status, submitting = false, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const [recipientName, setRecipientName] = useState("");
  const [note, setNote] = useState("");
  const codOrder = ["cod", "cash_on_delivery", "cash on delivery"].includes(String(order.paymentMethod || "").trim().toLowerCase());
  const cashDue = codOrder && order.paymentStatus !== "paid"
    ? Math.max(0, Math.round((Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)) * 100) / 100)
    : 0;
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const initialCashAmount = cashDue ? String(cashDue) : "";
  const [cashAmount, setCashAmount] = useState(initialCashAmount);
  const [error, setError] = useState("");
  const isCollection = status === "collected";
  function requestClose() {
    if (submitting) return;
    const isDirty = Boolean(recipientName.trim() || note.trim())
      || (cashDue > 0 && (cashConfirmed || cashAmount !== initialCashAmount));
    if (isDirty && !window.confirm("Discard your unsaved handover details?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting);

  async function submit(event) {
    event.preventDefault();
    if (!recipientName.trim()) return setError(isCollection ? "Enter the name of the person who collected the parcel." : "Enter the name of the person who received the delivery.");
    if (cashDue > 0 && !cashConfirmed) return setError("Confirm that the exact cash amount was received before marking this order paid.");
    if (cashDue > 0 && Math.abs(Number(cashAmount) - cashDue) > 0.009) return setError(`The cash amount must match the amount due: KSh ${cashDue.toLocaleString()}.`);
    setError("");
    try {
      await onSubmit({
        status,
        deliveryRecipient: recipientName.trim(),
        deliveryNote: note.trim(),
        codCashReceived: cashDue > 0 && cashConfirmed,
        codCashAmount: cashDue > 0 ? Number(cashAmount) : 0,
      });
    } catch (submitError) {
      setError(submitError?.message || "Could not record this handover. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="delivery-completion-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order._id).slice(-6).toUpperCase()}</p><h2 id="delivery-completion-title" className="mt-1 font-display text-2xl text-cream">{isCollection ? "Confirm parcel collection" : "Confirm delivery"}</h2><p className="mt-1 text-xs text-cream/45">This records the handover and sends the customer a final order update.</p></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        <label className="block text-xs text-cream/65">{isCollection ? "Collected by" : "Received by"}<input required value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Name of recipient"/></label>
        {order.deliveryRoute?.serviceType === "parcel" && <div className="mt-4 rounded-xl bg-mall-800 p-3 text-xs text-cream/55"><p className="font-medium text-cream/75">{order.deliveryRoute.carrier} · {order.collectionBranch || order.deliveryRoute.officeName}</p>{order.parcelReference && <p className="mt-1">Parcel reference: {order.parcelReference}</p>}</div>}
        {cashDue > 0 && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
          <p className="text-xs font-semibold text-amber-100">Cash on delivery · KSh {cashDue.toLocaleString()} due</p>
          <label className="mt-3 block text-xs text-cream/65">Cash amount received<input type="number" min="0" step="0.01" required value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent"/></label>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-amber-100/80"><input type="checkbox" checked={cashConfirmed} onChange={(event) => setCashConfirmed(event.target.checked)} className="mt-0.5 accent-orange-400"/><span>I confirm this exact cash amount was received from the customer.</span></label>
        </div>}
        {cashDue === 0 && <p className="mt-4 rounded-xl bg-emerald-300/5 p-3 text-xs text-emerald-100/80">{order.paymentStatus === "paid" ? "Payment is already recorded. This action only confirms the handover." : "No cash amount is due for this order."}</p>}
        <label className="mt-4 block text-xs text-cream/65">Handover note <span className="text-cream/30">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" placeholder="Optional delivery or collection details"/></label>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50"><CheckCircle2 size={15}/>{submitting ? "Saving…" : isCollection ? "Confirm collection" : cashDue > 0 ? "Confirm delivery & cash received" : "Confirm delivery"}</button></div>
      </form>
    </div>
  );
}
