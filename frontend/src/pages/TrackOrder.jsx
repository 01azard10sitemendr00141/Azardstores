import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Search, Package, AlertCircle, ArrowRight, MapPin, FileText, Receipt } from "lucide-react";
import api from "../api/client";
import { connectRealtime } from "../api/realtime";
import OrderStatusTracker from "../components/OrderStatusTracker";
import AvailabilityIssueActions from "../components/AvailabilityIssueActions";
import DeliveryIssuePanel from "../components/DeliveryIssuePanel";
import PaymentFailurePanel from "../components/PaymentFailurePanel";
import ReturnRequestForm from "../components/ReturnRequestForm";
import CustomerCancellationForm from "../components/CustomerCancellationForm";
import { customerOrderEvents, customerRequestStatus, getCustomerOrderMessage, getCustomerPaymentSummary, getCustomerReturnMessage, orderEventLabel, orderEventNote, storeBalanceCreditAmount } from "../utils/orderEventDisplay";
import { isReturnWindowOpen } from "../utils/returnWindow";
import { getAvailableReturnQuantities } from "../utils/returnQuantities";

export default function TrackOrder() {
  const { id: idFromUrl } = useParams();
  const location = useLocation();
  const [orderId, setOrderId] = useState(idFromUrl || "");
  const [contact, setContact] = useState(location.state?.contact || "");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const [paying, setPaying] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [showCancellationForm, setShowCancellationForm] = useState(false);
  const [submittingCancellation, setSubmittingCancellation] = useState(false);
  const hasOpenReturn = order?.returnRequests?.some((request) => ["pending", "approved"].includes(request.status) || (request.status === "completed" && !request.storeBalanceIssuedAt));
  const hasPendingDuplicatePayment = order?.additionalPaymentRefunds?.some((payment) => payment.status === "refund_pending");
  const hasOpenDeliveryIssue = order?.deliveryIssueRequests?.some((issue) => ["open", "investigating"].includes(issue.status));
  const hasActiveReplacement = ["pending", "confirmed", "shipped", "ready_for_collection"].includes(order?.replacementOrder?.status);

  useEffect(() => {
    const initialContact = String(location.state?.contact || "").trim();
    if (!idFromUrl) {
      setLoading(false);
      return undefined;
    }
    setOrderId(idFromUrl);
    setContact(initialContact);
    setOrder(null);
    setLoading(Boolean(initialContact));
    setError("");
    setRefreshWarning("");
    if (!initialContact) return undefined;
    let active = true;
    api.get(`/orders/${idFromUrl}/track`, { params: { contact: initialContact } })
      .then((response) => { if (active) setOrder(response.data); })
      .catch((err) => { if (active) setError(err.response?.data?.message || "Couldn't find that order. Check your details and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [idFromUrl, location.state?.contact]);

  useEffect(() => {
    if (!order?._id || !contact.trim() || (!hasOpenReturn && !hasPendingDuplicatePayment && !hasOpenDeliveryIssue && !hasActiveReplacement && !["pending", "confirmed", "shipped", "ready_for_collection"].includes(order.status))) return undefined;
    let active = true;
    const refreshOrder = () => {
      if (document.hidden) return;
      api.get(`/orders/${order._id}/track`, { params: { contact: contact.trim() } })
        .then((response) => { if (active) { setOrder(response.data); setRefreshWarning(""); } })
        .catch(() => { if (active) setRefreshWarning("Live updates are temporarily unavailable. The status shown may be out of date."); });
    };
    const refreshForThisOrder = (event) => {
      if (!event?.id || String(event.id) === String(order._id)) refreshOrder();
    };
    const socket = connectRealtime();
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshOrder();
      else hasConnectedOnce = true;
    });
    [
      "order-status-updated",
      "order-details-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
    ].forEach((eventName) => socket.on(eventName, refreshForThisOrder));
    socket.on("store-balance-updated", (event) => {
      const affectedOrders = (event?.orderIds || []).map(String);
      if (affectedOrders.includes(String(order._id))) refreshOrder();
    });
    document.addEventListener("visibilitychange", refreshOrder);
    const timer = setInterval(() => {
      // This public lookup can belong to a guest or to a different signed-in
      // account, so it cannot rely on a private user socket room.
      if (!document.hidden) refreshOrder();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOrder);
      socket.disconnect();
    };
  }, [order?._id, order?.status, order?.replacementOrder?.status, hasOpenReturn, hasPendingDuplicatePayment, hasOpenDeliveryIssue, hasActiveReplacement, contact]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setRefreshWarning("");
    if (!orderId.trim() || !contact.trim()) {
      setError("Enter the full tracking ID and the phone or email used for this order");
      return;
    }
    setLoading(true);
    setOrder(null);
    try {
      const res = await api.get(`/orders/${orderId.trim()}/track`, { params: { contact: contact.trim() } });
      setOrder(res.data);
      setRefreshWarning("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't find that order — double-check the details and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function continuePayment() {
    if (!order) return;
    setPaying(true);
    setPaymentMessage("");
    const providerLabel = order.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
    try {
      if (order.paymentMethod === "paystack") {
        const res = await api.post("/payments/paystack/initialize", { orderId: order._id, contact });
        window.location.assign(res.data.authorizationUrl);
        return;
      }
      const initiation = await api.post("/payments/mpesa/initiate", { orderId: order._id, contact });
      setPaymentMessage(initiation.data.displayText || "Approve the M-Pesa payment prompt on your phone. Waiting for confirmation.");
      for (let attempt = 0; attempt < 18; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const result = await api.get(`/payments/mpesa/status/${order._id}`, { params: { contact } });
        setOrder(result.data.order);
        if (result.data.paymentStatus === "paid") { setPaymentMessage(`Payment confirmed by ${providerLabel}. Your receipt is available below to print or save.`); return; }
        if (result.data.paymentStatus === "failed") { setPaymentMessage(""); return; }
      }
      setPaymentMessage(`${providerLabel} has not confirmed this payment yet, so the order is still unpaid. If you approved the request on your phone, do not start another payment yet; refresh the order or contact Azard Stores with this order number.`);
    } catch (err) {
      setPaymentMessage(err.response?.data?.message || "Could not start payment. Your order remains active.");
    } finally { setPaying(false); }
  }

  async function checkPaymentStatus() {
    if (!order) return;
    setPaying(true);
    setPaymentMessage("");
    const providerLabel = order.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
    try {
      const pendingAttempt = [...(order.paymentAttempts || [])].reverse().find((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
      const res = order.paymentMethod === "mpesa"
        ? await api.get(`/payments/mpesa/status/${order._id}`, { params: { contact } })
        : pendingAttempt
          ? await api.get(`/payments/paystack/verify/${encodeURIComponent(pendingAttempt.reference)}`, { params: { contact } })
          : null;
      if (!res) {
        setPaymentMessage("There is no active payment request to check. Contact Azard Stores if you believe you paid.");
        return;
      }
      setOrder(res.data.order);
      const status = res.data.paymentStatus || res.data.order.paymentStatus;
      setPaymentMessage(status === "paid"
        ? "Payment confirmed. Your receipt is available below."
        : status === "failed"
          ? `${providerLabel} confirmed that payment did not complete. You can start a new payment while the reservation is active.`
          : `${providerLabel} has not confirmed a result yet. The order remains unpaid; wait for the current request to finish. If you already approved it and it remains pending, contact Azard Stores with your order number.`);
    } catch (err) {
      setPaymentMessage(err.response?.data?.message || `Could not check ${providerLabel} yet. Your order remains unpaid; wait before starting another payment.`);
    } finally { setPaying(false); }
  }

  async function submitCancellation(reason) {
    if (!order) return;
    setSubmittingCancellation(true);
    try {
      const res = await api.post(`/orders/${order._id}/cancel-request`, { reason, contact });
      setOrder(res.data);
      setOrderMessage(res.data.paymentStatus === "paid"
        ? res.data.storeBalanceCreditedAt
          ? `Order cancelled. KSh ${Number(res.data.storeBalanceCreditedAmount || res.data.totalAmount || 0).toLocaleString()} is in Store Balance.`
          : "Order cancelled. The payment settled during cancellation and its value is being added to Store Balance."
        : order.paymentStatus === "paid"
          ? "Cancellation request sent. Azard Stores will review it before dispatch; if approved, the paid value goes to Store Balance."
          : "Order cancelled. Any stock reservation has been released.");
      setShowCancellationForm(false);
    } catch (err) { throw new Error(err.response?.data?.message || "Could not cancel this order."); }
    finally { setSubmittingCancellation(false); }
  }

  function requestReturn() {
    setOrderMessage("");
    setShowReturnForm(true);
  }

  async function submitReturnRequest(payload) {
    if (!order) return;
    setSubmittingReturn(true);
    try {
      const res = await api.post(`/orders/${order._id}/returns`, { ...payload, contact });
      setOrder(res.data);
      setOrderMessage(`${payload.type === "return" ? "Return" : "Exchange"} request sent for review. Check the order updates here for its status.`);
      setShowReturnForm(false);
    } catch (err) { throw new Error(err.response?.data?.message || "Could not submit the request."); }
    finally { setSubmittingReturn(false); }
  }

  function printDocument(kind) {
    if (!order) return;
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const ref = order._id.slice(-6).toUpperCase();
    const number = kind === "receipt" ? (order.receiptNumber || `AS-R-${order._id.slice(-8).toUpperCase()}`) : (order.invoiceNumber || `AS-${ref}`);
    const deliveryAddress = order.deliveryCorrection?.address || order.deliveryAddress || "";
    const rows = order.items.map((item) => `<tr><td>${esc(item.name)}${item.variantName ? ` · ${esc(item.variantName)}` : ""}</td><td>${item.quantity}</td><td>KSh ${(item.price * item.quantity).toLocaleString()}</td></tr>`).join("");
    const popup = window.open("", "_blank", "width=800,height=900");
    if (!popup) {
      setDocumentMessage(`Your browser blocked the ${kind} window. Allow pop-ups for this site and try again.`);
      return;
    }
    setDocumentMessage("");
    popup.opener = null;
    const docStatus = kind === "receipt"
      ? (order.storeBalanceCreditedAt ? "PAID · VALUE RETURNED TO STORE BALANCE" : "PAID")
      : (order.storeBalanceCreditedAt ? "VALUE RETURNED TO STORE BALANCE" : order.paymentStatus === "paid" ? "PAID" : order.paymentStatus === "refund_pending" ? "STORE BALANCE UNDER REVIEW" : order.paymentStatus === "refunded" ? "VALUE RETURNED TO STORE BALANCE" : "UNPAID");
    const balancePaid = Number(order.storeBalanceApplied || 0);
    const externalPaid = Math.max(0, Number(order.totalAmount || 0) - balancePaid);
    const methodLabel = { mpesa: "M-Pesa", paystack: "Card", cod: "Cash on delivery", store_balance: "Store Balance" }[order.paymentMethod] || order.paymentMethod || "Payment";
    const paymentBreakdown = kind === "receipt" ? `${balancePaid > 0 ? `<p>Paid using Azard Store Balance: KSh ${balancePaid.toLocaleString()}</p>` : ""}${externalPaid > 0 ? `<p>Paid by ${esc(methodLabel)}: KSh ${externalPaid.toLocaleString()}</p>` : ""}` : "";
    popup.document.write(`<!doctype html><html><head><title>${kind === "receipt" ? "Receipt" : "Invoice"} ${esc(number)}</title><style>body{font:15px Arial,sans-serif;color:#142033;max-width:760px;margin:48px auto;padding:0 24px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd}td:last-child,th:last-child{text-align:right}.total{text-align:right;font-size:20px;font-weight:bold}.status{font-weight:bold;color:${order.paymentStatus === "paid" ? "#087443" : "#9a5b00"}}</style></head><body><h1>Azard Stores</h1><h2>${kind === "receipt" ? "Receipt" : "Invoice"} ${esc(number)}</h2><p>Order #${ref} · ${new Date(kind === "receipt" ? order.receiptIssuedAt || order.updatedAt : order.createdAt).toLocaleDateString("en-KE")}</p><p>Bill to: ${esc(order.billingSnapshot?.name || order.guestInfo?.name || "Customer")} · ${esc(order.billingSnapshot?.email || order.guestInfo?.email || "")}</p>${deliveryAddress ? `<p>Delivery to: ${esc(deliveryAddress)}</p>` : ""}<p class="status">${docStatus}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}<tr><td colspan="2">Delivery</td><td>KSh ${Number(order.deliveryFee || 0).toLocaleString()}</td></tr></tbody></table><p class="total">Total: KSh ${Number(order.totalAmount || 0).toLocaleString()}</p>${paymentBreakdown}<p>Payment method: ${esc(methodLabel)}${order.paymentReference ? `<br>Payment reference: ${esc(order.paymentReference)}` : ""}</p><button onclick="window.print()">Print / Save as PDF</button><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    popup.document.close();
  }

  const customerEvents = customerOrderEvents(order?.events);
  const customerMessage = order ? getCustomerOrderMessage(order) : null;
  const paymentSummary = order ? getCustomerPaymentSummary(order) : null;

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-10 sm:py-16">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">Azard Stores</p>
          <h1 className="font-display text-3xl sm:text-4xl text-cream mb-2">Track your order</h1>
          <p className="text-cream/40 text-sm">
            Enter the full tracking ID from your confirmation and the phone or email you used at checkout.
          </p>
        </div>

        {/* Lookup form */}
        <form onSubmit={handleSubmit} className="bg-mall-800 rounded-2xl p-5 sm:p-6 border border-cream/8 mb-6">
          <div className="mb-4">
            <label htmlFor="tracking-order-id" className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest block mb-2">Full Tracking ID</label>
            <input
              id="tracking-order-id"
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Paste the full ID copied from confirmation"
              className="w-full bg-mall-700 rounded-xl px-3.5 py-3 text-cream placeholder-cream/25 text-sm outline-none focus:ring-1 focus:ring-mall-accent transition"
            />
          </div>
          <div className="mb-5">
            <label htmlFor="tracking-order-contact" className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest block mb-2">Phone or Email</label>
            <input
              id="tracking-order-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="The one you used at checkout"
              className="w-full bg-mall-700 rounded-xl px-3.5 py-3 text-cream placeholder-cream/25 text-sm outline-none focus:ring-1 focus:ring-mall-accent transition"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs mb-4">
              <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm"
          >
            <Search size={15} />
            {loading ? "Looking up..." : "Track Order"}
          </button>
        </form>

        {/* Result */}
        {order && (
          <div className="bg-mall-800 rounded-2xl p-5 sm:p-6 border border-cream/8">
            <div className="flex items-center justify-between mb-5 pb-5 border-b border-cream/10">
              <span className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest">
                Order #{order._id.slice(-6).toUpperCase()}
              </span>
              <span className="font-display text-lg text-cream">KSh {order.totalAmount?.toLocaleString()}</span>
            </div>

            <div className="mb-5">
              <OrderStatusTracker status={order.status} deliveryArea={order.deliveryArea} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} storeBalanceApplied={order.storeBalanceApplied} totalAmount={order.totalAmount} />
              {refreshWarning && <p role="status" className="mt-3 rounded-lg border border-amber-200/15 bg-amber-200/5 px-3 py-2 text-left text-xs text-amber-100/80">{refreshWarning}</p>}
              {(!["cancelled", "expired", "unavailable", "delivered", "collected"].includes(order.status) || hasOpenReturn || hasPendingDuplicatePayment || hasOpenDeliveryIssue) && <p className="mt-2 text-center text-[10px] text-cream/30">Order and open request status refresh automatically while this page is open.</p>}
            </div>
            <div className="mb-5 rounded-xl border border-cream/8 bg-mall-700/60 px-4 py-3">
              <p className="text-sm font-medium text-cream">{customerMessage.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-cream/50">{customerMessage.body}</p>
            </div>
            <div className="mb-5"><AvailabilityIssueActions order={order} contact={contact} onUpdate={setOrder} /></div>
            <DeliveryIssuePanel order={order} contact={contact} onUpdate={setOrder} />
            <div className="flex flex-wrap gap-2 mb-2"><button onClick={() => printDocument("invoice")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/70 sm:min-h-0"><FileText size={13}/> Invoice</button>{(order.receiptNumber || order.paymentStatus === "paid") && <button onClick={() => printDocument("receipt")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-mall-accent/10 px-3 py-2 text-xs text-mall-accent sm:min-h-0"><Receipt size={13}/> Receipt</button>}</div>
            {documentMessage && <p role="status" className="mb-4 text-xs text-amber-200">{documentMessage}</p>}
            {order.replacementFor && <div className="mb-4 rounded-lg bg-mall-accent/5 px-3 py-2 text-xs text-cream/65"><p>Replacement order for #{String(order.replacementFor._id || order.replacementFor).slice(-6).toUpperCase()} · {Number(order.replacementPriceDifference) > 0 ? "+" : ""}KSh {Number(order.replacementPriceDifference || 0).toLocaleString()} compared with the original total.</p><Link to={`/track-order/${order.replacementFor._id || order.replacementFor}`} state={{ contact }} className="mt-1 inline-flex min-h-11 items-center gap-1 text-mall-accent underline sm:min-h-0">View original order <ArrowRight size={12}/></Link></div>}
            {order.replacementOrder?._id && <div className="mb-4 rounded-lg bg-mall-accent/5 px-3 py-2 text-xs text-cream/65"><p>Replacement order #{String(order.replacementOrder._id).slice(-6).toUpperCase()} · {order.replacementOrder.status?.replace(/_/g, " ")} · KSh {Number(order.replacementOrder.totalAmount || 0).toLocaleString()}</p><Link to={`/track-order/${order.replacementOrder._id}`} state={{ contact }} className="mt-1 inline-flex min-h-11 items-center gap-1 text-mall-accent underline sm:min-h-0">View replacement order <ArrowRight size={12}/></Link></div>}
            {order.replacementFor && order.paymentStatus !== "paid" && <p className="mb-4 text-xs text-cream/55">{order.status === "pending" ? "Amount due after availability is confirmed" : "Amount due"}: KSh {Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()}</p>}
            {order.storeBalanceClaimStatus === "pending" && order.status !== "unavailable" && <p className="mb-4 rounded-lg border border-mall-accent/20 bg-mall-accent/5 px-3 py-3 text-xs text-cream/70">A Store Balance from this order is waiting to be claimed for {order.guestInfo?.email || order.billingSnapshot?.email}. Sign in or create an account with this email and verify it to claim the balance.</p>}

            <div className="mb-5 rounded-xl bg-mall-700/70 p-4 text-xs space-y-2">
              <p className="text-cream/70">Payment: <span className="text-cream">{paymentSummary.status}</span> <span className="text-cream/35">·</span> Method: <span className="text-cream">{paymentSummary.method}</span></p>
              {order.storeBalanceCreditedAt ? <p className="text-emerald-200">KSh {storeBalanceCreditAmount(order).toLocaleString()} returned to Store Balance</p> : Number(order.storeBalanceApplied) > 0 && <p className="text-cream/50">Store Balance {order.storeBalanceStatus === "reserved" ? "reserved" : order.storeBalanceStatus === "released" ? "returned" : "applied"}: KSh {Number(order.storeBalanceApplied).toLocaleString()}{order.storeBalanceStatus !== "released" && order.paymentStatus !== "paid" ? ` · ${order.status === "pending" ? "remaining after availability" : "remaining to pay"} KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied)).toLocaleString()}` : ""}</p>}
              {order.deliveryRoute?.serviceType === "parcel" && order.deliveryRoute?.carrier && <p className="text-cream/50">Parcel route: {order.deliveryRoute.carrier} · {order.deliveryRoute.officeName}{order.deliveryRoute.officeAddress ? ` · ${order.deliveryRoute.officeAddress}` : ""}{Number(order.deliveryRoute.estimatedDays) > 0 ? ` · estimated ${Number(order.deliveryRoute.estimatedDays)} day${Number(order.deliveryRoute.estimatedDays) === 1 ? "" : "s"}` : ""}</p>}
              {order.deliveryRoute?.serviceType === "direct" && <p className="text-cream/50">Direct delivery address: {order.deliveryAddress}</p>}
              {order.deliveryArea !== "nairobi-cbd" && <p className="text-cream/50">Delivery charge: KSh {Number(order.deliveryFee || 0).toLocaleString()}</p>}
            {order.parcelReference && order.status !== "ready_for_collection" && <p className="text-cream/45">Parcel reference: {order.parcelReference}</p>}
            {order.paymentReference && <p className="text-cream/45">Payment reference: {order.paymentReference}</p>}
            </div>
            {order.paymentStatus === "failed" && order.status === "confirmed" && <div className="mb-5"><PaymentFailurePanel order={order} retrying={paying} onRetry={continuePayment} /></div>}
            {customerEvents.length > 0 && <div className="mb-5"><p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/30 mb-3">Order updates</p><div className="space-y-3">{customerEvents.map((event, index) => <div key={`${event.type}-${event.createdAt}-${index}`} className="flex gap-3 text-xs"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-mall-accent shrink-0"/><div><p className="text-cream/75">{orderEventLabel(event)}</p>{orderEventNote(event) && <p className="mt-1 text-cream/45">{orderEventNote(event)}</p>}<p className="mt-1 text-cream/30">{new Date(event.createdAt).toLocaleString("en-KE")}</p></div></div>)}</div></div>}
            {order.returnRequests?.map((request) => { const summary = getCustomerReturnMessage(request, order); return <div key={request._id} className="mb-3 rounded-lg border border-cream/8 bg-mall-700/50 px-3 py-2 text-xs"><p className="font-medium text-cream/75">{request.type === "return" ? "Return" : "Exchange"} · {summary.label}</p><p className="mt-1 text-cream/45">{summary.body}</p></div>; })}
            {order.cancellationRequests?.map((request) => <p key={request._id} className="mb-3 text-xs text-amber-200">Cancellation request: {customerRequestStatus(request.status)}{request.status === "pending" ? " · Azard Stores is reviewing it" : ""}{request.decisionNote ? ` · ${request.decisionNote}` : ""}</p>)}
            {!order.user && order.guestInfo?.email && <Link to="/signup" state={{ claimOrderId: order._id, prefillName: order.guestInfo.name, prefillEmail: order.guestInfo.email }} className="block min-h-11 text-center rounded-lg border border-mall-accent/25 px-3 py-2.5 text-xs text-mall-accent mb-4 sm:min-h-0">Create an account to keep this order in My Orders</Link>}
            {!(order.paymentAttempts || []).some((attempt) => attempt.status === "review") && !order.paymentTestMode && ["mpesa", "paystack"].includes(order.paymentMethod) && ((order.status === "confirmed" && order.paymentStatus !== "paid" && order.paymentStatus !== "failed") || (order.status === "expired" && order.paymentStatus !== "paid" && (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending"))) && <button disabled={paying} onClick={() => (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending") ? checkPaymentStatus() : continuePayment()} className="min-h-11 w-full rounded-lg bg-mall-accent px-3 py-3 text-xs font-semibold text-mall-900 disabled:opacity-50 sm:min-h-0">{paying ? "Checking payment" : (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending") ? "Check payment status" : "Continue payment"}</button>}

            {paymentMessage && <p role="status" className="text-xs text-cream/60 mt-2">{paymentMessage}</p>}
            {orderMessage && <p role="status" className="text-xs text-cream/60 mt-2">{orderMessage}</p>}
            {["pending", "confirmed"].includes(order.status) && !order.cancellationRequests?.some((request) => request.status === "pending") && <button onClick={() => setShowCancellationForm(true)} className="mt-2 min-h-11 w-full rounded-lg border border-red-400/20 px-3 py-2.5 text-xs text-red-300 sm:min-h-0">{order.paymentStatus === "paid" ? "Request cancellation" : "Cancel order"}</button>}
            {isReturnWindowOpen(order) && getAvailableReturnQuantities(order).some((quantity) => quantity > 0) && <button onClick={requestReturn} className="mt-2 min-h-11 w-full rounded-lg border border-mall-accent/25 px-3 py-2.5 text-xs text-mall-accent sm:min-h-0">Request return or exchange</button>}

            {/* Items */}
            <div className="space-y-3 mb-5 pt-5 border-t border-cream/8">
              {order.items?.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-mall-700 overflow-hidden shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={12} className="text-cream/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-cream text-sm line-clamp-1">{item.name}</p>
                    {item.variantName && <p className="text-cream/30 text-[11px]">{item.variantName}</p>}
                    <p className="text-cream/40 text-xs">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-cream/70 text-sm shrink-0">
                    KSh {(item.price * item.quantity).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {(order.deliveryAddress || order.deliveryCorrection?.address) && (
              <div className="flex items-start gap-2.5 pt-4 border-t border-cream/8 text-sm text-cream/50">
                <MapPin size={14} className="text-mall-accent shrink-0 mt-0.5" />
                <div><p className="text-cream/40 text-xs mb-1">{[order.deliveryCorrection?.town || order.deliveryTown, order.deliveryCorrection?.county || order.deliveryCounty].filter(Boolean).join(", ")}</p><p>{order.deliveryCorrection?.address || order.deliveryAddress}</p>{order.deliveryInstructions && <p className="text-cream/35 text-xs mt-1">Your notes: {order.deliveryInstructions}</p>}</div>
              </div>
            )}
          </div>
        )}

        <div className="text-center mt-8">
          <Link to="/directory" className="inline-flex items-center gap-1.5 text-cream/30 hover:text-mall-accent transition text-sm">
            Continue browsing the mall <ArrowRight size={13} />
          </Link>
        </div>
        {showReturnForm && order && <ReturnRequestForm order={order} submitting={submittingReturn} onClose={() => setShowReturnForm(false)} onSubmit={submitReturnRequest} />}
        {showCancellationForm && order && <CustomerCancellationForm order={order} submitting={submittingCancellation} onClose={() => setShowCancellationForm(false)} onSubmit={submitCancellation} />}
      </div>
    </div>
  );
}
