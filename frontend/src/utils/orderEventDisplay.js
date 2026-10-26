import { getReturnRequestLines } from "./returnQuantities";

const HIDDEN_EVENT_TYPES = new Set([
  "payment_failed",
  "payment_test_confirmed",
  "payment_not_confirmed",
  "duplicate_payment",
]);

const EVENT_LABELS = {
  order_placed: "Order received",
  order_created: "Order received",
  availability_confirmed: "Availability confirmed",
  order_confirmed: "Availability confirmed",
  payment_received: "Payment confirmed",
  order_shipped: "Dispatched",
  shipped: "Dispatched",
  ready_for_collection: "Ready for collection",
  collected: "Collected",
  delivered: "Delivered",
  order_cancelled: "Cancelled",
  cancelled: "Cancelled",
  order_unavailable: "Item unavailable",
  unavailable: "Item unavailable",
  order_expired: "Payment deadline passed",
  expired: "Payment deadline passed",
  status_confirmed: "Availability confirmed",
  status_shipped: "Dispatched",
  status_ready_for_collection: "Ready for collection",
  status_collected: "Collected",
  status_delivered: "Delivered",
  status_cancelled: "Cancelled",
  status_unavailable: "Item unavailable",
  status_expired: "Payment deadline passed",
  late_payment_after_expiry: "Late payment received",
  payment_mismatch_review: "Payment under review",
  payment_mismatch_balance_issued: "Added to Store Balance",
  additional_payment_credited: "Additional payment added to Store Balance",
  store_balance_issued: "Added to Store Balance",
  return_balance_recovered: "Return value added to Store Balance",
  exchange_balance_recovered: "Exchange value added to Store Balance",
  availability_issue_resolved: "Availability issue resolved",
  availability_choice_submitted: "Your preference was sent to Azard Stores",
  cancellation_requested: "Cancellation requested",
  cancellation_request_approved: "Cancellation approved",
  cancellation_request_rejected: "Cancellation declined",
  return_requested: "Return requested",
  exchange_requested: "Exchange requested",
  payment_not_confirmed: "Payment pending confirmation",
  additional_payment_refunded: "Extra payment refunded",
  delivery_issue_reported: "Delivery problem reported",
  delivery_issue_investigating: "Delivery report under review",
  delivery_issue_resolved: "Delivery issue resolved",
};

function hasLegacyTestCopy(event) {
  return /sandbox|test payment|test mode|no real funds|simulation/i.test(`${event?.label || ""} ${event?.note || ""}`);
}

export function customerOrderEvents(events = []) {
  const visible = (Array.isArray(events) ? events : [])
    .filter((event) => event && !HIDDEN_EVENT_TYPES.has(event.type) && !hasLegacyTestCopy(event))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const seen = new Set();
  return visible.filter((event) => {
    const label = orderEventLabel(event);
    if (["Order received", "Availability confirmed", "Payment confirmed"].includes(label)) {
      if (seen.has(label)) return false;
      seen.add(label);
    }
    return true;
  });
}

export function orderEventLabel(event) {
  return EVENT_LABELS[event?.type] || event?.label || event?.type?.replace(/_/g, " ") || "Order update";
}

export function orderEventNote(event) {
  if (hasLegacyTestCopy(event)) return "";
  if (event?.type === "additional_payment_refunded") return "The extra payment refund was recorded.";
  return event?.note || "";
}

export function storeBalanceCreditAmount(order) {
  if (order?.storeBalanceCreditedAmount == null) return Number(order?.totalAmount || 0);
  const recordedAmount = Number(order?.storeBalanceCreditedAmount);
  return Number.isFinite(recordedAmount) && recordedAmount >= 0
    ? recordedAmount
    : Number(order?.totalAmount || 0);
}

