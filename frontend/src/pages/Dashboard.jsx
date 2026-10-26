import { useEffect, useRef, useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ShoppingBag, Heart, Settings, Package, ChevronRight, Wallet,
  CheckCircle, Clock, Truck, XCircle, LogOut, User, Phone, Mail, Lock, Eye, EyeOff, CreditCard, FileText, Receipt,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import api from "../api/client";
import { connectRealtime } from "../api/realtime";
import { isValidPassword } from "../utils/passwordPolicy";
import StripProductCard from "../components/StripProductCard";
import VerificationCenter from "../components/VerificationCenter";
import OrderStatusTracker from "../components/OrderStatusTracker";
import AvailabilityIssueActions from "../components/AvailabilityIssueActions";
import DeliveryIssuePanel from "../components/DeliveryIssuePanel";
import PaymentFailurePanel from "../components/PaymentFailurePanel";
import ReturnRequestForm from "../components/ReturnRequestForm";
import CustomerCancellationForm from "../components/CustomerCancellationForm";
import { customerOrderEvents, customerRequestStatus, getCustomerOrderMessage, getCustomerPaymentSummary, getCustomerReturnMessage, orderEventLabel, orderEventNote, storeBalanceCreditAmount } from "../utils/orderEventDisplay";
import { isReturnWindowOpen } from "../utils/returnWindow";
import { getAvailableReturnQuantities } from "../utils/returnQuantities";
import { getWishlist, isWishlistStorageAvailable, replaceWishlist, subscribeToWishlist } from "../utils/wishlist";

// â”€â”€â”€ Status config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS = {
  pending:   { label: "Availability check",   icon: Clock,         color: "text-mall-accent",  bg: "bg-mall-accent/10" },
  confirmed: { label: "Availability confirmed", icon: CheckCircle,   color: "text-blue-400",   bg: "bg-blue-400/10"  },
  shipped:   { label: "Shipped",   icon: Truck,         color: "text-purple-400", bg: "bg-purple-400/10"},
  ready_for_collection: { label: "Ready for collection", icon: Package, color: "text-amber-300", bg: "bg-amber-300/10" },
  collected: { label: "Collected", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  delivered: { label: "Delivered", icon: CheckCircle,   color: "text-emerald-400",bg: "bg-emerald-400/10"},
  cancelled: { label: "Cancelled", icon: XCircle,       color: "text-red-400",    bg: "bg-red-400/10"   },
  unavailable: { label: "Availability issue", icon: XCircle, color: "text-red-300", bg: "bg-red-300/10" },
  expired: { label: "Expired", icon: Clock, color: "text-amber-200", bg: "bg-amber-300/10" },
};

// â”€â”€â”€ Tab nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TABS = [
  { id: "orders",   label: "My Orders",  icon: ShoppingBag },
  { id: "billing",  label: "Billing",    icon: CreditCard },
  { id: "wishlist", label: "Wishlist",   icon: Heart       },
  { id: "settings", label: "Settings",  icon: Settings    },
];

function eventBelongsToUser(event, user) {
  return String(event?.userId || "") === String(user?.id || user?._id || "");
}

