const mongoose = require("mongoose");
const { Schema } = mongoose;

const stockRequestItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, required: true, trim: true },
    variantName: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 1 },
    catalogPrice: { type: Number, required: true, min: 0 },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    confirmedQuantity: { type: Number, default: null, min: 0 },
    supplierUnitCost: { type: Number, default: null, min: 0 },
    confirmedCustomerPrice: { type: Number, default: null, min: 0 },
    transferTimeHours: { type: Number, default: null, min: 1 },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const stockRequestEventSchema = new Schema(
  {
    type: { type: String, required: true },
    label: { type: String, required: true },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

const stockRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    guestInfo: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["checking", "partial", "quoted", "expired", "released", "cancelled", "converted"],
      default: "checking",
      index: true,
    },
    items: { type: [stockRequestItemSchema], required: true },
    verificationTargetAt: { type: Date, default: null },
    quoteExpiresAt: { type: Date, default: null },
    quoteExtendedAt: { type: Date, default: null },
    quoteExtensionCount: { type: Number, default: 0, min: 0, max: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    events: { type: [stockRequestEventSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockRequest", stockRequestSchema);
