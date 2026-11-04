const mongoose = require("mongoose");
const { makeSlug } = require("../utils/slug");
const { createInitialInventoryHistory } = require("../utils/inventoryHistory");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // SKU belongs to the sellable parent for simple products. Variable
    // products use their variant SKUs instead; the parent SKU is optional.
    sku: { type: String, default: "", trim: true, uppercase: true },
    slug: { type: String, unique: true, sparse: true },
    description: { type: String, default: "" },
    longDescription: { type: String, default: "" },
    // Drafts may be incomplete. Publishing validation requires a positive
    // price before the product is exposed or can be ordered.
    price: { type: Number, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    images: {
      type: [String],
      default: [],
      validate: { validator: (images) => Array.isArray(images) && images.length <= 12, message: "A product can have up to 12 gallery images." },
    },
    shop: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    // IDs are the managed taxonomy links; names remain for legacy products and public URLs.
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    subcategoryId: { type: Schema.Types.ObjectId, default: null, index: true },
    category: { type: String, default: "" },
    subcategory: { type: String, default: "" },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", default: null, index: true },
    // Kept in sync with brandId for existing storefront filters and CSVs.
    brand: { type: String, default: "" },
    returnEligibility: { type: String, enum: ["standard", "final_sale", "perishable", "digital_product"], default: "standard" },
    // Undefined means inventory has not yet been confirmed. A deliberate
    // zero is valid and remains distinguishable for draft publish checks.
    stock: { type: Number, min: 0, validate: { validator: Number.isInteger, message: "Stock must be a whole number." } },
    reorderLevel: { type: Number, min: 0, max: 1000000, default: 5, validate: { validator: Number.isInteger, message: "Reorder level must be a whole number." } },
    inventoryHistory: {
      type: [{
        type: { type: String, enum: ["initial", "baseline", "restock", "return_inspected", "purchase_order_received", "stock_count", "transfer_in", "transfer_out", "admin_adjustment", "bulk_adjustment", "csv_import", "order_reserved", "order_released", "legacy_order_restored"], required: true },
        delta: { type: Number, default: null },
        previousStock: { type: Number, default: null },
        stock: { type: Number, default: null },
        variantId: { type: Schema.Types.ObjectId, default: null },
        variantName: { type: String, default: "" },
        source: { type: String, default: "" },
        reason: { type: String, default: "", trim: true, maxlength: 500 },
        orderId: { type: Schema.Types.ObjectId, default: null },
        returnRequestId: { type: Schema.Types.ObjectId, default: null },
        purchaseOrderId: { type: Schema.Types.ObjectId, default: null },
        purchaseOrderLineId: { type: Schema.Types.ObjectId, default: null },
        receiptId: { type: String, default: "" },
        itemIndex: { type: Number, default: null },
        restockedQuantity: { type: Number, default: null },
        damagedQuantity: { type: Number, default: null },
        discardedQuantity: { type: Number, default: null },
        shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
        transferId: { type: String, default: "" },
        operationId: { type: String, default: "" },
        changedAt: { type: Date, default: Date.now },
      }],
      default: [],
      select: false,
    },
    inventoryLocations: {
      type: [{
        shop: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
        stock: { type: Number, min: 0, validate: { validator: Number.isInteger, message: "Stock must be a whole number." } },
        stockReservations: [{ orderId: { type: Schema.Types.ObjectId, required: true }, itemIndex: { type: Number, required: true }, quantity: { type: Number, required: true, min: 1 } }],
        variants: [{
          variantId: { type: Schema.Types.ObjectId, required: true },
          stock: { type: Number, min: 0, validate: { validator: Number.isInteger, message: "Stock must be a whole number." } },
          stockReservations: [{ orderId: { type: Schema.Types.ObjectId, required: true }, itemIndex: { type: Number, required: true }, quantity: { type: Number, required: true, min: 1 } }],
        }],
      }],
      default: [],
      select: false,
    },
    stockReservations: [{ orderId: { type: Schema.Types.ObjectId, required: true }, itemIndex: { type: Number, required: true }, quantity: { type: Number, required: true, min: 1 } }],
    badge: { type: String, default: "" },
    isFlashSale: { type: Boolean, default: false },
    // Optional simple variants (e.g. "Red / Large") — each is independently
    // priced and stocked. Fully wired end-to-end: the Product page lets a
    // shopper pick one, the cart keeps different variants as separate line
    // items, and checkout decrements the specific variant's stock (not the
    // base product's). A product with no variants behaves exactly as
    // before, using its own top-level price/stock.
    variants: [
      {
        // Drafts may preserve an unfinished option so it is not silently
        // discarded; validatePublishable requires a customer-facing name.
        name: { type: String, default: "", trim: true },
        sku: { type: String, default: "" },
        price: { type: Number },
        compareAtPrice: { type: Number },
        stock: { type: Number, min: 0, validate: { validator: Number.isInteger, message: "Stock must be a whole number." } },
        reorderLevel: { type: Number, min: 0, max: 1000000, default: 5, validate: { validator: Number.isInteger, message: "Reorder level must be a whole number." } },
        stockReservations: [{ orderId: { type: Schema.Types.ObjectId, required: true }, itemIndex: { type: Number, required: true }, quantity: { type: Number, required: true, min: 1 } }],
        image: { type: String, default: "" },
      },
    ],
    flashSaleEndsAt: { type: Date },
    purposeTags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: undefined, index: true },
    archivedAt: { type: Date, default: null },
    // Denormalized set used for globally unique SKU enforcement, spanning
    // both simple product SKUs and variant SKUs.
    skuCodes: { type: [String], default: undefined, select: false },
  },
  { timestamps: true }
);

productSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = makeSlug(this.name, Date.now().toString().slice(-6));
  }
  if (this.status) this.isActive = this.status === "published";
  else this.status = this.isActive === false ? "draft" : "published";
  const codes = [this.sku, ...(this.variants || []).map((variant) => variant.sku)]
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean);
  if (new Set(codes).size !== codes.length) return next(new Error("SKU codes must be unique across this product and its variants"));
  this.sku = String(this.sku || "").trim().toUpperCase();
  (this.variants || []).forEach((variant) => { variant.sku = String(variant.sku || "").trim().toUpperCase(); });
  this.skuCodes = codes.length ? [...new Set(codes)] : undefined;
  if (this.isNew && !this.inventoryHistory?.length) {
    this.inventoryHistory = createInitialInventoryHistory(this, "initial", "product-create");
  }
  next();
});

// insertMany() skips pre('save') hooks, so we need this separately.
// Random suffix avoids collisions when multiple products are inserted in the same millisecond.
productSchema.pre("insertMany", function (next, docs) {
  docs.forEach((doc) => {
    if (!doc.slug) {
      doc.slug = makeSlug(doc.name, Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000));
    }
    doc.status = doc.status || (doc.isActive === false ? "draft" : "published");
    doc.isActive = doc.status === "published";
    doc.sku = String(doc.sku || "").trim().toUpperCase();
    (doc.variants || []).forEach((variant) => { variant.sku = String(variant.sku || "").trim().toUpperCase(); });
    const codes = [doc.sku, ...(doc.variants || []).map((variant) => variant.sku)]
      .map((code) => String(code || "").trim().toUpperCase()).filter(Boolean);
    doc.skuCodes = codes.length ? codes : undefined;
    if (!doc.inventoryHistory?.length) {
      doc.inventoryHistory = createInitialInventoryHistory(doc, "initial", "product-seed");
    }
  });
  if (docs.some((doc) => new Set(doc.skuCodes).size !== doc.skuCodes.length)) return next(new Error("SKU codes must be unique across each product and its variants"));
  next();
});

productSchema.index({ skuCodes: 1 }, { unique: true, sparse: true });

productSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});
productSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, value) {
    delete value.stockReservations;
    delete value.skuCodes;
    delete value.inventoryHistory;
    for (const variant of value.variants || []) delete variant.stockReservations;
    delete value.inventoryLocations;
    return value;
  },
});

// Enables $text search across name, description and brand — powers product search in directory
productSchema.index({ name: "text", description: "text", brand: "text" });

module.exports = mongoose.model("Product", productSchema);
