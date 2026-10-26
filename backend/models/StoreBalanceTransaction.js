const mongoose = require("mongoose");
const { Schema } = mongoose;

const storeBalanceTransactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["credit", "reserve", "release", "claim"], required: true },
  amount: { type: Number, min: 0, required: true },
  balanceAfter: { type: Number, min: 0, required: true },
  reference: { type: String, required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  description: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

storeBalanceTransactionSchema.index({ user: 1, reference: 1 }, { unique: true });
storeBalanceTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("StoreBalanceTransaction", storeBalanceTransactionSchema);
