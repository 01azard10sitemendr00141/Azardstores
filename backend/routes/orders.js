const express = require("express");
const { body, validationResult } = require("express-validator");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const User = require("../models/User");
const Settings = require("../models/Settings");
const { protect, requireRole, optionalAuth } = require("../middleware/auth");
const { sendOrderConfirmationEmail, sendOrderUpdateEmail } = require("../utils/email");
const { isEmailVerificationLive, isPhoneVerificationLive } = require("../config/verification");
const { normalizePhone } = require("../utils/normalizePhone");
const { toCsv } = require("../utils/csvExport");
const { reserveOrderStock, restoreOrderStockOnce, commitOrderStockReservations, hasCommittedInventory } = require("../utils/orderStock");
const { isPaystackConfigured, isPaystackMpesaConfigured } = require("../utils/paystack");
const { changeBalance, releaseOrderBalance, creditPaidOrderToStoreBalance, issueStoreBalance, customerStoreBalanceMessage } = require("../utils/storeBalance");
const { emitOrderEvent, emitOrderCreatedEvent } = require("../utils/orderRealtime");
const { getCbdDeliveryFee } = require("../utils/deliveryPricing");
const { orderLimiter, orderLookupLimiter, customerOrderActionLimiter } = require("../middleware/rateLimits");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");
const { customerOrderView } = require("../utils/customerOrderView");
const { normalizeReturnInspectionLines, applyReturnInspection } = require("../utils/returnInventory");
const { allocateStock, shopStockEntries } = require("../utils/productInventory");

const router = express.Router();

function hasValidPersonName(name) {
  const normalized = String(name || "").trim();
  return normalized.length >= 2 && normalized.length <= 100 && /\p{L}/u.test(normalized);
}

function hasValidKenyanMobile(phone) {
  return /^254[17]\d{8}$/.test(normalizePhone(phone));
}

function isRequestObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCodOrder(order) {
  const method = String(order.paymentMethod || "cod").trim().toLowerCase();
  return ["cod", "cash_on_delivery", "cash on delivery"].includes(method);
}

function orderFulfilledAt(order) {
  if (order.deliveredAt) return new Date(order.deliveredAt);
  const event = [...(order.events || [])].reverse().find((entry) => ["status_delivered", "status_collected"].includes(entry.type));
  return event?.createdAt ? new Date(event.createdAt) : null;
}

function parcelDestination(order) {
  const route = order.deliveryRoute || {};
  const carrier = route.carrier || "Parcel service";
  const office = [route.officeName, route.officeAddress].filter(Boolean).join(", ");
  const location = [order.deliveryTown, order.deliveryCounty].filter(Boolean).join(", ");
  return { carrier, office, location, description: [carrier, office, location].filter(Boolean).join(" · ") };
}

function isUnconfirmedPaystackSettlement(order) {
  const reference = String(order.paymentReference || "");
  return Boolean(
    order.paymentTestMode ||
    (process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") &&
      order.paymentStatus === "paid" &&
      ["mpesa", "paystack"].includes(order.paymentMethod) &&
      order.paymentAttempts?.some((attempt) => attempt.provider === "paystack" && ["paid", "test_succeeded"].includes(attempt.status) && attempt.reference === reference) &&
      (reference.startsWith(`azard-mpesa-${order._id}-`) || reference.startsWith(`azard-${order._id}-`)))
  );
}

async function normalizeUnconfirmedPaystackSettlement(order) {
  const legacyPaymentEvent = (order.events || []).some((event) => event.type === "payment_test_confirmed" || /sandbox|test payment/i.test(`${event.label || ""} ${event.note || ""}`));
  if (isUnconfirmedPaystackSettlement(order) && (!order.paymentTestMode || order.paymentStatus !== "unpaid" || order.paymentTestStatus !== "succeeded" || order.receiptNumber || legacyPaymentEvent)) {
    order.paymentTestMode = true;
    order.paymentTestStatus = "succeeded";
    order.paymentStatus = "unpaid";
    order.receiptNumber = "";
    order.receiptIssuedAt = null;
    const paymentEvent = [...(order.events || [])].reverse().find((event) => ["payment_received", "payment_test_confirmed"].includes(event.type) || /sandbox|test payment/i.test(`${event.label || ""} ${event.note || ""}`));
    if (paymentEvent) {
      paymentEvent.type = "payment_not_confirmed";
      paymentEvent.label = "Payment not confirmed";
      paymentEvent.note = "The payment provider has not confirmed settlement. This order remains unpaid and cannot be dispatched.";
    } else {
      order.events.push({ type: "payment_not_confirmed", label: "Payment not confirmed", note: "The payment provider has not confirmed settlement. This order remains unpaid and cannot be dispatched." });
    }
    await order.save();
  }
  return order;
}

