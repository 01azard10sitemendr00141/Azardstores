const mongoose = require("mongoose");
const { Schema } = mongoose;

const supplierProductSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    estimatedStock: { type: Number, default: null, min: 0 },
    estimatedUnitCost: { type: Number, default: null, min: 0 },
    transferTimeHours: { type: Number, default: null, min: 1 },
  },
  { _id: false }
);

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, default: "", trim: true, maxlength: 160 },
    contact: { type: String, default: "", trim: true, maxlength: 200 },
    email: { type: String, default: "", trim: true, maxlength: 254 },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true, index: true },
    products: { type: [supplierProductSchema], default: [] },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Supplier", supplierSchema);
