const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const StockRequest = require("../models/StockRequest");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const User = require("../models/User");
const { protect, requireRole, optionalAuth, setAuthCookie, signAuthToken } = require("../middleware/auth");
const { parseListQuery, escapeRegex, queryText } = require("../utils/listQuery");
const { normalizePhone } = require("../utils/normalizePhone");
const { quoteExpiryFrom, validateSetAsideQuantity, canExtendQuote, stockRequestCanCancel, stockRequestBelongsToUser, expireLinkedStockOrder } = require("../utils/stockRequest");
const { emitOrderCreatedEvent, emitOrderEvent } = require("../utils/orderRealtime");

const router = express.Router();
const QUOTE_HOURS = 12;

function isQuotedAndActive(request, now = new Date()) {
  return request.status === "quoted" && request.quoteExpiresAt && request.quoteExpiresAt > now;
}

router.get("/admin", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { page, limit, search } = parseListQuery(req.query);
    const filter = {};
    const status = String(req.query.status || "");
    if (["checking", "partial", "quoted", "expired", "released", "cancelled", "converted"].includes(status)) filter.status = status;
    if (search) {
      const literal = new RegExp(escapeRegex(queryText(search)), "i");
      filter.$or = [{ "guestInfo.name": literal }, { "guestInfo.phone": literal }, { "guestInfo.email": literal }, { "items.name": literal }];
    }
    const [requests, total] = await Promise.all([
      StockRequest.find(filter).populate("items.supplier", "name contact").populate("items.confirmedBy", "name").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      StockRequest.countDocuments(filter),
    ]);
    res.json({ requests, total, page, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

router.get("/mine", protect, async (req, res, next) => {
  try {
    const email = String(req.user.email || "").trim();
    const requests = await StockRequest.find({
      status: { $ne: "converted" },
      $or: [
        { user: req.user._id },
        { "guestInfo.email": new RegExp(`^${escapeRegex(email)}$`, "i") },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({
      requests: requests.map((request) => ({
        _id: request._id,
        status: request.status,
        createdAt: request.createdAt,
        verificationTargetAt: request.verificationTargetAt,
        quoteExpiresAt: request.quoteExpiresAt,
        items: request.items.map((item) => ({
          _id: item._id,
          name: item.name,
          variantName: item.variantName,
          quantity: item.quantity,
          confirmedQuantity: item.confirmedQuantity,
          confirmedCustomerPrice: item.confirmedCustomerPrice,
        })),
      })),
    });
  } catch (error) { next(error); }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Stock request not found." });
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (req.user) {
      if (!stockRequestBelongsToUser(request, req.user)) return res.status(404).json({ message: "Stock request not found." });
    } else {
      const contact = normalizePhone(String(req.query.contact || ""));
      const email = String(req.query.contact || "").trim().toLowerCase();
      const phoneMatches = normalizePhone(request.guestInfo.phone) === contact;
      const emailMatches = String(request.guestInfo.email || "").trim().toLowerCase() === email;
      if (!phoneMatches && !emailMatches) return res.status(404).json({ message: "Stock request not found." });
    }
    const view = request.toObject();
    view.items = view.items.map((item) => ({
      _id: item._id,
      product: item.product,
      variantId: item.variantId,
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      catalogPrice: item.catalogPrice,
      confirmedQuantity: item.confirmedQuantity,
      confirmedCustomerPrice: item.confirmedCustomerPrice,
      transferTimeHours: item.transferTimeHours,
      confirmedAt: item.confirmedAt,
    }));
    for (const event of view.events || []) {
      delete event.actor;
    }
    res.json(view);
  } catch (error) { next(error); }
});

router.post("/", optionalAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    let orderUser = req.user || null;
    let createdUser = null;
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      return res.status(400).json({ message: "Select one to 100 cart items." });
    }
    if (req.user) {
      if (req.user.accountSetupStage !== "complete") {
        return res.status(403).json({ message: "Complete your account setup before submitting another order." });
      }
      if (!req.user.phone) return res.status(400).json({ message: "Add a phone number to your account before requesting stock confirmation." });
    } else {
      const guest = body.guestInfo || {};
      const email = String(guest.email || "").trim().toLowerCase();
      if (!String(guest.name || "").trim() || !String(guest.phone || "").trim() || !email) {
        return res.status(400).json({ message: "Name, phone, and email are required to create your order and account." });
      }
      if (String(guest.name).trim().length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Enter a valid name and email address." });
      }
      const phone = normalizePhone(guest.phone);
      if (!/^254[17]\d{8}$/.test(phone)) {
        return res.status(400).json({ message: "Enter a valid Kenyan mobile number." });
      }
      const existingUser = await User.findOne({ email }).select("_id");
      if (existingUser) {
        return res.status(409).json({
          code: "ACCOUNT_EXISTS",
          message: "An account already uses this email. Sign in, then submit your cart to add this order to your account.",
        });
      }
    }

    const productIds = [...new Set(body.items.map((item) => String(item.productId || "")))];
    if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: "A stock-request product ID is invalid." });
    }
    const products = await Product.find({ _id: { $in: productIds } }).select("name images shop variants._id variants.name variants.price variants.image price");
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const items = [];
    for (const entry of body.items) {
      const product = productsById.get(String(entry.productId));
      if (!product) return res.status(400).json({ message: "A selected product no longer exists." });
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ message: "Item quantities must be whole numbers from 1 to 99." });
      let variant = null;
      if (entry.variantId) {
        if (!mongoose.Types.ObjectId.isValid(String(entry.variantId))) return res.status(400).json({ message: "A stock-request option ID is invalid." });
        variant = product.variants.find((option) => String(option._id) === String(entry.variantId));
        if (!variant) return res.status(400).json({ message: `The selected option for "${product.name}" no longer exists.` });
      }
      items.push({
        product: product._id,
        variantId: variant?._id || null,
        name: product.name,
        variantName: variant?.name || "",
        quantity,
        catalogPrice: Number(variant?.price ?? product.price ?? 0),
      });
    }

    const now = new Date();
    let request = null;
    let order = null;
    try {
      if (!orderUser) {
        createdUser = await User.create({
          name: String(body.guestInfo.name).trim(),
          email: String(body.guestInfo.email).trim().toLowerCase(),
          phone: normalizePhone(body.guestInfo.phone),
          password: crypto.randomBytes(32).toString("hex"),
          accountSetupStage: "password_required",
        });
        orderUser = createdUser;
      }
      request = await StockRequest.create({
        user: orderUser._id,
        guestInfo: {
          name: orderUser.name,
          phone: orderUser.phone,
          email: orderUser.email,
        },
        items,
        verificationTargetAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        events: [{ type: "stock_check_requested", label: "Stock check requested", createdAt: now }],
      });
      const orderItems = items.map((item) => {
        const product = productsById.get(String(item.product));
        const variant = item.variantId ? product.variants.id(item.variantId) : null;
        return {
          product: item.product,
          name: item.name,
          variantId: item.variantId,
          variantName: item.variantName,
          price: item.catalogPrice,
          quantity: item.quantity,
          image: variant?.image || product.images?.[0] || "",
        };
      });
      order = await Order.create({
        _id: request._id,
        user: orderUser._id,
        stockRequest: request._id,
        billingSnapshot: { name: orderUser.name, email: orderUser.email, phone: orderUser.phone },
        items: orderItems,
        totalAmount: items.reduce((sum, item) => sum + item.catalogPrice * item.quantity, 0),
        deliveryFee: 0,
        deliveryAddress: "",
        deliveryCounty: "",
        deliveryTown: "",
        paymentMethod: "pending",
        paymentStatus: "unpaid",
        status: "pending",
        stockNeedsReservation: false,
        loadingCheckpointRequired: true,
        checkoutDetailsCompletedAt: null,
        invoiceNumber: "",
        invoiceIssuedAt: null,
        events: [{
          type: "order_placed",
          label: "Order received",
          note: "Staff are checking item availability and prices. No payment is due and no stock is reserved yet.",
          createdAt: now,
        }],
      });
    } catch (error) {
      if (order) await Order.deleteOne({ _id: order._id });
      if (request) await StockRequest.deleteOne({ _id: request._id });
      if (createdUser) await User.deleteOne({ _id: createdUser._id });
      if (error.code === 11000) {
        return res.status(409).json({
          code: "ACCOUNT_EXISTS",
          message: "An account already uses this email. Sign in, then submit your cart to add this order to your account.",
        });
      }
      throw error;
    }

    if (createdUser) setAuthCookie(res, signAuthToken(createdUser));
    emitOrderCreatedEvent(req.app.get("io"), order);
    res.status(201).json({
      ...request.toObject(),
      orderId: order._id,
      accountCreated: Boolean(createdUser),
      user: createdUser ? {
        id: createdUser._id,
        name: createdUser.name,
        email: createdUser.email,
        phone: createdUser.phone,
        role: createdUser.role,
        accountSetupStage: createdUser.accountSetupStage,
        isEmailVerified: createdUser.isEmailVerified,
        isPhoneVerified: createdUser.isPhoneVerified,
      } : undefined,
    });
  } catch (error) { next(error); }
});