function orderReviewFlags(order) {
  const name = order.user?.name || order.guestInfo?.name || "";
  const email = order.user?.email || order.guestInfo?.email || "";
  const phone = order.user?.phone || order.guestInfo?.phone || "";
  const flags = [];
  if (isUnconfirmedPaystackSettlement(order)) flags.push("The payment provider has not confirmed settlement. Do not dispatch.");
  if (["unpaid", "failed"].includes(order.paymentStatus) && (order.paymentAttempts || []).some((attempt) => attempt.status === "paid")) {
    flags.push("A payment attempt is marked paid while the order is not. Reconcile the provider payment before any collection or dispatch.");
  }
  if (!hasValidPersonName(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !hasValidKenyanMobile(phone)) {
    flags.push("Customer name, email, or Kenyan phone number is missing or invalid");
  }
  if (isCodOrder(order) && ["shipped", "ready_for_collection"].includes(order.status)) {
    flags.push("COD order has a parcel fulfillment status");
  }
  if (!isCodOrder(order) && order.paymentStatus !== "paid" && ["shipped", "ready_for_collection", "collected", "delivered"].includes(order.status)) {
    flags.push("Unpaid online order has advanced in fulfillment");
  }
  if (order.paymentStatus === "paid" && !order.receiptNumber && !isUnconfirmedPaystackSettlement(order)) {
    flags.push("Paid order has no receipt number");
  }
  if (order.status === "cancelled" && order.paymentStatus === "paid" && !order.storeBalanceCreditedAt) {
    flags.push("Paid order was cancelled; issue its value to Store Balance");
  }
  if (order.status === "unavailable" && order.paymentStatus === "paid" && !order.storeBalanceCreditedAt) {
    flags.push("Paid unavailable order has not been issued to Store Balance");
  }
  if (order.status === "expired" && order.paymentStatus === "paid") {
    flags.push(order.storeBalanceCreditedAt ? "Late payment was returned to store balance; do not dispatch" : "Payment arrived after order expiry; issue its value to store balance and do not dispatch");
  }
  if (["cancelled", "expired", "unavailable"].includes(order.status) && order.stockReservedAt && !order.stockRestoredAt && !hasCommittedInventory(order)) {
    flags.push("Order has ended but reserved stock is not recorded as restored");
  }
  const pendingAdditionalPayments = (order.additionalPaymentRefunds || []).filter((payment) => payment.status === "refund_pending").length;
  if (pendingAdditionalPayments) {
    flags.push(`${pendingAdditionalPayments} duplicate payment${pendingAdditionalPayments === 1 ? "" : "s"} need refund review`);
  }
  if ((order.cancellationRequests || []).some((request) => request.status === "pending")) {
    flags.push("Paid order cancellation request needs a decision");
  }
  if ((order.deliveryIssueRequests || []).some((request) => ["open", "investigating"].includes(request.status))) {
    flags.push("Customer delivery report needs a response");
  }
  if (!(order.deliveryCorrection?.address || order.deliveryAddress) || !(order.deliveryCorrection?.county || order.deliveryCounty) || !(order.deliveryCorrection?.town || order.deliveryTown)) {
    flags.push("Delivery destination details are incomplete");
  }
  return flags;
}

async function withReviewFlags(order) {
  await normalizeUnconfirmedPaystackSettlement(order);
  const serialized = order.toObject();
  serialized.adminReviewFlags = orderReviewFlags(order);
  return serialized;
}

// POST /api/orders - create an order (works for logged-in users or guests)
router.post(
  "/",
  orderLimiter,
  optionalAuth,
  [
    body("items").isArray({ min: 1 }).withMessage("Order must contain at least one item"),
    body("items.*.productId").isMongoId().withMessage("An order item is invalid"),
    body("items.*.variantId").optional().isMongoId().withMessage("An item option is invalid"),
    body("items.*.quantity").isInt({ min: 1, max: 99 }).toInt().withMessage("Item quantities must be between 1 and 99"),
    body("items.*.expectedPrice").optional().isFloat({ min: 0 }).toFloat().withMessage("An item price is invalid"),
    body("channel").isIn(["cart", "whatsapp"]).withMessage("Invalid order channel"),
    body("paymentMethod").optional().isIn(["cod", "mpesa", "paystack", "store_balance"]).withMessage("Invalid payment method"),
    body("storeBalanceAmount").optional().isFloat({ min: 0 }).toFloat().withMessage("Store balance amount is invalid"),
    body("deliveryAddress").trim().notEmpty().withMessage("Delivery address is required"),
    body("deliveryArea").isIn(["nairobi-cbd", "nairobi-direct", "other"]).withMessage("Choose a valid delivery area"),
    body("deliveryAddress").isLength({ min: 8, max: 1000 }).withMessage("Enter a complete delivery or parcel collection location"),
    body("deliveryCounty").trim().notEmpty().isLength({ max: 100 }).withMessage("Enter the destination county"),
    body("deliveryTown").trim().notEmpty().isLength({ max: 100 }).withMessage("Enter the destination town or area"),
    body("deliveryRouteId").optional({ checkFalsy: true }).isMongoId().withMessage("Choose a valid parcel office"),
    body("expectedDeliveryFee").optional().isFloat({ min: 0 }).toFloat().withMessage("The delivery charge is invalid"),
    body("deliveryInstructions").optional().isString().isLength({ max: 1000 }).withMessage("Delivery notes are too long"),
    // Guests must provide contact info directly; logged-in users already have it on their account.
    body("guestInfo").custom((value, { req }) => {
      if (!req.user) {
        if (!value || typeof value.name !== "string" || typeof value.phone !== "string" || typeof value.email !== "string" || !value.name.trim() || !value.phone.trim() || !value.email.trim()) {
          throw new Error("Name, phone, and email are required for guest checkout");
        }
        if (!hasValidPersonName(value.name)) {
          throw new Error("Enter a valid name containing at least one letter");
        }
        if (value.name.trim().length > 100 || value.email.trim().length > 254) {
          throw new Error("Name must be 100 characters or fewer and email must be 254 characters or fewer");
        }
        if (!hasValidKenyanMobile(value.phone)) {
          throw new Error("Enter a valid Kenyan mobile number, such as 0712 345 678");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) throw new Error("Enter a valid email address");
      }
      return true;
    }),
    body("guestInfo").custom((value, { req }) => {
      if (req.user && !hasValidPersonName(req.user.name)) throw new Error("Update your account name before checkout");
      if (req.user && !hasValidKenyanMobile(req.user.phone)) throw new Error("Add a valid Kenyan mobile number to your account before checkout");
      return true;
    }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      // Logged-in customers must be verified before checking out — guests
      // aren't affected, they don't have an account to verify. Both email
      // and phone are only required once their sending channel is actually
      // live — otherwise a customer could be asked to verify something
      // they have no way to ever receive.
      if (req.user) {
        if (isEmailVerificationLive() && !req.user.isEmailVerified) {
          const err = new Error("Please verify your email before placing an order");
          err.statusCode = 403;
          throw err;
        }
        if (isPhoneVerificationLive() && !req.user.isPhoneVerified) {
          const err = new Error("Please verify your phone number before placing an order");
          err.statusCode = 403;
          throw err;
        }
      }

      const { items, channel, deliveryAddress, guestInfo, paymentMethod } = req.body;
      const normalizedGuestInfo = guestInfo && guestInfo.phone
        ? { ...guestInfo, email: guestInfo.email?.trim().toLowerCase(), phone: normalizePhone(guestInfo.phone) }
        : guestInfo;
      const selectedPaymentMethod = paymentMethod || "cod";
      if (selectedPaymentMethod === "mpesa" && !isPaystackMpesaConfigured()) {
        const err = new Error("M-Pesa via Paystack is not enabled for checkout. Confirm that M-Pesa is active on the Paystack account and set PAYSTACK_MPESA_ENABLED=true.");
        err.statusCode = 503;
        throw err;
      }
      if (selectedPaymentMethod === "paystack" && !isPaystackConfigured()) {
        const err = new Error("Card payment is not configured yet");
        err.statusCode = 503;
        throw err;
      }
      if (selectedPaymentMethod === "cod" && req.body.deliveryArea !== "nairobi-cbd") {
        const err = new Error("Cash on delivery is available only for Nairobi CBD orders. Parcel orders must be paid before dispatch.");
        err.statusCode = 400;
        throw err;
      }
      if (selectedPaymentMethod === "cod" && (String(req.body.deliveryCounty || "").trim().toLowerCase() !== "nairobi" || req.body.cbdDeliveryConfirmed !== true)) {
        const err = new Error("Confirm a Nairobi County CBD address before choosing cash on delivery");
        err.statusCode = 400;
        throw err;
      }
      const settings = await Settings.findOne();
      if (req.body.deliveryArea === "nairobi-cbd" && (String(req.body.deliveryCounty || "").trim().toLowerCase() !== "nairobi" || String(req.body.deliveryTown || "").trim().toLowerCase() !== "nairobi cbd")) {
        const err = new Error("Nairobi CBD delivery requires a Nairobi CBD address");
        err.statusCode = 400;
        throw err;
      }
      let selectedDeliveryRoute = null;
      if (req.body.deliveryArea !== "nairobi-cbd") {
        selectedDeliveryRoute = settings?.deliveryRoutes?.find((route) => route.active && route._id.toString() === req.body.deliveryRouteId);
        const expectedService = req.body.deliveryArea === "nairobi-direct" ? "direct" : "parcel";
        if (!selectedDeliveryRoute || (selectedDeliveryRoute.serviceType || "parcel") !== expectedService || selectedDeliveryRoute.county.toLowerCase() !== req.body.deliveryCounty.trim().toLowerCase() || selectedDeliveryRoute.town.toLowerCase() !== req.body.deliveryTown.trim().toLowerCase()) {
          return res.status(409).json({
            message: expectedService === "direct" ? "That direct-delivery option changed. Delivery options have been refreshed; please choose an available option." : "That parcel office changed. Delivery options have been refreshed; please choose an available office.",
            deliveryChanged: true,
          });
        }
        if (expectedService === "direct" && selectedDeliveryRoute.county.toLowerCase() !== "nairobi") {
          const err = new Error("Direct delivery zones are available only within Nairobi County");
          err.statusCode = 400;
          throw err;
        }
      }

      // Re-fetch real prices from DB rather than trusting client-sent prices.
      // Stock is decremented atomically per item (not just checked) so two
      // concurrent orders for the last unit can't both succeed — if any item
      // in the order fails, already-decremented items are rolled back.
      const productIds = items.map((i) => i.productId);
      const activeShops = await Shop.find({ isActive: true }).select("_id name shopNumber").lean();
      const activeShopIds = activeShops.map((shop) => shop._id);
      const activeShopsById = new Map(activeShops.map((shop) => [shop._id.toString(), shop]));
      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
        $or: [{ status: "published" }, { status: { $exists: false } }],
      }).select("+inventoryLocations");

      const orderItems = [];
      const priceChanges = [];
      const allocatedStock = new Map();
      for (const item of items) {
        const product = products.find((p) => p._id.toString() === item.productId);
        if (!product) {
          return res.status(409).json({
            message: "This product is no longer available. It has been removed from your cart; review the updated total before continuing.",
            unavailableItems: [{ productId: item.productId, variantId: item.variantId || null }],
          });
        }
        const variant = item.variantId
          ? product.variants.find((v) => v._id.toString() === item.variantId)
          : null;
        if (item.variantId && !variant) {
          return res.status(409).json({
            message: `The selected option for "${product.name}" is no longer available. It has been removed from your cart; review the updated total before continuing.`,
            unavailableItems: [{ productId: item.productId, variantId: item.variantId }],
          });
        }

        const stockKey = `${product._id}:${variant?._id || "base"}`;
        if (!allocatedStock.has(stockKey)) allocatedStock.set(stockKey, new Map());
        const allocations = allocateStock(product, variant?._id || null, item.quantity, activeShops, allocatedStock.get(stockKey));
        if (!allocations) {
          const eligibleLocations = shopStockEntries(product, variant?._id || null, activeShopIds);
          const hasUnconfirmedStock = eligibleLocations.some((location) => !Number.isInteger(location.stock));
          const knownAvailable = eligibleLocations
            .filter((location) => Number.isInteger(location.stock))
            .reduce((sum, location) => sum + location.stock, 0);
          return res.status(409).json({
            message: hasUnconfirmedStock
              ? `Availability for "${product.name}"${variant ? ` (${variant.name})` : ""} has not been confirmed at every active shop. Please contact Azard Stores before ordering.`
              : `Only ${knownAvailable} of "${product.name}"${variant ? ` (${variant.name})` : ""} are currently available across active shops. Adjust the quantity and try again.`,
            stockChanged: true,
            item: { productId: product._id.toString(), variantId: variant?._id?.toString() || null, availableStock: hasUnconfirmedStock ? null : knownAvailable },
          });
        }

        const currentPrice = variant?.price ?? product.price;
        const lineImage = variant?.image || product.images[0] || "";
        if (item.expectedPrice !== undefined && Number(item.expectedPrice) !== Number(currentPrice)) {
          priceChanges.push({
            productId: product._id.toString(),
            variantId: variant?._id?.toString() || null,
            name: product.name,
            price: currentPrice,
            image: lineImage,
          });
        }
        for (const allocation of allocations) {
          const shop = allocation.shop || activeShopsById.get(String(product.shop));
          if (!shop) return res.status(409).json({ message: "Stock is assigned to a shop that is no longer active. Review the cart and try again." });
          orderItems.push({
            product: product._id,
            shopId: shop._id,
            productShopId: product.shop,
            shopName: shop.name,
            shopNumber: shop.shopNumber,
            name: product.name,
            variantId: variant?._id || null,
            variantName: variant?.name || "",
            returnEligibility: product.returnEligibility || "standard",
            price: currentPrice,
            quantity: allocation.quantity,
            image: lineImage,
          });
        }
      }

      if (priceChanges.length) {
        return res.status(409).json({
          message: "Some prices changed while these items were in your cart. We updated the affected items; review your total and place the order again.",
          priceChanged: true,
          items: priceChanges,
        });
      }

      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      // Delivery fee comes from admin-configured Settings, never the client —
      // same trust boundary as product prices above. A freeDeliveryThreshold
      // of 0 means "disabled" (matches the admin form's "0 = disabled" hint).
      const deliveryFee = req.body.deliveryArea === "nairobi-cbd"
        ? getCbdDeliveryFee(subtotal, settings)
        : selectedDeliveryRoute.fee;
      if (req.body.expectedDeliveryFee !== undefined && Number(req.body.expectedDeliveryFee) !== Number(deliveryFee)) {
        return res.status(409).json({
          message: "The delivery charge changed while you were checking out. We refreshed delivery options; review your total before placing the order again.",
          deliveryChanged: true,
        });
      }

      const totalAmount = subtotal + deliveryFee;
      const requestedBalance = Number(req.body.storeBalanceAmount || 0);
      if (requestedBalance && !req.user) {
        const err = new Error("Sign in to use your store balance"); err.statusCode = 400; throw err;
      }
      if (!Number.isFinite(requestedBalance) || requestedBalance < 0 || requestedBalance > totalAmount) {
        const err = new Error("Store balance amount is invalid"); err.statusCode = 400; throw err;
      }
      const balanceAmount = Math.round(requestedBalance * 100) / 100;
      if (selectedPaymentMethod === "store_balance" && (!req.user || balanceAmount < totalAmount)) {
        const err = new Error("Store balance must cover the full order to use it as the only payment method"); err.statusCode = 400; throw err;
      }
      if (balanceAmount > 0 && selectedPaymentMethod === "cod" && balanceAmount < totalAmount && req.body.deliveryArea !== "nairobi-cbd") {
        const err = new Error("Cash on delivery is available only for Nairobi CBD orders"); err.statusCode = 400; throw err;
      }

      const order = new Order({
          user: req.user ? req.user._id : null,
          guestInfo: req.user ? undefined : normalizedGuestInfo,
          billingSnapshot: req.user
            ? { name: req.user.name, email: req.user.email, phone: req.user.phone }
            : normalizedGuestInfo,
        items: orderItems,
        totalAmount,
        storeBalanceApplied: balanceAmount,
        storeBalanceStatus: balanceAmount > 0 ? "reserved" : "none",
        deliveryFee,
        deliveryAddress: selectedDeliveryRoute?.serviceType === "parcel" ? selectedDeliveryRoute.officeAddress : deliveryAddress,
        deliveryInstructions: selectedDeliveryRoute?.serviceType === "parcel" ? String(req.body.deliveryInstructions || "").trim() : "",
        deliveryArea: req.body.deliveryArea,
        deliveryCounty: req.body.deliveryCounty.trim(),
        deliveryTown: req.body.deliveryTown.trim(),
        deliveryRoute: selectedDeliveryRoute ? {
          serviceType: selectedDeliveryRoute.serviceType || "parcel",
          carrier: selectedDeliveryRoute.carrier,
          officeName: selectedDeliveryRoute.officeName,
          officeAddress: selectedDeliveryRoute.officeAddress,
          estimatedDays: selectedDeliveryRoute.estimatedDays,
        } : undefined,
        cbdDeliveryConfirmed: req.body.cbdDeliveryConfirmed === true,
        channel,
        paymentMethod: selectedPaymentMethod,
        stockNeedsReservation: true,
        invoiceNumber: `AS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        events: [{ type: "order_placed", label: "Order received", note: "Awaiting Azard Stores availability confirmation; stock is not reserved yet." }],
        });

      if (balanceAmount > 0) {
        await changeBalance(req.user._id, { amount: balanceAmount, type: "reserve", reference: `order:${order._id}:reserve`, orderId: order._id, description: "Reserved for checkout" });
      }
      try {
        await order.save();
      } catch (saveError) {
        if (balanceAmount > 0) await changeBalance(req.user._id, { amount: balanceAmount, type: "release", reference: `order:${order._id}:save-failure-release`, orderId: order._id, description: "Checkout could not be completed" });
        throw saveError;
      }

      // Notify any connected admin dashboards in real time
      const io = req.app.get("io");
      emitOrderCreatedEvent(io, order);

      // Send a confirmation email if we have an address to send it to
      const recipientEmail = req.user ? req.user.email : normalizedGuestInfo?.email;
      if (recipientEmail) {
        sendOrderConfirmationEmail(recipientEmail, order).catch((err) =>
          console.error("Failed to send order confirmation email:", err.message)
        );
      }

      res.status(201).json(customerOrderView(order));
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/orders/my - logged-in user's own order history
// GET /api/orders/export - admin only. Exports all orders as CSV.
router.get("/export", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });

    const csv = toCsv(orders, [
      { label: "Order ID", value: (o) => o._id.toString().slice(-6).toUpperCase() },
      { label: "Date", value: (o) => new Date(o.createdAt).toISOString() },
      { label: "Customer", value: (o) => o.user?.name || o.guestInfo?.name || "Guest" },
      { label: "Email", value: (o) => o.user?.email || o.guestInfo?.email || "" },
      { label: "Phone", value: (o) => o.user?.phone || o.guestInfo?.phone || "" },
      { label: "Channel", value: "channel" },
      { label: "Status", value: "status" },
      { label: "Payment Method", value: "paymentMethod" },
      { label: "Payment Status", value: "paymentStatus" },
      { label: "Items", value: (o) => o.items.length },
      { label: "Total (KSh)", value: "totalAmount" },
      { label: "Store Balance Used (KSh)", value: (o) => Number(o.storeBalanceApplied || 0) },
      { label: "External/COD Amount Due (KSh)", value: (o) => Math.max(0, Number(o.totalAmount || 0) - Number(o.storeBalanceApplied || 0)) },
      { label: "Unfulfilled Order Value Returned (KSh)", value: (o) => o.storeBalanceCreditedAt ? Number(o.storeBalanceCreditedAmount ?? o.totalAmount ?? 0) : 0 },
      { label: "Completed Return Balance Issued (KSh)", value: (o) => (o.returnRequests || []).filter((request) => request.storeBalanceIssuedAt).reduce((sum, request) => sum + Number(request.storeBalanceAmount || 0), 0) },
      { label: "Guest Balance Claim", value: "storeBalanceClaimStatus" },
      { label: "Delivery Area", value: "deliveryArea" },
      { label: "County", value: (o) => o.deliveryCorrection?.county || o.deliveryCounty },
      { label: "Town", value: (o) => o.deliveryCorrection?.town || o.deliveryTown },
      { label: "Parcel Company", value: (o) => o.deliveryRoute?.carrier || "" },
      { label: "Parcel Office", value: (o) => o.deliveryRoute?.officeName || "" },
      { label: "Parcel Charge (KSh)", value: (o) => o.deliveryArea === "nairobi-cbd" ? "" : o.deliveryFee },
      { label: "Delivery Address", value: (o) => o.deliveryCorrection?.address || o.deliveryAddress },
      { label: "Delivery Instructions", value: "deliveryInstructions" },
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="orders-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/review", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validPhone = /^(?:254|0)?[17]\d{8}$/;
    const flagsQuery = [
      {
        user: null,
        $or: [
          { "guestInfo.name": { $exists: false } },
          { "guestInfo.name": "" },
          { "guestInfo.name": /^\d+$/ },
          { "guestInfo.email": { $not: validEmail } },
          { "guestInfo.phone": { $not: validPhone } },
        ],
      },
      { paymentMethod: { $in: ["cod", "cash_on_delivery", "cash on delivery"] }, status: { $in: ["shipped", "ready_for_collection"] } },
      { paymentMethod: { $nin: ["cod", "mpesa", "paystack", "cash_on_delivery", "cash on delivery"] }, status: { $in: ["shipped", "ready_for_collection", "collected", "delivered"] } },
      { paymentMethod: { $in: ["mpesa", "paystack"] }, paymentStatus: { $ne: "paid" }, status: { $in: ["confirmed", "shipped", "ready_for_collection", "collected", "delivered"] } },
      { paymentStatus: { $in: ["unpaid", "failed"] }, paymentAttempts: { $elemMatch: { status: "paid" } } },
      { paymentStatus: "paid", $or: [{ receiptNumber: { $exists: false } }, { receiptNumber: "" }] },
      { additionalPaymentRefunds: { $elemMatch: { status: "refund_pending" } } },
      { cancellationRequests: { $elemMatch: { status: "pending" } } },
      { deliveryIssueRequests: { $elemMatch: { status: { $in: ["open", "investigating"] } } } },
      { status: { $in: ["cancelled", "expired", "unavailable"] }, paymentStatus: "paid", storeBalanceCreditedAt: null },
      { status: { $in: ["cancelled", "expired", "unavailable"] }, stockReservedAt: { $ne: null }, stockRestoredAt: null },
      { deliveryCorrection: { $exists: false }, $or: [{ deliveryAddress: { $exists: false } }, { deliveryAddress: "" }, { deliveryCounty: { $exists: false } }, { deliveryCounty: "" }, { deliveryTown: { $exists: false } }, { deliveryTown: "" }] },
    ];
    const invalidCustomerUsers = await User.find({
      $or: [
        { name: { $not: /\p{L}/u } },
        { email: { $not: validEmail } },
        { phone: { $not: validPhone } },
      ],
    }).select("_id");
    if (invalidCustomerUsers.length) flagsQuery.push({ user: { $in: invalidCustomerUsers.map((user) => user._id) } });
    const filter = { $or: flagsQuery };
    const { search, page, limit } = parseListQuery(req.query);
    if (search) {
      const escaped = escapeRegex(search);
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
          { phone: { $regex: escaped, $options: "i" } },
        ],
      }).select("_id");
      filter.$and = [{
        $or: [
          { "guestInfo.name": { $regex: escaped, $options: "i" } },
          { "guestInfo.email": { $regex: escaped, $options: "i" } },
          { "guestInfo.phone": { $regex: escaped, $options: "i" } },
          { user: { $in: matchingUsers.map((user) => user._id) } },
        ],
      }];
    }
    const [orders, total] = await Promise.all([
      Order.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ orders: await Promise.all(orders.map(withReviewFlags)), total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get("/my", protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).populate("replacementOrder", "status totalAmount replacementPriceDifference").sort({ createdAt: -1 });
    await Promise.all(orders.map(normalizeUnconfirmedPaystackSettlement));
    res.json(orders.map(customerOrderView));
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/track?contact=<phone-or-email> - public order lookup, no login required.
// Requires the order id AND a matching contact so an order can't be looked up by ID alone.
router.get("/:id/track", orderLookupLimiter, async (req, res, next) => {
  try {
    const contact = queryText(req.query.contact, 254);
    if (!contact) {
      return res.status(400).json({ message: "Enter the phone or email used for this order" });
    }

    const order = await Order.findById(req.params.id).populate("user", "name email phone").populate("replacementOrder", "status totalAmount replacementPriceDifference");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const normalizedEmailInput = contact.trim().toLowerCase();
    const normalizedPhoneInput = normalizePhone(contact);

    const ownerEmails = [order.user?.email, order.guestInfo?.email].filter(Boolean).map((e) => e.toLowerCase());
    const ownerPhones = [order.user?.phone, order.guestInfo?.phone].filter(Boolean).map((p) => normalizePhone(p));

    // Deliberately vague on mismatch — same message as a genuinely missing
    // order, so this can't be used to confirm whether an order id is real.
    if (!ownerEmails.includes(normalizedEmailInput) && !ownerPhones.includes(normalizedPhoneInput)) {
      return res.status(404).json({ message: "Order not found" });
    }

    await normalizeUnconfirmedPaystackSettlement(order);
    res.json(customerOrderView(order));
  } catch (err) {
    next(err);
  }
});

// GET /api/orders - admin only, all orders
router.get("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { status: rawStatus } = req.query;
    const { search, page, limit } = parseListQuery(req.query);
    const status = typeof rawStatus === "string" ? rawStatus : "";
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const trimmed = search;
      // Guest orders store the name directly; registered-customer orders
      // only store a `user` ref, so their name lives on the User collection
      // and has to be looked up separately before it can be matched here.
      const escaped = escapeRegex(trimmed);
      const matchingUsers = await User.find({ name: { $regex: escaped, $options: "i" } }).select("_id");

      filter.$or = [
        { "guestInfo.name": { $regex: escaped, $options: "i" } },
        { user: { $in: matchingUsers.map((u) => u._id) } },
        // Matches the short reference shown in the UI (last 6 chars of _id).
        { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: escaped, options: "i" } } },
      ];
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(filter).populate("user", "name email phone storeBalance").populate("replacementOrder", "status totalAmount paymentStatus replacementPriceDifference storeBalanceApplied storeBalanceStatus").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ orders: await Promise.all(orders.map(withReviewFlags)), total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id/customer-details",
  protect,
  requireRole("admin"),
  [
    body("name").isString().trim().isLength({ min: 2, max: 100 }).custom(hasValidPersonName).withMessage("Enter a customer name"),
    body("email").isEmail().withMessage("Enter a valid email address"),
    body("phone").isString().trim().custom((phone) => hasValidKenyanMobile(phone)).withMessage("Enter a valid Kenyan mobile number"),
    body("reason").isString().trim().isLength({ min: 5, max: 500 }).withMessage("Explain why these customer details are being corrected"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const order = await Order.findOne({ _id: req.params.id, user: null });
      if (!order) return res.status(404).json({ message: "Guest order not found" });
      const previous = {
        name: order.guestInfo?.name || "",
        email: order.guestInfo?.email || "",
        phone: order.guestInfo?.phone || "",
      };
      const next = {
        name: req.body.name.trim(),
        email: req.body.email.trim().toLowerCase(),
        phone: normalizePhone(req.body.phone),
      };
      const changes = Object.keys(next)
        .filter((field) => previous[field] !== next[field])
        .map((field) => ({ field, before: previous[field], after: next[field] }));
      if (!changes.length) return res.status(400).json({ message: "No customer detail changes were made" });
      order.guestInfo = { ...(order.guestInfo || {}).toObject?.(), ...next };
      if (order.storeBalanceClaimStatus === "pending") {
        const PendingStoreBalance = require("../models/PendingStoreBalance");
        await PendingStoreBalance.updateMany({ order: order._id, claimedAt: null }, { $set: { email: next.email } });
      }
      order.adminCorrections.push({ type: "customer_details", reason: req.body.reason.trim(), changes, actor: req.user._id });
      order.events.push({ type: "customer_details_corrected", label: "Customer contact corrected", note: req.body.reason.trim(), actor: req.user._id });
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-details-updated", order);
      res.json(await withReviewFlags(order));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/:id/destination",
  protect,
  requireRole("admin"),
  [
    body("address").isString().trim().isLength({ min: 8, max: 1000 }).withMessage("Enter a complete delivery address"),
    body("county").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Enter the destination county"),
    body("town").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Enter the destination town or area"),
    body("reason").isString().trim().isLength({ min: 5, max: 500 }).withMessage("Explain why this destination is being corrected"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (["collected", "delivered", "cancelled"].includes(order.status)) return res.status(409).json({ message: "The destination cannot be changed after the order is completed or cancelled" });
      const previous = {
        address: order.deliveryCorrection?.address || order.deliveryAddress || "",
        county: order.deliveryCorrection?.county || order.deliveryCounty || "",
        town: order.deliveryCorrection?.town || order.deliveryTown || "",
      };
      const next = { address: req.body.address.trim(), county: req.body.county.trim(), town: req.body.town.trim() };
      const changes = Object.keys(next).filter((field) => previous[field] !== next[field]).map((field) => ({ field, before: previous[field], after: next[field] }));
      if (!changes.length) return res.status(400).json({ message: "No destination changes were made" });
      order.deliveryCorrection = { ...order.deliveryCorrection?.toObject?.(), ...next, reason: req.body.reason.trim(), actor: req.user._id, correctedAt: new Date() };
      order.adminCorrections.push({ type: "delivery_destination", reason: req.body.reason.trim(), changes, actor: req.user._id });
      order.events.push({ type: "delivery_destination_corrected", label: "Delivery destination corrected", note: req.body.reason.trim(), actor: req.user._id });
      await order.save();
      emitOrderEvent(req.app.get("io"), "order-details-updated", order);
      res.json(await withReviewFlags(order));
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/orders/:id/payment-status - admin only. Used to record cash
// collected for a COD order or to correct an unpaid/failed state. Online
// payments can only be confirmed by the provider.
router.put("/:id/payment-status", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Payment status must be submitted as an object" });
    const { paymentStatus } = req.body;
    if (!["unpaid", "paid", "failed"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }
    let order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.paymentTestMode) return res.status(409).json({ message: "This payment cannot be manually confirmed. Contact support to review it." });
    if (["unpaid", "failed"].includes(paymentStatus) && order.paymentStatus === paymentStatus) return res.json(order);
    const originalStatus = order.status;
    const originalPaymentStatus = order.paymentStatus;
    const update = { $set: { paymentStatus } };

    if (paymentStatus === "paid") {
      if (!isCodOrder(order)) {
        return res.status(409).json({ message: "Online payments can only be confirmed by the payment provider." });
      }
      if (["cancelled", "expired", "unavailable"].includes(order.status)) return res.status(409).json({ message: "Ended or unavailable orders cannot be manually marked paid. Resolve the order with the customer first." });
      if (order.status === "pending") return res.status(409).json({ message: "Confirm item availability before recording payment for this order." });
      if (order.paymentStatus === "refunded" || order.paymentStatus === "refund_pending") return res.status(409).json({ message: "A settled or refund-review order cannot be marked paid again" });
      if (isCodOrder(order) && !["collected", "delivered"].includes(order.status)) return res.status(409).json({ message: "Record COD payment when the order is delivered" });
      if (order.paymentStatus === "paid") return res.json(order);
      const receivedAt = new Date();
      update.$set.receiptNumber = order.receiptNumber || `AS-R-${order._id.toString().slice(-8).toUpperCase()}`;
      update.$set.receiptIssuedAt = receivedAt;
      update.$push = { events: { type: "payment_received", label: "Payment received", actor: req.user._id, createdAt: receivedAt } };
    } else if (paymentStatus === "failed") {
      if (["paid", "refund_pending", "refunded"].includes(order.paymentStatus)) return res.status(409).json({ message: "A settled payment cannot be changed to failed" });
      order.paymentStatus = "failed";
      // Failed attempts remain active and stock remains reserved so payment can be retried.
    } else if (order.paymentStatus === "paid") {
      return res.status(409).json({ message: "A settled payment cannot be reset to unpaid" });
    } else if (["refund_pending", "refunded"].includes(order.paymentStatus)) {
      return res.status(409).json({ message: "A refund state cannot be reset to unpaid" });
    } else if (order.paymentStatus !== "paid") {
      order.paymentStatus = "unpaid";
    }
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: originalStatus, paymentStatus: originalPaymentStatus },
      update,
      { new: true, runValidators: true }
    );
    if (!updatedOrder) return res.status(409).json({ message: "The order's payment changed while you were updating it. Refresh and review its latest status." });
    order = updatedOrder;

    if (paymentStatus === "paid") {
      const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
      if (recipientEmail) {
        const message = `Payment for order #${order._id.toString().slice(-6).toUpperCase()} is confirmed. ${order.user ? "Your receipt is available in your account's Billing section." : "Please keep this email for your records."}`;
        sendOrderUpdateEmail(recipientEmail, order, "Payment received", message).catch((err) => console.error("Payment email failed:", err.message));
      }
    }

    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);

    res.json(order);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/additional-payment-refunds/:reference", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Invalid refund details" });
    const refundReference = typeof req.body.refundReference === "string" ? req.body.refundReference.trim() : "";
    if (!refundReference || refundReference.length > 200) return res.status(400).json({ message: "Enter a refund transaction reference of 200 characters or fewer" });
    const orderId = req.params.id;
    const paymentReference = req.params.reference;
    const refundedAt = new Date();
    const note = `${paymentReference} - refund ${refundReference}`;
    let order = await Order.findOneAndUpdate(
      { _id: orderId, additionalPaymentRefunds: { $elemMatch: { reference: paymentReference, status: "refund_pending" } } },
      {
        $set: { "additionalPaymentRefunds.$.status": "refunded", "additionalPaymentRefunds.$.refundReference": refundReference, "additionalPaymentRefunds.$.refundedAt": refundedAt },
        $push: { events: { type: "additional_payment_refunded", label: "Additional payment refunded", note, actor: req.user._id } },
      },
      { new: true, runValidators: true }
    );
    if (!order) {
      order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      const duplicate = order.additionalPaymentRefunds.find((payment) => payment.reference === paymentReference);
      if (!duplicate) return res.status(404).json({ message: "Additional payment not found" });
      if (duplicate.status === "refunded") return res.json(order);
      return res.status(409).json({ message: "The refund changed while you were recording it. Refresh and review its latest status." });
    }
    const duplicate = order.additionalPaymentRefunds.find((payment) => payment.reference === paymentReference);
    await require("../models/UnmatchedPayment").updateOne(
      { reference: duplicate.reference, order: order._id, status: "refund_pending" },
      { $set: { status: "refunded", resolutionNote: `Refund recorded with reference ${refundReference}`, resolvedBy: req.user._id, resolvedAt: new Date() } }
    );
    const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
    if (recipientEmail) sendOrderUpdateEmail(recipientEmail, order, "Additional payment refunded", `An additional payment was returned. Refund reference: ${refundReference}. Your original order payment remains confirmed.`).catch((err) => console.error("Additional payment refund email failed:", err.message));
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);
    res.json(order);
  } catch (err) { next(err); }
});

