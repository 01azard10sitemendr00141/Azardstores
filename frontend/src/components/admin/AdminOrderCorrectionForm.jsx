import { useRef, useState } from "react";
import { X } from "lucide-react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

export default function AdminOrderCorrectionForm({ order, mode, payment, submitting = false, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const [values, setValues] = useState(() => mode === "reconcile"
    ? { orderId: payment?.order?._id || payment?.metadataOrderId || "" }
    : mode === "customer"
    ? { name: order.guestInfo?.name || "", email: order.guestInfo?.email || "", phone: order.guestInfo?.phone || "", reason: "" }
    : mode === "destination"
      ? { address: order.deliveryCorrection?.address || order.deliveryAddress || "", town: order.deliveryCorrection?.town || order.deliveryTown || "", county: order.deliveryCorrection?.county || order.deliveryCounty || "", reason: "" }
      : { refundReference: "" });
  const initialValuesRef = useRef(values);
  const [error, setError] = useState("");
  const titles = { customer: "Correct guest contact details", destination: "Correct delivery destination", refund: "Record duplicate payment refund", reconcile: "Match payment to order", credit_balance: "Credit payment to Store Balance" };
  const title = titles[mode];
  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  function requestClose() {
    if (submitting) return;
    const isDirty = Object.entries(values).some(([field, value]) => value.trim() !== initialValuesRef.current[field].trim());
    if (isDirty && !window.confirm("Discard your unsaved order correction?")) return;
    onClose();
  }
  useModalAccessibility(dialogRef, requestClose, submitting);

  async function submit(event) {
    event.preventDefault();
    if (mode === "reconcile" && values.orderId.trim().length < 6) return setError("Enter at least the last 6 characters of the order ID.");
    if (!["refund", "reconcile", "credit_balance"].includes(mode) && values.reason.trim().length < 8) return setError("Record at least 8 characters explaining how this information was verified.");
    if (mode === "refund" && values.refundReference.trim().length < 3) return setError("Enter the reference from the completed refund transaction.");
    setError("");
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])));
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Could not save this update. Please try again.");
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent";
  const textareaClass = `${inputClass} resize-y`;
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="admin-order-correction-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order #{String(order._id).slice(-6).toUpperCase()}</p><h2 id="admin-order-correction-title" className="mt-1 font-display text-2xl text-cream">{title}</h2></div><button type="button" onClick={requestClose} disabled={submitting} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
        {mode === "reconcile" && <div className="space-y-3"><div className="rounded-xl bg-mall-800 p-3 text-xs"><p className="text-cream/80">Verified amount: KSh {(Number(payment?.amountSubunit || 0) / 100).toLocaleString()} · {payment?.currency}</p><p className="mt-1 text-cream/50">Verified customer email: {payment?.customerEmail || "Unavailable"}</p>{payment?.order && <p className="mt-1 text-amber-100">Suggested order #{String(payment.order._id).slice(-6).toUpperCase()} · KSh {Number(payment.order.totalAmount || 0).toLocaleString()}</p>}</div><label className="block text-xs text-cream/65">Order number or full order ID<input data-dialog-initial-focus required value={values.orderId} onChange={set("orderId")} minLength={6} maxLength={24} className={inputClass} placeholder="Enter the order number shown in Orders"/></label><p className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs text-amber-100/75">The server will link this only if the verified customer email and exact amount match. If more than one order matches, enter its full ID.</p></div>}
        {mode === "credit_balance" && <div className="space-y-3"><div className="rounded-xl bg-mall-800 p-3 text-xs"><p className="text-cream/80">Verified payment: KSh {(Number(payment?.amountSubunit || 0) / 100).toLocaleString()} · {payment?.currency}</p><p className="mt-1 text-cream/50">Customer email: {payment?.customerEmail || "Unavailable"}</p>{payment?.order && <p className="mt-1 text-amber-100">Order #{String(payment.order._id).slice(-6).toUpperCase()} · current status: {payment.order.paymentStatus}</p>}</div><p className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100/80">This records the verified unmatched amount in the customer’s Store Balance because it did not match the order total. The order remains unpaid and cannot be dispatched. The server rechecks the order and customer email before crediting.</p></div>}
        {mode === "customer" && <div className="space-y-3"><label className="block text-xs text-cream/65">Verified customer name<input data-dialog-initial-focus required value={values.name} onChange={set("name")} maxLength={100} className={inputClass}/></label><label className="block text-xs text-cream/65">Verified email<input required type="email" value={values.email} onChange={set("email")} maxLength={254} className={inputClass}/></label><label className="block text-xs text-cream/65">Kenyan mobile number<input required inputMode="tel" value={values.phone} onChange={set("phone")} maxLength={20} className={inputClass}/></label><label className="block text-xs text-cream/65">How were these details verified?<textarea required value={values.reason} onChange={set("reason")} minLength={8} maxLength={500} rows={3} className={textareaClass}/><span className="mt-2 block text-[11px] text-cream/40">Enter at least 8 non-whitespace characters describing how the customer details were verified.</span></label><p className="rounded-xl bg-mall-800 p-3 text-xs text-cream/45">This updates the order contact record. The original invoice snapshot and payment history remain unchanged.</p></div>}
        {mode === "destination" && <div className="space-y-3"><label className="block text-xs text-cream/65">Verified delivery address or parcel office<input data-dialog-initial-focus required value={values.address} onChange={set("address")} maxLength={300} className={inputClass}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-cream/65">Town or area<input required value={values.town} onChange={set("town")} maxLength={100} className={inputClass}/></label><label className="block text-xs text-cream/65">County<input required value={values.county} onChange={set("county")} maxLength={100} className={inputClass}/></label></div><label className="block text-xs text-cream/65">How was this destination verified?<textarea required value={values.reason} onChange={set("reason")} minLength={8} maxLength={500} rows={3} className={textareaClass}/><span className="mt-2 block text-[11px] text-cream/40">Enter at least 8 non-whitespace characters explaining how the delivery destination was verified.</span></label><p className="rounded-xl bg-mall-800 p-3 text-xs text-cream/45">The corrected destination is recorded separately. The original order and invoice destination remain in the audit history.</p></div>}
        {mode === "refund" && <div className="space-y-3"><div className="rounded-xl bg-mall-800 p-3 text-xs"><p className="text-cream/75">Duplicate payment: KSh {Number(payment?.amount || 0).toLocaleString()}</p><p className="mt-1 break-all text-cream/45">Original payment reference: {payment?.reference}</p></div><label className="block text-xs text-cream/65">Completed refund transaction reference<input data-dialog-initial-focus required value={values.refundReference} onChange={set("refundReference")} maxLength={200} className={inputClass} placeholder="Reference supplied by the payment provider"/></label><p className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs text-amber-100/75">This records a refund that has already been completed with the provider. It does not send money or initiate a refund.</p></div>}
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3"><button type="button" onClick={requestClose} disabled={submitting} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={submitting} className="flex-1 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Saving…" : mode === "credit_balance" ? "Confirm Store Balance credit" : title}</button></div>
      </form>
    </div>
  );
}
