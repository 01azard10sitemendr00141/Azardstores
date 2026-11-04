const mongoose = require("mongoose");
const { Schema } = mongoose;

const inventoryOperationSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  operationId: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ["stock_count", "stock_transfer"], required: true },
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  fromShopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  toShopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  variantId: { type: Schema.Types.ObjectId, default: null },
  expectedStock: { type: Number, default: null },
  countedStock: { type: Number, default: null },
  quantity: { type: Number, default: null },
  reason: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true });

inventoryOperationSchema.index({ productId: 1, operationId: 1 }, { unique: true });

module.exports = mongoose.model("InventoryOperation", inventoryOperationSchema);