// PUT /api/orders/:id/status - admin only
router.put("/:id/status", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Invalid order update" });
    const textLimits = { cancellationReason: 500, parcelReference: 200, collectionBranch: 200, deliveryRecipient: 120, deliveryNote: 500, unavailabilityReason: 500 };
    for (const [field, limit] of Object.entries(textLimits)) {
      if (req.body[field] !== undefined && req.body[field] !== null && (typeof req.body[field] !== "string" || req.body[field].length > limit)) {
        return res.status(400).json({ message: `${field} must be text of ${limit} characters or fewer` });
      }
    }
    if (req.body.codCashReceived !== undefined && typeof req.body.codCashReceived !== "boolean") return res.status(400).json({ message: "Confirm cash receipt with a boolean value" });
    if (req.body.codCashAmount !== undefined && (!Number.isFinite(Number(req.body.codCashAmount)) || Number(req.body.codCashAmount) < 0)) return res.status(400).json({ message: "Enter a valid cash amount" });
    const { status, cancellationReason, parcelReference, collectionBranch, deliveryRecipient, deliveryNote, codCashReceived, codCashAmount } = req.body;
    const allowedStatuses = ["pending", "confirmed", "shipped", "ready_for_collection", "collected", "delivered", "cancelled", "expired", "unavailable"];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ message: "Invalid order status" });
    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    await normalizeUnconfirmedPaystackSettlement(existing);
    if (existing.paymentTestMode && status !== existing.status) {
      return res.status(409).json({ message: "Payment confirmation is required before this order can be moved into fulfillment." });
    }
    if (status !== existing.status && existing.cancellationRequests?.some((request) => request.status === "pending")) {
      return res.status(409).json({ message: "Resolve the customer's cancellation request before changing this order" });
    }

    const allowedNextStatuses = {
      pending: ["confirmed", "cancelled", "unavailable"],
      confirmed: ["shipped", "delivered", "cancelled", "unavailable"],
      shipped: ["ready_for_collection", "cancelled"],
      ready_for_collection: ["collected", "cancelled"],
      collected: [],
      delivered: [],
      cancelled: [],
      unavailable: ["cancelled"],
    };
    if (status !== existing.status && !allowedNextStatuses[existing.status]?.includes(status)) {
      return res.status(409).json({ message: `Cannot move an order from ${existing.status} to ${status}` });
    }
    if (status === existing.status) {
      if (["cancelled", "unavailable", "expired"].includes(status) && existing.paymentStatus === "paid" && !existing.storeBalanceCreditedAt) {
        const reason = status === "unavailable" ? "Paid order unavailable" : status === "expired" ? "Late payment after order expiry" : "Paid order cancelled";
        const credit = await creditPaidOrderToStoreBalance(existing, reason);
        if (!credit.duplicate) {
          existing.events.push({ type: "store_balance_issued", label: "Value added to Store Balance", note: customerStoreBalanceMessage(existing) });
          const recipientEmail = existing.user ? (await User.findById(existing.user))?.email : existing.guestInfo?.email;
          if (recipientEmail) sendOrderUpdateEmail(recipientEmail, existing, "Order value added to Store Balance", `${customerStoreBalanceMessage(existing)} This order will not be dispatched. Store Balance can be used toward a future order; cash refunds are not offered.`).catch((err) => console.error("Recovered Store Balance email failed:", err.message));
        }
        await existing.save();
      } else if (["cancelled", "unavailable", "expired"].includes(status) && existing.paymentStatus !== "paid" && existing.storeBalanceStatus !== "released") {
        await releaseOrderBalance(existing);
        await existing.save();
      }
      if (["cancelled", "unavailable", "expired"].includes(status) && existing.stockReservedAt && !existing.stockRestoredAt) {
        await restoreOrderStockOnce(existing);
      }
      return res.json(existing);
    }

    const codOrder = isCodOrder(existing);
    if (["shipped", "ready_for_collection", "collected", "delivered"].includes(status) && !codOrder && existing.paymentStatus !== "paid") {
      return res.status(409).json({ message: "Confirm payment before processing or dispatching an online order" });
    }
    if (["shipped", "ready_for_collection"].includes(status) && (codOrder || existing.deliveryArea !== "other")) {
      return res.status(409).json({ message: "Only parcel orders can be shipped to a collection office" });
    }
    if (codOrder && status === "delivered" && (existing.deliveryArea !== "nairobi-cbd" || existing.status === "shipped" || existing.status === "ready_for_collection")) {
      return res.status(409).json({ message: "This COD order is outside the direct Nairobi CBD delivery flow. Review and correct the order before completing it." });
    }
    if (status === "collected" && existing.deliveryArea !== "other") {
      return res.status(409).json({ message: "Only parcel orders can be marked collected" });
    }
    if (status === "collected" && !["shipped", "ready_for_collection"].includes(existing.status)) {
      return res.status(409).json({ message: "Parcel orders must be dispatched and marked ready for collection before collection" });
    }
    if (status === "collected" && existing.deliveryArea === "other" && !existing.parcelReference) {
      return res.status(409).json({ message: "Record a parcel reference before marking the order collected" });
    }
    if (status === "delivered" && existing.deliveryArea === "other") {
      return res.status(409).json({ message: "Parcel orders are completed when the customer collects the parcel" });
    }
    if (status === "shipped" && !parcelReference?.trim() && !existing.parcelReference) {
      return res.status(400).json({ message: "Enter the parcel tracking or booking reference before dispatch" });
    }
    if (status === "ready_for_collection" && !collectionBranch?.trim() && !existing.collectionBranch) return res.status(400).json({ message: "Enter the parcel collection branch" });
    const recipientName = String(deliveryRecipient || "").trim().slice(0, 120);
    const handoverNote = String(deliveryNote || "").trim().slice(0, 500);
    if (["collected", "delivered"].includes(status) && !recipientName) return res.status(400).json({ message: "Record the name of the person who received or collected the order" });
    const expectedCodCash = Math.max(0, Math.round((Number(existing.totalAmount || 0) - Number(existing.storeBalanceApplied || 0)) * 100) / 100);
    if (status === "delivered" && codOrder && existing.paymentStatus !== "paid" && expectedCodCash > 0 && (
      codCashReceived !== true || !Number.isFinite(Number(codCashAmount)) || Math.abs(Number(codCashAmount) - expectedCodCash) > 0.009
    )) return res.status(400).json({ message: `Confirm receipt of the exact KSh ${expectedCodCash.toLocaleString()} cash due before recording this COD delivery.` });
    if (status === "cancelled" && !cancellationReason?.trim() && !existing.cancellationReason) {
      return res.status(400).json({ message: "Record a cancellation reason" });
    }
    const unavailableItemIndexes = Array.isArray(req.body.unavailableItemIndexes)
      ? [...new Set(req.body.unavailableItemIndexes.map(Number))]
      : [];
    const unavailabilityReason = String(req.body.unavailabilityReason || "").trim().slice(0, 500);
    if (status === "unavailable") {
      if (!unavailableItemIndexes.length || unavailableItemIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= existing.items.length)) {
        return res.status(400).json({ message: "Select at least one unavailable order item" });
      }
      if (!unavailabilityReason) return res.status(400).json({ message: "Record why the selected item cannot be supplied" });
    }
    if (["cancelled", "unavailable"].includes(status) && existing.availabilityConfirmationInProgress) {
      return res.status(409).json({ message: "Availability confirmation is in progress. Refresh and try again." });
    }
    const recordCodPayment = codOrder && ["collected", "delivered"].includes(status) && existing.paymentStatus !== "paid";
    if (["shipped", "ready_for_collection", "collected", "delivered"].includes(status)) {
      const lateOnlinePayment = !codOrder
        && existing.paymentStatus === "paid"
        && existing.stockReservedUntil
        && existing.receiptIssuedAt
        && existing.receiptIssuedAt > existing.stockReservedUntil;
      if (lateOnlinePayment) {
        return res.status(409).json({ message: "This payment arrived after the stock reservation expired. The order cannot be dispatched; its value must be resolved through Store Balance." });
      }
      const transitionFilter = {
        _id: existing._id,
        status: existing.status,
        cancellationRequests: { $not: { $elemMatch: { status: "pending" } } },
      };
      if (!codOrder) {
        transitionFilter.paymentStatus = "paid";
        if (existing.stockReservedUntil) {
          // If a provider callback settles while this transition is in flight,
          // only allow dispatch when its atomic receipt timestamp is within
          // the reservation window. Null remains valid for legacy paid orders.
          transitionFilter.$or = [
            { receiptIssuedAt: { $lte: existing.stockReservedUntil } },
            { receiptIssuedAt: null },
          ];
        }
      }
      const transitionSet = { status };
      if (status === "shipped" && parcelReference?.trim()) transitionSet.parcelReference = parcelReference.trim();
      if (status === "ready_for_collection" && collectionBranch?.trim()) transitionSet.collectionBranch = collectionBranch.trim();
      if (["collected", "delivered"].includes(status) && !existing.deliveredAt) transitionSet.deliveredAt = new Date();
      if (["collected", "delivered"].includes(status)) {
        transitionSet.deliveryConfirmation = {
          recipientName,
          note: handoverNote,
          paymentCollectedAmount: recordCodPayment ? expectedCodCash : 0,
          confirmedAt: new Date(),
          confirmedBy: req.user._id,
        };
      }
      if (recordCodPayment) {
        transitionSet.paymentStatus = "paid";
        transitionSet.receiptNumber = existing.receiptNumber || `AS-R-${existing._id.toString().slice(-8).toUpperCase()}`;
        transitionSet.receiptIssuedAt = new Date();
      }
      const transitionUpdate = { $set: transitionSet };
      if (recordCodPayment) transitionUpdate.$push = { events: { type: "payment_received", label: "COD collected", actor: req.user._id } };
      const transitionClaim = await Order.updateOne(transitionFilter, transitionUpdate);
      if (!transitionClaim.modifiedCount) return res.status(409).json({ message: "The order changed while you were updating it. Refresh and try again." });
      if (recordCodPayment) {
        existing.paymentStatus = "paid";
        existing.receiptNumber = transitionSet.receiptNumber;
        existing.receiptIssuedAt = transitionSet.receiptIssuedAt;
      }
      if (transitionSet.deliveryConfirmation) existing.deliveryConfirmation = transitionSet.deliveryConfirmation;
    }
    if (["cancelled", "unavailable"].includes(status)) {
      const cancellationClaim = await Order.updateOne(
        {
          _id: existing._id,
          status: existing.status,
          availabilityConfirmationInProgress: { $ne: true },
          cancellationRequests: { $not: { $elemMatch: { status: "pending" } } },
        },
        { $set: { status } }
      );
      if (!cancellationClaim.modifiedCount) return res.status(409).json({ message: "The order changed while you were updating it. Refresh and try again." });
    }

    if (status === "confirmed" && existing.status === "pending") {
      const confirmedAt = new Date();
      const claim = await Order.updateOne(
        {
          _id: existing._id,
          status: "pending",
          availabilityConfirmationInProgress: { $ne: true },
          cancellationRequests: { $not: { $elemMatch: { status: "pending" } } },
        },
        { $set: { availabilityConfirmationInProgress: true } }
      );
      if (!claim.modifiedCount) return res.status(409).json({ message: "The order changed or has a pending cancellation request. Refresh and resolve it before confirming availability." });
      if (existing.stockNeedsReservation) {
        try {
          await reserveOrderStock(existing.items, existing._id);
          existing.stockReservationTracked = true;
        } catch (error) {
          if (error.statusCode === 409) {
            await Order.updateOne({ _id: existing._id }, { $set: { availabilityConfirmationInProgress: false } });
          }
          return res.status(error.statusCode || 409).json({ message: `${error.message}. The order remains awaiting availability confirmation.` });
        }
      } else if (!existing.stockReservedAt) {
        // Legacy orders had stock deducted at checkout; preserve that reservation.
        existing.stockReservedAt = existing.createdAt || confirmedAt;
      }
      existing.stockNeedsReservation = false;
      existing.availabilityConfirmationInProgress = false;
      existing.availabilityConfirmedAt = confirmedAt;
      existing.stockReservedAt = existing.stockReservedAt || confirmedAt;
      existing.stockReservedUntil = codOrder ? null : new Date(confirmedAt.getTime() + 5 * 24 * 60 * 60 * 1000);
      if (existing.storeBalanceApplied > 0 && existing.storeBalanceStatus === "reserved") {
        existing.storeBalanceStatus = "applied";
      }
      if (existing.storeBalanceApplied >= existing.totalAmount && existing.paymentStatus !== "paid") {
        existing.paymentStatus = "paid";
        existing.receiptNumber = existing.receiptNumber || `AS-R-${existing._id.toString().slice(-8).toUpperCase()}`;
        existing.receiptIssuedAt = new Date();
        existing.events.push({ type: "payment_received", label: "Paid with store balance", actor: req.user._id });
      }
    }

    existing.status = status;
    if (cancellationReason) existing.cancellationReason = cancellationReason.trim();
    if (parcelReference) existing.parcelReference = parcelReference.trim();
    if (collectionBranch) existing.collectionBranch = collectionBranch.trim();
    if (status === "cancelled" && !existing.stockNeedsReservation && !existing.stockReservedAt) {
      existing.stockReservedAt = existing.createdAt || new Date();
    }
    if (status === "unavailable") {
      if (!existing.stockNeedsReservation && !existing.stockReservedAt) existing.stockReservedAt = existing.createdAt || new Date();
      existing.availabilityIssue = { itemIndexes: unavailableItemIndexes, reason: unavailabilityReason, customerChoice: "", customerChoiceAt: null };
    }
    if (["collected", "delivered"].includes(status) && codOrder && existing.paymentStatus !== "paid") {
      existing.paymentStatus = "paid";
      existing.receiptNumber = existing.receiptNumber || `AS-R-${existing._id.toString().slice(-8).toUpperCase()}`;
      existing.receiptIssuedAt = new Date();
      existing.events.push({ type: "payment_received", label: "COD collected", actor: req.user._id });
    }
    if (["collected", "delivered"].includes(status) && !existing.deliveredAt) existing.deliveredAt = new Date();
    const parcelForEvent = parcelDestination(existing);
    const statusEventNote = status === "cancelled"
      ? existing.cancellationReason
      : status === "unavailable"
        ? unavailabilityReason
        : status === "shipped"
          ? `${parcelForEvent.description} · Reference ${existing.parcelReference}`
      : status === "ready_for_collection"
            ? `${existing.collectionBranch} · ${parcelForEvent.carrier} · Reference ${existing.parcelReference}`
            : status === "delivered"
              ? `Received by ${recipientName}${recordCodPayment ? ` · Cash received KSh ${expectedCodCash.toLocaleString()}` : ""}${handoverNote ? ` · ${handoverNote}` : ""}`
              : status === "collected"
                ? `Collected by ${recipientName}${handoverNote ? ` · ${handoverNote}` : ""}`
            : "";
    existing.events.push({
      type: `status_${status}`,
      label: status === "confirmed" ? "Availability confirmed" : status === "unavailable" ? "Availability issue" : status.replace(/_/g, " "),
      note: statusEventNote,
      actor: req.user._id,
    });
    let order = await existing.save();

    if (["shipped", "delivered", "collected"].includes(status)) {
      await commitOrderStockReservations(order);
    }

    if (["cancelled", "unavailable"].includes(status)) {
      let settledOrder = await Order.findById(order._id);
      if (settledOrder?.paymentStatus === "paid") {
        await creditPaidOrderToStoreBalance(settledOrder, status === "unavailable" ? "Paid order unavailable" : "Paid order cancelled");
        await settledOrder.save();
      } else {
        await releaseOrderBalance(settledOrder || order);
        if (settledOrder) await settledOrder.save();
      }
      // A provider callback can settle the payment while cancellation is
      // releasing the wallet reservation. Re-read and issue any paid value
      // after the release helper's own atomic payment-state check.
      settledOrder = await Order.findById(order._id);
      if (settledOrder?.paymentStatus === "paid" && !settledOrder.storeBalanceCreditedAt) {
        await creditPaidOrderToStoreBalance(settledOrder, status === "unavailable" ? "Paid order unavailable" : "Paid order cancelled");
        await settledOrder.save();
      }
      order = settledOrder || order;
    }

    // Cancelling an order releases the stock that was reserved for it —
    // but only the first time it's cancelled, so re-saving an already-
    // cancelled order doesn't double-restore stock.
    if (["cancelled", "unavailable"].includes(status)) {
      await restoreOrderStockOnce(order);
    }

    const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
    if (recipientEmail) {
      const externalAmountDue = Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0));
      const parcel = parcelDestination(order);
      const estimatedTransit = Number(order.deliveryRoute?.estimatedDays) > 0 ? ` Estimated transit time: ${Number(order.deliveryRoute.estimatedDays)} day${Number(order.deliveryRoute.estimatedDays) === 1 ? "" : "s"}.` : "";
      const labels = {
        confirmed: order.paymentStatus === "paid"
          ? ["Availability confirmed", "Availability is confirmed and payment has been received. We are preparing your order."]
          : codOrder
            ? ["Availability confirmed", externalAmountDue > 0 ? `Your items are available and reserved. KSh ${Number(order.storeBalanceApplied || 0).toLocaleString()} is covered by Store Balance. The remaining KSh ${externalAmountDue.toLocaleString()} is due at handover for this eligible Nairobi CBD order.` : "Your items are available and fully covered by Store Balance. We will arrange your Nairobi CBD delivery."]
            : ["Availability confirmed", externalAmountDue > 0 ? `Your items are available and reserved. Pay KSh ${externalAmountDue.toLocaleString()} within 5 days of this confirmation, before delivery or parcel dispatch.` : "Your items are available and fully covered by Store Balance. We are preparing your order."],
        shipped: ["Parcel dispatched", `Your parcel has been dispatched with ${parcel.carrier}${parcel.office ? ` to ${parcel.office}` : ""}${parcel.location ? ` in ${parcel.location}` : ""}.${order.parcelReference ? ` Tracking reference: ${order.parcelReference}.` : " We will share the collection reference when it is available."}${estimatedTransit} We will notify you when it is ready for collection.`],
        ready_for_collection: ["Ready for collection", `Your parcel is ready at ${order.collectionBranch || parcel.office || "the destination parcel office"}${parcel.location ? `, ${parcel.location}` : ""}.${order.parcelReference ? ` Show your ${parcel.carrier} reference, ${order.parcelReference}, when you collect it.` : ` Contact Azard Stores before travelling so we can provide your ${parcel.carrier} collection reference.`}`],
        collected: ["Order collected", `${order.deliveryConfirmation?.recipientName || "The named recipient"} collected your parcel${order.deliveryConfirmation?.note ? `. Handover note: ${order.deliveryConfirmation.note}` : ""}. Thank you for choosing Azard Stores.`],
        delivered: ["Order delivered", `Order #${order._id.toString().slice(-6).toUpperCase()} was received by ${order.deliveryConfirmation?.recipientName || "the named recipient"}${order.deliveryConfirmation?.note ? `. Handover note: ${order.deliveryConfirmation.note}` : ""}.${Number(order.deliveryConfirmation?.paymentCollectedAmount) > 0 ? ` Payment of KSh ${Number(order.deliveryConfirmation.paymentCollectedAmount).toLocaleString()} was collected.` : isCodOrder(order) ? " Your payment is recorded." : ""} ${order.user ? "Your receipt is available in your account's Billing section." : "Please keep this email for your records."} If you have not received this order, contact Azard Stores with your order number.`],
        cancelled: ["Order cancelled", `Your order was cancelled.${order.cancellationReason ? ` Reason: ${order.cancellationReason}.` : ""}${order.paymentStatus === "paid" ? ` ${customerStoreBalanceMessage(order)} Cash refunds are not offered.` : order.storeBalanceStatus === "released" && order.storeBalanceApplied > 0 ? ` KSh ${Number(order.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account.` : " No payment was collected."}`],
        unavailable: ["Availability update needed", `We could not confirm availability for ${order.availabilityIssue.itemIndexes.map((index) => order.items[index]?.name).filter(Boolean).join(", ") || "one or more items"}. ${order.availabilityIssue.reason}${order.paymentStatus === "paid" ? ` ${customerStoreBalanceMessage(order)} Contact Azard Stores if you would like to discuss a replacement.` : ` No payment is due. ${order.storeBalanceStatus === "released" && order.storeBalanceApplied > 0 ? `KSh ${Number(order.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account. ` : ""}Choose your preferred next step on the order page. Azard Stores will follow up with you.`}`],
      };
      const update = labels[status];
      if (update) sendOrderUpdateEmail(recipientEmail, order, ...update).catch((err) => console.error("Order update email failed:", err.message));
    }

    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);

    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Customer records the preferred next step for an order with an unavailable item.