router.post("/:id/cancel", optionalAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Stock request not found." });
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (req.user) {
      if (!stockRequestBelongsToUser(request, req.user)) return res.status(404).json({ message: "Stock request not found." });
    } else {
      const contact = normalizePhone(String(req.body?.contact || ""));
      const email = String(req.body?.contact || "").trim().toLowerCase();
      const phoneMatches = normalizePhone(request.guestInfo.phone) === contact;
      const emailMatches = String(request.guestInfo.email || "").trim().toLowerCase() === email;
      if (!phoneMatches && !emailMatches) return res.status(404).json({ message: "Stock request not found." });
    }
    if (!stockRequestCanCancel(request)) return res.status(409).json({ message: "This stock request can no longer be cancelled from the customer page." });
    request.status = "cancelled";
    request.events.push({ type: "stock_request_cancelled", label: "Stock request cancelled", createdAt: new Date() });
    await request.save();
    const order = await Order.findOne({ stockRequest: request._id, status: "pending" });
    if (order && !order.checkoutDetailsCompletedAt) {
      order.status = "cancelled";
      order.cancellationReason = "Customer cancelled the stock check.";
      order.events.push({ type: "status_cancelled", label: "Order cancelled", note: order.cancellationReason });
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-status-updated", order);
    }
    res.json(request);
  } catch (error) { next(error); }
});

