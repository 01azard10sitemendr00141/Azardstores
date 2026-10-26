const PRIVATE_ORDER_FIELDS = [
  "adminCorrections",
  "paymentReminders",
  "paymentInitiationAt",
  "paymentTestStatus",
  "refundReference",
  "paystackReference",
  "paystackStatusQueriedAt",
  "mpesaCheckoutRequestId",
  "mpesaStatusQueriedAt",
  "stockReservationTracked",
  "stockReservationCommittedAt",
  "stockNeedsReservation",
  "stockRestoredAt",
  "availabilityConfirmationInProgress",
];

function withoutKeys(value, keys) {
  if (!value || typeof value !== "object") return value;
  for (const key of keys) delete value[key];
  return value;
}

function customerOrderView(order) {
  if (!order) return order;
  const view = typeof order.toObject === "function" ? order.toObject() : JSON.parse(JSON.stringify(order));
  withoutKeys(view, PRIVATE_ORDER_FIELDS);

  if (Array.isArray(view.paymentAttempts)) {
    view.paymentAttempts = view.paymentAttempts.map((attempt) => withoutKeys(attempt, ["phone"]));
  }
  if (Array.isArray(view.additionalPaymentRefunds)) {
    view.additionalPaymentRefunds = view.additionalPaymentRefunds.map((refund) => withoutKeys(refund, ["reference", "refundReference"]));
  }
  if (Array.isArray(view.additionalPaymentCredits)) {
    view.additionalPaymentCredits = view.additionalPaymentCredits.map((credit) => withoutKeys(credit, ["reference"]));
  }
  if (Array.isArray(view.events)) {
    view.events = view.events.map((event) => {
      withoutKeys(event, ["actor"]);
      if (["customer_details_corrected", "delivery_destination_corrected", "additional_payment_refunded", "late_payment_after_expiry"].includes(event.type)) {
        event.note = "";
      }
      return event;
    });
  }

  withoutKeys(view.deliveryCorrection, ["reason", "actor"]);
  withoutKeys(view.deliveryConfirmation, ["confirmedBy"]);
  withoutKeys(view.availabilityIssue, ["resolvedBy"]);
  for (const request of view.cancellationRequests || []) withoutKeys(request, ["decidedBy"]);
  for (const issue of view.deliveryIssueRequests || []) withoutKeys(issue, ["resolvedBy"]);
  return view;
}

module.exports = { customerOrderView };
