import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle, Clock3, ArrowRight, ShoppingBag, Copy, Check, UserPlus, FileText } from "lucide-react";
import OrderStatusTracker from "../components/OrderStatusTracker";
import { storeBalanceCreditAmount } from "../utils/orderEventDisplay";

export default function OrderSuccess() {
  const { state } = useLocation();
  const order = state?.order || null;
  const addressSaveWarning = state?.addressSaveWarning || "";
  const [copied, setCopied] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const orderRef = order ? order._id.slice(-6).toUpperCase() : null;
  const isGuestOrder = order && !order.user;
  const trackingContact = order?.guestInfo?.email || order?.billingSnapshot?.email || order?.guestInfo?.phone || order?.billingSnapshot?.phone || "";
  const trackingState = trackingContact ? { contact: trackingContact } : undefined;
  const deliveryAddress = order ? (order.deliveryCorrection?.address || order.deliveryAddress || "") : "";
  const valueInStoreBalance = Boolean(order?.storeBalanceCreditedAt);
  const balanceCreditAmount = storeBalanceCreditAmount(order);
  const awaitingAvailability = order?.status === "pending";
  const awaitingPayment = order?.status === "confirmed" && order?.paymentMethod !== "cod" && order?.paymentStatus !== "paid";
  const realPaymentConfirmed = order?.paymentStatus === "paid";
  const paymentDestination = isGuestOrder ? "Track Order" : "My Orders";
  const confirmationTitle = !order ? "Order details unavailable"
    : valueInStoreBalance ? order.status === "unavailable" ? "Item unavailable · Store Balance updated"
      : order.status === "expired" ? "Order expired · Store Balance updated"
        : order.status === "cancelled" ? "Order cancelled · Store Balance updated"
          : "Value added to Store Balance"
    : awaitingAvailability ? "Order submitted"
      : awaitingPayment ? "Availability confirmed"
        : order.status === "expired" ? "Order expired"
          : order.status === "cancelled" ? "Order cancelled"
            : order.status === "unavailable" ? "Item unavailable"
              : realPaymentConfirmed ? "Payment confirmed" : "Order placed";

  async function copyRef() {
    if (!orderRef) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable");
      await navigator.clipboard.writeText(order._id);
      setCopied(true);
      setActionMessage("Full tracking ID copied. Use it with your checkout phone or email to track this order.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionMessage(`Full tracking ID: ${order._id}`);
    }
  }

  function downloadInvoice() {
    if (!order) return;
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const rows = order.items.map((item) => `<tr><td>${esc(item.name)}${item.variantName ? ` · ${esc(item.variantName)}` : ""}</td><td>${item.quantity}</td><td>KSh ${(item.price * item.quantity).toLocaleString()}</td></tr>`).join("");
    const deliveryAddress = order.deliveryCorrection?.address || order.deliveryAddress || "";
    const invoicePaymentStatus = order.storeBalanceCreditedAt
      ? "VALUE RETURNED TO STORE BALANCE"
      : order.paymentStatus === "paid" ? "PAID" : order.paymentStatus === "refund_pending" ? "STORE BALANCE UNDER REVIEW" : order.paymentStatus === "refunded" ? "VALUE RETURNED TO STORE BALANCE" : "UNPAID";
    const invoicePaymentMethod = { mpesa: "M-Pesa", paystack: "Card", cod: "Cash on delivery", store_balance: "Store Balance" }[order.paymentMethod] || order.paymentMethod || "Payment";
    const popup = window.open("", "_blank", "width=800,height=900");
    if (!popup) {
      setActionMessage("Your browser blocked the invoice window. Allow pop-ups for this site, then open the invoice again.");
      return;
    }
    setActionMessage("");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>Invoice ${esc(order.invoiceNumber || orderRef)}</title><style>body{font:15px Arial,sans-serif;color:#142033;max-width:760px;margin:48px auto;padding:0 24px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd}td:last-child,th:last-child{text-align:right}.total{text-align:right;font-size:20px;font-weight:bold}.status{color:${order.paymentStatus === "paid" ? "#087443" : "#9a5b00"};font-weight:bold}</style></head><body><h1>Azard Stores</h1><h2>Invoice ${esc(order.invoiceNumber || `AS-${orderRef}`)}</h2><p>Order #${orderRef} · ${new Date(order.createdAt || Date.now()).toLocaleDateString("en-KE")}</p><p>Bill to: ${esc(order.billingSnapshot?.name || order.guestInfo?.name || "Customer")} · ${esc(order.billingSnapshot?.email || order.guestInfo?.email || "")}</p>${deliveryAddress ? `<p>Delivery to: ${esc(deliveryAddress)}</p>` : ""}<p class="status">${invoicePaymentStatus}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}<tr><td colspan="2">Delivery</td><td>KSh ${Number(order.deliveryFee || 0).toLocaleString()}</td></tr></tbody></table><p class="total">Total: KSh ${Number(order.totalAmount || 0).toLocaleString()}</p><p>Payment method: ${esc(invoicePaymentMethod)}</p><button onclick="window.print()">Print / Save as PDF</button><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    popup.document.close();
  }

  return (
    <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="max-w-md w-full mx-auto">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-full ${!order || awaitingAvailability || awaitingPayment ? "bg-amber-300/10" : "bg-emerald-500/15"} flex items-center justify-center mx-auto mb-6`}>
          {!order || awaitingAvailability || awaitingPayment ? <Clock3 size={38} className="text-amber-200" /> : <CheckCircle size={40} className="text-emerald-400" />}
        </div>

        {/* Heading */}
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
          Azard Stores
        </p>
        <h1 className="font-display text-3xl sm:text-4xl text-cream mb-3 leading-tight">
          {confirmationTitle}
        </h1>
        <p className="text-cream/50 text-sm sm:text-base leading-relaxed mb-6">
          {!order
              ? "Order details are not available in this page session. Use Track Order with the full tracking ID and the phone or email used at checkout, or sign in to view My Orders."
              : valueInStoreBalance
              ? `We couldn’t fulfil this order. KSh ${balanceCreditAmount.toLocaleString()} is in Store Balance${order.storeBalanceClaimStatus === "pending" ? ` and can be claimed by signing in or creating an account with ${order.guestInfo?.email || order.billingSnapshot?.email || "the email used for this order"}, then verifying that email address` : " for a future order"}. Cash refunds are not offered.`
              : awaitingAvailability
              ? "Your order is submitted. Azard Stores will check availability first; no payment is taken and stock is not reserved yet. Track Order is the reliable place to check its status; email updates may also be sent."
              : awaitingPayment
                ? `Azard Stores confirmed availability. Pay KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()} using Continue payment in ${paymentDestination} before the reservation deadline.`
                  : order?.status === "unavailable"
                    ? realPaymentConfirmed ? "Azard Stores could not supply one or more items. This order will not be dispatched; review the order updates for the payment resolution." : "Azard Stores could not supply one or more items. No payment is due; review the order updates for the next steps."
                    : order?.status === "cancelled"
                      ? realPaymentConfirmed ? "This order was cancelled and will not be dispatched. Azard Stores is resolving the paid amount." : "This order was cancelled and will not be dispatched."
                      : order?.status === "expired"
                        ? realPaymentConfirmed ? "The payment window ended and this order will not be dispatched. Azard Stores is resolving the payment value." : "The payment window ended. This order will not be dispatched."
                    : realPaymentConfirmed
                    ? `Your payment is confirmed. Azard Stores will prepare your order. Follow delivery updates in Track Order; ${isGuestOrder ? "open your receipt from Track Order" : "your receipt is available in Billing"}.`
                  : "Your order was received. Track its status in Track Order; email updates may also be sent."}
        </p>

        {actionMessage && <p role="status" aria-live="polite" className="mb-5 rounded-xl border border-cream/10 bg-mall-800 px-4 py-3 text-left text-xs leading-relaxed text-cream/70">{actionMessage}</p>}

        {addressSaveWarning && <p role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-left text-xs leading-relaxed text-amber-100">{addressSaveWarning}</p>}

        {order && (
          <>
            <button onClick={downloadInvoice}             className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/70 hover:border-cream/30 mb-4 sm:min-h-0">
              <FileText size={13} /> Open invoice
            </button>
            {/* Keep the short reference visible, but copy the full ID required by tracking. */}
            <button
              onClick={copyRef}
              className="inline-flex min-h-11 items-center gap-2 bg-mall-800 border border-cream/10 rounded-full px-4 py-2 mb-6 hover:border-cream/25 transition sm:min-h-0"
            >
              <span className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest">Order #{orderRef} · Copy tracking ID</span>
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-cream/30" />}
            </button>

            {/* Status tracker */}
            <div className="bg-mall-800 rounded-2xl p-5 mb-6 border border-cream/8">
              <OrderStatusTracker status={order.status || "pending"} deliveryArea={order.deliveryArea} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} />
            </div>
            {valueInStoreBalance && (
              <div role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-left">
                <p className="text-sm font-semibold text-amber-100">Order not dispatched · value in Store Balance</p>
                <p className="mt-1 text-xs leading-relaxed text-cream/65">
                  {order.storeBalanceClaimStatus === "pending"
                    ? `KSh ${balanceCreditAmount.toLocaleString()} is ready to claim. Sign in or create an account with ${order.guestInfo?.email || order.billingSnapshot?.email || "the email used for this order"}, then verify that email address.`
                    : `KSh ${balanceCreditAmount.toLocaleString()} is available in your Azard Store Balance for a future order. Cash refunds are not offered.`}
                </p>
              </div>
            )}
          </>
        )}

        {/* Divider */}
        <div className="border-t border-cream/10 mb-8" />

        {/* Trust signals — only claims what actually happens */}
        {order && <div className="space-y-2 mb-6 rounded-xl border border-cream/10 bg-mall-800/70 p-4 text-left">
          <p className="mb-2 font-mono-tag text-[9px] uppercase tracking-widest text-cream/40">What happens next</p>
          {[awaitingAvailability ? "We check item availability before taking payment." : null,
            awaitingAvailability ? "Track Order is the reliable place to check its status; email updates may also be sent." : null,
            awaitingPayment ? `Open ${paymentDestination} and choose Continue payment when you are ready.` : null,
            awaitingPayment ? "Payment is due before the order can be dispatched." : null,
            order.paymentMethod === "cod" && order.status === "pending" ? "If the address is eligible, pay when Azard Stores delivers your order." : null,
            realPaymentConfirmed && !valueInStoreBalance ? "Follow delivery updates in Track Order; email updates may also be sent." : null,
          ].filter(Boolean).map((line, index) => <p key={index} className="text-xs leading-relaxed text-cream/65">{line}</p>)}
        </div>}

        <div className="space-y-2 mb-8 text-left">
          {[
            order?.status === "pending" ? "Stock is not reserved until availability is confirmed" : null,
            order?.status === "confirmed" && order?.paymentMethod === "cod" ? "Pay on delivery for this eligible Nairobi CBD order" : null,
            order?.status === "confirmed" && order?.paymentMethod !== "cod" && order?.paymentStatus !== "paid" && order?.stockReservedUntil ? `Pay within 5 days, by ${new Date(order.stockReservedUntil).toLocaleString("en-KE")}` : null,
            order?.paymentStatus === "paid" && !valueInStoreBalance ? "Payment received - thank you!" : null,
            deliveryAddress ? `Delivery destination: ${deliveryAddress}` : null,
          ].filter(Boolean).map((line, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-cream/50">
              <CheckCircle size={13} className="text-emerald-400 shrink-0 mt-0.5" />
              {line}
            </div>
          ))}
        </div>

        {/* Guest account CTA — the whole point being: create an account and
            this exact order gets linked to it automatically, no re-entering info */}
        {isGuestOrder && (
            <Link
            to="/signup"
            state={{ claimOrderId: order._id, prefillName: order.guestInfo?.name, prefillEmail: order.guestInfo?.email }}
            className="flex min-h-11 items-center justify-center gap-2 bg-mall-accent/10 border border-mall-accent/30 text-mall-accent font-medium py-3.5 rounded-xl hover:bg-mall-accent/20 transition text-sm mb-3 sm:min-h-0"
          >
            <UserPlus size={15} />
            {valueInStoreBalance && order.storeBalanceClaimStatus === "pending" ? "Create an account to claim Store Balance" : "Create an account to keep this order"}
          </Link>
        )}

        {order && (
          <p className="text-cream/25 text-[11px] mb-6 leading-relaxed">
            Use your full tracking ID and checkout phone or email to check its status anytime at{" "}
            <Link to={`/track-order/${order._id}`} state={trackingState} className="text-mall-accent hover:underline">
              Track Order
            </Link>
            .
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/directory"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition text-sm sm:min-h-0"
          >
            <ShoppingBag size={15} />
            Continue Shopping
          </Link>
          <Link
            to={!order ? "/track-order" : order.user ? "/dashboard" : `/track-order/${order._id}`}
            state={order && !order.user ? trackingState : undefined}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 border border-cream/15 text-cream/60 hover:text-cream hover:border-cream/30 font-medium py-3.5 rounded-xl transition text-sm sm:min-h-0"
          >
            {!order ? "Track an order" : order.user ? "View My Orders" : "Track Order"} <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
