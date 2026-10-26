const mongoose = require("mongoose");
const { Schema } = mongoose;

const pendingStoreBalanceSchema = new Schema({
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  reference: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  claimedAt: { type: Date, default: null },
  claimedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

pendingStoreBalanceSchema.index({ email: 1, claimedAt: 1, createdAt: 1 });

module.exports = mongoose.model("PendingStoreBalance", pendingStoreBalanceSchema);