router.post("/:id/confirm-item", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid stock request ID." });
    const itemId = String(req.body?.itemId || "");
    const supplierId = String(req.body?.supplierId || "");
    if (!mongoose.Types.ObjectId.isValid(supplierId)) return res.status(400).json({ message: "Choose a valid supplier." });
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (!["checking", "partial"].includes(request.status)) return res.status(409).json({ message: "This stock request cannot accept another item confirmation." });
    const item = request.items.id(itemId);
    if (!item) return res.status(404).json({ message: "Stock request item not found." });
    const supplier = await Supplier.findOne({ _id: supplierId, isActive: true });
    if (!supplier) return res.status(400).json({ message: "Choose an active supplier." });

    const confirmedQuantity = Number(req.body.confirmedQuantity);
    const supplierUnitCost = Number(req.body.supplierUnitCost);
    const confirmedCustomerPrice = Number(req.body.confirmedCustomerPrice);
    const transferTimeHours = Number(req.body.transferTimeHours);
    validateSetAsideQuantity(item.quantity, confirmedQuantity);
    if (!Number.isFinite(supplierUnitCost) || supplierUnitCost < 0) return res.status(400).json({ message: "Enter a valid supplier unit cost." });
    if (!Number.isFinite(confirmedCustomerPrice) || confirmedCustomerPrice < 0) return res.status(400).json({ message: "Enter a valid customer price." });
    if (!Number.isFinite(transferTimeHours) || transferTimeHours < 1) return res.status(400).json({ message: "Enter a valid supplier transfer time." });

    item.supplier = supplier._id;
    item.confirmedQuantity = confirmedQuantity;
    item.supplierUnitCost = supplierUnitCost;
    item.confirmedCustomerPrice = confirmedCustomerPrice;
    item.transferTimeHours = transferTimeHours;
    item.confirmedAt = new Date();
    item.confirmedBy = req.user._id;
    request.events.push({ type: "stock_item_confirmed", label: "Item set aside", note: item.name, actor: req.user._id });
    const allItemsConfirmed = request.items.every((line) =>
      line.confirmedQuantity != null && line.confirmedQuantity === line.quantity
    );
    let quoteIssued = false;
    if (allItemsConfirmed) {
      const now = new Date();
      request.status = "quoted";
      request.quoteExpiresAt = quoteExpiryFrom(now);
      request.events.push({ type: "quote_issued", label: "Confirmed quote issued", note: `Valid for ${QUOTE_HOURS} hours.`, actor: req.user._id });
      quoteIssued = true;
    } else {
      request.status = "partial";
    }
    await request.save();
    const order = await Order.findOne({ stockRequest: request._id, status: "pending" });
    if (order) {
      const orderItem = order.items.find((line) => String(line.product) === String(item.product)
        && String(line.variantId || "") === String(item.variantId || ""));
      if (orderItem) orderItem.price = confirmedCustomerPrice;
      order.totalAmount = order.items.reduce((sum, line) => sum + Number(line.price || 0) * line.quantity, 0);
      order.events.push({ type: "availability_confirmed", label: "Item availability confirmed", note: item.name, actor: req.user._id });
      if (quoteIssued) {
        for (const requestItem of request.items) {
          const linkedItem = order.items.find((line) => String(line.product) === String(requestItem.product)
            && String(line.variantId || "") === String(requestItem.variantId || ""));
          if (linkedItem) linkedItem.price = requestItem.confirmedCustomerPrice;
        }
        order.totalAmount = order.items.reduce((sum, line) => sum + Number(line.price || 0) * line.quantity, 0);
        order.events.push({ type: "quote_issued", label: "Confirmed quote ready", note: "Review delivery and payment details to complete checkout.", actor: req.user._id });
      }
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-details-updated", order);
    }
    res.json(request);
  } catch (error) { next(error); }
});