router.post("/:id/availability-resolution", customerOrderActionLimiter, optionalAuth, async (req, res, next) => {
  try {
    const { choice, contact } = req.body;
    const normalizedChoice = choice === "store_credit" ? "store_balance" : choice;
    if (!["replacement", "store_balance"].includes(normalizedChoice)) return res.status(400).json({ message: "Choose a replacement or store balance" });
    const order = req.user
      ? await Order.findOne({ _id: req.params.id, user: req.user._id })
      : await Order.findOne({ _id: req.params.id, user: null });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!req.user) {
      const candidate = String(contact || "").trim();
      const emailMatches = order.guestInfo?.email && order.guestInfo.email.toLowerCase() === candidate.toLowerCase();
      const phoneMatches = order.guestInfo?.phone && normalizePhone(order.guestInfo.phone) === normalizePhone(candidate);
      if (!emailMatches && !phoneMatches) return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "unavailable" || !order.availabilityIssue?.itemIndexes?.length || ["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(order.availabilityIssue.resolutionStatus)) {
      return res.status(409).json({ message: "This order does not have an open availability issue" });
    }
    if (normalizedChoice === "store_balance" && order.paymentStatus !== "paid") return res.status(409).json({ message: "This order has not been paid, so no store balance is available. Choose a replacement instead." });
    if (order.availabilityIssue.customerChoice) return res.status(409).json({ message: "Your preference has already been sent. Azard Stores will follow up with you." });
    const choiceAt = new Date();
    const choiceFilter = {
      _id: order._id,
      status: "unavailable",
      "availabilityIssue.resolutionStatus": { $in: ["open", null] },
      "availabilityIssue.customerChoice": { $in: ["", null] },
    };
    if (normalizedChoice === "store_balance") choiceFilter.paymentStatus = "paid";
    const eventLabel = normalizedChoice === "replacement" ? "Customer requested a replacement" : "Customer requested store balance";
    const updatedOrder = await Order.findOneAndUpdate(choiceFilter, {
      $set: { "availabilityIssue.customerChoice": normalizedChoice, "availabilityIssue.customerChoiceAt": choiceAt },
      $push: { events: { type: "availability_choice_submitted", label: eventLabel, createdAt: choiceAt } },
    }, { new: true });
    if (!updatedOrder) return res.status(409).json({ message: "Your preference or this order changed. Refresh to see the latest status." });
    const recipientEmail = req.user?.email || updatedOrder.guestInfo?.email;
    const choiceLabel = normalizedChoice === "replacement" ? "a replacement" : "store balance";
    if (recipientEmail) {
      sendOrderUpdateEmail(recipientEmail, updatedOrder, "Your preference is recorded", `We recorded your request for ${choiceLabel}. Check the order updates for the next step. No payment is due while this availability issue is being resolved.`).catch((err) => console.error("Availability choice email failed:", err.message));
    }
    const io = req.app.get("io");
    emitOrderEvent(io, "order-resolution-updated", updatedOrder, { availabilityIssue: updatedOrder.availabilityIssue });
    return res.json(customerOrderView(updatedOrder));
  } catch (err) {
    next(err);
  }
});

