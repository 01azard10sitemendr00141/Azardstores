const mongoose = require("mongoose");
const { Schema } = mongoose;

const purchaseOrderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true, trim: true },
  shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  productShopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
  sku: { type: String, default: "" },
  variantId: { type: Schema.Types.ObjectId, default: null },
  variantName: { type: String, default: "" },
  quantityOrdered: { type: Number, required: true, min: 1 },
  quantityReceived: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
}, { timestamps: false });

const purchaseReceiptLineSchema = new Schema({
  purchaseOrderLineId: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 1 },
  inventoryAppliedAt: { type: Date, default: null },
}, { _id: false });

const purchaseReceiptSchema = new Schema({
  receiptId: { type: String, required: true },
  lines: { type: [purchaseReceiptLineSchema], required: true },
  note: { type: String, default: "", trim: true, maxlength: 500 },
  receivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: false });

const purchaseOrderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  supplierName: { type: String, required: true, trim: true, maxlength: 160 },
  supplierContact: { type: String, default: "", trim: true, maxlength: 200 },
  status: { type: String, enum: ["ordered", "partially_received", "received", "cancelled"], default: "ordered", index: true },
  expectedAt: { type: Date, default: null },
  note: { type: String, default: "", trim: true, maxlength: 1000 },
  items: { type: [purchaseOrderItemSchema], required: true, validate: [(items) => items.length > 0, "Add at least one product to the purchase order."] },
  receipts: { type: [purchaseReceiptSchema], default: [], validate: [(receipts) => receipts.length <= 100, "A purchase order can have at most 100 shipment receipts."] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  orderedAt: { type: Date, default: Date.now },
}, { timestamps: true });

purchaseOrderSchema.index({ "receipts.receiptId": 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
