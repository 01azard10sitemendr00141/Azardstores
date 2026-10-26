import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, RefreshCw, Wallet } from "lucide-react";
import api from "../api/client";
import { storeBalanceCreditAmount } from "../utils/orderEventDisplay";

export default function AvailabilityIssueActions({ order, contact = "", onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const issue = order?.availabilityIssue;
  if (order?.status !== "unavailable" || !issue?.itemIndexes?.length) return null;

  const choiceLabel = issue.customerChoice === "replacement" ? "replacement" : "Store Balance";
  const guestEmail = order.guestInfo?.email || order.billingSnapshot?.email;
  async function choose(choice) {
    setSaving(true);
    setError("");
    try {
      const response = await api.post(`/orders/${order._id}/availability-resolution`, { choice, contact });
      onUpdate?.(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your preference. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 space-y-3" aria-live="polite">
      <div>
        <p className="text-sm font-semibold text-amber-100">An item is unavailable</p>
        <p className="mt-1 text-xs text-cream/60">{issue.itemIndexes.map((index) => order.items?.[index]?.name || `Item ${index + 1}`).join(", ")}</p>
        {issue.reason && <p className="mt-1 text-xs text-cream/45">{issue.reason}</p>}
      </div>
      {order.paymentStatus === "paid" && order.storeBalanceCreditedAt && !["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(issue.resolutionStatus) && <p className="rounded-lg bg-emerald-300/5 px-3 py-2 text-xs text-emerald-100">KSh {storeBalanceCreditAmount(order).toLocaleString()} has already been added to Store Balance.{order.storeBalanceClaimStatus === "pending" ? ` Sign in or create an account with ${guestEmail} and verify that email to claim it.` : " Use it at checkout; it is not withdrawable for cash."}</p>}
      {["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(issue.resolutionStatus) ? (
        <div className="flex items-start gap-2 text-xs text-emerald-200">
          <CheckCircle size={15} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">{issue.resolutionStatus === "replacement_arranged" ? "Replacement arrangement recorded" : issue.resolutionStatus === "store_balance_issued" || order.storeBalanceCreditedAt ? "Store Balance issued" : "Store Balance arrangement recorded"}</p><p className="mt-1">{issue.resolutionMessage}</p>{(issue.resolutionStatus === "store_balance_issued" || order.storeBalanceCreditedAt) && <p className="mt-1">KSh {storeBalanceCreditAmount(order).toLocaleString()} was added to Store Balance.{order.storeBalanceClaimStatus === "pending" ? ` Sign in or create an account with ${guestEmail} and verify that email to claim it.` : " Use it at checkout; it is not withdrawable for cash."}</p>}<p className="mt-1 text-cream/50">This unavailable order will not be dispatched.</p>{order.replacementOrder && <p className="mt-2">Latest replacement order #{String(order.replacementOrder._id || order.replacementOrder).slice(-6).toUpperCase()}{order.replacementOrder.totalAmount != null ? ` · KSh ${Number(order.replacementOrder.totalAmount).toLocaleString()} · ${order.replacementOrder.status?.replace(/_/g, " ")}` : ""}. {order.replacementOrder.status === "pending" && "No payment is due until availability is confirmed."}</p>}{order.replacementOrder && <Link to={`/track-order/${order.replacementOrder._id || order.replacementOrder}`} state={{ contact: guestEmail || "" }} className="mt-1 inline-block text-xs text-mall-accent underline">View latest replacement order</Link>}</div>
        </div>
      ) : issue.customerChoice ? (
        <div className="flex items-start gap-2 text-xs text-emerald-200">
          <CheckCircle size={15} className="mt-0.5 shrink-0" />
          <p>You requested {choiceLabel}. Check this order’s updates for the next step. No payment is due while this is unresolved.</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-cream/65 mb-2">{order.paymentStatus === "paid" && order.storeBalanceCreditedAt ? "Your paid amount is in Store Balance. If you still want an item, ask for a replacement and Azard Stores will coordinate the next step." : order.paymentStatus === "paid" ? "Your payment was received. Azard Stores will confirm the replacement or Store Balance next step; do not pay again for this unavailable order." : "How would you like us to resolve this? No payment is due while Azard Stores follows up."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => choose("replacement")} className="inline-flex items-center gap-2 rounded-lg bg-mall-accent px-3 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50"><RefreshCw size={13} /> Ask for a replacement</button>
            {order.paymentStatus === "paid" && !order.storeBalanceCreditedAt && <button type="button" disabled={saving} onClick={() => choose("store_balance")} className="inline-flex items-center gap-2 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/80 disabled:opacity-50"><Wallet size={13} /> Request store balance</button>}
          </div>
          <p className="mt-2 text-[11px] text-cream/35">This records your preference. Check this order’s updates for the confirmed arrangement.</p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </section>
  );
}