// Admin records the agreed follow-up after contacting the customer. Paid
// replacement or Store Balance outcomes recover the idempotent balance credit;
// this route never changes the unavailable order's items or amount.
router.put("/:id/availability-resolution", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { outcome, customerMessage } = req.body;
    if (!["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(outcome)) {
      return res.status(400).json({ message: "Record a replacement or store balance arrangement" });
    }
    const message = String(customerMessage || "").trim().slice(0, 500);
    if (!message) return res.status(400).json({ message: "Add a short message for the customer" });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "unavailable" || !order.availabilityIssue?.itemIndexes?.length) {
      return res.status(409).json({ message: "This order has no availability issue to resolve" });
    }
    if (["replacement_arranged", "store_credit_arranged", "store_balance_issued"].includes(order.availabilityIssue.resolutionStatus)) {
      return res.status(409).json({ message: "A resolution has already been recorded" });
    }
    if (["store_balance_issued", "replacement_arranged"].includes(outcome) && order.paymentStatus === "paid") {
      await creditPaidOrderToStoreBalance(order, outcome === "replacement_arranged" ? "Paid order value reserved for replacement" : "Paid order unavailable");
    }
    if (outcome === "store_balance_issued" && order.paymentStatus !== "paid") {
      return res.status(409).json({ message: "Only a paid order can be credited to Store Balance" });
    }
    const resolvedAt = new Date();
    const label = outcome === "replacement_arranged" ? "Replacement arranged" : outcome === "store_balance_issued" ? "Store balance issued" : "Store credit arranged";
    const resolutionClaim = await Order.updateOne(
      { _id: order._id, status: "unavailable", "availabilityIssue.resolutionStatus": { $in: ["open", null] } },
      {
        $set: {
          "availabilityIssue.resolutionStatus": outcome,
          "availabilityIssue.resolutionMessage": message,
          "availabilityIssue.resolvedAt": resolvedAt,
          "availabilityIssue.resolvedBy": req.user._id,
        },
        $push: { events: { type: "availability_issue_resolved", label, note: message, actor: req.user._id, createdAt: resolvedAt } },
      }
    );
    if (!resolutionClaim.modifiedCount) return res.status(409).json({ message: "Another admin recorded a resolution. Refresh the order to see its latest status." });
    const responseOrder = await Order.findById(order._id).populate("user", "name email phone storeBalance");
    if (!responseOrder) return res.status(404).json({ message: "Order not found" });
    const recipientEmail = responseOrder.user ? responseOrder.user.email : responseOrder.guestInfo?.email;
    if (recipientEmail) {
      const nextStep = outcome === "store_balance_issued"
        ? `${customerStoreBalanceMessage(responseOrder)} Use it at checkout; it is not withdrawable. `
        : outcome === "store_credit_arranged"
          ? "Azard Stores has recorded that store balance was arranged."
        : `Azard Stores has recorded that a replacement was arranged. ${responseOrder.paymentStatus === "paid" ? `${customerStoreBalanceMessage(responseOrder)} Use this balance toward the replacement order; any remaining amount will be shown before payment.` : `The original unavailable order was not paid.${responseOrder.storeBalanceStatus === "released" && responseOrder.storeBalanceApplied > 0 ? ` KSh ${Number(responseOrder.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account.` : ""}`} Follow the instructions in the message below for next steps.`;
      sendOrderUpdateEmail(recipientEmail, responseOrder, label, `${nextStep} ${message}`).catch((err) => console.error("Availability resolution email failed:", err.message));
    }
    const io = req.app.get("io");
    emitOrderEvent(io, "order-resolution-updated", responseOrder, { availabilityIssue: responseOrder.availabilityIssue });
    return res.json(responseOrder);
  } catch (err) {
    next(err);
  }
});

