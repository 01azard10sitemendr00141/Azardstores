const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null, immutable: true },
    productShopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null, immutable: true },
    shopName: { type: String, default: "", immutable: true },
    shopNumber: { type: Number, default: null, immutable: true },
    // Set only when the ordered item was a specific variant — lets stock
    // decrement/restore target that variant instead of the base product.
    variantId: { type: Schema.Types.ObjectId, default: null },
    variantName: { type: String, default: "" },
    returnEligibility: { type: String, enum: ["standard", "final_sale", "perishable", "digital_product"], default: "standard" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const paymentReminderSchema = new Schema(
  { offsetMinutes: Number, sentAt: { type: Date, default: null }, claimedAt: { type: Date, default: null }, claimToken: { type: String, default: "" } },
  { _id: false }
);

const paymentAttemptSchema = new Schema(
  { provider: { type: String, enum: ["mpesa", "paystack"], required: true }, reference: { type: String, required: true }, phone: { type: String, default: "" }, status: { type: String, enum: ["pending", "failed", "paid", "review", "test_succeeded"], default: "pending" }, createdAt: { type: Date, default: Date.now } },
  { _id: false }
);

const additionalPaymentRefundSchema = new Schema(
  { reference: { type: String, required: true, trim: true, maxlength: 200 }, amount: { type: Number, required: true }, status: { type: String, enum: ["refund_pending", "refunded"], default: "refund_pending" }, refundReference: { type: String, default: "", trim: true, maxlength: 200 }, createdAt: { type: Date, default: Date.now }, refundedAt: { type: Date, default: null } },
  { _id: false }
);

const additionalPaymentCreditSchema = new Schema(
  {
    reference: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["crediting", "credited", "claim_pending"], default: "crediting" },
    claimStatus: { type: String, enum: ["not_required", "pending", "claimed"], default: "not_required" },
    creditedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const adminCorrectionSchema = new Schema(
  {
    type: { type: String, required: true },
    reason: { type: String, required: true, trim: true },
    changes: { type: [Schema.Types.Mixed], default: [] },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderEventSchema = new Schema(
  { type: String, label: String, note: String, createdAt: { type: Date, default: Date.now }, actor: { type: Schema.Types.ObjectId, ref: "User", default: null } },
  { _id: false }
);

const returnRequestSchema = new Schema(
  {
    type: { type: String, enum: ["return", "exchange"], required: true },
    itemIndexes: { type: [Number], required: true, default: [] },
    itemQuantities: { type: [{ itemIndex: { type: Number, required: true }, quantity: { type: Number, required: true, min: 1 } }], default: [] },
    reason: { type: String, required: true, trim: true },
    unused: { type: Boolean, required: true },
    originalPackaging: { type: Boolean, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "completed"], default: "pending" },
    storeBalanceIssuedAt: { type: Date, default: null },
    storeBalanceAmount: { type: Number, default: 0, min: 0 },
    storeBalanceClaimStatus: { type: String, enum: ["not_required", "pending", "claimed"], default: "not_required" },
    decisionNote: { type: String, default: "" },
    inspectionLines: { type: [{ itemIndex: { type: Number, required: true }, restockedQuantity: { type: Number, required: true, min: 0 }, damagedQuantity: { type: Number, required: true, min: 0 }, discardedQuantity: { type: Number, required: true, min: 0 } }], default: [] },
    inventoryProcessedAt: { type: Date, default: null },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
  },
  { _id: true }
);

const cancellationRequestSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    decisionNote: { type: String, default: "", trim: true, maxlength: 500 },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const deliveryIssueRequestSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["open", "investigating", "resolved"], default: "open" },
    response: { type: String, default: "", trim: true, maxlength: 1000 },
    requestedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    guestInfo: {
      name: String,
      phone: String,
      email: String,
    },
    billingSnapshot: {
      name: { type: String, default: "", immutable: true },
      email: { type: String, default: "", immutable: true },
      phone: { type: String, default: "", immutable: true },
    },
    items: { type: [orderItemSchema], immutable: true },
    // totalAmount is the grand total (items subtotal + deliveryFee). Kept as
    // a single required field since every existing read site (Dashboard,
    // AdminOrders, OrderSuccess, CSV export) already displays it as "the
    // total" — deliveryFee is stored alongside it just for the breakdown.
    totalAmount: { type: Number, required: true, min: 0, immutable: true },
    storeBalanceApplied: { type: Number, default: 0, min: 0, immutable: true },
    storeBalanceStatus: { type: String, enum: ["none", "reserved", "applied", "releasing", "crediting", "released", "credited"], default: "none" },
    storeBalanceCreditedAt: { type: Date, default: null },
    storeBalanceCreditedAmount: { type: Number, default: null, min: 0 },
    storeBalanceClaimStatus: { type: String, enum: ["not_required", "pending", "claimed"], default: "not_required" },
    storeBalanceRefundTo: { type: String, enum: ["account", "claim"], default: "account" },
    deliveryFee: { type: Number, default: 0, min: 0, immutable: true },
    deliveryAddress: { type: String, default: "", immutable: true },
    deliveryInstructions: { type: String, default: "", immutable: true },
    deliveryCounty: { type: String, default: "", trim: true, maxlength: 100, immutable: true },
    deliveryTown: { type: String, default: "", trim: true, maxlength: 100, immutable: true },
    deliveryArea: { type: String, enum: ["nairobi-cbd", "nairobi-direct", "other"], default: "other", immutable: true },
    deliveryRoute: {
      serviceType: { type: String, enum: ["direct", "parcel"], default: "parcel", immutable: true },
      carrier: { type: String, default: "", immutable: true },
      officeName: { type: String, default: "", immutable: true },
      officeAddress: { type: String, default: "", immutable: true },
      estimatedDays: { type: Number, default: null, immutable: true },
    },
    cbdDeliveryConfirmed: { type: Boolean, default: false, immutable: true },
    deliveryCorrection: {
      address: { type: String, default: "" },
      county: { type: String, default: "" },
      town: { type: String, default: "" },
      reason: { type: String, default: "" },
      actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
      correctedAt: { type: Date, default: null },
    },
    parcelReference: { type: String, default: "" },
    collectionBranch: { type: String, default: "" },
    deliveredAt: { type: Date, default: null },
    deliveryConfirmation: {
      recipientName: { type: String, default: "", trim: true, maxlength: 120 },
      note: { type: String, default: "", trim: true, maxlength: 500 },
      paymentCollectedAmount: { type: Number, default: 0, min: 0 },
      confirmedAt: { type: Date, default: null },
      confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    channel: { type: String, enum: ["cart", "whatsapp"], default: "cart" },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "confirmed", "shipped", "ready_for_collection", "collected", "delivered", "cancelled", "expired", "unavailable"],
    },
    availabilityIssue: {
      itemIndexes: { type: [Number], default: [] },
      reason: { type: String, default: "", trim: true, maxlength: 500 },
      customerChoice: { type: String, enum: ["", "replacement", "store_credit", "store_balance"], default: "" },
      customerChoiceAt: { type: Date, default: null },
      resolutionStatus: { type: String, enum: ["open", "replacement_arranged", "store_credit_arranged", "store_balance_issued"], default: "open" },
      resolutionMessage: { type: String, default: "", trim: true, maxlength: 500 },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    replacementFor: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    replacementRoot: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    replacementOrder: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    replacementPriceDifference: { type: Number, default: null },
    availabilityConfirmedAt: { type: Date, default: null },
    stockReservedAt: { type: Date, default: null },
    stockReservedUntil: { type: Date, default: null },
    stockReservationTracked: { type: Boolean, default: false },
    stockReservationCommittedAt: { type: Date, default: null },
    stockNeedsReservation: { type: Boolean, default: false },
    availabilityConfirmationInProgress: { type: Boolean, default: false },
    // How the customer is paying, and where that payment currently stands.
    // COD orders start and generally stay "unpaid" until an admin marks
    // cash as collected on delivery. Online orders (mpesa/paystack) start
    // "unpaid" the instant the order is created, then move to "paid" or
    // "failed" once the provider's webhook confirms the result —
    // paymentReference holds that provider's own transaction id/receipt
    // number for reconciliation and support lookups.
    paymentMethod: { type: String, enum: ["cod", "mpesa", "paystack", "store_balance"], default: "cod", immutable: true },
    paymentStatus: { type: String, enum: ["unpaid", "paid", "failed", "refund_pending", "refunded"], default: "unpaid" },
    paymentReference: { type: String, default: "" },
    paymentTestMode: { type: Boolean, default: false },
    paymentTestStatus: { type: String, enum: ["", "succeeded"], default: "" },
    cancellationReason: { type: String, default: "" },
    stockRestoredAt: { type: Date, default: null },
    refundReference: { type: String, default: "" },
    invoiceNumber: { type: String, default: "", immutable: true },
    invoiceIssuedAt: { type: Date, default: Date.now, immutable: true },
    receiptNumber: { type: String, default: "" },
    receiptIssuedAt: { type: Date, default: null },
    paymentReminders: { type: [paymentReminderSchema], default: [] },
    paymentAttempts: { type: [paymentAttemptSchema], default: [] },
    additionalPaymentRefunds: { type: [additionalPaymentRefundSchema], default: [] },
    additionalPaymentCredits: { type: [additionalPaymentCreditSchema], default: [] },
    adminCorrections: { type: [adminCorrectionSchema], default: [] },
    events: { type: [orderEventSchema], default: [] },
    returnRequests: { type: [returnRequestSchema], default: [] },
    cancellationRequests: { type: [cancellationRequestSchema], default: [] },
    deliveryIssueRequests: { type: [deliveryIssueRequestSchema], default: [] },
    // Ties an in-flight payment attempt back to this order — set when the
    // attempt is initiated, read by the provider's callback/webhook to find
    // which order it's reporting on. See routes/payments.js.
    mpesaCheckoutRequestId: { type: String, default: "", index: true },
    mpesaStatusQueriedAt: { type: Date, default: null },
    paymentInitiationAt: { type: Date, default: null },
    paystackReference: { type: String, default: "", index: true },
    paystackStatusQueriedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