function printableOrderDocument(order, kind, account) {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ref = order._id.slice(-6).toUpperCase();
  const rows = (order.items || []).map((item) => `<tr><td>${esc(item.name)}${item.variantName ? ` · ${esc(item.variantName)}` : ""}</td><td>${item.quantity}</td><td>KSh ${(item.price * item.quantity).toLocaleString()}</td></tr>`).join("");
  const date = new Date(kind === "receipt" ? (order.receiptIssuedAt || order.updatedAt) : order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
  const number = kind === "receipt" ? order.receiptNumber : (order.invoiceNumber || `AS-${ref}`);
  const status = kind === "receipt" ? (order.storeBalanceCreditedAt ? "PAID · VALUE RETURNED TO STORE BALANCE" : "PAID") : (order.paymentStatus === "paid" ? "PAID" : order.paymentStatus === "refund_pending" ? "REFUND PENDING" : order.paymentStatus === "refunded" ? "REFUNDED" : "UNPAID");
  const balancePaid = Number(order.storeBalanceApplied || 0);
  const returnedToBalance = storeBalanceCreditAmount(order);
  const externalPaid = Math.max(0, Number(order.totalAmount || 0) - balancePaid);
  const methodLabel = { mpesa: "M-Pesa", paystack: "Card", cod: "Cash on delivery", store_balance: "Store Balance" }[order.paymentMethod] || order.paymentMethod || "Payment";
  const balanceState = order.storeBalanceCreditedAt ? "original Store Balance contribution" : order.storeBalanceStatus === "reserved" ? "reserved" : order.storeBalanceStatus === "released" ? "returned to the account" : "applied";
  const paymentBreakdown = kind === "receipt"
    ? `${balancePaid > 0 ? `<p>Paid using Azard Store Balance: KSh ${balancePaid.toLocaleString()}</p>` : ""}${externalPaid > 0 ? `<p>Paid by ${esc(methodLabel)}: KSh ${externalPaid.toLocaleString()}</p>` : ""}${order.storeBalanceCreditedAt ? `<p>Order value later returned to Store Balance: KSh ${returnedToBalance.toLocaleString()}</p>` : ""}${(order.additionalPaymentRefunds || []).map((payment) => `<p>Additional payment outside this order total: KSh ${Number(payment.amount || 0).toLocaleString()} · ${payment.status === "refunded" ? "refund recorded" : "refund under review"}</p>`).join("")}`
    : balancePaid > 0 ? `<p>Store Balance ${esc(balanceState)}: KSh ${balancePaid.toLocaleString()}</p>${order.paymentStatus !== "paid" && order.storeBalanceStatus !== "released" ? `<p>${order.paymentMethod === "cod" ? "Cash due at delivery" : order.status === "pending" ? "Remaining after availability confirmation" : "Payment due"}: KSh ${externalPaid.toLocaleString()}</p>` : ""}${order.storeBalanceCreditedAt ? `<p>Order value returned to Store Balance: KSh ${returnedToBalance.toLocaleString()}</p>` : ""}` : "";
  const customerName = order.billingSnapshot?.name || order.guestInfo?.name || account?.name || "Customer";
  const customerEmail = order.billingSnapshot?.email || order.guestInfo?.email || account?.email || "";
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return false;
  win.opener = null;
  const deliveryAddress = order.deliveryCorrection?.address || order.deliveryAddress || "";
  win.document.write(`<!doctype html><html><head><title>${kind === "receipt" ? "Receipt" : "Invoice"} ${esc(number)}</title><style>body{font:15px Arial,sans-serif;color:#142033;max-width:760px;margin:48px auto;padding:0 24px}h1{margin-bottom:4px}small{color:#596579}.meta{display:flex;justify-content:space-between;margin:28px 0;padding:16px;background:#f4f6f8}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd}th:last-child,td:last-child{text-align:right}.total{text-align:right;font-size:20px;font-weight:bold;margin-top:24px}.status{font-weight:bold;color:${status.startsWith("PAID") ? "#087443" : "#9a5b00"}}@media print{button{display:none}}</style></head><body><h1>Azard Stores</h1><small>${kind === "receipt" ? "Payment receipt" : "Order invoice"}</small><div class="meta"><div><b>${kind === "receipt" ? "Receipt" : "Invoice"} ${esc(number)}</b><br>Order #${ref}<br>${esc(date)}<br><br>Bill to: ${esc(customerName)}<br>${esc(customerEmail)}<br>${esc(deliveryAddress)}</div><div class="status">${status}</div></div><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}<tr><td colspan="2">Delivery</td><td>KSh ${Number(order.deliveryFee || 0).toLocaleString()}</td></tr></tbody></table><div class="total">Total: KSh ${Number(order.totalAmount || 0).toLocaleString()}</div>${paymentBreakdown}<p>Payment method: ${esc(order.paymentMethod || "—")} ${order.paymentReference ? `<br>Payment reference: ${esc(order.paymentReference)}` : ""}</p><p><small>Thank you for shopping with Azard Stores.</small></p><button onclick="window.print()">Print / Save as PDF</button><script>setTimeout(()=>window.print(),300)</script></body></html>`);
  win.document.close();
  return true;
}

function StoreBalancePanel({ compact = false }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(Number(user?.storeBalance || 0));
  const [transactions, setTransactions] = useState([]);
  const [balanceError, setBalanceError] = useState("");
  const [refreshAttempt, setRefreshAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const socket = connectRealtime();
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      setBalanceError("");
      api.get('/auth/store-balance').then((res) => {
        if (!active) return;
        setBalance(Number(res.data.balance || 0));
        setTransactions(res.data.transactions || []);
      }).catch(() => {
        if (active) setBalanceError("Store Balance could not be refreshed. Your displayed balance may be out of date.");
      });
    };
    refresh();
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refresh();
      else hasConnectedOnce = true;
    });
    const orderEvents = [
      "order-status-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
    ];
    orderEvents.forEach((eventName) => socket.on(eventName, (event) => {
      if (eventBelongsToUser(event, user)) refresh();
    }));
    socket.on("new-order", (event) => {
      if (eventBelongsToUser(event, user)) refresh();
    });
    socket.on("store-balance-updated", (event) => {
      if (eventBelongsToUser(event, user)) refresh();
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => {
      if (!socket.connected && document.visibilityState === 'visible') refresh();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket.disconnect();
    };
  }, [refreshAttempt]);

  return <section className={'rounded-2xl border border-mall-accent/20 bg-gradient-to-br from-mall-accent/10 to-mall-800 ' + (compact ? 'p-4' : 'p-5 sm:p-6 mb-6')}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-mono-tag text-[9px] uppercase tracking-widest text-mall-accent/80">Azard Store Balance</p>
        <p className={'font-display text-cream mt-1 ' + (compact ? 'text-2xl' : 'text-3xl')}>KSh {balance.toLocaleString()}</p>
        <p className="text-cream/40 text-xs mt-1">Returned money for eligible orders. Use it on future purchases; it is not withdrawable for cash.</p>
      </div>
      <Wallet size={20} className="text-mall-accent"/>
    </div>
    {balanceError && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2.5 text-xs text-amber-100"><span>{balanceError}</span><button type="button" onClick={() => setRefreshAttempt((attempt) => attempt + 1)} className="rounded-lg border border-amber-200/25 px-3 py-2 text-amber-100 hover:bg-amber-200/5">Retry</button></div>}
    {!compact && transactions.length > 0 && <div className="mt-5 border-t border-cream/10 pt-4">
      <p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/35 mb-2">Balance activity</p>
      <div className="divide-y divide-cream/8">{transactions.slice(0, 8).map((entry, index) => {
        const orderId = entry.order ? String(entry.order) : '';
        const orderStatus = entry.orderStatus ? entry.orderStatus.replace(/_/g, ' ') : '';
        const paymentStatus = entry.orderPaymentStatus ? entry.orderPaymentStatus.replace(/_/g, ' ') : '';
        const addsBalance = ['credit', 'claim', 'release'].includes(entry.type);
        return <div key={entry.reference + '-' + index} className="py-2 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="text-cream/75">{entry.description || entry.type.replace(/_/g, ' ')}</p>
            <p className="text-cream/30 mt-0.5">{new Date(entry.createdAt).toLocaleDateString('en-KE')}{orderId ? ' | Order #' + orderId.slice(-6).toUpperCase() : ''}{orderStatus ? ' | ' + orderStatus : ''}{paymentStatus ? ' | payment ' + paymentStatus : ''}</p>
            {entry.balanceAfter !== undefined && entry.balanceAfter !== null && Number.isFinite(Number(entry.balanceAfter)) && <p className="mt-0.5 text-cream/25">Balance after: KSh {Number(entry.balanceAfter).toLocaleString()}</p>}
          </div>
          <span className={'shrink-0 ' + (addsBalance ? 'text-emerald-300' : 'text-cream/60')}>{addsBalance ? '+' : '-'}KSh {Number(entry.amount).toLocaleString()}</span>
        </div>;
      })}</div>
    </div>}
  </section>;
}
function PaymentMethodsInfo() {
  return <section className="mb-5 rounded-xl border border-cream/10 bg-mall-900/40 p-4">
    <h3 className="text-sm font-medium text-cream">Payment methods</h3>
    <p className="mt-1 text-xs leading-relaxed text-cream/45">Card details are entered in Paystack’s secure checkout. If Paystack Saved Cards is enabled for Azard Stores, Paystack will offer its saved-card option there. Azard never stores card numbers or security codes. M-Pesa payments require approval on your phone for every order.</p>
  </section>;
}

