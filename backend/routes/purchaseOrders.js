const express = require("express");
const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const { protect, requireRole } = require("../middleware/auth");
const {
  purchaseOrderNumber,
  normalizePurchaseOrderItems,
  normalizeReceiptLines,
  applyPurchaseReceipt,
} = require("../utils/purchaseOrder");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");

const router = express.Router();
router.use(protect, requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, search } = parseListQuery(req.query);
    const status = String(req.query.status || "all");
    const filter = {};
    if (status !== "all") {
      if (!["ordered", "partially_received", "received", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Choose a valid purchase-order status." });
      }
      filter.status = status;
    }
    if (search) {
      const literal = new RegExp(escapeRegex(queryText(search)), "i");
      filter.$or = [{ orderNumber: literal }, { supplierName: literal }, { "items.productName": literal }];
    }
    const [purchaseOrders, total] = await Promise.all([
      PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PurchaseOrder.countDocuments(filter),
    ]);
    res.json({ purchaseOrders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const supplierName = String(req.body?.supplierName || "").trim();
    const supplierContact = String(req.body?.supplierContact || "").trim();
    const note = String(req.body?.note || "").trim();
    if (!supplierName || supplierName.length > 160) return res.status(400).json({ message: "Enter a supplier name of 160 characters or fewer." });
    if (supplierContact.length > 200 || note.length > 1000) return res.status(400).json({ message: "Supplier contact or note is too long." });
    const items = normalizePurchaseOrderItems(req.body?.items);
    const expectedAt = req.body?.expectedAt ? new Date(req.body.expectedAt) : null;
    if (expectedAt && !Number.isFinite(expectedAt.getTime())) return res.status(400).json({ message: "Enter a valid expected delivery date." });

    const productIds = [...new Set(items.map((item) => item.productId))];
    if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ message: "A purchase-order product ID is invalid." });
    const products = await Product.find({ _id: { $in: productIds } }).select("name sku shop variants._id variants.name variants.sku").lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const orderItems = [];
    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) return res.status(400).json({ message: "A selected product no longer exists. Refresh and try again." });
      const receivingShopId = item.shopId || String(product.shop);
      if (!mongoose.Types.ObjectId.isValid(receivingShopId)) return res.status(400).json({ message: `Choose a valid receiving shop for "${product.name}".` });
      if (!await Shop.exists({ _id: receivingShopId, isActive: true })) return res.status(400).json({ message: `The receiving shop for "${product.name}" is no longer active.` });
      const variant = item.variantId
        ? product.variants?.find((entry) => String(entry._id) === item.variantId)
        : null;
      if (item.variantId && !variant) return res.status(400).json({ message: `The selected option for "${product.name}" no longer exists.` });
      if (!item.variantId && product.variants?.length) return res.status(400).json({ message: `Choose a specific option for "${product.name}".` });
      orderItems.push({
        product: product._id,
        productName: product.name,
        shopId: receivingShopId,
        productShopId: product.shop,
        sku: variant?.sku || product.sku || "",
        variantId: variant?._id || null,
        variantName: variant?.name || "",
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
      });
    }

    const purchaseOrder = await PurchaseOrder.create({
      orderNumber: purchaseOrderNumber(),
      supplierName,
      supplierContact,
      expectedAt,
      note,
      items: orderItems,
      createdBy: req.user._id,
    });
    res.status(201).json(purchaseOrder);
  } catch (error) { next(error); }
});

router.post("/:id/receipts", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid purchase-order ID." });
    const receiptId = String(req.body?.receiptId || "").trim();
    if (!/^[\w-]{16,80}$/.test(receiptId)) return res.status(400).json({ message: "A valid receipt idempotency key is required." });
    const note = String(req.body?.note || "").trim();
    if (note.length > 500) return res.status(400).json({ message: "Receipt note must be 500 characters or fewer." });
    let purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) return res.status(404).json({ message: "Purchase order not found." });

    let receipt = purchaseOrder.receipts.find((entry) => entry.receiptId === receiptId);
    if (receipt) {
      const inputLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      const sameLines = inputLines.length === receipt.lines.length
        && inputLines.every((line) => receipt.lines.some((saved) =>
          String(saved.purchaseOrderLineId) === String(line?.purchaseOrderLineId)
          && Number(saved.quantity) === Number(line?.quantity)
        ));
      if (!sameLines) return res.status(409).json({ message: "This receipt key was already used with different quantities." });
    } else {
      if (purchaseOrder.status === "cancelled" || purchaseOrder.status === "received") return res.status(409).json({ message: "This purchase order cannot receive any more stock." });
      if (purchaseOrder.receipts.length >= 100) return res.status(409).json({ message: "This purchase order has reached its 100 receipt limit." });
      const requestedLines = normalizeReceiptLines(purchaseOrder, req.body?.lines);
      const capacityChecks = requestedLines.map((line) => ({
        $let: {
          vars: {
            item: {
              $arrayElemAt: [
                { $filter: { input: "$items", as: "item", cond: { $eq: ["$$item._id", line.purchaseOrderLineId] } } },
                0,
              ],
            },
          },
          in: {
            $lte: [
              { $add: [{ $ifNull: ["$$item.quantityReceived", 0] }, line.quantity] },
              "$$item.quantityOrdered",
            ],
          },
        },
      }));
      const update = {
        $push: {
          receipts: {
            receiptId,
            lines: requestedLines,
            note,
            receivedBy: req.user._id,
            receivedAt: new Date(),
          },
        },
        $inc: {},
      };
      const arrayFilters = [];
      requestedLines.forEach((line, index) => {
        update.$inc[`items.$[item${index}].quantityReceived`] = line.quantity;
        arrayFilters.push({ [`item${index}._id`]: line.purchaseOrderLineId });
      });
      const claimed = await PurchaseOrder.findOneAndUpdate(
        {
          _id: purchaseOrder._id,
          status: { $in: ["ordered", "partially_received"] },
          "receipts.99": { $exists: false },
          "receipts.receiptId": { $ne: receiptId },
          $expr: { $and: capacityChecks },
        },
        update,
        { new: true, arrayFilters }
      );
      if (!claimed) {
        purchaseOrder = await PurchaseOrder.findById(req.params.id);
        const duplicate = purchaseOrder?.receipts.find((entry) => entry.receiptId === receiptId);
        if (duplicate) return res.status(409).json({ message: "Receipt processing has started. Retry using the saved receipt." });
        return res.status(409).json({ message: "Another receipt changed this order, or the requested quantity exceeds what remains. Refresh and try again." });
      }
      purchaseOrder = claimed;
      receipt = purchaseOrder.receipts.find((entry) => entry.receiptId === receiptId);
    }

    await applyPurchaseReceipt({ Product, purchaseOrder, receipt });
    const refreshed = await PurchaseOrder.findById(purchaseOrder._id);
    const fullyReceived = refreshed.items.every((item) => item.quantityReceived >= item.quantityOrdered);
    const partiallyReceived = refreshed.items.some((item) => item.quantityReceived > 0);
    refreshed.status = fullyReceived ? "received" : partiallyReceived ? "partially_received" : "ordered";
    await refreshed.save();
    res.json(refreshed);
  } catch (error) { next(error); }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, status: "ordered", receipts: { $size: 0 } },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!purchaseOrder) return res.status(409).json({ message: "Only an order with no received stock can be cancelled." });
    res.json(purchaseOrder);
  } catch (error) { next(error); }
});

module.exports = router;