router.post("/:id/issue-quote", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (!["checking", "partial"].includes(request.status)) return res.status(409).json({ message: "This stock request cannot issue a quote." });
    const incomplete = request.items.find((item) => item.confirmedQuantity == null || item.confirmedQuantity < item.quantity);
    if (incomplete) return res.status(409).json({ message: `Set aside stock for "${incomplete.name}" before issuing the quote.` });
    const now = new Date();
    request.status = "quoted";
    request.quoteExpiresAt = quoteExpiryFrom(now);
    request.events.push({ type: "quote_issued", label: "Confirmed quote issued", note: `Valid for ${QUOTE_HOURS} hours.`, actor: req.user._id });
    await request.save();
    const order = await Order.findOne({ stockRequest: request._id, status: "pending" });
    if (order) {
      for (const requestItem of request.items) {
        const orderItem = order.items.find((line) => String(line.product) === String(requestItem.product)
          && String(line.variantId || "") === String(requestItem.variantId || ""));
        if (orderItem) orderItem.price = requestItem.confirmedCustomerPrice;
      }
      order.totalAmount = order.items.reduce((sum, line) => sum + Number(line.price || 0) * line.quantity, 0);
      order.events.push({ type: "quote_issued", label: "Confirmed quote ready", note: "Review delivery and payment details to complete checkout.", actor: req.user._id });
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-details-updated", order);
    }
    res.json(request);
  } catch (error) { next(error); }
});

router.post("/:id/extend", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (!canExtendQuote(request, new Date())) return res.status(409).json({ message: "Only an active quote with no prior extension can be extended." });
    const now = new Date();
    request.quoteExpiresAt = quoteExpiryFrom(now);
    request.quoteExtendedAt = now;
    request.quoteExtensionCount = 1;
    request.events.push({ type: "quote_extended", label: "Quote extended", note: "Stock and price reconfirmed; valid for another 12 hours.", actor: req.user._id });
    await request.save();
    res.json(request);
  } catch (error) { next(error); }
});

router.post("/:id/expire", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (request.status !== "quoted") return res.status(409).json({ message: "Only an issued quote can be expired." });
    if (request.quoteExpiresAt && request.quoteExpiresAt > new Date()) return res.status(409).json({ message: "This quote has not expired." });
    request.status = "expired";
    request.events.push({ type: "quote_expired", label: "Quote expired", note: "Stock remains set aside until staff confirms it was returned to available stock.", actor: req.user._id });
    await request.save();
    await expireLinkedStockOrder(request, "Staff expired the quote. Held stock remains unavailable until staff confirms its release.", req.app.get("io"));
    res.json(request);
  } catch (error) { next(error); }
});

router.post("/:id/release", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const request = await StockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Stock request not found." });
    if (!["expired", "cancelled"].includes(request.status)) return res.status(409).json({ message: "Only expired or cancelled holds can be released." });
    request.status = "released";
    request.events.push({ type: "held_stock_released", label: "Held stock released", note: "Staff confirmed the physically set-aside quantity is available again.", actor: req.user._id });
    await request.save();
    const order = await Order.findOne({ stockRequest: request._id, status: "pending" });
    if (order) {
      order.status = "cancelled";
      order.cancellationReason = "The stock quote expired and its held stock was released.";
      order.events.push({ type: "status_cancelled", label: "Order cancelled", note: order.cancellationReason, actor: req.user._id });
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-status-updated", order);
    }
    res.json(request);
  } catch (error) { next(error); }
});

module.exports = router;