// Admin creates a fresh, unpaid order after agreeing a replacement with the
// customer. Prices and delivery charges are recalculated from trusted records.
router.post("/:id/replacement-order", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const original = await Order.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Original order not found" });
    if (original.status !== "unavailable" || original.availabilityIssue?.resolutionStatus !== "replacement_arranged") {
      return res.status(409).json({ message: "Record an agreed replacement before creating a replacement order" });
    }
    const replacementRootId = original.replacementRoot || original._id;
    const replacementRoot = replacementRootId.equals(original._id) ? original : await Order.findById(replacementRootId);
    if (!replacementRoot || replacementRoot.status !== "unavailable") return res.status(409).json({ message: "The original order chain is no longer open for a replacement" });
    if (!Array.isArray(req.body.items) || req.body.items.length < 1 || req.body.items.length > 30) {
      return res.status(400).json({ message: "Add at least one replacement item" });
    }
    const activeReplacementStatuses = ["pending", "confirmed", "shipped", "ready_for_collection", "collected", "delivered"];
    const activeDescendant = await Order.findOne({
      $or: [{ replacementRoot: replacementRootId }, { replacementFor: replacementRootId }],
      status: { $in: activeReplacementStatuses },
    }).select("_id");
    if (activeDescendant) return res.status(409).json({ message: "An active replacement order already exists in this order chain" });
    if (replacementRoot.replacementOrder) {
      const previous = await Order.findById(replacementRoot.replacementOrder).select("status paymentStatus");
      if (previous && activeReplacementStatuses.includes(previous.status)) {
        return res.status(409).json({ message: "A replacement order is already active in this order chain" });
      }
      if (previous?.paymentStatus === "paid") return res.status(409).json({ message: "The previous replacement order is paid and cannot be replaced" });
      if (previous?.status === "unavailable" && !previous._id.equals(original._id)) {
        return res.status(409).json({ message: "Resolve the latest unavailable replacement order with the customer before creating another order" });
      }
    }
    if (!replacementRoot._id.equals(original._id) && String(replacementRoot.replacementOrder || "") !== String(original._id)) {
      return res.status(409).json({ message: "Only the latest unavailable order in the chain can create the next replacement" });
    }

    const settings = await Settings.findOne();
    const deliveryInput = req.body.delivery || {};
    let deliveryArea = original.deliveryArea;
    let deliveryCounty = original.deliveryCorrection?.county || original.deliveryCounty;
    let deliveryTown = original.deliveryCorrection?.town || original.deliveryTown;
    let deliveryAddress = original.deliveryCorrection?.address || original.deliveryAddress;
    let deliveryInstructions = original.deliveryInstructions || "";
    let deliveryFee = original.deliveryFee || 0;
    let deliveryRoute = original.deliveryRoute?.toObject?.() || original.deliveryRoute || {};
    let cbdDeliveryConfirmed = original.cbdDeliveryConfirmed;

    if (deliveryInput.keepCurrent === false) {
      if (deliveryInput.routeId === "nairobi-cbd") {
        deliveryArea = "nairobi-cbd";
        deliveryCounty = "Nairobi";
        deliveryTown = "Nairobi CBD";
        deliveryAddress = String(deliveryInput.address || "").trim();
        if (deliveryAddress.length < 8) return res.status(400).json({ message: "Enter the new Nairobi CBD delivery address" });
        deliveryInstructions = String(deliveryInput.instructions || "").trim().slice(0, 1000);
        deliveryFee = settings?.deliveryFee || 0;
        deliveryRoute = { serviceType: "direct", carrier: "", officeName: "", officeAddress: "", estimatedDays: null };
        cbdDeliveryConfirmed = true;
      } else {
        const route = settings?.deliveryRoutes?.find((candidate) => candidate.active && candidate._id.toString() === String(deliveryInput.routeId || ""));
        if (!route) return res.status(400).json({ message: "Choose an active delivery route" });
        deliveryArea = route.serviceType === "direct" ? "nairobi-direct" : "other";
        deliveryCounty = route.county;
        deliveryTown = route.town;
        if (route.serviceType === "direct" && route.county.toLowerCase() !== "nairobi") return res.status(400).json({ message: "Direct delivery routes must be within Nairobi County" });
        deliveryAddress = route.serviceType === "direct" ? String(deliveryInput.address || "").trim() : route.officeAddress;
        if (route.serviceType === "direct" && deliveryAddress.length < 8) return res.status(400).json({ message: "Enter the new direct delivery address" });
        deliveryInstructions = String(deliveryInput.instructions || "").trim().slice(0, 1000);
        deliveryFee = route.fee;
        deliveryRoute = { serviceType: route.serviceType || "parcel", carrier: route.carrier, officeName: route.officeName, officeAddress: route.officeAddress, estimatedDays: route.estimatedDays };
        cbdDeliveryConfirmed = false;
      }
    }

    let paymentMethod = String(req.body.paymentMethod || original.paymentMethod || "").trim().toLowerCase();
    if (!["cod", "mpesa", "paystack", "store_balance"].includes(paymentMethod)) return res.status(400).json({ message: "Choose a supported payment method" });

    if (req.body.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) return res.status(400).json({ message: "Replacement items must be valid product entries" });
    const productIds = [...new Set(req.body.items.map((item) => String(item.productId || "")))];
    if (productIds.some((id) => !/^[a-f\d]{24}$/i.test(id))) return res.status(400).json({ message: "A replacement item is invalid" });
    const activeShops = await Shop.find({ isActive: true }).select("_id name shopNumber").lean();
    const activeShopIds = activeShops.map((shop) => shop._id);
    const activeShopsById = new Map(activeShops.map((shop) => [shop._id.toString(), shop]));
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select("+inventoryLocations");
    const orderItems = [];
    const allocatedStock = new Map();
    for (const item of req.body.items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ message: "Replacement quantities must be between 1 and 99" });
      const product = products.find((entry) => entry._id.toString() === String(item.productId));
      if (!product) return res.status(409).json({ message: "A replacement product is no longer available" });
      const variant = item.variantId ? product.variants.find((entry) => entry._id.toString() === String(item.variantId)) : null;
      if (item.variantId && !variant) return res.status(409).json({ message: `The selected option for ${product.name} is no longer available` });
      if (!variant && product.variants.length) return res.status(400).json({ message: `Choose an option for ${product.name}` });
      const stockKey = `${product._id}:${variant?._id || "base"}`;
      if (!allocatedStock.has(stockKey)) allocatedStock.set(stockKey, new Map());
      const allocations = allocateStock(product, variant?._id || null, quantity, activeShops, allocatedStock.get(stockKey));
      if (!allocations) {
        const eligibleLocations = shopStockEntries(product, variant?._id || null, activeShopIds);
        const hasUnconfirmedStock = eligibleLocations.some((location) => !Number.isInteger(location.stock));
        const stock = eligibleLocations
          .filter((location) => Number.isInteger(location.stock))
          .reduce((sum, location) => sum + location.stock, 0);
        return res.status(409).json({
          message: hasUnconfirmedStock
            ? `Availability for ${product.name}${variant ? ` (${variant.name})` : ""} has not been confirmed at every active shop. Please contact Azard Stores before ordering.`
            : `Only ${stock} of ${product.name}${variant ? ` (${variant.name})` : ""} currently appear available`,
        });
      }
      for (const allocation of allocations) {
        const shop = allocation.shop || activeShopsById.get(String(product.shop));
        if (!shop) return res.status(409).json({ message: "Replacement stock is assigned to a shop that is no longer active" });
        orderItems.push({
          product: product._id,
          shopId: shop._id,
          productShopId: product.shop,
          shopName: shop.name,
          shopNumber: shop.shopNumber,
          name: product.name,
          variantId: variant?._id || null,
          variantName: variant?.name || "",
          returnEligibility: product.returnEligibility || "standard",
          price: variant?.price ?? product.price,
          quantity: allocation.quantity,
          image: variant?.image || product.images[0] || "",
        });
      }
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (deliveryInput.keepCurrent === false && deliveryArea === "nairobi-cbd") {
      deliveryFee = getCbdDeliveryFee(subtotal, settings);
    }
    const totalAmount = subtotal + deliveryFee;
    const requestedBalance = Number(req.body.storeBalanceAmount || 0);
    if (!Number.isFinite(requestedBalance) || requestedBalance < 0 || requestedBalance > totalAmount) {
      return res.status(400).json({ message: "Store Balance amount must be between zero and the replacement total" });
    }
    const balanceAmount = Math.round(requestedBalance * 100) / 100;
    if (balanceAmount > 0 && !original.user) return res.status(400).json({ message: "The customer must claim their Store Balance before it can be applied to a replacement" });
    if (balanceAmount > 0) {
      const customer = await User.findById(original.user).select("storeBalance");
      if (!customer || Number(customer.storeBalance || 0) < balanceAmount) return res.status(409).json({ message: "The customer's available Store Balance has changed. Refresh the order and try again." });
    }
    const amountDue = Math.max(0, totalAmount - balanceAmount);
    if (amountDue === 0) {
      if (!original.user || paymentMethod !== "store_balance") return res.status(400).json({ message: "A fully balance-paid replacement requires the customer's account balance" });
    } else {
      if (paymentMethod === "store_balance") return res.status(400).json({ message: "Store Balance does not cover the full replacement. Choose a payment method for the remaining amount" });
      if (paymentMethod === "cod" && deliveryArea !== "nairobi-cbd") return res.status(400).json({ message: "Cash on delivery is only available for Nairobi CBD direct delivery" });
      if (paymentMethod === "cod" && (deliveryCounty.toLowerCase() !== "nairobi" || deliveryTown.toLowerCase() !== "nairobi cbd" || !cbdDeliveryConfirmed)) {
        return res.status(400).json({ message: "Confirm a Nairobi CBD delivery address before choosing cash on delivery" });
      }
      if (paymentMethod === "mpesa" && !isPaystackMpesaConfigured()) return res.status(503).json({ message: "M-Pesa via Paystack is not enabled for checkout. Confirm that M-Pesa is active on the Paystack account and set PAYSTACK_MPESA_ENABLED=true." });
      if (paymentMethod === "paystack" && !isPaystackConfigured()) return res.status(503).json({ message: "Card payment is not configured" });
    }
    const replacement = new Order({
      user: original.user,
      guestInfo: original.guestInfo,
      billingSnapshot: original.billingSnapshot,
      items: orderItems,
      totalAmount,
      deliveryFee,
      deliveryAddress,
      deliveryInstructions,
      deliveryCounty,
      deliveryTown,
      deliveryArea,
      deliveryRoute,
      cbdDeliveryConfirmed,
      channel: original.channel,
      paymentMethod,
      paymentStatus: "unpaid",
      storeBalanceApplied: balanceAmount,
      storeBalanceStatus: balanceAmount > 0 ? "reserved" : "none",
      stockNeedsReservation: true,
      replacementFor: original._id,
      replacementRoot: replacementRootId,
      replacementPriceDifference: totalAmount - original.totalAmount,
      invoiceNumber: `AS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      events: [{ type: "replacement_order_created", label: "Replacement order created", note: `Replaces unavailable order #${original._id.toString().slice(-6).toUpperCase()}. Awaiting availability confirmation; stock is not reserved and payment is not due yet.${balanceAmount > 0 ? ` KSh ${balanceAmount.toLocaleString()} Store Balance reserved; KSh ${amountDue.toLocaleString()} due after availability confirmation.` : ""}` }],
    });
    if (balanceAmount > 0) {
      await changeBalance(original.user, { amount: balanceAmount, type: "reserve", reference: `order:${replacement._id}:reserve`, orderId: replacement._id, description: "Reserved for replacement order" });
    }
    try {
      await replacement.save();
    } catch (saveError) {
      if (balanceAmount > 0) await changeBalance(original.user, { amount: balanceAmount, type: "release", reference: `order:${replacement._id}:create-failure-release`, orderId: replacement._id, description: "Replacement order could not be created" });
      throw saveError;
    }

    async function discardUnlinkedReplacement() {
      if (balanceAmount > 0) await changeBalance(original.user, { amount: balanceAmount, type: "release", reference: `order:${replacement._id}:link-failure-release`, orderId: replacement._id, description: "Replacement order could not be linked" });
      await Order.deleteOne({ _id: replacement._id });
    }

    const previousParentReplacement = original.replacementOrder || null;
    const parentClaim = await Order.updateOne(
      { _id: original._id, status: "unavailable", replacementOrder: original.replacementOrder || null },
      { $set: { replacementOrder: replacement._id } }
    );
    if (!parentClaim.modifiedCount) {
      await discardUnlinkedReplacement();
      return res.status(409).json({ message: "The original order changed. Refresh and try again." });
    }
    const parentIsRoot = replacementRoot._id.equals(original._id);
    if (!parentIsRoot) {
      const rootClaim = await Order.updateOne(
        { _id: replacementRoot._id, status: "unavailable", replacementOrder: replacementRoot.replacementOrder || null },
        { $set: { replacementOrder: replacement._id } }
      );
      if (!rootClaim.modifiedCount) {
        await Order.updateOne({ _id: original._id, replacementOrder: replacement._id }, { $set: { replacementOrder: previousParentReplacement } });
        await discardUnlinkedReplacement();
        return res.status(409).json({ message: "Another replacement was created in this order chain. Refresh and try again." });
      }
      replacementRoot.replacementOrder = replacement._id;
      replacementRoot.events.push({ type: "replacement_order_created", label: "Latest replacement order created", note: `Order #${replacement._id.toString().slice(-6).toUpperCase()} is the active replacement in this order chain.`, actor: req.user._id });
      await replacementRoot.save();
    }
    original.replacementOrder = replacement._id;
    original.events.push({ type: "replacement_order_created", label: "Replacement order created", note: `Order #${replacement._id.toString().slice(-6).toUpperCase()} · KSh ${totalAmount.toLocaleString()} · difference from original KSh ${(totalAmount - original.totalAmount).toLocaleString()}`, actor: req.user._id });
    await original.save();
    const updatedOriginal = await Order.findById(original._id).populate("user", "name email phone storeBalance").populate("replacementOrder", "status totalAmount paymentStatus replacementPriceDifference");

    const recipientEmail = original.user ? (await User.findById(original.user))?.email : original.guestInfo?.email;
    if (recipientEmail) {
      const difference = totalAmount - original.totalAmount;
      const differenceText = difference > 0 ? `KSh ${difference.toLocaleString()} more` : difference < 0 ? `KSh ${Math.abs(difference).toLocaleString()} less` : "the same total";
      const deliverySummary = deliveryRoute.serviceType === "parcel"
        ? `${deliveryRoute.carrier} · ${deliveryRoute.officeName}, ${deliveryTown}, ${deliveryCounty}`
        : `${deliveryTown}, ${deliveryCounty} · ${deliveryAddress}`;
      const paymentMethodLabel = { mpesa: "M-Pesa", paystack: "Card", cod: "Cash on delivery", store_balance: "Store Balance" }[paymentMethod] || "selected payment method";
      const replacementPayment = amountDue > 0 ? `Amount due after availability is confirmed: KSh ${amountDue.toLocaleString()} by ${paymentMethodLabel}.` : balanceAmount > 0 ? "The replacement is fully covered by Store Balance once availability is confirmed." : `Payment method: ${paymentMethodLabel}. No payment is due until availability is confirmed.`;
      sendOrderUpdateEmail(recipientEmail, replacement, "Replacement order created", `Replacement order #${replacement._id.toString().slice(-6).toUpperCase()} totals KSh ${totalAmount.toLocaleString()} (${differenceText} than the original). Delivery: ${deliverySummary}. ${balanceAmount > 0 ? `KSh ${balanceAmount.toLocaleString()} from Store Balance is reserved for this order. ` : ""}${replacementPayment}`).catch((err) => console.error("Replacement order email failed:", err.message));
    }
    const io = req.app.get("io");
    if (io) {
      emitOrderCreatedEvent(io, replacement);
      emitOrderEvent(io, "order-resolution-updated", original, { availabilityIssue: original.availabilityIssue, replacementOrder: updatedOriginal.replacementOrder });
    }
    return res.status(201).json({ replacementOrder: replacement, originalOrder: updatedOriginal });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/cancel-request", customerOrderActionLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Cancellation details must be submitted as an object" });
    let order = req.user
      ? await Order.findOne({ _id: req.params.id, user: req.user._id })
      : await Order.findOne({ _id: req.params.id, user: null });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!req.user) {
      const contact = String(req.body.contact || "").trim();
      const emailMatches = order.guestInfo?.email && order.guestInfo.email.toLowerCase() === contact.toLowerCase();
      const phoneMatches = order.guestInfo?.phone && normalizePhone(order.guestInfo.phone) === normalizePhone(contact);
      if (!emailMatches && !phoneMatches) return res.status(404).json({ message: "Order not found" });
    }
    if (order.availabilityConfirmationInProgress) return res.status(409).json({ message: "Azard Stores is confirming availability right now. Refresh the order and try again." });
    if (typeof req.body.reason !== "string") return res.status(400).json({ message: "Enter a cancellation reason" });
    const reason = req.body.reason.trim();
    if (reason.length < 8 || reason.length > 500) return res.status(400).json({ message: "Cancellation reason must be between 8 and 500 characters" });
    if (order.paymentStatus === "paid") {
      if (!["pending", "confirmed"].includes(order.status)) return res.status(409).json({ message: "Cancellation requests are available before dispatch. Contact Azard Stores for help with an order already sent." });
      if (order.cancellationRequests.some((request) => request.status === "pending")) return res.status(409).json({ message: "Your cancellation request is already waiting for review" });
      const updatedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: order.status,
          paymentStatus: "paid",
          cancellationRequests: { $not: { $elemMatch: { status: "pending" } } },
        },
        { $push: {
          cancellationRequests: { reason },
          events: { type: "cancellation_requested", label: "Cancellation requested", note: reason },
        } },
        { new: true }
      );
      if (!updatedOrder) return res.status(409).json({ message: "The order changed while you were requesting cancellation. Refresh and try again." });
      order = updatedOrder;
      const io = req.app.get("io");
      emitOrderEvent(io, "order-cancellation-updated", order);
      const recipientEmail = req.user?.email || order.guestInfo?.email;
      if (recipientEmail) sendOrderUpdateEmail(recipientEmail, order, "Cancellation request received", "We received your cancellation request and will review it before dispatch. If approved, the paid order value will be added to Store Balance. Cash refunds are not offered.").catch((err) => console.error("Cancellation request email failed:", err.message));
      return res.json(customerOrderView(order));
    }
    if (!["pending", "confirmed"].includes(order.status)) return res.status(409).json({ message: "This order can no longer be cancelled online. Contact support for help." });
    if (!order.stockNeedsReservation && !order.stockReservedAt) order.stockReservedAt = order.createdAt || new Date();
    const cancellationClaim = await Order.updateOne(
      { _id: order._id, status: order.status, paymentStatus: { $ne: "paid" }, availabilityConfirmationInProgress: { $ne: true } },
      { $set: { status: "cancelled" } }
    );
    if (!cancellationClaim.modifiedCount) return res.status(409).json({ message: "The order changed while you were cancelling it. Refresh and try again." });
    order.status = "cancelled";
    order.cancellationReason = reason;
    order.events.push({ type: "status_cancelled", label: "Order cancelled", note: order.cancellationReason });
    await order.save();
    await releaseOrderBalance(order);
    await order.save();
    let settledOrder = await Order.findById(order._id);
    if (settledOrder?.paymentStatus === "paid" && !settledOrder.storeBalanceCreditedAt) {
      await creditPaidOrderToStoreBalance(settledOrder, "Payment received during customer cancellation");
      await settledOrder.save();
    }
    order = settledOrder || order;
    await restoreOrderStockOnce(order);
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);
    const recipientEmail = req.user?.email || order.guestInfo?.email;
    if (recipientEmail) {
      const outcome = order.paymentStatus === "paid"
        ? customerStoreBalanceMessage(order) + " Cash refunds are not offered."
        : order.storeBalanceStatus === "released" && order.storeBalanceApplied > 0
          ? `KSh ${Number(order.storeBalanceApplied).toLocaleString()} reserved from Store Balance has been returned to your account.`
          : "No payment was collected.";
      sendOrderUpdateEmail(recipientEmail, order, "Order cancelled", `Your order was cancelled. ${outcome}`).catch((err) => console.error("Order cancellation email failed:", err.message));
    }
    res.json(customerOrderView(order));
  } catch (err) { next(err); }
});