function BillingTab({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [documentMessage, setDocumentMessage] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    api.get('/orders/my')
      .then((res) => { if (active) setOrders(res.data); })
      .catch(() => { if (active) setError('Billing history could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const socket = connectRealtime();
    const refreshBilling = () => {
      if (!document.hidden) setAttempt((value) => value + 1);
    };
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshBilling();
      else hasConnectedOnce = true;
    });
    [
      "order-status-updated",
      "order-details-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
    ].forEach((eventName) => socket.on(eventName, (event) => {
      if (eventBelongsToUser(event, user)) refreshBilling();
    }));
    socket.on("new-order", (event) => {
      if (eventBelongsToUser(event, user)) refreshBilling();
    });
    socket.on("store-balance-updated", (event) => {
      if (eventBelongsToUser(event, user)) refreshBilling();
    });
    const onVisibilityChange = () => {
      if (!document.hidden) refreshBilling();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => {
      if (!socket.connected && !document.hidden) refreshBilling();
    }, 15000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket.disconnect();
    };
  }, []);

  if (loading) return <div className="py-16 text-center text-cream/40 text-sm">Loading billing history...</div>;
  if (error && orders.length === 0) return <div className="py-12 text-center"><p role="alert" className="text-red-300 text-sm mb-3">{error}</p><button onClick={() => setAttempt((value) => value + 1)} className="rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/70 hover:border-cream/30">Try again</button></div>;
  if (!orders.length) return <div><PaymentMethodsInfo/><div className="py-16 text-center"><Receipt size={34} className="text-cream/20 mx-auto mb-3"/><p className="text-cream/40 text-sm">Invoices and receipts will appear here after you place an order.</p></div></div>;

  const extraPayments = orders.flatMap((order) => (order.additionalPaymentRefunds || []).map((payment) => ({ order, payment })));
  const extraCredits = orders.flatMap((order) => (order.additionalPaymentCredits || []).map((payment) => ({ order, payment })));
  return (
    <div>
      {error && <p role="status" className="mb-3 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">Billing could not refresh. Showing the last loaded records. <button type="button" onClick={() => setAttempt((value) => value + 1)} className="ml-1 underline">Retry</button></p>}
      <PaymentMethodsInfo />
      {documentMessage && <p role="status" className="mb-3 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{documentMessage}</p>}
      {extraPayments.length > 0 && <section className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4">
        <h3 className="text-sm font-medium text-amber-100">Additional payment updates</h3>
        <p className="mt-1 text-xs text-cream/45">These payments are separate from the order total and are not counted as order payment.</p>
        <div className="mt-3 space-y-2">{extraPayments.map(({ order, payment }) => <article key={order._id + (payment._id || payment.amount)} className="rounded-lg bg-mall-900/40 px-3 py-2 text-xs">
          <p className="text-cream/80">Order #{order._id.slice(-6).toUpperCase()} | KSh {Number(payment.amount).toLocaleString()} | {payment.status === 'refunded' ? 'Refund recorded' : 'Refund under review'}</p>
        </article>)}</div>
      </section>}
      {extraCredits.length > 0 && <section className="mb-4 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4">
        <h3 className="text-sm font-medium text-emerald-100">Additional payments in Store Balance</h3>
        <p className="mt-1 text-xs text-cream/45">These verified payments are kept separately from the amount paid for each order.</p>
        <div className="mt-3 space-y-2">{extraCredits.map(({ order, payment }) => <article key={order._id + (payment._id || payment.amount)} className="rounded-lg bg-mall-900/40 px-3 py-2 text-xs">
          <p className="text-cream/80">Order #{order._id.slice(-6).toUpperCase()} · KSh {Number(payment.amount).toLocaleString()} · {payment.status === 'crediting' ? 'Being added to Store Balance' : payment.status === 'claim_pending' ? 'Waiting for verified account claim' : 'Added to Store Balance'}</p>
        </article>)}</div>
      </section>}
      <div className="divide-y divide-cream/8">{orders.map((order) => {
        const paymentSummary = getCustomerPaymentSummary(order);
        const paymentState = order.paymentStatus === 'paid' && order.storeBalanceCreditedAt
          ? 'Paid | value returned to Store Balance'
          : paymentSummary.status;
        return <div key={order._id} className="py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
          <div>
            <p className="text-cream text-sm font-medium">Order #{order._id.slice(-6).toUpperCase()}</p>
            <p className="mt-1 text-xs text-cream/40">{new Date(order.createdAt).toLocaleDateString('en-KE')} | {paymentSummary.method} | {paymentState}</p>
            <p className="mt-1 text-sm text-cream/65">KSh {Number(order.totalAmount).toLocaleString()}</p>
            {order.replacementFor && <p className="mt-1 text-xs text-mall-accent/75">Replacement for order #{String(order.replacementFor._id || order.replacementFor).slice(-6).toUpperCase()}</p>}
            {order.storeBalanceCreditedAt ? <p className="mt-1 text-xs text-emerald-300">KSh {storeBalanceCreditAmount(order).toLocaleString()} returned to Store Balance{order.storeBalanceClaimStatus === 'pending' ? ' | waiting for verified account claim' : ''}</p>
              : Number(order.storeBalanceApplied) > 0 && <p className="mt-1 text-xs text-cream/45">Store Balance {order.storeBalanceStatus === 'reserved' ? 'reserved' : order.storeBalanceStatus === 'released' ? 'returned' : 'applied'}: KSh {Number(order.storeBalanceApplied).toLocaleString()}{order.paymentStatus !== 'paid' && order.storeBalanceStatus !== 'released' ? ' | remaining KSh ' + Math.max(0, Number(order.totalAmount) - Number(order.storeBalanceApplied)).toLocaleString() : ''}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard#orders" className="inline-flex items-center gap-2 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/75 hover:border-cream/30">View order</Link>
            <button onClick={() => setDocumentMessage(printableOrderDocument(order, 'invoice', user) ? '' : 'Your browser blocked the invoice window. Allow pop-ups for this site and try again.')} className="inline-flex items-center gap-2 rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/75"><FileText size={13}/> Invoice</button>
            {order.paymentStatus === 'paid' && order.receiptNumber && <button onClick={() => setDocumentMessage(printableOrderDocument(order, 'receipt', user) ? '' : 'Your browser blocked the receipt window. Allow pop-ups for this site and try again.')} className="inline-flex items-center gap-2 rounded-lg bg-mall-accent/10 px-3 py-2 text-xs text-mall-accent"><Receipt size={13}/> Receipt</button>}
          </div>
        </div>;
      })}</div>
    </div>
  );
}
function OrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [paymentAction, setPaymentAction] = useState(null);
  const [returningOrder, setReturningOrder] = useState(null);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [cancellationOrder, setCancellationOrder] = useState(null);
  const [submittingCancellation, setSubmittingCancellation] = useState(false);
  const [ordersLoadError, setOrdersLoadError] = useState("");
  const [ordersLoadAttempt, setOrdersLoadAttempt] = useState(0);
  const [ordersRefreshWarning, setOrdersRefreshWarning] = useState("");

  const hasActiveOrders = orders.some((order) => ["pending", "confirmed", "shipped", "ready_for_collection"].includes(order.status)
    || order.storeBalanceClaimStatus === "pending"
    || order.returnRequests?.some((request) => ["pending", "approved"].includes(request.status) || (request.status === "completed" && !request.storeBalanceIssuedAt))
    || order.deliveryIssueRequests?.some((issue) => ["open", "investigating"].includes(issue.status))
    || order.additionalPaymentRefunds?.some((payment) => payment.status === "refund_pending")
    || order.paymentAttempts?.some((attempt) => attempt.status === "review")
    || order.additionalPaymentCredits?.some((payment) => payment.status === "crediting"));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setOrdersLoadError("");
    setOrdersRefreshWarning("");
    api.get("/orders/my")
      .then((res) => { if (active) { setOrders(res.data); setOrdersRefreshWarning(""); } })
      .catch(() => { if (active) setOrdersLoadError("Your orders could not be loaded. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ordersLoadAttempt]);
  useEffect(() => {
    let active = true;
    const refreshOrders = (event = null) => {
      if (document.hidden) return;
      const eventOrderId = event?.id ? String(event.id) : "";
      if (eventOrderId && !ordersRef.current.some((order) => String(order._id) === eventOrderId || String(order.replacementOrder?._id || order.replacementOrder || "") === eventOrderId)) return;
      api.get("/orders/my")
        .then((res) => { if (active) { setOrders(res.data); setOrdersRefreshWarning(""); } })
        .catch(() => { if (active) setOrdersRefreshWarning("Live order updates are temporarily unavailable. The details shown may be out of date."); });
    };
    const socket = connectRealtime();
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshOrders();
      else hasConnectedOnce = true;
    });
    document.addEventListener("visibilitychange", refreshOrders);
    socket.on("new-order", (event) => {
      if (eventBelongsToUser(event, user)) refreshOrders();
    });
    [
      "order-status-updated",
      "order-details-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
    ].forEach((eventName) => socket.on(eventName, refreshOrders));
    socket.on("store-balance-updated", (event) => {
      if (eventBelongsToUser(event, user)) refreshOrders();
    });

    // Keep polling quiet while Socket.IO is healthy. If it disconnects, use
    // a short fallback interval until the connection returns.
    const timer = setInterval(() => {
      if (!socket.connected) refreshOrders();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOrders);
      socket.disconnect();
    };
  }, [hasActiveOrders, user?.id]);

  function cancelOrder(order) {
    setActionMessage("");
    setCancellationOrder(order);
  }

  async function submitCancellation(reason) {
    if (!cancellationOrder) return;
    setSubmittingCancellation(true);
    try {
      const res = await api.post(`/orders/${cancellationOrder._id}/cancel-request`, { reason });
      setOrders((prev) => prev.map((item) => item._id === cancellationOrder._id ? res.data : item));
      setActionMessage(res.data.paymentStatus === "paid"
        ? res.data.storeBalanceCreditedAt
          ? `Order cancelled. KSh ${storeBalanceCreditAmount(res.data).toLocaleString()} is in Store Balance.`
          : "Order cancelled. The payment settled during cancellation and its value is being added to Store Balance."
        : cancellationOrder.paymentStatus === "paid"
          ? "Cancellation request sent. Azard Stores will review it before dispatch; if approved, the paid value goes to Store Balance."
          : "Order cancelled. The stock reservation, if any, has been released.");
      setCancellationOrder(null);
    } catch (err) { throw new Error(err.response?.data?.message || "Could not cancel this order."); }
    finally { setSubmittingCancellation(false); }
  }

  function requestReturn(order) {
    setActionMessage("");
    setReturningOrder(order);
  }

  async function submitReturnRequest(payload) {
    if (!returningOrder) return;
    setSubmittingReturn(true);
    try {
      const res = await api.post(`/orders/${returningOrder._id}/returns`, payload);
      setOrders((prev) => prev.map((item) => item._id === returningOrder._id ? res.data : item));
      setActionMessage(`${payload.type === "return" ? "Return" : "Exchange"} request sent for review. Check the order updates here for its status.`);
      setReturningOrder(null);
    } catch (err) { throw new Error(err.response?.data?.message || "Could not submit the request."); }
    finally { setSubmittingReturn(false); }
  }

  async function retryPayment(order) {
    setActionMessage("");
    setPayingOrderId(order._id);
    setPaymentAction(order.paymentMethod === "mpesa" ? "starting" : "opening");
    const providerLabel = order.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
    try {
      if (order.paymentMethod === "paystack") {
        const res = await api.post("/payments/paystack/initialize", { orderId: order._id });
        window.location.href = res.data.authorizationUrl;
        return;
      }
      const initiation = await api.post("/payments/mpesa/initiate", { orderId: order._id });
      setPaymentAction("waiting");
      setActionMessage(initiation.data.displayText || "Approve the M-Pesa payment prompt on your phone. Waiting for confirmation.");
      for (let attempt = 0; attempt < 18; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const res = await api.get(`/payments/mpesa/status/${order._id}`);
        const updatedOrder = res.data.order;
        if (updatedOrder) {
          setOrders((prev) => prev.map((item) => item._id === order._id ? updatedOrder : item));
        }
        if (res.data.paymentStatus === "paid") {
          setActionMessage("Payment confirmed. Your receipt is available in Billing.");
          return;
        }
        if (res.data.paymentStatus === "failed") {
          setActionMessage("That payment attempt did not go through. You can try again when ready.");
          return;
        }
      }
      setActionMessage(`${providerLabel} has not confirmed this payment yet, so the order is still unpaid. If you approved the request on your phone, do not start another payment yet; refresh My Orders or contact Azard Stores with this order number.`);
    } catch (err) {
      setActionMessage(err.response?.data?.message || "Could not start payment. Your order remains active; try again shortly.");
    } finally { setPayingOrderId(null); setPaymentAction(null); }
  }

  async function checkPaymentStatus(order) {
    setActionMessage("");
    setPayingOrderId(order._id);
    setPaymentAction("checking");
    const providerLabel = order.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
    try {
      const pendingAttempt = [...(order.paymentAttempts || [])].reverse().find((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
      const res = order.paymentMethod === "mpesa"
        ? await api.get(`/payments/mpesa/status/${order._id}`)
        : pendingAttempt
          ? await api.get(`/payments/paystack/verify/${encodeURIComponent(pendingAttempt.reference)}`)
          : null;
      if (!res) {
        setActionMessage("There is no active payment request to check. Contact Azard Stores if you believe you paid.");
        return;
      }
      const updatedOrder = res.data.order;
      setOrders((prev) => prev.map((item) => item._id === order._id ? updatedOrder : item));
      const status = res.data.paymentStatus || updatedOrder.paymentStatus;
      setActionMessage(status === "paid"
        ? "Payment confirmed. Your receipt is available in Billing."
        : status === "failed"
          ? `${providerLabel} confirmed that payment did not complete. You can start a new payment while the reservation is active.`
          : `${providerLabel} has not confirmed a result yet. The order remains unpaid; wait for the current request to finish. If you already approved it and it remains pending, contact Azard Stores with your order number.`);
    } catch (err) {
      setActionMessage(err.response?.data?.message || `Could not check ${providerLabel} yet. Your order remains unpaid; wait before starting another payment.`);
    } finally { setPayingOrderId(null); setPaymentAction(null); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
    </div>
  );

  if (ordersLoadError) return <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-300/15 bg-red-300/5 px-5 py-8 text-center"><p className="font-display text-lg text-cream">Orders unavailable</p><p className="mt-2 text-sm text-cream/50">{ordersLoadError}</p><button type="button" onClick={() => setOrdersLoadAttempt((attempt) => attempt + 1)} className="mt-5 rounded-xl border border-cream/15 px-4 py-2.5 text-xs text-cream/75 hover:border-cream/30">Try again</button></div>;

  if (orders.length === 0) return (
    <div className="py-20 text-center">
      <Package size={40} className="text-cream/15 mx-auto mb-3" />
      <p className="font-display text-xl text-cream/30 mb-2">No orders yet</p>
      <p className="text-cream/20 text-sm mb-6">Start shopping to see your orders here.</p>
      <Link to="/directory" className="inline-flex items-center gap-2 text-mall-accent hover:underline text-sm">
        Browse the mall <ChevronRight size={13} />
      </Link>
    </div>
  );

  return (
    <div>
    {ordersRefreshWarning && <p role="status" className="mb-3 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{ordersRefreshWarning}</p>}
    {actionMessage && <p role="status" className="text-xs text-cream/70 bg-mall-800 rounded-lg p-3 mb-3">{actionMessage}</p>}
    <div className="space-y-0 divide-y divide-cream/8">
      {orders.map((order) => {
        const status = STATUS[order.status] || STATUS.pending;
        const StatusIcon = status.icon;
        const isOpen = expanded === order._id;
        const customerMessage = getCustomerOrderMessage(order);
        const paymentSummary = getCustomerPaymentSummary(order);
        const customerEvents = customerOrderEvents(order.events);
        const paymentAttemptPending = (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
        const paymentAttemptNeedsReview = (order.paymentAttempts || []).some((attempt) => attempt.status === "review");

        return (
          <div key={order._id} className="py-5">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : order._id)}
              aria-expanded={isOpen}
              className="w-full flex items-start justify-between gap-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest">
                    Order #{order._id.slice(-6).toUpperCase()}
                  </span>
                  <span className={`inline-flex items-center gap-1 font-mono-tag text-[9px] uppercase px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                    <StatusIcon size={9} />
                    {status.label}
                  </span>
                </div>
                <p className="text-cream/40 text-xs">
                  {new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}{order.items.length} item{order.items.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-lg text-cream">KSh {order.totalAmount.toLocaleString()}</p>
                {order.storeBalanceCreditedAt ? <p className="text-[10px] text-emerald-300">KSh {storeBalanceCreditAmount(order).toLocaleString()} returned to Store Balance</p> : Number(order.storeBalanceApplied) > 0 && <p className="text-[10px] text-mall-accent">KSh {Number(order.storeBalanceApplied).toLocaleString()} {order.storeBalanceStatus === "reserved" ? "Store Balance reserved" : order.storeBalanceStatus === "released" ? "Store Balance returned" : "Store Balance applied"}</p>}
                <ChevronRight size={14} className={`text-cream/30 ml-auto mt-1 transition ${isOpen ? "rotate-90" : ""}`} />
              </div>
            </button>

            {/* Expanded items */}
            {isOpen && (
              <div className="mt-4 pt-4 border-t border-cream/8 space-y-3">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-cream/45">
                  <span>Payment: {paymentSummary.status}</span>
                  <span>Method: {paymentSummary.method}</span>
                  {order.storeBalanceCreditedAt && <span>Returned to Store Balance: KSh {storeBalanceCreditAmount(order).toLocaleString()}</span>}
                  {!order.storeBalanceCreditedAt && Number(order.storeBalanceApplied) > 0 && <span>Store Balance {order.storeBalanceStatus === "reserved" ? "reserved" : order.storeBalanceStatus === "released" ? "returned" : "applied"}: KSh {Number(order.storeBalanceApplied).toLocaleString()}</span>}
                  {!order.storeBalanceCreditedAt && order.storeBalanceStatus !== "released" && order.paymentStatus !== "paid" && Number(order.storeBalanceApplied) > 0 && <span>{order.status === "pending" ? "Remaining after availability" : "Remaining to pay"}: KSh {Math.max(0, Number(order.totalAmount) - Number(order.storeBalanceApplied)).toLocaleString()}</span>}
                  {order.parcelReference && <span>Parcel ref: {order.parcelReference}</span>}
                  {order.deliveryRoute?.serviceType === "parcel" && order.deliveryRoute?.carrier && <span>Carrier: {order.deliveryRoute.carrier}{order.deliveryRoute.officeName ? ` · ${order.deliveryRoute.officeName}` : ""}{Number(order.deliveryRoute.estimatedDays) > 0 ? ` · about ${Number(order.deliveryRoute.estimatedDays)} day${Number(order.deliveryRoute.estimatedDays) === 1 ? "" : "s"}` : ""}</span>}
                </div>
                {order.replacementFor && <p className="text-xs text-mall-accent/80">Replacement for order #{String(order.replacementFor).slice(-6).toUpperCase()} · {Number(order.replacementPriceDifference) > 0 ? "+" : ""}KSh {Number(order.replacementPriceDifference || 0).toLocaleString()} compared with its original total</p>}
                <OrderStatusTracker status={order.status} deliveryArea={order.deliveryArea} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} storeBalanceApplied={order.storeBalanceApplied} totalAmount={order.totalAmount} />
                <AvailabilityIssueActions order={order} onUpdate={(updated) => setOrders((prev) => prev.map((item) => item._id === updated._id ? updated : item))} />
                <DeliveryIssuePanel order={order} onUpdate={(updated) => setOrders((prev) => prev.map((item) => item._id === updated._id ? updated : item))} />
                <div className="rounded-xl border border-cream/8 bg-mall-800/60 px-4 py-3">
                  <p className="text-sm font-medium text-cream">{customerMessage.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-cream/50">{customerMessage.body}</p>
                </div>
                {order.storeBalanceClaimStatus === "pending" && order.status !== "unavailable" && <p className="rounded-lg border border-mall-accent/20 bg-mall-accent/5 px-3 py-2 text-xs text-cream/65">A Store Balance from this order is waiting to be claimed. Sign in or create an account with {order.guestInfo?.email || order.billingSnapshot?.email} and verify that email. <Link to="/dashboard#billing" className="text-mall-accent underline">View Billing</Link></p>}
                {order.paymentStatus === "failed" && order.status === "confirmed" && <PaymentFailurePanel order={order} retrying={payingOrderId === order._id} onRetry={() => retryPayment(order)} />}
                {!paymentAttemptNeedsReview && !order.paymentTestMode && ["mpesa", "paystack"].includes(order.paymentMethod) && ((order.status === "confirmed" && order.paymentStatus !== "paid" && order.paymentStatus !== "failed") || (order.status === "expired" && paymentAttemptPending && order.paymentStatus !== "paid")) && <button disabled={payingOrderId === order._id} onClick={() => paymentAttemptPending ? checkPaymentStatus(order) : retryPayment(order)} className="rounded-lg bg-mall-accent px-3 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50">{payingOrderId === order._id ? paymentAction === "starting" ? "Starting M-Pesa" : paymentAction === "waiting" ? "Waiting for M-Pesa" : paymentAction === "opening" ? "Opening secure checkout" : "Checking payment" : paymentAttemptPending ? "Check payment status" : "Continue payment"}</button>}
                {order.returnRequests?.map((request) => { const summary = getCustomerReturnMessage(request, order); return <div key={request._id} className="rounded-lg border border-cream/8 bg-mall-900/40 px-3 py-2 text-xs"><p className="font-medium text-cream/75">{request.type === "return" ? "Return" : "Exchange"} · {summary.label}</p><p className="mt-1 text-cream/45">{summary.body}</p></div>; })}
                {order.cancellationRequests?.map((request) => <p key={request._id} className="text-xs text-amber-200">Cancellation request: {customerRequestStatus(request.status)}{request.status === "pending" ? " · Azard Stores is reviewing it" : ""}{request.decisionNote ? ` · ${request.decisionNote}` : ""}</p>)}
                {customerEvents.length > 0 && <div className="space-y-3"><p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/30">Order updates</p><div className="border-l border-cream/15 pl-3 space-y-3">{customerEvents.map((event, index) => <div key={`${event.type}-${event.createdAt}-${index}`}><p className="text-xs text-cream/70">{orderEventLabel(event)}</p>{orderEventNote(event) && <p className="text-[11px] text-cream/40">{orderEventNote(event)}</p>}<p className="text-[10px] text-cream/25">{new Date(event.createdAt).toLocaleString("en-KE")}</p></div>)}</div></div>}
                {order.status === "ready_for_collection" && <p className="text-amber-200 text-xs">Your parcel is ready. Collect it from {order.collectionBranch || "the destination parcel branch"} using reference {order.parcelReference}.</p>}
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-mall-800 overflow-hidden shrink-0">
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
                    <p className="text-cream/70 text-sm shrink-0">KSh {(item.price * item.quantity).toLocaleString()}</p>
                  </div>
                ))}
                {Boolean(order.deliveryFee) && (
                  <div className="flex items-center justify-between pt-3 border-t border-cream/8 text-xs">
                    <span className="text-cream/40">Delivery fee</span>
                    <span className="text-cream/70">KSh {order.deliveryFee.toLocaleString()}</span>
                  </div>
                )}
                {(order.deliveryAddress || order.deliveryCorrection?.address) && (
                  <div className="pt-3 border-t border-cream/8">
                    <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-1">Delivery to</p>
                    <p className="text-cream/45 text-xs mb-1">{[order.deliveryCorrection?.town || order.deliveryTown, order.deliveryCorrection?.county || order.deliveryCounty].filter(Boolean).join(", ")}</p>
                    <p className="text-cream/50 text-xs">{order.deliveryCorrection?.address || order.deliveryAddress}</p>
                    {order.deliveryRoute?.serviceType === "direct" && <p className="text-cream/40 text-xs mt-1">Direct delivery zone: {order.deliveryTown}</p>}
                    {order.deliveryInstructions && <p className="text-cream/35 text-xs mt-1">Your notes: {order.deliveryInstructions}</p>}
                    {order.deliveryRoute?.serviceType === "parcel" && order.deliveryRoute?.carrier && <p className="text-cream/40 text-xs mt-1">{order.deliveryRoute.carrier} · {order.deliveryRoute.officeName}{order.deliveryRoute.officeAddress ? ` · ${order.deliveryRoute.officeAddress}` : ""}</p>}
                  </div>
                )}
                {(["pending", "confirmed"].includes(order.status) && !order.cancellationRequests?.some((request) => request.status === "pending")) && <button onClick={() => cancelOrder(order)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs text-red-300 hover:text-red-200 sm:min-h-0">{order.paymentStatus === "paid" ? "Request cancellation" : "Cancel order"}</button>}
                {isReturnWindowOpen(order) && getAvailableReturnQuantities(order).some((quantity) => quantity > 0) && <button onClick={() => requestReturn(order)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs text-mall-accent hover:underline sm:min-h-0">Request return or exchange</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {returningOrder && <ReturnRequestForm order={returningOrder} submitting={submittingReturn} onClose={() => setReturningOrder(null)} onSubmit={submitReturnRequest} />}
    {cancellationOrder && <CustomerCancellationForm order={cancellationOrder} submitting={submittingCancellation} onClose={() => setCancellationOrder(null)} onSubmit={submitCancellation} />}
    </div>
  );
}

// â”€â”€â”€ Wishlist tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WishlistTab() {
  const { user, wishlistError, wishlistLoading, retryWishlist } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => subscribeToWishlist(() => setLoadAttempt((attempt) => attempt + 1)), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    try {
      const saved = getWishlist();
      setStorageNotice(isWishlistStorageAvailable() ? "" : "Wishlist changes are available for this visit only because browser storage is blocked.");
      if (saved.length === 0) {
        setProducts([]);
        setLoading(false);
        return () => { active = false; };
      }
      Promise.all(saved.map(async (slug) => {
        try {
          const response = await api.get(`/products/${encodeURIComponent(slug)}`);
          return { slug, product: response.data, error: false, missing: false };
        } catch (err) {
          return { slug, product: null, error: !err.response || err.response.status >= 500, missing: err.response?.status === 404 };
        }
      })).then((results) => {
        if (!active) return;
        setProducts(results.map((result) => result.product).filter(Boolean));
        if (results.some((result) => result.error)) setLoadError("Some saved items could not be loaded. Check your connection and try again.");
        else if (results.some((result) => result.missing)) {
          const unavailable = new Set(results.filter((result) => result.missing).map((result) => result.slug));
          replaceWishlist(saved.filter((slug) => !unavailable.has(slug)));
        }
      }).finally(() => { if (active) setLoading(false); });
    } catch {
      if (active) {
        setLoadError("Saved items could not be read. Reload this section to try again.");
        setLoading(false);
      }
    }
    return () => { active = false; };
  }, [loadAttempt]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
    </div>
  );

    if (loadError && products.length === 0) return <div className="py-16 text-center">
      {wishlistError && <p role="alert" className="mx-auto mb-3 flex max-w-lg items-center justify-between gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-left text-xs text-amber-100">{wishlistError}<button type="button" onClick={retryWishlist} className="shrink-0 underline">Retry sync</button></p>}
      <p role="alert" className="text-amber-200 text-sm mb-3">{loadError}</p><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/70 hover:border-cream/30">Try again</button></div>;

  if (products.length === 0) return (
    <div className="py-20 text-center">
      {storageNotice && <p role="status" className="mx-auto mb-5 max-w-lg rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-left text-xs text-amber-100">{storageNotice}</p>}
      {user && wishlistLoading && <p role="status" className="mx-auto mb-5 max-w-lg text-xs text-cream/45">Syncing your wishlist…</p>}
      {user && wishlistError && <p role="alert" className="mx-auto mb-5 flex max-w-lg items-center justify-between gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-left text-xs text-amber-100">{wishlistError}<button type="button" onClick={retryWishlist} className="shrink-0 underline">Retry</button></p>}
      <Heart size={40} className="text-cream/15 mx-auto mb-3" />
      <p className="font-display text-xl text-cream/30 mb-2">Nothing saved yet</p>
      <p className="text-cream/20 text-sm mb-2">Tap the heart on any product to save it here.</p>
      <p className="text-cream/20 text-xs mb-6">{user ? "Your wishlist is saved to your account and follows you across devices." : "Sign in to keep your wishlist with your account across devices."}</p>
      <Link to="/directory" className="inline-flex items-center gap-2 text-mall-accent hover:underline text-sm">
        Browse the mall <ChevronRight size={13} />
      </Link>
    </div>
  );

  return (
    <div>
      {storageNotice && <p role="status" className="mb-4 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{storageNotice}</p>}
      {loadError && <p role="alert" className="mb-4 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{loadError} <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="ml-2 underline">Try again</button></p>}
      <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest mb-5">
        {products.length} saved item{products.length !== 1 ? "s" : ""}
      </p>
      {user && wishlistError ? <p role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">{wishlistError}<button type="button" onClick={retryWishlist} className="shrink-0 underline">Retry</button></p> : <p className="text-cream/25 text-xs mb-4">{user ? "Saved to your account and synced across devices." : "Saved on this device. Sign in to sync your wishlist across devices."}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {products.map((p) => <StripProductCard key={p._id} product={p} />)}
      </div>
    </div>
  );
}

// â”€â”€â”€ Settings tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SettingsTab({ user }) {
  const { logout, refreshUser, updateCurrentUser, updateSessionToken } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [phoneVerificationOpen, setPhoneVerificationOpen] = useState(false);
  const [emailResending, setEmailResending] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const phoneIsVerified = Boolean(user.isPhoneVerified && phone.trim() === (user.phone || "").trim());
  const profileDirty = name !== (user.name || "") || phone !== (user.phone || "");
  const profileDirtyRef = useRef(profileDirty);
  profileDirtyRef.current = profileDirty;

  useEffect(() => {
    let active = true;
    const syncProfile = async () => {
      if (profileDirtyRef.current) return;
      try {
        const freshUser = await refreshUser();
        if (!active || profileDirtyRef.current) return;
        setName(freshUser.name || "");
        setPhone(freshUser.phone || "");
      } catch {
        // Keep the current profile values if a focus refresh has a transient failure.
      }
    };
    window.addEventListener("focus", syncProfile);
    return () => {
      active = false;
      window.removeEventListener("focus", syncProfile);
    };
  }, [refreshUser]);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileError("");
    if (!name.trim()) { setProfileError("Name is required"); return; }
    setSaving(true);
    try {
      const res = await api.put("/auth/me", { name, phone });
      updateCurrentUser(res.data.user);
      setName(res.data.user.name || "");
      setPhone(res.data.user.phone || "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setProfileError(err.response?.data?.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyEmail() {
    setEmailResending(true);
    setEmailMessage("");
    try {
      const res = await api.post("/auth/resend-verification-email");
      setEmailMessage(res.data.message);
    } catch (err) {
      setEmailMessage(err.response?.data?.message || "Couldn't send the verification link. Try again shortly.");
    } finally {
      setEmailResending(false);
    }
  }

  async function handleOpenPhoneVerification() {
    setProfileError("");
    setPhoneVerificationOpen(false);
    if (!phone.trim()) {
      setProfileError("Add your phone number before verifying it.");
      return;
    }
    if (phone !== (user.phone || "")) {
      setSaving(true);
      try {
        const res = await api.put("/auth/me", { name, phone });
        updateCurrentUser(res.data.user);
        setName(res.data.user.name || "");
        setPhone(res.data.user.phone || "");
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setProfileError(err.response?.data?.message || "Could not save your phone number.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setPhoneVerificationOpen(true);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError("");
    if (!currentPw || !newPw) { setPwError("Please fill in both fields"); return; }
    if (!isValidPassword(newPw)) { setPwError("Use a password with at least 12 characters and no more than 72 UTF-8 bytes."); return; }
    setPwSaving(true);
    try {
      const response = await api.put("/auth/change-password", { currentPassword: currentPw, newPassword: newPw });
      updateSessionToken(response.data.token);
      setCurrentPw(""); setNewPw("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    } catch (err) {
      setPwError(err.response?.data?.message || "Could not change password");
    } finally {
      setPwSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  const inputClass = "flex-1 bg-transparent text-cream placeholder-cream/20 text-sm outline-none";
  const rowClass = "flex items-center gap-2 pb-2 transition";

  return (
    <div className="max-w-xl space-y-10">

      {/* Profile */}
      <div>
        <div className="mb-5">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">Profile</p>
        </div>
        <form onSubmit={handleSaveProfile} className="rounded-2xl bg-mall-800/60 p-5 sm:p-6">
          <div className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="profile-name" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-3">Full name</label>
            <div className={rowClass}>
              <User size={14} className="text-cream/30 shrink-0" />
              <input id="profile-name" name="name" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputClass} />
            </div>
          </div>

          {/* Email â€” read only */}
          <div>
            <label htmlFor="profile-email" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-3">Email</label>
            <div className={rowClass}>
              <Mail size={14} className="text-cream/30 shrink-0" />
              <input id="profile-email" value={user.email} readOnly className={`${inputClass} appearance-none border-0 outline-none ring-0 focus:outline-none focus:ring-0 cursor-not-allowed`} />
              {user.isEmailVerified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 shrink-0"><CheckCircle size={14} /> Verified</span>
              ) : (
                <button type="button" aria-label="Verify email address" onClick={handleVerifyEmail} disabled={emailResending} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-mall-accent disabled:opacity-50 shrink-0"><Clock size={14} /> {emailResending ? "Sending..." : "Verify"}</button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2">
              <p className="text-cream/25 text-[10px]">Email cannot be changed</p>
              {!user.isEmailVerified && <span className="text-cream/25 text-[10px]">A secure verification link will be sent to this address.</span>}
            </div>
            {emailMessage && <p role="status" className="text-cream/60 text-xs mt-2">{emailMessage}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="profile-phone" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-3">Phone number</label>
            <div className={rowClass}>
              <Phone size={14} className="text-cream/30 shrink-0" />
              <input id="profile-phone" name="tel" type="tel" autoComplete="tel" maxLength={18} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Add your phone number" className={`${inputClass} appearance-none border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0`} />
              {phoneIsVerified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 shrink-0"><CheckCircle size={14} /> Verified</span>
              ) : (
                <button type="button" aria-label="Verify phone number" onClick={handleOpenPhoneVerification} disabled={saving} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-mall-accent disabled:opacity-50 shrink-0"><Clock size={14} /> {saving ? "Saving..." : "Verify"}</button>
              )}
            </div>
            <VerificationCenter embedded open={phoneVerificationOpen} phone={phone} onPhoneChange={setPhone} />
          </div>

          {profileError && <p role="alert" className="text-red-400 text-xs mb-3">{profileError}</p>}
          </div>

          <div className="flex flex-col items-start gap-2 pt-5 mt-6 border-t border-cream/8">
            <button type="submit" disabled={saving || !profileDirty}
              className="flex items-center gap-2 bg-mall-accent text-mall-900 font-semibold py-2.5 px-5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm">
              {saving ? "Saving changes..." : saved ? "Changes saved" : "Save changes"}
            </button>
            {!profileDirty && !saved && <span className="text-cream/30 text-xs">Your details are up to date</span>}
          </div>        </form>
      </div>

      {/* Change password */}
      <div className="max-w-xl border-t border-cream/10 pt-8">
        <div className="mb-6">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">Security</p>
          <h3 className="font-display text-xl text-cream">Change password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-5">
          <div>
            <label htmlFor="current-password" className="font-mono-tag text-[10px] uppercase text-cream/45 tracking-widest block mb-2">Current password</label>
            <div className="flex items-center gap-3 px-0 py-2">
              <Lock size={15} className="text-cream/35 shrink-0" />
              <input id="current-password" name="current-password" type={showCurrent ? "text" : "password"} autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Enter current password" className={`${inputClass} min-w-0 appearance-none border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0`} />
              <button type="button" aria-label={showCurrent ? "Hide current password" : "Show current password"} onClick={() => setShowCurrent((s) => !s)} className="text-cream/35 hover:text-cream transition shrink-0">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="new-password" className="font-mono-tag text-[10px] uppercase text-cream/45 tracking-widest block mb-2">New password</label>
            <div className="flex items-center gap-3 px-0 py-2">
              <Lock size={15} className="text-cream/35 shrink-0" />
              <input id="new-password" name="new-password" type={showNew ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={72} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 12 characters" className={`${inputClass} min-w-0 appearance-none border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0`} />
              <button type="button" aria-label={showNew ? "Hide new password" : "Show new password"} onClick={() => setShowNew((s) => !s)} className="text-cream/35 hover:text-cream transition shrink-0">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-cream/25 text-[10px] mt-2">Use at least 12 characters. Passwords are limited to 72 UTF-8 bytes.</p>
          </div>
          {pwError && <p role="alert" className="text-red-400 text-xs">{pwError}</p>}
          <button type="submit" disabled={pwSaving} className="inline-flex items-center justify-center gap-2 bg-mall-accent text-mall-900 hover:bg-mall-accentDark font-semibold py-3 px-5 rounded-xl transition disabled:opacity-50 text-sm">
            {pwSaving ? "Updating password..." : pwSaved ? "Password updated" : "Update password"}
          </button>
        </form>
      </div>
      {/* Divider */}
      <div className="border-t border-cream/10" />

      {/* Logout */}
      <div>
        <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest mb-4">Account</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 transition text-sm font-medium"
        >
          <LogOut size={14} /> Log out of Azard Stores
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main account page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Dashboard() {
  const { user, loading: authLoading, authError, retryAuth, logout } = useAuth();
  const [overviewBalance, setOverviewBalance] = useState(Number(user?.storeBalance || 0));
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL hash or default to orders
  const hash = location.hash.replace("#", "") || "orders";
  const activeTab = TABS.find((t) => t.id === hash)?.id || "orders";

  useEffect(() => {
    if (!user) return;
    api.get("/auth/store-balance").then((res) => setOverviewBalance(Number(res.data.balance || 0))).catch(() => setOverviewBalance(Number(user.storeBalance || 0)));
  }, [user?.id, activeTab]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const socket = connectRealtime();
    const refreshBalance = () => {
      if (document.hidden) return;
      api.get("/auth/store-balance")
        .then((res) => { if (active) setOverviewBalance(Number(res.data.balance || 0)); })
        .catch(() => {});
    };
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshBalance();
      else hasConnectedOnce = true;
    });
    [
      "order-status-updated",
      "order-resolution-updated",
      "order-cancellation-updated",
      "order-return-updated",
      "order-delivery-issue-updated",
    ].forEach((eventName) => socket.on(eventName, (event) => {
      if (eventBelongsToUser(event, user)) refreshBalance();
    }));
    socket.on("new-order", (event) => {
      if (eventBelongsToUser(event, user)) refreshBalance();
    });
    socket.on("store-balance-updated", (event) => {
      if (eventBelongsToUser(event, user)) refreshBalance();
    });
    const onVisibilityChange = () => {
      if (!document.hidden) refreshBalance();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => {
      if (!socket.connected && !document.hidden) refreshBalance();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket.disconnect();
    };
  }, [user?.id]);

  function setTab(id) {
    navigate(`/dashboard#${id}`, { replace: true });
  }

  if (authLoading) return (
    <div className="min-h-screen bg-mall-900 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
    </div>
  );

  if (authError) return (
    <div className="min-h-screen bg-mall-900 flex items-center justify-center px-4">
      <div role="alert" className="max-w-md rounded-2xl border border-cream/10 bg-mall-800 p-6 text-center">
        <p className="text-cream mb-4">{authError}</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => retryAuth().catch(() => {})} className="rounded-full bg-mall-accent px-5 py-2 text-sm font-semibold text-mall-900">Retry</button>
          <Link to="/login" className="rounded-full border border-cream/15 px-5 py-2 text-sm text-cream/70">Log in</Link>
        </div>
      </div>
    </div>
  );

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const ActiveIcon = TABS.find((t) => t.id === activeTab)?.icon || ShoppingBag;

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8 pb-6 border-b border-cream/10">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">My Account</p>
          <h1 className="font-display text-3xl sm:text-4xl text-cream">Hi, {user.name?.split(" ")[0]}</h1>
          <p className="text-cream/40 text-sm mt-1">{user.email}</p>
          <Link to="/dashboard#billing" className="inline-flex items-center gap-3 mt-4 rounded-xl border border-mall-accent/20 bg-mall-accent/5 px-4 py-3 hover:bg-mall-accent/10"><Wallet size={17} className="text-mall-accent"/><span className="text-left"><span className="block text-[9px] uppercase tracking-widest text-mall-accent/80">Azard Store Balance</span><span className="block text-cream text-sm font-medium">KSh {overviewBalance.toLocaleString()}</span></span><span className="text-xs text-cream/40">View Billing</span></Link>
        </div>

        <div className="grid md:grid-cols-[200px_1fr] gap-8 lg:gap-12 items-start">

          {/* â”€â”€ Sidebar â€” desktop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="hidden md:block">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setTab(tab.id)}
                    aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition text-left ${
                      active ? "bg-mall-accent/10 text-mall-accent" : "text-cream/50 hover:text-cream hover:bg-cream/5"
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* â”€â”€ Tab pills â€” mobile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="md:hidden mb-6 -mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setTab(tab.id)}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 flex min-h-11 items-center gap-1.5 font-mono-tag text-[10px] uppercase px-3 py-2 rounded-full border transition sm:min-h-0 ${
                      active ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold" : "bg-mall-800 text-cream/50 border-cream/10"
                    }`}
                  >
                    <Icon size={11} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-cream/10">
              <ActiveIcon size={16} className="text-mall-accent shrink-0" />
              <h2 className="font-display text-xl text-cream">
                {TABS.find((t) => t.id === activeTab)?.label}
              </h2>
            </div>

            {activeTab === "orders"   && <OrdersTab />}
            {activeTab === "billing"  && <><StoreBalancePanel/><BillingTab user={user} /></>}
            {activeTab === "wishlist" && <WishlistTab />}
            {activeTab === "settings" && <SettingsTab user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}
