import { useMemo, useRef, useState } from "react";
import { X, RotateCcw, Repeat2 } from "lucide-react";
import { getAvailableReturnQuantities } from "../utils/returnQuantities";
import useModalAccessibility from "../hooks/useModalAccessibility";

export default function ReturnRequestForm({ order, submitting = false, onClose, onSubmit }) {
  const available = useMemo(() => getAvailableReturnQuantities(order), [order]);
  const [type, setType] = useState("return");
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [conditionConfirmed, setConditionConfirmed] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  useModalAccessibility(dialogRef, onClose, submitting);
  const selected = Object.entries(quantities)
    .map(([index, quantity]) => ({ itemIndex: Number(index), quantity: Number(quantity) }))
    .filter((line) => line.quantity > 0);
  const estimatedValue = selected.reduce((sum, line) => sum + Number(order.items[line.itemIndex]?.price || 0) * line.quantity, 0);

  async function submit(event) {
    event.preventDefault();
    if (!selected.length) return setError("Choose at least one item and quantity.");
    if (!reason.trim()) return setError("Tell us why you are requesting this.");
    if (!conditionConfirmed) return setError("Confirm the selected items meet the condition requirements.");
    setError("");
    try {
      await onSubmit({ type, itemQuantities: selected, reason: reason.trim(), unused: true, originalPackaging: true });
    } catch (submitError) {
      setError(submitError?.message || "Could not submit the request. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <form ref={dialogRef} tabIndex={-1} onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl outline-none sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="return-request-title">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-accent">Order #{String(order._id).slice(-6).toUpperCase()}</p><h2 id="return-request-title" className="mt-1 font-display text-2xl text-cream">Return or exchange</h2><p className="mt-1 text-xs text-cream/45">Choose the items. Approved requests are settled as Store Balance for a future order; we don’t ship a replacement automatically.</p></div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {[{ id: "return", label: "Return", Icon: RotateCcw }, { id: "exchange", label: "Exchange", Icon: Repeat2 }].map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setType(id)} aria-pressed={type === id} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition ${type === id ? "border-mall-accent/60 bg-mall-accent/10 text-mall-accent" : "border-cream/10 bg-mall-800 text-cream/60"}`}><Icon size={15}/>{label}</button>)}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-semibold text-cream/75">Select items and quantities</legend>
          {order.items.map((item, index) => {
            if (!available[index]) return null;
            const quantity = Number(quantities[index] || 0);
            return <div key={`${item.product || item.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-cream/8 bg-mall-800/70 p-3">
              {item.image && <img src={item.image} alt="" className="h-11 w-11 rounded-lg object-cover"/>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm text-cream">{item.name}</p><p className="mt-0.5 text-[11px] text-cream/40">KSh {Number(item.price).toLocaleString()} each · {available[index]} eligible</p></div>
              <label className="flex items-center gap-2 text-[11px] text-cream/45"><span className="sr-only">Quantity for {item.name}</span><select value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [index]: Number(event.target.value) }))} className="rounded-lg border border-cream/10 bg-mall-900 px-2 py-2 text-sm text-cream outline-none focus:border-mall-accent"><option value={0}>Skip</option>{Array.from({ length: available[index] }, (_, i) => i + 1).map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
            </div>;
          })}
        </fieldset>
        {order.items.some((item) => ["final_sale", "perishable", "digital_product"].includes(item.returnEligibility)) && (
          <p className="mt-3 text-[11px] leading-relaxed text-cream/40">Final sale, perishable, and digital products or gift cards in this order are excluded from returns and exchanges.</p>
        )}

        <label className="mt-5 block text-xs font-semibold text-cream/75" htmlFor="return-reason">Reason for request</label>
        <textarea id="return-reason" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell us what happened or why you’d like to return or exchange the item." className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none placeholder:text-cream/30 focus:border-mall-accent/60"/>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-mall-800/70 p-3 text-xs leading-relaxed text-cream/65"><input type="checkbox" checked={conditionConfirmed} onChange={(event) => setConditionConfirmed(event.target.checked)} className="mt-0.5 accent-orange-400"/><span>I confirm the selected items are unused and in their original packaging, with included tags and accessories.</span></label>
        <div className="mt-4 rounded-xl border border-cream/8 bg-mall-800/50 p-3 text-xs"><div className="flex justify-between gap-3 text-cream/70"><span>Estimated item value for Store Balance</span><strong className="text-cream">KSh {estimatedValue.toLocaleString()}</strong></div><p className="mt-1 text-[11px] leading-relaxed text-cream/40">The final eligible value is confirmed after inspection. Delivery charges are excluded; approved value is added to Store Balance, not paid as cash.</p></div>
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" disabled={submitting} onClick={onClose} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Keep order</button><button type="submit" disabled={submitting} className="flex-1 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Submitting…" : `Submit ${type} request`}</button></div>
      </form>
    </div>
  );
}
