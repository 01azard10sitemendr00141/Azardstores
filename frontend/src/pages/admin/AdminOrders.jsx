import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShoppingBag, ChevronRight, Clock, CheckCircle, Truck, XCircle, Package, Download } from "lucide-react";
import api from "../../api/client";
import { connectRealtime } from "../../api/realtime";
import { orderEventLabel, orderEventNote, storeBalanceCreditAmount } from "../../utils/orderEventDisplay";
import { getReturnRequestLines } from "../../utils/returnQuantities";
import AdminPagination from "../../components/AdminPagination";
import AdminLoadError from "../../components/AdminLoadError";
import AdminReplacementOrderForm from "../../components/AdminReplacementOrderForm";
import ReturnDecisionForm from "../../components/admin/ReturnDecisionForm";
import ParcelStatusForm from "../../components/admin/ParcelStatusForm";
import DeliveryCompletionForm from "../../components/admin/DeliveryCompletionForm";
import DeliveryIssueDecisionForm from "../../components/admin/DeliveryIssueDecisionForm";
import AdminCancellationForm from "../../components/admin/AdminCancellationForm";
import AvailabilityResolutionForm from "../../components/admin/AvailabilityResolutionForm";
import AdminOrderCorrectionForm from "../../components/admin/AdminOrderCorrectionForm";
import { downloadCsv } from "../../utils/downloadCsv";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const STATUSES = ["pending", "confirmed", "shipped", "ready_for_collection", "collected", "delivered", "cancelled", "expired", "unavailable"];

const NEXT_STATUSES = {
  pending: ["confirmed", "cancelled", "unavailable"],
  confirmed: ["shipped", "delivered", "cancelled", "unavailable"],
  shipped: ["ready_for_collection", "cancelled"],
  ready_for_collection: ["collected", "cancelled"],
  collected: [],
  delivered: [],
  cancelled: [],
  expired: [],
  unavailable: ["cancelled"],
};

function isCodOrder(order) {
  return ["", "cod", "cash_on_delivery", "cash on delivery"].includes(String(order.paymentMethod || "").trim().toLowerCase());
}

