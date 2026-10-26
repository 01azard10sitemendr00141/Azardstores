const mongoose = require("mongoose");
const { Schema } = mongoose;

const unmatchedPaymentSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  amountSubunit: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, uppercase: true },
  domain: { type: String, required: true },
  customerEmail: { type: String, default: "", lowercase: true, trim: true },
  metadataOrderId: { type: String, default: "", trim: true },
  issueReason: { type: String, default: "", trim: true },
  gatewayResponse: { type: String, default: "" },
  status: { type: String, enum: ["open", "processing", "linked", "refund_pending", "refunded"], default: "open", index: true },
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  resolutionNote: { type: String, default: "" },
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("UnmatchedPayment", unmatchedPaymentSchema);