export function getCustomerPaymentSummary(order) {
  const method = { mpesa: "M-Pesa", paystack: "Card", cod: "Cash on delivery", store_balance: "Store Balance" }[order?.paymentMethod] || order?.paymentMethod || "Payment";
  let status = "Due";
  if (["expired", "cancelled", "unavailable"].includes(order?.status) && order.paymentStatus === "paid" && order.storeBalanceCreditedAt) status = "Added to Store Balance";
  else if (order?.paymentStatus !== "paid" && (order?.events || []).some((event) => event.type === "payment_mismatch_balance_issued")) status = "Value in Store Balance";
  else if (order?.status === "expired" && order.paymentStatus !== "paid" && (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending")) status = "Processing after expiry";
  else if (order?.status === "expired" && order.paymentStatus !== "paid") status = "Window ended";
  else if (order?.paymentTestMode && order.paymentStatus !== "paid") status = "Needs review";
  else if ((order?.paymentAttempts || []).some((attempt) => attempt.status === "review")) status = "Payment needs review";
  else if (order?.paymentStatus === "paid") status = "Paid";
  else if (order?.paymentStatus === "refund_pending") status = "Under review";
  else if (order?.paymentStatus === "refunded") status = "Returned to Store Balance";
  else if (order?.paymentStatus === "failed") status = "Not completed";
  else if (order?.status === "pending") status = "Not due yet";
  else if ((order?.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending")) status = "Processing";
  else if (order?.paymentMethod === "cod") status = "Due at handover";
  return { method, status };
}

export function customerRequestStatus(status) {
  return { pending: "Under review", approved: "Approved", rejected: "Declined", completed: "Completed" }[status] || "Received";
}

export function getCustomerReturnMessage(request, order) {
  const itemNames = getReturnRequestLines(request, order).map((line) => `${line.name} × ${line.quantity}`).join(", ");
  const items = itemNames ? ` for ${itemNames}` : "";
  const estimatedValue = Number(request.storeBalanceAmount || 0);
  const estimateNote = estimatedValue > 0 ? ` Expected Store Balance after inspection: KSh ${estimatedValue.toLocaleString()} for item value; delivery charges are excluded.` : "";
  if (request.status === "pending") return { label: "Received · under review", body: `Azard Stores is reviewing your ${request.type}${items}.${estimateNote} Check the order updates here for the decision and next steps.` };
  if (request.status === "approved") return { label: "Approved · review next steps", body: `${request.decisionNote || "Your request was approved."} Check the order updates here for return or exchange handover instructions.${estimateNote}` };
  if (request.status === "rejected") return { label: "Declined", body: request.decisionNote || "Azard Stores declined this request. Contact us if you need help." };
  if (request.status === "completed" && request.type === "exchange" && Number(request.storeBalanceAmount) > 0) {
    const amount = Number(request.storeBalanceAmount).toLocaleString();
    if (!request.storeBalanceIssuedAt) return { label: "Inspection recorded · balance needs review", body: `The exchange item was received, but Store Balance has not been confirmed. Contact Azard Stores before placing another order. ${request.decisionNote || ""}`.trim() };
    const pendingClaim = (request.storeBalanceClaimStatus || order.storeBalanceClaimStatus) === "pending";
    const balanceMessage = pendingClaim
      ? order.user
        ? `KSh ${amount} is waiting to be added to the verified account for ${order.guestInfo?.email || order.billingSnapshot?.email || "this order"}. Open Billing to retry the claim.`
        : `KSh ${amount} is ready to claim. Sign in or create an account with ${order.guestInfo?.email || order.billingSnapshot?.email}, then verify that email address.`
        : `KSh ${amount} is in your Azard Store Balance. Use it toward a new order and pay any difference at checkout.`;
    const inspectionNote = request.decisionNote ? ` Inspection and handover update: ${request.decisionNote}` : "";
      return { label: pendingClaim ? "Exchange value · balance claim needed" : "Exchange value · Store Balance added", body: `${balanceMessage} This is Store Balance for the accepted exchange${items}; it does not create a replacement order. Delivery charges are not included.${inspectionNote}` };
  }
  if (request.status === "completed" && request.type === "return" && Number(request.storeBalanceAmount) > 0) {
    const amount = Number(request.storeBalanceAmount).toLocaleString();
    if (!request.storeBalanceIssuedAt) return { label: "Inspection recorded · balance needs review", body: `The return was recorded, but Store Balance has not been confirmed. Contact Azard Stores before using this amount toward another order. ${request.decisionNote || ""}`.trim() };
    const pendingClaim = (request.storeBalanceClaimStatus || order.storeBalanceClaimStatus) === "pending";
    const balanceMessage = pendingClaim
      ? order.user
        ? `KSh ${amount} is waiting to be added to the verified account for ${order.guestInfo?.email || order.billingSnapshot?.email || "this order"}. Open Billing to retry the claim.`
        : `KSh ${amount} is ready to claim. Sign in or create an account with ${order.guestInfo?.email || order.billingSnapshot?.email}, then verify that email address.`
      : `KSh ${amount} is in your Azard Store Balance for a future order; cash refunds are not offered.`;
    const inspectionNote = request.decisionNote ? ` Inspection and handover update: ${request.decisionNote}` : "";
    return { label: pendingClaim ? "Return completed · balance claim needed" : "Return completed · Store Balance added", body: `${balanceMessage} This covers the returned item value${items}; delivery charges are not included.${inspectionNote}` };
  }
  if (request.status === "completed" && request.type === "exchange") return { label: "Exchange completed", body: request.decisionNote || "Azard Stores recorded the exchange as completed." };
  return { label: request.status ? request.status[0].toUpperCase() + request.status.slice(1) : "Received", body: request.decisionNote || "Azard Stores will update you about this request." };
}

export function getCustomerOrderMessage(order) {
  const paymentReviewProvider = order?.paymentMethod === "mpesa" ? "M-Pesa via Paystack" : "Paystack";
  if ((order?.paymentAttempts || []).some((attempt) => attempt.status === "review")) {
    return {
      title: "Payment needs review",
      body: `We received a payment notice from ${paymentReviewProvider}, but its details don’t match this order. Your order is still unpaid and on hold while we check it. Please don’t make another payment; we’ll contact you with an update.`,
    };
  }
  if (order?.paymentStatus !== "paid" && (order?.events || []).some((event) => event.type === "payment_mismatch_balance_issued")) {
    const email = order.guestInfo?.email || order.billingSnapshot?.email;
    const claim = order.storeBalanceClaimStatus === "pending"
      ? ` Sign in or create an account using ${email || "the email used for this order"}, then verify that email address to claim the balance.`
      : " The amount is available for a future order.";
    return {
      title: "Payment value is in Store Balance",
      body: `The verified payment didn’t match this order total, so the amount has been placed in Store Balance.${claim} The order remains unpaid; you can pay the balance due if you still want to proceed.`,
    };
  }
  const extraCredits = (order?.additionalPaymentCredits || []).filter((entry) => ["credited", "claim_pending"].includes(entry.status));
  if (extraCredits.length) {
    const amount = extraCredits.reduce((sum, entry) => sum + Number(entry.amount || 0), 0).toLocaleString();
    const claimPending = extraCredits.some((entry) => entry.claimStatus === "pending" || entry.status === "claim_pending");
    const email = order.guestInfo?.email || order.billingSnapshot?.email;
    const claim = claimPending
      ? ` Sign in or create an account using ${email || "the email used for this order"}, then verify that email address to claim the balance.`
      : " The amount is available in your Store Balance for a future order.";
    return {
      title: "Additional payment added to Store Balance",
      body: `Your order payment remains confirmed. An additional verified KSh ${amount} was added to Store Balance.${claim}`,
    };
  }
  const pendingDuplicatePayments = (order?.additionalPaymentRefunds || []).filter((payment) => payment.status === "refund_pending");
  if (pendingDuplicatePayments.length) {
    const amount = pendingDuplicatePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      title: "Extra payment under review",
      body: `Your order payment is recorded. An additional KSh ${amount.toLocaleString()} payment${pendingDuplicatePayments.length === 1 ? " is" : "s are"} under review. Azard Stores will update you when it is resolved; you do not need to pay again.`,
    };
  }
  if (order?.status === "unavailable") {
    const issue = order.availabilityIssue || {};
    if (issue.resolutionStatus === "replacement_arranged") {
      const replacementId = order.replacementOrder?._id || order.replacementOrder;
      const creditedAmount = storeBalanceCreditAmount(order).toLocaleString();
      const balanceInfo = order.storeBalanceCreditedAt
        ? order.storeBalanceClaimStatus === "pending"
          ? ` The paid KSh ${creditedAmount} is reserved as Store Balance for ${order.guestInfo?.email || order.billingSnapshot?.email}; verify an account with that email to claim it.`
          : ` The paid KSh ${creditedAmount} is in Store Balance.`
        : "";
      return { title: "Replacement agreed", body: `${issue.resolutionMessage || "Azard Stores has recorded the agreed replacement."}${balanceInfo}${replacementId ? ` Follow replacement order #${String(replacementId).slice(-6).toUpperCase()} in My Orders.` : " This original order will not be dispatched."}` };
    }
    if (order.paymentStatus === "paid" && order.storeBalanceCreditedAt) {
      const amount = storeBalanceCreditAmount(order).toLocaleString();
      const email = order.guestInfo?.email || order.billingSnapshot?.email;
      const claim = order.storeBalanceClaimStatus === "pending" ? ` Sign in or create an account with ${email}, then verify that email address to claim the balance.` : " Use it at checkout for a future order; cash refunds are not offered.";
      return { title: "Item unavailable · value in Store Balance", body: `KSh ${amount} has been added to Store Balance.${claim} This order will not be dispatched.` };
    }
    if (order.availabilityIssue?.customerChoice) {
      return { title: "Availability issue · preference received", body: `You asked for a ${order.availabilityIssue.customerChoice === "replacement" ? "replacement" : "Store Balance"}. Azard Stores will follow up. The original order will not be dispatched.` };
    }
    const balanceReturn = order.storeBalanceStatus === "released" && Number(order.storeBalanceApplied || 0) > 0 ? ` KSh ${Number(order.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account.` : "";
    return { title: "An item needs your attention", body: order.paymentStatus === "paid" ? "Azard Stores cannot supply one or more items. Review the resolution details below; this order will not be dispatched." : `Azard Stores cannot supply one or more items. No payment is due. Choose a replacement or wait for Azard Stores to contact you; this order will not be dispatched.${balanceReturn}` };
  }
  if (order?.status === "cancelled") {
    const approved = (order.cancellationRequests || []).some((request) => request.status === "approved");
    if (order.paymentStatus === "paid" && order.storeBalanceCreditedAt) {
      const amount = storeBalanceCreditAmount(order).toLocaleString();
      const email = order.guestInfo?.email || order.billingSnapshot?.email;
      const claim = order.storeBalanceClaimStatus === "pending" ? ` Sign in or create an account with ${email}, then verify that email address to claim it.` : " It is available at checkout; cash refunds are not offered.";
      return { title: approved ? "Cancellation approved · value in Store Balance" : "Order cancelled · value in Store Balance", body: `KSh ${amount} has been added to Store Balance.${claim}` };
    }
    if (order.paymentStatus === "paid") return { title: "This order was cancelled", body: "The payment is being resolved. Contact Azard Stores if Store Balance is not visible in your account." };
    const balanceReturn = order.storeBalanceStatus === "released" && Number(order.storeBalanceApplied || 0) > 0 ? ` KSh ${Number(order.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account.` : "";
    return { title: "This order was cancelled", body: `Any stock reservation has been released. No payment was collected.${balanceReturn}` };
  }
  const cancellationRequests = order?.cancellationRequests || [];
  const pendingCancellation = cancellationRequests.some((request) => request.status === "pending");
  const declinedCancellation = [...cancellationRequests].reverse().find((request) => request.status === "rejected");
  if (pendingCancellation && ["pending", "confirmed"].includes(order.status)) {
    return { title: "Cancellation request under review", body: order.paymentStatus === "paid" ? "Azard Stores is reviewing this request before dispatch. If approved, the paid value will go to Store Balance; cash refunds are not offered." : "Azard Stores is reviewing this request. The order remains active until the request is decided." };
  }
  if (declinedCancellation && ["pending", "confirmed"].includes(order.status)) {
    return { title: "Cancellation request declined · order still active", body: `${declinedCancellation.decisionNote || "Azard Stores declined the request."} Contact Azard Stores if you need help.` };
  }
  if (order?.status === "expired") {
    const paymentProcessing = (order.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
    const paymentProvider = order.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
    if (order.paymentStatus === "paid" && order.storeBalanceCreditedAt) {
      return { title: "Payment received after the reservation ended", body: `KSh ${storeBalanceCreditAmount(order).toLocaleString()} has been added to Store Balance. This expired order will not be dispatched.` };
    }
    if (order.paymentStatus === "paid") {
      return { title: "Payment received after the reservation ended", body: "This order will not be dispatched. Contact Azard Stores to confirm how the payment is being resolved." };
    }
    if (paymentProcessing) {
      return { title: "Reservation ended · payment still processing", body: `Stock has been released and this order cannot be dispatched. Check the payment status below; do not start another payment. If ${paymentProvider} confirms a late payment, its value will be added to Store Balance.` };
    }
    return { title: "The payment window has ended", body: "This order is no longer reserved and will not be dispatched. Contact Azard Stores if you still want to place it." };
  }
  if (order?.paymentTestMode && order.paymentStatus !== "paid") {
    return { title: "Payment needs review", body: "We could not verify a completed payment for this order. It remains unpaid and cannot be dispatched. Contact Azard Stores before making another payment." };
  }
  const paymentProcessing = (order?.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
  const paymentProvider = order?.paymentMethod === "mpesa" ? "M-Pesa" : "Paystack";
  if (order?.paymentStatus === "refund_pending") return { title: "Payment under review", body: "Azard Stores is reviewing the payment. You do not need to make another payment." };
  if (order?.paymentStatus === "refunded") return { title: "Payment returned", body: "This payment has been returned to your Azard Store Balance." };
  if (order?.paymentStatus === "paid") {
    if (order.status === "delivered" || order.status === "collected") return { title: "Order complete", body: order.user ? "Payment is confirmed. Your receipt is available in Billing." : "Payment is confirmed. Open your receipt from Track Order." };
    if (Number(order.storeBalanceApplied || 0) >= Number(order.totalAmount || 0) && Number(order.totalAmount || 0) > 0 && order.storeBalanceStatus === "applied") {
      return { title: "Paid with Store Balance", body: order.status === "confirmed" ? "Your items are available and fully covered by Store Balance. Azard Stores is preparing your order." : "The order total was covered by your Store Balance." };
    }
    if (order.status === "ready_for_collection") return { title: "Ready for collection", body: `Your parcel is ready${order.collectionBranch ? ` at ${order.collectionBranch}` : " at the destination office"}${order.parcelReference ? ` · reference ${order.parcelReference}` : ""}.` };
    if (order.status === "shipped") return { title: "Order dispatched", body: `Your order is with the delivery carrier${order.parcelReference ? ` · reference ${order.parcelReference}` : ""}.` };
    if (order.status === "pending") return { title: "Payment received · availability check in progress", body: "We’re checking item availability and will update you before preparing the order." };
    return { title: "Payment confirmed · order being prepared", body: "Your payment is confirmed. The order will move to delivery once it is prepared." };
  }
  if (order?.status === "pending") return { title: "Order received · availability check in progress", body: "We’re checking item availability. Your items aren’t reserved yet, and no payment is due until we confirm availability." };
  if (paymentProcessing && order?.status === "confirmed") return { title: "Payment processing", body: `${paymentProvider} is checking this payment. Don’t start another payment; this order will update when the result is confirmed.` };
  if (order?.paymentStatus === "failed") return { title: "Payment was not completed", body: "See the payment details below. Your order remains active while the reservation is valid." };
  if (order?.paymentMethod === "cod") return { title: "Pay at handover", body: "For this eligible Nairobi CBD order, payment is due when your order is handed over." };
  if (["mpesa", "paystack"].includes(order?.paymentMethod) && order?.status === "confirmed") {
    const deadline = order.stockReservedUntil ? new Date(order.stockReservedUntil).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "the reservation deadline";
    return { title: "Availability confirmed · payment due", body: `Your items are reserved. Pay KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()} by ${deadline} EAT to keep the order active and allow dispatch.` };
  }
  return { title: "Order update", body: "Azard Stores will update you as this order progresses." };
}