const STATUS_CONFIG = {
  pending:   { label: "Awaiting availability",   icon: Clock,        color: "text-mall-accent",   bg: "bg-mall-accent/10"  },
  confirmed: { label: "Availability confirmed", icon: CheckCircle,  color: "text-blue-400",    bg: "bg-blue-400/10"   },
  shipped:   { label: "Shipped",   icon: Truck,        color: "text-purple-400",  bg: "bg-purple-400/10" },
  ready_for_collection: { label: "Ready for collection", icon: Package, color: "text-amber-300", bg: "bg-amber-300/10" },
  collected: { label: "Collected", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  delivered: { label: "Delivered", icon: CheckCircle,  color: "text-emerald-400", bg: "bg-emerald-400/10"},
  cancelled: { label: "Cancelled", icon: XCircle,      color: "text-red-400",     bg: "bg-red-400/10"    },
  expired: { label: "Expired", icon: Clock, color: "text-amber-200", bg: "bg-amber-300/10" },
  unavailable: { label: "Availability issue", icon: XCircle, color: "text-red-300", bg: "bg-red-300/10" },
};

export default function AdminOrders() {
  const [searchParams] = useSearchParams();
  const unavailableDialogRef = useRef(null);
  const ordersHeadingRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [updating, setUpdating] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [unavailableDialog, setUnavailableDialog] = useState(null);
  const [unavailableReason, setUnavailableReason] = useState("");
  const [unavailableItems, setUnavailableItems] = useState([]);
  const [returnDecision, setReturnDecision] = useState(null);
  const [parcelStatusDialog, setParcelStatusDialog] = useState(null);
  const [deliveryCompletionDialog, setDeliveryCompletionDialog] = useState(null);
  const [deliveryIssueDecision, setDeliveryIssueDecision] = useState(null);
  const [cancellationDialog, setCancellationDialog] = useState(null);
  const [availabilityResolutionDialog, setAvailabilityResolutionDialog] = useState(null);
  const [orderCorrectionDialog, setOrderCorrectionDialog] = useState(null);
  const [unmatchedPayments, setUnmatchedPayments] = useState([]);
  const [unmatchedPaymentsError, setUnmatchedPaymentsError] = useState("");

  function closeUnavailableDialog() {
    if (updating === unavailableDialog?.id) return;
    if ((unavailableItems.length > 0 || unavailableReason.trim()) && !window.confirm("Discard the unavailable items and reason you selected?")) return;
    setUnavailableDialog(null);
    setActionError("");
  }

  useModalAccessibility(
    unavailableDialogRef,
    closeUnavailableDialog,
    Boolean(unavailableDialog && updating === unavailableDialog.id),
    Boolean(unavailableDialog),
  );

  function load() {
    setLoading(true);
    setLoadError("");
    if (reviewMode) {
      setUnmatchedPaymentsError("");
      api.get("/payments/unmatched").then((res) => setUnmatchedPayments(res.data || [])).catch(() => {
        setUnmatchedPayments([]);
        setUnmatchedPaymentsError("Unmatched payments could not be loaded. Retry before treating this queue as clear.");
      });
    } else {
      setUnmatchedPayments([]);
      setUnmatchedPaymentsError("");
    }
    api.get(reviewMode ? "/orders/review" : "/orders", { params: { status: reviewMode ? undefined : filterStatus || undefined, search: search || undefined, page, limit: 20 } })
      .then((res) => {
        setOrders(res.data.orders);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch(() => setLoadError("Orders could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filterStatus, reviewMode, search, page, loadAttempt]);

  // Reflects status changes made from another admin session in real time,
  // so this list doesn't go stale without a manual refresh.
  useEffect(() => {
    const socket = connectRealtime();
    const refreshOrders = () => {
      if (!document.hidden) setLoadAttempt((attempt) => attempt + 1);
    };
    let hasConnectedOnce = socket.everConnected;
    socket.on("connect", () => {
      if (hasConnectedOnce) refreshOrders();
      else hasConnectedOnce = true;
    });
    socket.on("new-order", refreshOrders);
    socket.on("order-status-updated", ({ id, status, paymentStatus }) => {
      setOrders((prev) => prev.map((order) => {
        if (order._id === id) return { ...order, status, ...(paymentStatus ? { paymentStatus } : {}) };
        if (String(order.replacementOrder?._id || order.replacementOrder || "") === String(id)) {
          return { ...order, replacementOrder: { ...order.replacementOrder, status, ...(paymentStatus ? { paymentStatus } : {}) } };
        }
        return order;
      }));
      refreshOrders();
    });
    socket.on("order-details-updated", refreshOrders);
    socket.on("order-resolution-updated", ({ id, availabilityIssue, replacementOrder }) => {
      setOrders((prev) => prev.map((order) => order._id === id ? { ...order, availabilityIssue, ...(replacementOrder ? { replacementOrder } : {}) } : order));
      refreshOrders();
    });
    socket.on("order-cancellation-updated", refreshOrders);
    socket.on("order-return-updated", refreshOrders);
    socket.on("order-delivery-issue-updated", refreshOrders);
    socket.on("store-balance-updated", refreshOrders);
    const onVisibilityChange = () => {
      if (!document.hidden) refreshOrders();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => {
      if (!socket.connected && !document.hidden) refreshOrders();
    }, 15000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket.disconnect();
    };
  }, []);

  async function reconcileUnmatchedPayment(payment) {
    setActionError("");
    setOrderCorrectionDialog({ order: payment.order || { _id: payment.metadataOrderId || payment._id }, payment, mode: "reconcile" });
  }

  async function creditMismatchToStoreBalance(payment) {
    setActionError("");
    setOrderCorrectionDialog({ order: payment.order || { _id: payment.metadataOrderId || payment._id }, payment, mode: "credit_balance" });
  }

  async function updateStatus(id, status) {
    let cancellationReason;
    if (["collected", "delivered"].includes(status)) {
      const order = orders.find((item) => item._id === id);
      if (!order) return;
      setActionError("");
      setDeliveryCompletionDialog({ order, status });
      return;
    }
    if (["shipped", "ready_for_collection"].includes(status)) {
      const order = orders.find((item) => item._id === id);
      if (!order) return;
      setActionError("");
      setParcelStatusDialog({ order, status });
      return;
    }
    if (status === "cancelled") {
      const order = orders.find((item) => item._id === id);
      if (!order) return;
      setActionError("");
      setCancellationDialog({ order, mode: "status" });
      return;
    }
    if (status === "unavailable") {
      setUnavailableItems([]);
      setUnavailableReason("");
      setActionError("");
      setUnavailableDialog({ id, items: orders.find((order) => order._id === id)?.items || [] });
      return;
    }
    setUpdating(id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${id}/status`, { status, cancellationReason });
      setOrders((prev) => prev.map((o) => o._id === id ? res.data : o));
    } catch (err) {
      setActionError(err.response?.data?.message || (err.response
        ? `The server returned HTTP ${err.response.status} without an error message. Refresh the orders list and try again.`
        : `Could not reach the backend (${err.message || "network error"}). Check that the backend is running, then try again.`));
    } finally {
      setUpdating(null);
    }
  }

  async function submitParcelStatus(payload) {
    const order = parcelStatusDialog?.order;
    if (!order) return;
    setUpdating(order._id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${order._id}/status`, payload);
      setOrders((prev) => prev.map((item) => item._id === order._id ? res.data : item));
      setParcelStatusDialog(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || `Could not update order #${order._id.slice(-6).toUpperCase()}.`);
    } finally { setUpdating(null); }
  }

  async function submitDeliveryCompletion(payload) {
    const order = deliveryCompletionDialog?.order;
    if (!order) return;
    setUpdating(order._id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${order._id}/status`, payload);
      setOrders((prev) => prev.map((item) => item._id === order._id ? res.data : item));
      setDeliveryCompletionDialog(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || `Could not confirm handover for order #${order._id.slice(-6).toUpperCase()}.`);
    } finally { setUpdating(null); }
  }

  async function retryStoreBalanceCredit(order) {
    setUpdating(order._id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${order._id}/status`, { status: order.status });
      setOrders((prev) => prev.map((item) => item._id === order._id ? res.data : item));
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not complete the Store Balance credit. Refresh and retry.");
    } finally {
      setUpdating(null);
    }
  }

  async function submitUnavailableStatus() {
    if (!unavailableDialog) return;
    if (!unavailableItems.length) { setActionError("Select at least one unavailable item."); return; }
    if (!unavailableReason.trim()) { setActionError("Enter why Azard Stores cannot supply these items."); return; }
    const { id } = unavailableDialog;
    setUpdating(id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${id}/status`, {
        status: "unavailable",
        unavailableItemIndexes: unavailableItems,
        unavailabilityReason: unavailableReason.trim(),
      });
      setOrders((prev) => prev.map((order) => order._id === id ? res.data : order));
      setUnavailableDialog(null);
    } catch (err) {
      setActionError(err.response?.data?.message || (err.response
        ? `The server returned HTTP ${err.response.status} without an error message. Refresh the orders list and try again.`
        : `Could not reach the backend (${err.message || "network error"}). Check that the backend is running, then try again.`));
    } finally {
      setUpdating(null);
    }
  }

  async function resolveAvailabilityIssue(order) {
    setActionError("");
    setAvailabilityResolutionDialog(order);
  }

  async function submitAvailabilityResolution(payload) {
    const order = availabilityResolutionDialog;
    if (!order) return;
    setUpdating(order._id);
    setActionError("");
    try {
      const response = await api.put(`/orders/${order._id}/availability-resolution`, payload);
      setOrders((prev) => prev.map((item) => item._id === order._id ? response.data : item));
      setAvailabilityResolutionDialog(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || "Could not record the availability resolution.");
    } finally {
      setUpdating(null);
    }
  }

  async function markPaid(id) {
    setUpdating(id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${id}/payment-status`, { paymentStatus: "paid" });
      setOrders((prev) => prev.map((o) => o._id === id ? res.data : o));
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not update the payment status. Try again.");
    } finally {
      setUpdating(null);
    }
  }

  async function correctGuestContact(order) {
    setActionError("");
    setOrderCorrectionDialog({ order, mode: "customer" });
  }

  async function correctDestination(order) {
    setActionError("");
    setOrderCorrectionDialog({ order, mode: "destination" });
  }

  async function refundAdditionalPayment(order, payment) {
    setActionError("");
    setOrderCorrectionDialog({ order, payment, mode: "refund" });
  }

  async function submitOrderCorrection(payload) {
    const dialog = orderCorrectionDialog;
    if (!dialog) return;
    setUpdating(dialog.order._id);
    setActionError("");
    try {
      const res = dialog.mode === "reconcile"
        ? await api.put(`/payments/unmatched/${dialog.payment._id}/reconcile`, payload)
        : dialog.mode === "credit_balance"
          ? await api.put(`/payments/unmatched/${dialog.payment._id}/store-balance`, payload)
        : dialog.mode === "customer"
        ? await api.put(`/orders/${dialog.order._id}/customer-details`, payload)
        : dialog.mode === "destination"
          ? await api.put(`/orders/${dialog.order._id}/destination`, payload)
          : await api.put(`/orders/${dialog.order._id}/additional-payment-refunds/${encodeURIComponent(dialog.payment.reference)}`, payload);
      if (["reconcile", "credit_balance"].includes(dialog.mode)) {
        setOrders((prev) => prev.map((o) => o._id === res.data.order?._id ? res.data.order : o));
        setLoadAttempt((attempt) => attempt + 1);
      } else {
        setOrders((prev) => prev.map((o) => o._id === dialog.order._id ? res.data : o));
      }
      if (reviewMode) load();
      setOrderCorrectionDialog(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || "Could not save this order update.");
    } finally { setUpdating(null); }
  }

  async function decideCancellationRequest(order, request, status) {
    setActionError("");
    setCancellationDialog({ order, request, mode: "request", decision: status });
  }

  async function submitCancellationDecision(note) {
    const dialog = cancellationDialog;
    if (!dialog) return;
    setUpdating(dialog.order._id);
    setActionError("");
    try {
      const res = dialog.mode === "request"
        ? await api.put(`/orders/${dialog.order._id}/cancellation-requests/${dialog.request._id}`, { status: dialog.decision, decisionNote: note })
        : await api.put(`/orders/${dialog.order._id}/status`, { status: "cancelled", cancellationReason: note });
      setOrders((prev) => prev.map((item) => item._id === dialog.order._id ? res.data : item));
      if (reviewMode) load();
      setCancellationDialog(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || "Could not update the cancellation decision.");
    } finally { setUpdating(null); }
  }

  async function updateReturnRequest(order, request, status, decisionNote, inspectionLines) {
    setUpdating(order._id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${order._id}/returns/${request._id}`, { status, decisionNote, ...(inspectionLines ? { inspectionLines } : {}) });
      setOrders((prev) => prev.map((o) => o._id === order._id ? res.data : o));
      setReturnDecision(null);
    } catch (err) {
      throw new Error(err.response?.data?.message || "Could not update the return request.");
    } finally { setUpdating(null); }
  }

  async function retryReturnBalanceCredit(order, request) {
    setUpdating(order._id);
    setActionError("");
    try {
      const res = await api.put(`/orders/${order._id}/returns/${request._id}`, {
        status: "completed",
        decisionNote: request.decisionNote,
      });
      setOrders((prev) => prev.map((item) => item._id === order._id ? res.data : item));
      if (reviewMode) load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not recover this Store Balance credit.");
    } finally { setUpdating(null); }
  }

  async function updateDeliveryIssue(order, issue, status, response) {
    setUpdating(order._id);
    setActionError("");
    try {
      const result = await api.put(`/orders/${order._id}/delivery-issues/${issue._id}`, { status, response: response.trim() });
      setOrders((prev) => prev.map((item) => item._id === order._id ? result.data : item));
      if (reviewMode) load();
      return result.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || "Could not update the delivery issue.");
    } finally { setUpdating(null); }
  }

  function setStatusFilter(status) {
    setReviewMode(false);
    setFilterStatus(status);
    setPage(1);
  }

  const filtered = orders;

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 pb-4 border-b border-cream/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 ref={ordersHeadingRef} tabIndex={-1} className="font-display text-2xl text-cream focus:outline focus:outline-2 focus:outline-offset-4 focus:outline-mall-accent rounded-sm">Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={() => downloadCsv(api, "/orders/export", "orders-export.csv")}
            className="flex min-h-11 items-center gap-1.5 border border-cream/15 text-cream/70 font-semibold text-xs px-4 py-2.5 rounded-xl hover:text-cream hover:border-cream/30 transition sm:min-h-0">
            <Download size={13} /> Export CSV
          </button>
          <button
            onClick={() => { setReviewMode((value) => !value); setFilterStatus(""); setPage(1); }}
            aria-pressed={reviewMode}
            className={`flex min-h-11 items-center gap-1.5 border font-semibold text-xs px-4 py-2.5 rounded-xl transition sm:min-h-0 ${reviewMode ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-cream/15 text-cream/70 hover:text-cream hover:border-cream/30"}`}
          >
            Review queue
          </button>
          <p className="w-full font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest sm:w-auto">{reviewMode ? `${total} need review` : `${total} total`}</p>
        </div>
      </div>

      {actionError && <p role="alert" className="bg-red-400/10 border border-red-400/20 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">{actionError}</p>}

      {reviewMode && unmatchedPaymentsError && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200"><span>{unmatchedPaymentsError}</span><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="rounded-lg border border-red-300/25 px-3 py-2 text-xs hover:bg-red-300/10">Retry</button></div>}

      {reviewMode && unmatchedPayments.length > 0 && <section className="mb-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-amber-100">Payments needing review</h2>
          <p className="mt-1 text-xs text-cream/50">Verify the customer, order, currency, and exact balance before linking a payment.</p>
        </div>
        <div className="space-y-2">{unmatchedPayments.map((payment) => <article key={payment._id} className="rounded-lg bg-mall-900/40 p-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-cream/85">KSh {(Number(payment.amountSubunit) / 100).toLocaleString()} · {payment.currency} · {payment.status === "refund_pending" ? "Extra payment needs refund review" : "Unmatched payment"}</p>
              {payment.issueReason && <p className="mt-1 text-amber-100">{payment.issueReason}</p>}
              <p className="mt-1 text-cream/55">Verified customer email: {payment.customerEmail || "Unavailable; cannot safely link automatically"}</p>
              <p className="mt-1 break-all text-cream/40">Paystack reference: {payment.reference}</p>
              <p className="mt-1 text-cream/35">Received {new Date(payment.createdAt).toLocaleString("en-KE")}{payment.gatewayResponse ? ` · ${payment.gatewayResponse}` : ""}</p>
              {payment.order && <p className="mt-1 text-amber-100">Potential order match: #{String(payment.order._id).slice(-6).toUpperCase()}. It remains unpaid until the mismatch is resolved.</p>}
            </div>
            {payment.status === "open" && payment.issueReason && payment.order && payment.currency === "KES" && payment.domain === "live" && <button onClick={() => creditMismatchToStoreBalance(payment)} disabled={updating === payment._id || !payment.customerEmail} title={!payment.customerEmail ? "This payment has no verified customer email; confirm identity before crediting." : undefined} className="shrink-0 rounded-lg border border-amber-200/20 px-3 py-2 text-amber-100 disabled:opacity-50">{updating === payment._id ? "Crediting..." : "Credit Store Balance"}</button>}
            {payment.status === "open" && !payment.issueReason && <button onClick={() => reconcileUnmatchedPayment(payment)} disabled={updating === payment._id || !payment.customerEmail} title={!payment.customerEmail ? "This payment has no verified customer email; contact support before linking it." : undefined} className="shrink-0 rounded-lg border border-amber-200/20 px-3 py-2 text-amber-100 disabled:opacity-50">{updating === payment._id ? "Linking..." : "Match to order"}</button>}
          </div>
        </article>)}</div>
      </section>}

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by customer name..."
          className="min-h-11 w-full sm:min-h-0 sm:w-72 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setStatusFilter("")}
          className={`min-h-11 shrink-0 font-mono-tag text-[9px] uppercase px-3 py-1.5 rounded-full border transition sm:min-h-0 ${
            !filterStatus ? "bg-mall-accent text-mall-900 border-mall-accent" : "border-cream/15 text-cream/50 hover:text-cream"
          }`}
        >
          All
        </button>
        {STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`min-h-11 shrink-0 font-mono-tag text-[9px] uppercase px-3 py-1.5 rounded-full border transition sm:min-h-0 ${
                filterStatus === s ? `${cfg.bg} ${cfg.color} border-current` : "border-cream/15 text-cream/50 hover:text-cream"
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div role="status" aria-label="Loading orders" className="flex items-center justify-center gap-3 py-16 text-sm text-cream/45">
          <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-mall-accent/30 border-t-mall-accent" />
          Loading orders…
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <ShoppingBag size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">{reviewMode ? "No flagged orders found." : "No orders found."}</p>
        </div>
      ) : (
        <div className="divide-y divide-cream/8">
          {filtered.map((order) => {
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isOpen = expanded === order._id;
            const isCod = isCodOrder(order);
            const customerName = order.user?.name || order.guestInfo?.name || "Guest";
            const customerEmail = order.user?.email || order.guestInfo?.email || "";
            const customerPhone = order.user?.phone || order.guestInfo?.phone || "";
            const invalidCustomerDetails = !/\p{L}/u.test(customerName) || !customerEmail || Boolean(customerPhone && !/^(?:254|0)?[17]\d{8}$/.test(customerPhone.replace(/\D/g, "")));
            const nextStatuses = (NEXT_STATUSES[order.status] || []).filter((status) => {
              if (order.cancellationRequests?.some((request) => request.status === "pending")) return false;
              if (isCod && ["shipped", "ready_for_collection"].includes(status)) return false;
              if (["shipped", "ready_for_collection", "collected"].includes(status) && order.deliveryArea !== "other") return false;
              if (status === "delivered" && order.deliveryArea === "other") return false;
              if (isCod && status === "delivered" && order.deliveryArea !== "nairobi-cbd") return false;
              if (!isCod && ["shipped", "ready_for_collection", "collected", "delivered"].includes(status) && order.paymentStatus !== "paid") return false;
              return STATUSES.includes(status);
            });
            const availableStatuses = [order.status, ...nextStatuses];
            const inconsistentCodParcel = isCod && ["shipped", "ready_for_collection", "collected"].includes(order.status);
            const inconsistentUnpaidFulfillment = !isCod && order.paymentStatus !== "paid" && ["shipped", "ready_for_collection", "collected", "delivered"].includes(order.status);
            const linkedReplacement = order.replacementOrder && typeof order.replacementOrder === "object" ? order.replacementOrder : null;

            return (
              <div key={order._id} className="py-5">
                {/* Order header row */}
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => setExpanded(isOpen ? null : order._id)}
                    className="flex-1 flex items-start justify-between gap-3 text-left min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest">
                          #{order._id.slice(-6).toUpperCase()}
                        </span>
                        <span className={`inline-flex items-center gap-1 font-mono-tag text-[9px] uppercase px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon size={9} /> {cfg.label}
                        </span>
                        <span className="font-mono-tag text-[9px] uppercase text-cream/25">{order.channel}</span>
                        <span className={`font-mono-tag text-[9px] uppercase px-2 py-0.5 rounded-full ${
                          order.paymentStatus === "paid" ? "bg-emerald-500/10 text-emerald-400"
                          : order.paymentStatus === "failed" ? "bg-red-500/10 text-red-400"
                          : "bg-cream/5 text-cream/40"
                        }`}>
                          {order.paymentMethod === "mpesa" ? "M-Pesa" : order.paymentMethod === "paystack" ? "Card" : order.paymentMethod === "store_balance" ? "Store balance" : "COD"} · {order.paymentStatus}
                        </span>
                      </div>
                      <p className="text-cream text-sm font-medium">
                        {customerName}
                      </p>
                      <p className="text-cream/40 text-xs">
                        Email: {customerEmail || "Not provided"}
                        {" · "}{new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {customerPhone && <p className="text-cream/35 text-xs">Phone: {customerPhone}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display text-lg text-cream">KSh {order.totalAmount?.toLocaleString()}</p>
                      {Number(order.storeBalanceApplied) > 0 && <p className="text-mall-accent text-[10px]">KSh {Number(order.storeBalanceApplied).toLocaleString()} store balance used</p>}
                      {order.storeBalanceCreditedAt && <p className="text-emerald-300 text-[10px]">KSh {storeBalanceCreditAmount(order).toLocaleString()} returned to store balance</p>}
                      {order.storeBalanceClaimStatus === "pending" && <p className="text-amber-200 text-[10px]">Guest balance awaiting verified account claim</p>}
                      {order.storeBalanceClaimStatus === "claimed" && <p className="text-emerald-200 text-[10px]">Guest balance claim complete</p>}
                      <p className="text-cream/30 text-xs">{order.items?.length} item{order.items?.length !== 1 ? "s" : ""}</p>
                      <ChevronRight size={13} className={`text-cream/20 ml-auto mt-1 transition ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                  </button>

                  {/* Status update dropdown */}
                  <select
                    value={order.status}
                    disabled={updating === order._id}
                    onChange={(e) => updateStatus(order._id, e.target.value)}
                    className="min-h-11 shrink-0 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs outline-none focus:border-mall-accent transition disabled:opacity-50 sm:min-h-0"
                  >
                    {availableStatuses.map((s) => <option key={s} value={s}>{s === "delivered" && isCod ? "Delivered · record cash received" : STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>

                {inconsistentCodParcel && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">Review required: COD is for direct Nairobi CBD delivery, but this order has a parcel status. Only cancellation is available until this record is corrected.</p>}
                {inconsistentUnpaidFulfillment && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">Review required: this online order is unpaid but has advanced into fulfillment. Do not dispatch or complete it until the payment is confirmed.</p>}
                {invalidCustomerDetails && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">Customer details need review: check the name, email, and Kenyan mobile number before contacting or dispatching.</p>}
                {order.status === "expired" && order.paymentStatus === "paid" && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">{order.storeBalanceCreditedAt ? "Payment arrived after expiry and its value is in Store Balance. Do not dispatch." : "Payment arrived after expiry, but its Store Balance credit is still outstanding. Do not dispatch."}</p>}
                {order.status === "cancelled" && order.paymentStatus === "paid" && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">{order.storeBalanceCreditedAt ? "This paid order was cancelled. Its value is in Store Balance; cash refunds are not offered." : "This paid order was cancelled, but its Store Balance credit is still outstanding."}</p>}
                {order.status === "unavailable" && <p role="alert" className="mt-3 rounded-lg border border-red-300/20 bg-red-300/5 px-3 py-2 text-xs text-red-100">{["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(order.availabilityIssue?.resolutionStatus) ? `This order remains unavailable and must not be paid or dispatched.${linkedReplacement ? ` Continue with linked order #${linkedReplacement._id.slice(-6).toUpperCase()} (${linkedReplacement.status?.replace(/_/g, " ")}).` : ""}` : order.paymentStatus === "paid" && order.storeBalanceCreditedAt ? "The paid amount is in Store Balance. Do not dispatch this order." : order.paymentStatus === "paid" ? "The order is paid, but its Store Balance credit is not recorded. Resolve this in the Review queue before proceeding. Do not dispatch." : "Availability issue: do not collect payment or dispatch. Contact the customer to resolve their preference."}</p>}
                {order.adminReviewFlags?.length > 0 && <div role="status" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-100"><p className="font-semibold mb-1">Review findings</p><ul className="list-disc pl-4 space-y-0.5">{order.adminReviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul></div>}
                {["cancelled", "expired", "unavailable"].includes(order.status) && order.paymentStatus === "paid" && !order.storeBalanceCreditedAt && <button type="button" onClick={() => retryStoreBalanceCredit(order)} disabled={updating === order._id} className="mt-3 rounded-lg border border-amber-300/25 px-3 py-2 text-xs text-amber-100 disabled:opacity-50">{updating === order._id ? "Crediting..." : "Retry Store Balance credit"}</button>}

                {/* Expanded order details */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-cream/8 space-y-3">
                    {order.availabilityIssue?.itemIndexes?.length > 0 && <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs space-y-2"><div className="space-y-1"><p className="font-semibold text-amber-100">Unavailable items</p><p className="text-cream/65">{order.availabilityIssue.itemIndexes.map((index) => order.items?.[index]?.name || `Item ${index + 1}`).join(", ")}</p>{order.availabilityIssue.reason && <p className="text-cream/45">Reason: {order.availabilityIssue.reason}</p>}<p className="text-cream/65">Customer preference: {order.availabilityIssue.customerChoice === "replacement" ? "Replacement requested" : ["store_credit", "store_balance"].includes(order.availabilityIssue.customerChoice) ? "Store balance requested" : "No preference submitted yet"}</p></div>{["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(order.availabilityIssue.resolutionStatus) ? <div className="border-t border-cream/10 pt-2"><p className="font-semibold text-emerald-200">{order.availabilityIssue.resolutionStatus === "replacement_arranged" ? "Replacement arrangement recorded" : order.availabilityIssue.resolutionStatus === "store_balance_issued" || order.storeBalanceCreditedAt ? "Store Balance issued" : "Store Balance arrangement recorded · verify credit in Billing"}</p><p className="text-cream/55 mt-1">{order.availabilityIssue.resolutionMessage}</p><p className="text-cream/35 mt-1">This order remains unavailable. {order.availabilityIssue.resolutionStatus === "store_balance_issued" || order.storeBalanceCreditedAt ? "The paid amount is recorded in Store Balance; unpaid orders do not receive a balance." : order.availabilityIssue.resolutionStatus === "store_credit_arranged" ? "This records a customer agreement only; it does not confirm a Store Balance transaction." : "Check the order's payment and Store Balance record before proceeding."}</p>{order.availabilityIssue.resolutionStatus === "replacement_arranged" && (linkedReplacement && !["cancelled", "expired", "unavailable"].includes(linkedReplacement.status) ? <p className="mt-2 text-emerald-100">Latest replacement order #{linkedReplacement._id.slice(-6).toUpperCase()} · {linkedReplacement.status?.replace(/_/g, " ")} · KSh {Number(linkedReplacement.totalAmount).toLocaleString()}</p> : linkedReplacement?.status === "unavailable" && linkedReplacement._id !== order._id ? <p className="mt-2 text-amber-100">Resolve latest replacement order #{linkedReplacement._id.slice(-6).toUpperCase()} with the customer before creating another. Open that order from the Orders list.</p> : <AdminReplacementOrderForm key={`${order._id}-${linkedReplacement?._id || "new"}`} order={order} onCreated={(updated) => setOrders((prev) => prev.map((item) => item._id === order._id ? updated : item))} />)}</div> : <div><p className="text-cream/35">Contact the customer and agree on the next step. Paid orders add the paid amount to store balance; unpaid orders do not receive a balance.</p><button type="button" disabled={updating === order._id} onClick={() => resolveAvailabilityIssue(order)} className="mt-2 rounded-lg bg-mall-accent px-3 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50">{updating === order._id ? "Saving..." : "Record agreed resolution"}</button></div>}</div>}
                    {["unpaid", "failed"].includes(order.paymentStatus) && !["cancelled", "expired", "unavailable"].includes(order.status) && isCod && ["collected", "delivered"].includes(order.status) && (
                      <button
                        onClick={() => markPaid(order._id)}
                        disabled={updating === order._id}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
                      >
                        Mark as Paid
                      </button>
                    )}
                    {order.paymentReference && (
                      <p className="text-cream/30 text-[11px]">Payment ref: {order.paymentReference}</p>
                    )}
                    {order.replacementFor && <p className="text-cream/45 text-xs">Replacement for order #{String(order.replacementFor._id || order.replacementFor).slice(-6).toUpperCase()} · price difference {Number(order.replacementPriceDifference) > 0 ? "+" : ""}KSh {Number(order.replacementPriceDifference || 0).toLocaleString()}</p>}
                    {order.availabilityConfirmedAt && <p className="text-cream/45 text-xs">Availability confirmed: {new Date(order.availabilityConfirmedAt).toLocaleString("en-KE")}{order.stockReservedUntil ? ` · reserved until ${new Date(order.stockReservedUntil).toLocaleString("en-KE")}` : " · COD reservation remains active until fulfilment"}</p>}
                    {order.paymentAttempts?.map((attempt, index) => <p key={`${attempt.reference}-${index}`} className="text-cream/30 text-[11px]">{attempt.provider} attempt · {attempt.status} · {attempt.reference}</p>)}
                    {order.additionalPaymentRefunds?.map((payment) => <div key={payment.reference} className="rounded-lg bg-amber-300/5 p-2 text-xs"><p className="text-amber-200">Additional payment: {payment.status} · KSh {Number(payment.amount).toLocaleString()}</p><p className="text-cream/35">Payment ref: {payment.reference}</p>{payment.status === "refund_pending" && <button onClick={() => refundAdditionalPayment(order, payment)} disabled={updating === order._id} className="mt-1 text-amber-200">Record additional payment refund</button>}{payment.refundReference && <p className="text-cream/35">Refund ref: {payment.refundReference}</p>}</div>)}
                    {order.parcelReference && <p className="text-cream/45 text-xs">Parcel reference: {order.parcelReference}{order.collectionBranch ? ` · ${order.collectionBranch}` : ""}</p>}
                    {order.deliveryRoute?.serviceType === "parcel" && order.deliveryRoute?.carrier && <p className="text-cream/45 text-xs">Selected parcel route: {order.deliveryRoute.carrier} · {order.deliveryRoute.officeName}{order.deliveryRoute.officeAddress ? ` · ${order.deliveryRoute.officeAddress}` : ""}</p>}
                    {order.deliveryRoute?.serviceType === "direct" && <p className="text-cream/45 text-xs">Direct delivery address: {order.deliveryAddress}</p>}
                    {order.deliveryConfirmation?.confirmedAt && <p className="text-cream/45 text-xs">Handover recorded: {new Date(order.deliveryConfirmation.confirmedAt).toLocaleString("en-KE")} · {order.deliveryConfirmation.recipientName}{Number(order.deliveryConfirmation.paymentCollectedAmount) > 0 ? ` · COD cash KSh ${Number(order.deliveryConfirmation.paymentCollectedAmount).toLocaleString()}` : ""}{order.deliveryConfirmation.note ? ` · ${order.deliveryConfirmation.note}` : ""}</p>}
                    {order.cancellationReason && <p className="text-red-300/70 text-xs">Cancellation: {order.cancellationReason}</p>}
                    <p className="text-xs text-cream/45">Inventory: {order.stockRestoredAt
                      ? `reservation released ${new Date(order.stockRestoredAt).toLocaleString("en-KE")}`
                      : order.stockReservationCommittedAt
                        || ["shipped", "ready_for_collection", "collected", "delivered"].includes(order.status)
                        || order.events?.some((event) => ["status_shipped", "status_ready_for_collection", "status_collected", "status_delivered"].includes(event.type))
                        ? "committed to fulfillment; only restock received and inspected returns"
                        : order.stockReservedAt
                          ? "reserved for this order"
                          : order.stockNeedsReservation
                            ? "not reserved yet · awaiting availability confirmation"
                            : "no active reservation record"}</p>
                    {order.events?.length > 0 && <div className="border-l border-cream/15 pl-3 space-y-2">{[...order.events].reverse().map((event, index) => <div key={`${event.type}-${index}`}><p className="text-xs text-cream/70 capitalize">{orderEventLabel(event)}</p>{orderEventNote(event) && <p className="text-[11px] text-cream/40">{orderEventNote(event)}</p>}<p className="text-[10px] text-cream/25">{new Date(event.createdAt).toLocaleString("en-KE")}</p></div>)}</div>}
                    {order.cancellationRequests?.map((request) => (
                      <div key={request._id} className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs space-y-2">
                        <p className="font-semibold text-amber-100">Customer cancellation request · {request.status}</p>
                        <p className="text-cream/60">Reason: {request.reason}</p>
                        {request.decisionNote && <p className="text-cream/45">Decision note: {request.decisionNote}</p>}
                        {request.status === "pending" && <div className="flex flex-wrap gap-3"><button disabled={updating === order._id} onClick={() => decideCancellationRequest(order, request, "approved")} className="text-emerald-300 disabled:opacity-50">Approve & credit Store Balance</button><button disabled={updating === order._id} onClick={() => decideCancellationRequest(order, request, "rejected")} className="text-red-300 disabled:opacity-50">Decline request</button></div>}
                      </div>
                    ))}
                    {order.deliveryIssueRequests?.map((issue) => (
                      <div key={issue._id} className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs space-y-2">
                        <p className="font-semibold text-amber-100">Delivery problem · {issue.status === "investigating" ? "Being checked" : issue.status === "resolved" ? "Resolved" : "Needs review"}</p>
                        <p className="text-cream/65">Customer report: {issue.reason}</p>
                        {issue.response && <p className="text-cream/45">Azard update: {issue.response}</p>}
                        {issue.status !== "resolved" && <div className="flex flex-wrap gap-3"><button disabled={updating === order._id} onClick={() => setDeliveryIssueDecision({ order, issue, status: "investigating" })} className="text-amber-200 disabled:opacity-50">Send customer update</button><button disabled={updating === order._id} onClick={() => setDeliveryIssueDecision({ order, issue, status: "resolved" })} className="text-emerald-300 disabled:opacity-50">Record resolution</button></div>}
                      </div>
                    ))}
                    {order.returnRequests?.map((request) => (
                      <div key={request._id} className="rounded-xl bg-mall-800 p-3 text-xs space-y-2">
                        <p className="text-cream">{request.type} request · {request.status}</p>
                        <p className="text-cream/50">Items: {getReturnRequestLines(request, order).map((line) => `${line.name} × ${line.quantity}`).join(", ")}</p>
                        <p className="text-cream/50">{request.reason}</p>
                        <p className="text-cream/35">Unused, original packaging confirmed by customer</p>
                        {request.decisionNote && <p className="text-cream/45">Latest update: {request.decisionNote}</p>}
                        {request.inspectionLines?.length > 0 && <div className="rounded-lg bg-cream/5 p-2 text-cream/55"><p className="font-medium text-cream/70">Inspection disposition</p>{request.inspectionLines.map((line) => <p key={line.itemIndex}>{order.items?.[line.itemIndex]?.name || `Item ${line.itemIndex + 1}`}: {line.restockedQuantity} sellable, {line.damagedQuantity} damaged, {line.discardedQuantity} discarded{line.restockedQuantity > 0 && !request.inventoryProcessedAt ? " · stock update pending" : ""}</p>)}{request.inventoryProcessedAt && <p className="mt-1 text-emerald-200">Inventory history updated</p>}</div>}
                        {!request.storeBalanceIssuedAt && ["pending", "approved"].includes(request.status) && Number(request.storeBalanceAmount) > 0 && <p className="text-cream/45">Estimated Store Balance after inspection: KSh {Number(request.storeBalanceAmount).toLocaleString()} for item value. Delivery charges are excluded.</p>}
                        {request.status === "completed" && ((request.inspectionLines?.length > 0 && !request.inventoryProcessedAt) || (!request.storeBalanceIssuedAt && Number(request.storeBalanceAmount) > 0)) && <div className="rounded-lg border border-amber-300/15 bg-amber-300/5 p-3"><p className="text-amber-100">{request.inspectionLines?.length > 0 && !request.inventoryProcessedAt ? "Inspection saved, but inventory processing is not confirmed." : `Completed inspection, but no Store Balance credit is recorded yet · KSh ${Number(request.storeBalanceAmount).toLocaleString()}.`}</p>{order.paymentStatus === "paid" ? <button type="button" disabled={updating === order._id} onClick={() => retryReturnBalanceCredit(order, request)} className="mt-2 rounded-lg border border-amber-200/25 px-3 py-2 text-xs text-amber-100 disabled:opacity-50">{updating === order._id ? "Retrying…" : request.inspectionLines?.length > 0 && !request.inventoryProcessedAt ? "Retry inspection processing" : "Retry Store Balance credit"}</button> : <p className="mt-2 text-amber-100/65">Payment is not confirmed, so this credit cannot be retried yet.</p>}</div>}
                        {request.storeBalanceIssuedAt && <p className="text-emerald-200">KSh {Number(request.storeBalanceAmount).toLocaleString()} added for {request.type === "exchange" ? "exchanged" : "returned"} item value{!order.user && request.storeBalanceClaimStatus === "pending" ? " · guest claim pending" : !order.user && request.storeBalanceClaimStatus === "claimed" ? " · credited to verified account" : ""}. Delivery charges excluded.</p>}
                        {request.status === "pending" && <div className="flex gap-3"><button disabled={updating === order._id} onClick={() => setReturnDecision({ order, request, status: "approved" })} className="text-emerald-300 disabled:opacity-50">Approve with handover instructions</button><button disabled={updating === order._id} onClick={() => setReturnDecision({ order, request, status: "rejected" })} className="text-red-300 disabled:opacity-50">Decline with reason</button></div>}
                        {request.status === "approved" && <button disabled={updating === order._id} onClick={() => setReturnDecision({ order, request, status: "completed" })} className="text-mall-accent disabled:opacity-50">Record received & inspected · issue Store Balance</button>}
                      </div>
                    ))}
                    {!order.user && <button onClick={() => correctGuestContact(order)} disabled={updating === order._id} className="rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/70 hover:border-cream/30 disabled:opacity-50">Correct guest contact details</button>}
                    {order.adminCorrections?.map((correction, correctionIndex) => (
                      <div key={`${correction.type}-${correctionIndex}`} className="rounded-lg bg-cream/5 p-3 text-xs">
                        <p className="text-cream/75">Admin correction · {new Date(correction.createdAt).toLocaleString("en-KE")}</p>
                        <p className="text-cream/40">{correction.reason}</p>
                        {correction.changes?.map((change, index) => <p key={`${change.field}-${index}`} className="text-cream/35">{change.field}: “{change.before || "empty"}” → “{change.after}”</p>)}
                      </div>
                    ))}
                    {order.items?.map((item, i) => (
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
                        <p className="text-cream/70 text-sm shrink-0">
                          KSh {(item.price * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {(order.deliveryAddress || order.deliveryCorrection?.address) && (
                      <div className="pt-3 border-t border-cream/8">
                        <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-1">{order.deliveryArea === "nairobi-cbd" ? "Nairobi CBD · direct delivery" : order.deliveryArea === "nairobi-direct" ? "Nairobi County · direct delivery" : "County route · parcel collection"}</p>
                        <p className="text-cream/45 text-xs mb-1">{[order.deliveryCorrection?.town || order.deliveryTown, order.deliveryCorrection?.county || order.deliveryCounty].filter(Boolean).join(", ") || "Town/county not recorded"}</p>
                        <p className="font-mono-tag text-[9px] uppercase text-cream/30 tracking-widest mb-1">Delivery Address</p>
                        <p className="text-cream/50 text-xs">{order.deliveryCorrection?.address || order.deliveryAddress || "Address not recorded"}</p>
                        {order.deliveryInstructions && <p className="text-cream/35 text-xs mt-1">Customer notes: {order.deliveryInstructions}</p>}
                        {order.deliveryCorrection?.reason && <p className="mt-1 text-[10px] text-amber-200/70">Corrected {new Date(order.deliveryCorrection.correctedAt).toLocaleString("en-KE")}: {order.deliveryCorrection.reason}</p>}
                      </div>
                    )}
                    {!(["collected", "delivered", "cancelled"].includes(order.status)) && <button onClick={() => correctDestination(order)} disabled={updating === order._id} className="rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/70 hover:border-cream/30 disabled:opacity-50">Correct delivery destination</button>}
                    <div className="ml-auto w-full max-w-xs border-t border-cream/8 pt-3 text-xs">
                      <div className="flex justify-between text-cream/40"><span>Items subtotal</span><span>KSh {order.items?.reduce((sum, item) => sum + item.price * item.quantity, 0).toLocaleString()}</span></div>
                      <div className="flex justify-between text-cream/40 mt-1"><span>Delivery</span><span>KSh {Number(order.deliveryFee || 0).toLocaleString()}</span></div>
                      <div className="flex justify-between text-cream mt-2 font-semibold"><span>Order total</span><span>KSh {Number(order.totalAmount || 0).toLocaleString()}</span></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <AdminPagination page={page} pages={pages} onChange={setPage} />
      {unavailableDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section ref={unavailableDialogRef} role="dialog" aria-modal="true" aria-labelledby="unavailable-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl">
            <p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Order availability</p>
            <h2 id="unavailable-title" className="mt-1 font-display text-xl text-cream">Mark unavailable items</h2>
            <p className="mt-2 text-xs text-cream/45">Select every item Azard cannot supply. The customer will be told not to pay or expect dispatch while you agree the next step.</p>
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
              {unavailableDialog.items.map((item, index) => (
                <label key={`${item.product || item.name}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-xl bg-mall-800 px-3 py-3 text-sm text-cream/80">
                  <input
                    type="checkbox"
                    checked={unavailableItems.includes(index)}
                    onChange={(event) => setUnavailableItems((current) => event.target.checked ? [...current, index] : current.filter((value) => value !== index))}
                    className="mt-0.5 accent-mall-accent"
                  />
                  <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}<span className="ml-2 text-xs text-cream/35">Qty {item.quantity}</span></span>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-xs text-cream/55">Why can’t Azard supply these items?
              <textarea value={unavailableReason} onChange={(event) => setUnavailableReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-y rounded-xl bg-mall-800 px-3 py-2.5 text-sm text-cream outline-none focus:ring-1 focus:ring-mall-accent" placeholder="Add the reason that will be recorded on the order" />
              <span className="mt-1 block text-[11px] text-cream/40">A reason is required; it will be saved with the order update.</span>
            </label>
            {actionError && <p role="alert" className="mt-3 text-xs text-red-300">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeUnavailableDialog} disabled={updating === unavailableDialog.id} className="rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/65 disabled:opacity-40">Keep order open</button>
              <button type="button" onClick={submitUnavailableStatus} disabled={updating === unavailableDialog.id} className="rounded-lg bg-red-400 px-4 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50">{updating === unavailableDialog.id ? "Saving…" : "Confirm unavailable"}</button>
            </div>
          </section>
        </div>
      )}
      {returnDecision && <ReturnDecisionForm order={returnDecision.order} request={returnDecision.request} status={returnDecision.status} submitting={updating === returnDecision.order._id} onClose={() => setReturnDecision(null)} onSubmit={(note, lines) => updateReturnRequest(returnDecision.order, returnDecision.request, returnDecision.status, note, lines)} />}
      {parcelStatusDialog && <ParcelStatusForm order={parcelStatusDialog.order} status={parcelStatusDialog.status} submitting={updating === parcelStatusDialog.order._id} onClose={() => setParcelStatusDialog(null)} onSubmit={submitParcelStatus} />}
      {deliveryCompletionDialog && <DeliveryCompletionForm order={deliveryCompletionDialog.order} status={deliveryCompletionDialog.status} submitting={updating === deliveryCompletionDialog.order._id} onClose={() => setDeliveryCompletionDialog(null)} onSubmit={submitDeliveryCompletion} />}
      {deliveryIssueDecision && <DeliveryIssueDecisionForm order={deliveryIssueDecision.order} issue={deliveryIssueDecision.issue} status={deliveryIssueDecision.status} submitting={updating === deliveryIssueDecision.order._id} restoreFocusRef={ordersHeadingRef} onClose={() => setDeliveryIssueDecision(null)} onSubmit={(note) => updateDeliveryIssue(deliveryIssueDecision.order, deliveryIssueDecision.issue, deliveryIssueDecision.status, note)} />}
      {cancellationDialog && <AdminCancellationForm order={cancellationDialog.order} request={cancellationDialog.request} mode={cancellationDialog.mode} decision={cancellationDialog.decision} submitting={updating === cancellationDialog.order._id} onClose={() => setCancellationDialog(null)} onSubmit={submitCancellationDecision} />}
      {availabilityResolutionDialog && <AvailabilityResolutionForm order={availabilityResolutionDialog} submitting={updating === availabilityResolutionDialog._id} restoreFocusRef={ordersHeadingRef} onClose={() => setAvailabilityResolutionDialog(null)} onSubmit={submitAvailabilityResolution} />}
      {orderCorrectionDialog && <AdminOrderCorrectionForm order={orderCorrectionDialog.order} payment={orderCorrectionDialog.payment} mode={orderCorrectionDialog.mode} submitting={updating === orderCorrectionDialog.order._id} onClose={() => setOrderCorrectionDialog(null)} onSubmit={submitOrderCorrection} />}
    </div>
  );
}