router.put("/:id/cancellation-requests/:requestId", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, decisionNote = "" } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Choose approved or rejected" });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const request = order.cancellationRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Cancellation request not found" });
    if (request.status !== "pending") return res.status(409).json({ message: "This cancellation request has already been decided" });
    if (status === "approved" && (order.paymentStatus !== "paid" || !["pending", "confirmed"].includes(order.status))) {
      return res.status(409).json({ message: "This paid order is no longer eligible for cancellation before dispatch" });
    }
    const note = String(decisionNote).trim().slice(0, 500);
    if (status === "rejected" && !note) return res.status(400).json({ message: "Add a short reason when declining a cancellation request" });
    const requestClaimFilter = {
      _id: order._id,
      cancellationRequests: { $elemMatch: { _id: request._id, status: "pending" } },
    };
    const requestClaimSet = {
      "cancellationRequests.$.status": status,
      "cancellationRequests.$.decisionNote": note,
      "cancellationRequests.$.decidedAt": new Date(),
      "cancellationRequests.$.decidedBy": req.user._id,
    };
    if (status === "approved") {
      requestClaimFilter.status = order.status;
      requestClaimFilter.paymentStatus = "paid";
      requestClaimSet.status = "cancelled";
      requestClaimSet.cancellationReason = request.reason;
    }
    const requestClaim = await Order.updateOne(requestClaimFilter, { $set: requestClaimSet });
    if (!requestClaim.modifiedCount) return res.status(409).json({ message: "The order or cancellation request changed. Refresh and review it again." });
    request.status = status;
    request.decisionNote = note;
    request.decidedAt = new Date();
    request.decidedBy = req.user._id;
    order.events.push({
      type: status === "approved" ? "cancellation_request_approved" : "cancellation_request_rejected",
      label: status === "approved" ? "Cancellation approved" : "Cancellation declined",
      note: note || request.reason,
      actor: req.user._id,
    });
    if (status === "approved") {
      order.status = "cancelled";
      order.cancellationReason = request.reason;
      await order.save();
      await creditPaidOrderToStoreBalance(order, "Customer cancellation approved");
      await order.save();
      await restoreOrderStockOnce(order);
    } else {
      await order.save();
    }
    const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
    if (recipientEmail) {
      const message = status === "approved"
        ? `Your cancellation was approved. ${customerStoreBalanceMessage(order)} Cash refunds are not offered.`
        : `Your cancellation request was declined. ${note} The order remains active; contact Azard Stores if you need help.`;
      sendOrderUpdateEmail(recipientEmail, order, status === "approved" ? "Order cancellation approved" : "Cancellation request declined", message).catch((err) => console.error("Cancellation decision email failed:", err.message));
    }
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);
    emitOrderEvent(io, "order-cancellation-updated", order);
    return res.json(order);
  } catch (err) { next(err); }
});

router.post("/:id/delivery-issues", customerOrderActionLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Delivery report must be submitted as an object" });
    const order = req.user
      ? await Order.findOne({ _id: req.params.id, user: req.user._id })
      : await Order.findOne({ _id: req.params.id, user: null });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!req.user) {
      const contact = String(req.body.contact || "").trim();
      const emailMatches = order.guestInfo?.email && order.guestInfo.email.toLowerCase() === contact.toLowerCase();
      const phoneMatches = order.guestInfo?.phone && normalizePhone(order.guestInfo.phone) === normalizePhone(contact);
      if (!emailMatches && !phoneMatches) return res.status(404).json({ message: "Order not found" });
    }
    const serviceType = order.deliveryRoute?.serviceType;
    const canReport = serviceType === "parcel"
      ? ["shipped", "ready_for_collection", "collected", "delivered"].includes(order.status)
      : serviceType === "direct" && ["shipped", "delivered"].includes(order.status);
    if (!canReport) {
      return res.status(409).json({ message: "A delivery problem can be reported while delivery is in progress or after a delivery or collection update" });
    }
    if (typeof req.body.reason !== "string") return res.status(400).json({ message: "Describe the delivery problem in at least 8 characters" });
    const reason = req.body.reason.trim();
    if (reason.length < 8 || reason.length > 1000) return res.status(400).json({ message: "Delivery report must be between 8 and 1,000 characters" });
    const issueReportedAt = new Date();
    const issueFilter = {
      _id: order._id,
      status: order.status,
      "deliveryRoute.serviceType": serviceType,
      deliveryIssueRequests: { $not: { $elemMatch: { status: { $in: ["open", "investigating"] } } } },
    };
    if (req.user) issueFilter.user = req.user._id;
    else issueFilter.user = null;
    const updatedOrder = await Order.findOneAndUpdate(issueFilter, {
      $push: {
        deliveryIssueRequests: { reason, requestedAt: issueReportedAt },
        events: { type: "delivery_issue_reported", label: "Delivery problem reported", createdAt: issueReportedAt },
      },
    }, { new: true, runValidators: true });
    if (!updatedOrder) return res.status(409).json({ message: "A delivery issue is already being reviewed, or the order status changed. Refresh and try again." });
    const currentOrder = updatedOrder;
    const io = req.app.get("io");
    emitOrderEvent(io, "order-delivery-issue-updated", currentOrder);
    const recipientEmail = req.user?.email || currentOrder.guestInfo?.email;
    if (recipientEmail) sendOrderUpdateEmail(recipientEmail, currentOrder, "Delivery issue received", "We received your delivery report. Our team will review it. Check the order updates for progress; email notifications may also be sent.").catch((err) => console.error("Delivery issue acknowledgement email failed:", err.message));
    return res.status(201).json(customerOrderView(currentOrder));
  } catch (err) { next(err); }
});

router.put("/:id/delivery-issues/:issueId", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, response = "" } = req.body;
    if (!["investigating", "resolved"].includes(status)) return res.status(400).json({ message: "Choose investigating or resolved" });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const issue = order.deliveryIssueRequests.id(req.params.issueId);
    if (!issue) return res.status(404).json({ message: "Delivery issue not found" });
    const note = String(response).trim().slice(0, 1000);
    if (note.length < 8) return res.status(400).json({ message: "Add at least 8 characters explaining the update to the customer" });
    const updatedAt = new Date();
    const eventType = status === "resolved" ? "delivery_issue_resolved" : "delivery_issue_investigating";
    const issueUpdate = {
      "deliveryIssueRequests.$.status": status,
      "deliveryIssueRequests.$.response": note,
      "deliveryIssueRequests.$.updatedAt": updatedAt,
      "deliveryIssueRequests.$.resolvedBy": req.user._id,
    };
    if (status === "resolved") issueUpdate["deliveryIssueRequests.$.resolvedAt"] = updatedAt;
    const updateResult = await Order.updateOne(
      { _id: order._id, deliveryIssueRequests: { $elemMatch: { _id: issue._id, status: { $in: ["open", "investigating"] }, updatedAt: issue.updatedAt || null } } },
      { $set: issueUpdate, $push: { events: { type: eventType, label: status === "resolved" ? "Delivery issue resolved" : "Delivery issue under investigation", note, actor: req.user._id, createdAt: updatedAt } } }
    );
    if (!updateResult.modifiedCount) return res.status(409).json({ message: "Another admin already updated this delivery report. Refresh the order to see its latest status." });
    const updatedOrder = await Order.findById(order._id);
    const recipientEmail = updatedOrder.user ? (await User.findById(updatedOrder.user))?.email : updatedOrder.guestInfo?.email;
    if (recipientEmail) sendOrderUpdateEmail(recipientEmail, updatedOrder, status === "resolved" ? "Delivery issue resolved" : "Delivery issue update", note).catch((err) => console.error("Delivery issue update email failed:", err.message));
    const io = req.app.get("io");
    emitOrderEvent(io, "order-delivery-issue-updated", updatedOrder);
    return res.json(updatedOrder);
  } catch (err) { next(err); }
});

router.post("/:id/returns", customerOrderActionLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!isRequestObject(req.body)) return res.status(400).json({ message: "Return details must be submitted as an object" });
    const { type, reason, unused, originalPackaging, contact } = req.body;
    if (typeof type !== "string" || !["return", "exchange"].includes(type) || typeof reason !== "string" || !reason.trim() || reason.length > 1000) return res.status(400).json({ message: "Choose a return or exchange and provide a reason of 1,000 characters or fewer" });
    if (unused !== true || originalPackaging !== true) return res.status(400).json({ message: "Items must be unused and in their original packaging" });
    let order = req.user
      ? await Order.findOne({ _id: req.params.id, user: req.user._id })
      : await Order.findOne({ _id: req.params.id, user: null });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!req.user) {
      const candidate = String(contact || "").trim();
      const emailMatches = order.guestInfo?.email && candidate.toLowerCase() === order.guestInfo.email.toLowerCase();
      const phoneMatches = order.guestInfo?.phone && normalizePhone(candidate) === normalizePhone(order.guestInfo.phone);
      if (!emailMatches && !phoneMatches) return res.status(404).json({ message: "Order not found" });
    }
    const requestedLines = Array.isArray(req.body.itemQuantities)
      ? req.body.itemQuantities
      : (Array.isArray(req.body.itemIndexes) ? req.body.itemIndexes.map(Number) : []).map((itemIndex) => ({ itemIndex, quantity: Number(order.items[itemIndex]?.quantity || 0) }));
    const itemQuantities = [];
    const seenIndexes = new Set();
    for (const line of requestedLines) {
      const itemIndex = Number(line?.itemIndex);
      const quantity = Number(line?.quantity);
      const orderedQuantity = Number(order.items[itemIndex]?.quantity || 0);
      if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= order.items.length || !Number.isInteger(quantity) || quantity < 1 || quantity > orderedQuantity || seenIndexes.has(itemIndex)) {
        return res.status(400).json({ message: "Choose valid item quantities that do not exceed the quantities in your order" });
      }
      seenIndexes.add(itemIndex);
      itemQuantities.push({ itemIndex, quantity });
    }
    if (!itemQuantities.length) return res.status(400).json({ message: "Select at least one item quantity to return or exchange" });
    if (itemQuantities.some(({ itemIndex }) => ["final_sale", "perishable", "digital_product"].includes(order.items[itemIndex]?.returnEligibility))) {
      return res.status(409).json({ message: "Final sale, perishable, and digital products or gift cards are not eligible for return or exchange under the store policy" });
    }
    const itemIndexes = itemQuantities.map((line) => line.itemIndex);
    const reservedByIndex = new Array(order.items.length).fill(0);
    for (const request of order.returnRequests) {
      if (request.status === "rejected") continue;
      if (request.itemQuantities?.length) {
        for (const line of request.itemQuantities) reservedByIndex[line.itemIndex] += Number(line.quantity || 0);
      } else {
        for (const index of request.itemIndexes || []) reservedByIndex[index] = Number(order.items[index]?.quantity || 0);
      }
    }
    if (itemQuantities.some((line) => reservedByIndex[line.itemIndex] + line.quantity > Number(order.items[line.itemIndex].quantity || 0))) {
      return res.status(409).json({ message: "One or more selected quantities are already part of a return or exchange request" });
    }
    const completedAt = ["delivered", "collected"].includes(order.status) ? orderFulfilledAt(order) : null;
    if (!completedAt || !["delivered", "collected"].includes(order.status)) return res.status(409).json({ message: "Returns and exchanges can be requested after delivery or collection" });
    if (order.paymentStatus !== "paid") return res.status(409).json({ message: "Payment must be confirmed before requesting a return or exchange" });
    const elapsedSinceFulfillment = Date.now() - completedAt.getTime();
    if (!Number.isFinite(elapsedSinceFulfillment) || elapsedSinceFulfillment < 0 || elapsedSinceFulfillment > 5 * 24 * 60 * 60 * 1000) return res.status(409).json({ message: "The 5-day return and exchange window has passed" });
    const requestData = {
      type,
      itemIndexes,
      reason: reason.trim(),
      unused,
      originalPackaging,
      status: "pending",
      requestedAt: new Date(),
      itemQuantities,
      storeBalanceAmount: Math.round(itemQuantities.reduce((sum, line) => sum + Number(order.items[line.itemIndex].price || 0) * line.quantity, 0) * 100) / 100,
    };
    const quantityCapacityChecks = itemQuantities.map(({ itemIndex, quantity }) => ({
      $lte: [
        {
          $add: [
            quantity,
            {
              $sum: {
                $map: {
                  input: { $filter: { input: { $ifNull: ["$returnRequests", []] }, as: "request", cond: { $ne: ["$$request.status", "rejected"] } } },
                  as: "request",
                  in: {
                    $cond: [
                      { $gt: [{ $size: { $ifNull: ["$$request.itemQuantities", []] } }, 0] },
                      {
                        $sum: {
                          $map: {
                            input: { $filter: { input: "$$request.itemQuantities", as: "line", cond: { $eq: ["$$line.itemIndex", itemIndex] } } },
                            as: "line",
                            in: { $ifNull: ["$$line.quantity", 0] },
                          },
                        },
                      },
                      { $cond: [{ $in: [itemIndex, { $ifNull: ["$$request.itemIndexes", []] }] }, { $arrayElemAt: ["$items.quantity", itemIndex] }, 0] },
                    ],
                  },
                },
              },
            },
          ],
        },
        { $arrayElemAt: ["$items.quantity", itemIndex] },
      ],
    }));
    const reservationFilter = {
      _id: order._id,
      status: { $in: ["delivered", "collected"] },
      paymentStatus: "paid",
      $expr: { $and: quantityCapacityChecks },
    };
    if (req.user) reservationFilter.user = req.user._id;
    else reservationFilter.user = null;
    const updatedOrder = await Order.findOneAndUpdate(
      reservationFilter,
      {
        $push: {
          returnRequests: requestData,
          events: { type: `${type}_requested`, label: `${type} requested`, actor: req.user?._id || null },
        },
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(409).json({ message: "One or more selected items already have a return or exchange request. Refresh the order and try again." });
    order = updatedOrder;
    const io = req.app.get("io");
    emitOrderEvent(io, "order-return-updated", order);
    const recipientEmail = req.user?.email || order.guestInfo?.email;
    const selectedItems = itemQuantities.map(({ itemIndex, quantity }) => {
      const item = order.items[itemIndex];
      return item ? `${item.name} × ${quantity} (KSh ${(item.price * quantity).toLocaleString()})` : "";
    }).filter(Boolean).join(", ");
    if (recipientEmail) sendOrderUpdateEmail(recipientEmail, order, `${type === "return" ? "Return" : "Exchange"} request received`, `We received your ${type} request${selectedItems ? ` for ${selectedItems}` : ""}. Azard Stores will review the item condition. Check the order updates for the decision and handover instructions; email notifications may also be sent. If approved and accepted after inspection, the eligible item value (currently estimated at KSh ${requestData.storeBalanceAmount.toLocaleString()}) is added to Store Balance; delivery charges are excluded and cash refunds are not offered. Requests must be made within 5 days of delivery or collection, and items must be unused in their original packaging.`).catch((err) => console.error("Return request email failed:", err.message));
    res.status(201).json(customerOrderView(order));
  } catch (err) { next(err); }
});

router.put("/:id/returns/:requestId", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, decisionNote = "" } = req.body;
    if (!["approved", "rejected", "completed"].includes(status)) return res.status(400).json({ message: "Choose approved, rejected, or completed" });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const request = order.returnRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Return request not found" });
    const allowedNext = { pending: ["approved", "rejected"], approved: ["completed"], rejected: [], completed: [] };
    const isCreditRecovery = request.status === "completed" && status === "completed" && !request.storeBalanceIssuedAt;
    const isInspectionRecovery = request.status === "completed"
      && status === "completed"
      && !request.inventoryProcessedAt
      && request.inspectionLines?.length > 0;
    if (!allowedNext[request.status]?.includes(status) && !isCreditRecovery && !isInspectionRecovery) return res.status(409).json({ message: `Cannot move a ${request.status} request to ${status}` });
    const note = String(decisionNote || (isCreditRecovery || isInspectionRecovery ? request.decisionNote : "")).trim().slice(0, 1000);
    if (!note) return res.status(400).json({ message: status === "approved" ? "Add the customer handover instructions" : status === "rejected" ? "Add a reason for declining this request" : request.type === "exchange" ? "Record where the exchange item was received and inspected" : "Record that the returned item was received and inspected" });
    if (status === "approved" && note.length < 30) return res.status(400).json({ message: "Add complete return instructions: method, exact destination or parcel office, and customer contact details" });
    if (status === "completed" && !isCreditRecovery && !isInspectionRecovery && note.length < 20) return res.status(400).json({ message: "Record where the item was received and confirm its inspection before completing this request" });
    if (status === "completed" && order.paymentStatus !== "paid") return res.status(409).json({ message: "Payment is no longer confirmed for this order, so this request cannot be completed or credited." });
    const returnedLines = request.itemQuantities?.length
      ? request.itemQuantities
      : request.itemIndexes.map((itemIndex) => ({ itemIndex, quantity: Number(order.items[itemIndex]?.quantity || 0) }));
    const inspectionLines = isInspectionRecovery
      ? request.inspectionLines
      : status === "completed" && !isCreditRecovery
        ? normalizeReturnInspectionLines(returnedLines, req.body.inspectionLines)
        : request.inspectionLines;
    if (["approved", "rejected"].includes(status)) {
      const decisionAt = new Date();
      const claim = await Order.updateOne(
        { _id: order._id, returnRequests: { $elemMatch: { _id: request._id, status: "pending" } } },
        { $set: {
          "returnRequests.$.status": status,
          "returnRequests.$.decisionNote": note,
          "returnRequests.$.decidedAt": decisionAt,
        } }
      );
      if (!claim.modifiedCount) return res.status(409).json({ message: "Another admin already updated this request. Refresh the order and review its latest status." });
    }
    if (status === "completed" && !isCreditRecovery && !isInspectionRecovery) {
      if (order.paymentStatus !== "paid") return res.status(409).json({ message: "Payment is no longer confirmed for this order, so this request cannot be completed or credited." });
      const completionClaim = await Order.updateOne(
        {
          _id: order._id,
          paymentStatus: "paid",
          returnRequests: { $elemMatch: { _id: request._id, status: "approved", storeBalanceIssuedAt: null } },
        },
        { $set: {
          "returnRequests.$.status": "completed",
          "returnRequests.$.decisionNote": note,
          "returnRequests.$.decidedAt": new Date(),
          "returnRequests.$.inspectionLines": inspectionLines,
        } }
      );
      if (!completionClaim.modifiedCount) return res.status(409).json({ message: "Another admin completed this request. Refresh the order to confirm its latest Store Balance status." });
    }
    if (isCreditRecovery && !request.decisionNote) return res.status(409).json({ message: "This completed request has no inspection record. Review it before issuing Store Balance." });
    request.status = status;
    request.decisionNote = note;
    request.decidedAt = new Date();
    if (inspectionLines?.length) request.inspectionLines = inspectionLines;
    if (status === "completed" && request.inspectionLines?.length && !request.inventoryProcessedAt) {
      await applyReturnInspection({ Product, order, request, inspectionLines: request.inspectionLines, inspectionNote: note });
      const processedAt = new Date();
      const inventoryClaim = await Order.updateOne(
        { _id: order._id, returnRequests: { $elemMatch: { _id: request._id, status: "completed", inventoryProcessedAt: null } } },
        { $set: { "returnRequests.$.inventoryProcessedAt": processedAt } }
      );
      if (!inventoryClaim.modifiedCount) {
        const latest = await Order.findOne({ _id: order._id, returnRequests: { $elemMatch: { _id: request._id, inventoryProcessedAt: { $ne: null } } } })
          .select("returnRequests")
          .lean();
        const processedRequest = latest?.returnRequests?.find((entry) => String(entry._id) === String(request._id));
        if (!processedRequest?.inventoryProcessedAt) return res.status(409).json({ message: "Inventory inspection could not be confirmed as complete. Refresh the order and retry." });
        request.inventoryProcessedAt = processedRequest.inventoryProcessedAt;
      } else {
        request.inventoryProcessedAt = processedAt;
      }
    }
    if (status === "completed" && ["return", "exchange"].includes(request.type)) {
      request.storeBalanceAmount = Math.round(returnedLines.reduce((sum, line) => {
        const item = order.items[line.itemIndex];
        return sum + (item ? item.price * line.quantity : 0);
      }, 0) * 100) / 100;
      if (!Number.isFinite(request.storeBalanceAmount) || request.storeBalanceAmount <= 0) return res.status(409).json({ message: "No eligible item value could be calculated, so this request cannot be completed. Review the selected items first." });
      const issued = await issueStoreBalance({
        order,
        amount: request.storeBalanceAmount,
        reference: `order:${order._id}:return:${request._id}:balance`,
        description: `Store balance for ${request.type === "exchange" ? "exchanged" : "returned"} items from order #${order._id.toString().slice(-6).toUpperCase()}`,
      });
      request.storeBalanceIssuedAt = new Date();
      request.storeBalanceClaimStatus = issued.pendingClaim ? "pending" : order.user ? "not_required" : "claimed";
      if (issued.pendingClaim) order.storeBalanceClaimStatus = "pending";
      order.events.push({ type: "store_balance_issued", label: `${request.type === "exchange" ? "Exchange" : "Return"} value added to store balance`, note: `KSh ${request.storeBalanceAmount.toLocaleString()}`, actor: req.user._id });
    }
    order.events.push({
      type: isCreditRecovery ? `${request.type}_balance_recovered` : `${request.type}_${status}`,
      label: isCreditRecovery ? `${request.type} Store Balance credit recovered` : `${request.type} ${status}`,
      note: request.decisionNote,
      actor: req.user._id,
    });
    await order.save();
    const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
    if (recipientEmail) {
      const message = status === "completed" && ["return", "exchange"].includes(request.type) && request.storeBalanceIssuedAt
        ? `${customerStoreBalanceMessage(order, request.storeBalanceAmount, request.storeBalanceClaimStatus)} This covers item value only; delivery charges are not included.${request.type === "exchange" ? " Use the balance toward a new order and pay any difference at checkout." : " Use it toward a future order; cash refunds are not offered."} ${request.decisionNote}`
        : status === "completed" && request.type === "exchange"
          ? `Your exchange item was received, but its Store Balance credit is still being resolved. Contact Azard Stores before placing another order. ${request.decisionNote}`
          : status === "approved"
            ? `Your ${request.type} request was approved. ${request.decisionNote}`
            : status === "rejected"
              ? `Your ${request.type} request was declined. ${request.decisionNote}`
              : request.decisionNote;
      const subject = isCreditRecovery
        ? `${request.type === "return" ? "Return" : "Exchange"} Store Balance credit confirmed`
        : `${request.type === "return" ? "Return" : "Exchange"} ${status}`;
      sendOrderUpdateEmail(recipientEmail, order, subject, message).catch((err) => console.error("Return decision email failed:", err.message));
    }
    const io = req.app.get("io");
    emitOrderEvent(io, "order-return-updated", order);
    res.json(order);
  } catch (err) { next(err); }
});

module.exports = router;
