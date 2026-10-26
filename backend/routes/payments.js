const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const UnmatchedPayment = require("../models/UnmatchedPayment");
const { optionalAuth, protect, requireRole } = require("../middleware/auth");
const { isPaystackConfigured, isPaystackMpesaConfigured, initializeTransaction, initiateMpesaCharge, checkCharge, verifyTransaction, verifyWebhookSignature, isVerifiedPayment, createPaymentCallbackToken, isValidPaymentCallbackToken } = require("../utils/paystack");
const { sendOrderUpdateEmail } = require("../utils/email");
const { normalizePhone } = require("../utils/normalizePhone");
const { creditPaidOrderToStoreBalance, issueStoreBalance, customerStoreBalanceMessage } = require("../utils/storeBalance");
const { restoreOrderStockOnce } = require("../utils/orderStock");
const { emitOrderEvent } = require("../utils/orderRealtime");
const { paymentLimiter, paymentStatusLimiter } = require("../middleware/rateLimits");
const { customerOrderView } = require("../utils/customerOrderView");

const router = express.Router();

function reconciliationError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function claimPaymentInitiation(order, reference, attempt) {
  const initiatedAt = new Date();
  const staleBefore = new Date(initiatedAt.getTime() - 2 * 60 * 1000);
  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: "confirmed",
      paymentStatus: { $nin: ["paid", "refund_pending", "refunded"] },
      stockReservedAt: { $ne: null },
      stockReservedUntil: { $gt: initiatedAt },
      paymentAttempts: { $not: { $elemMatch: { status: "pending" } } },
      $or: [
        { paymentInitiationAt: null },
        { paymentInitiationAt: { $exists: false } },
        { paymentInitiationAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        paymentInitiationAt: initiatedAt,
        paystackReference: reference,
        paystackStatusQueriedAt: null,
        paymentStatus: "unpaid",
      },
      $push: { paymentAttempts: attempt },
    },
    { new: true }
  );
  return claimedOrder ? { order: claimedOrder, initiatedAt } : null;
}

async function releasePaymentInitiation(orderId, initiatedAt) {
  await Order.updateOne({ _id: orderId, paymentInitiationAt: initiatedAt }, { $unset: { paymentInitiationAt: "" } });
}

async function recordPaymentMismatch(order, reference, verified, expectedAmountKsh) {
  if (verified?.status !== "success" || verified.reference !== reference || !Number.isSafeInteger(verified.amountSubunit) || verified.amountSubunit <= 0) return false;
  const expectedSubunit = Math.round(Number(expectedAmountKsh) * 100);
  const reasons = [];
  if (verified.amountSubunit !== expectedSubunit) reasons.push(`amount ${verified.amountSubunit} subunits differs from expected ${expectedSubunit}`);
  if (verified.currency !== "KES") reasons.push(`currency is ${verified.currency || "unknown"}`);
  if (verified.domain !== "live") reasons.push(`provider domain is ${verified.domain || "unknown"}`);
  if (!reasons.length) return false;

  const unmatchedWrite = await UnmatchedPayment.updateOne(
    { reference: verified.reference },
    { $setOnInsert: {
      reference: verified.reference,
      amountSubunit: verified.amountSubunit,
      currency: verified.currency || "UNKNOWN",
      domain: verified.domain || "unknown",
      customerEmail: verified.customerEmail || "",
      metadataOrderId: verified.metadataOrderId || order._id.toString(),
      gatewayResponse: verified.gatewayResponse || "",
      issueReason: `Potential order #${order._id.toString().slice(-6).toUpperCase()}: ${reasons.join("; ")}. Order left unpaid; review before asking the customer to pay again.`,
      order: order._id,
    } },
    { upsert: true }
  );
  let attempt = order.paymentAttempts.find((entry) => entry.reference === reference);
  if (attempt) attempt.status = "review";
  else {
    order.paymentAttempts.push({ provider: "paystack", reference, status: "review" });
    attempt = order.paymentAttempts[order.paymentAttempts.length - 1];
  }
  const paymentLabel = order.paymentMethod === "mpesa" ? "M-Pesa payment through Paystack" : "Paystack card payment";
  if (!order.events.some((event) => event.type === "payment_mismatch_review" && event.note?.includes(reference))) {
    order.events.push({
      type: "payment_mismatch_review",
      label: "Payment needs review",
      note: `${paymentLabel} was reported successful (${reference}), but its amount or transaction details did not match this order. The order remains unpaid. Do not pay again until Azard Stores reviews it.`,
    });
  }
  await order.save();
  if (unmatchedWrite.upsertedCount) {
    const { email } = await getOrderContact(order);
    if (email) {
      const received = verified.amountSubunit / 100;
      const expected = expectedSubunit / 100;
      sendOrderUpdateEmail(
        email,
        order,
        "Payment needs review",
        `${paymentLabel} for KSh ${received.toLocaleString()} was reported successful, but the amount or transaction details do not match the KSh ${expected.toLocaleString()} due for this order. The order remains unpaid and will not be dispatched. Please do not make another payment; Azard Stores will review this and contact you.`
      ).catch((err) => console.error("Payment mismatch review email failed:", err.message));
    }
  }
  return true;
}

async function issueAdditionalPaymentCredit(orderId, reference, amount) {
  let order = await Order.findById(orderId);
  if (!order || order.paymentStatus !== "paid") throw new Error("An additional payment can only be credited after the primary order payment is confirmed");
  let credit = (order.additionalPaymentCredits || []).find((entry) => entry.reference === reference);
  if (!credit) {
    await Order.updateOne(
      {
        _id: order._id,
        paymentStatus: "paid",
        additionalPaymentCredits: { $not: { $elemMatch: { reference } } },
      },
      {
        $set: { "paymentAttempts.$[attempt].status": "paid" },
        $push: { additionalPaymentCredits: { reference, amount, status: "crediting" } },
      },
      { arrayFilters: [{ "attempt.reference": reference }] }
    );
    order = await Order.findById(order._id);
    credit = order?.additionalPaymentCredits?.find((entry) => entry.reference === reference);
  }
  if (!order || !credit) throw new Error("Additional payment credit could not be recorded");
  let newlyCredited = false;
  if (credit.status === "crediting") {
    const issued = await issueStoreBalance({
      order,
      amount: credit.amount,
      reference: `payment:${reference}:duplicate-payment-credit`,
      description: "Additional verified payment for an already paid order",
    });
    const status = issued.pendingClaim ? "claim_pending" : "credited";
    const claimStatus = issued.pendingClaim ? "pending" : order.user ? "not_required" : "claimed";
    const update = await Order.updateOne(
      { _id: order._id, "additionalPaymentCredits.reference": reference, "additionalPaymentCredits.status": "crediting" },
      {
        $set: {
          "additionalPaymentCredits.$.status": status,
          "additionalPaymentCredits.$.claimStatus": claimStatus,
          "additionalPaymentCredits.$.creditedAt": new Date(),
          storeBalanceClaimStatus: claimStatus,
        },
        $push: {
          events: {
            type: "additional_payment_credited",
            label: "Additional payment added to Store Balance",
            note: `Verified KSh ${Number(credit.amount).toLocaleString()} additional payment ${reference} was added to Store Balance.`,
          },
        },
      }
    );
    newlyCredited = Boolean(update.modifiedCount);
    order = await Order.findById(order._id);
  }
  const finalCredit = order?.additionalPaymentCredits?.find((entry) => entry.reference === reference);
  return { order, credit: finalCredit, newlyCredited };
}

router.get("/unmatched", protect, requireRole("admin"), async (req, res, next) => {
  try {
    await UnmatchedPayment.updateMany(
      { status: "processing", updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
      { $set: { status: "open" } }
    );
    const payments = await UnmatchedPayment.find({ status: { $in: ["open", "refund_pending"] } })
      .populate("order", "status paymentStatus totalAmount paymentMethod")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

router.put("/unmatched/:id/reconcile", protect, requireRole("admin"), async (req, res, next) => {
  let claimedPaymentId = null;
  try {
    const { orderId } = req.body;
    const orderLookup = String(orderId || "").trim();
    if (!/^[a-f\d]{6,24}$/i.test(orderLookup)) {
      return res.status(400).json({ message: "Enter the order number shown in the admin order list" });
    }
    const unmatched = await UnmatchedPayment.findOne({ _id: req.params.id, status: "open" });
    if (!unmatched) return res.status(404).json({ message: "Open unmatched payment not found" });
    if (unmatched.currency !== "KES" || unmatched.domain !== "live") {
      return res.status(409).json({ message: "Only verified live KES payments can be linked to an order" });
    }

    const matchingOrders = orderLookup.length === 24
      ? [await Order.findById(orderLookup)].filter(Boolean)
      : await Order.find({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: `${orderLookup}$`,
            options: "i",
          },
        },
      }).limit(2);
    if (matchingOrders.length > 1) return res.status(409).json({ message: "More than one order matches that short number. Enter the full order ID." });
    let order = matchingOrders[0];
    if (!order) return res.status(404).json({ message: "Order not found" });
    const orderEmail = order.user
      ? (await User.findById(order.user).select("email"))?.email
      : order.billingSnapshot?.email || order.guestInfo?.email;
    if (!unmatched.customerEmail || !orderEmail || unmatched.customerEmail.trim().toLowerCase() !== orderEmail.trim().toLowerCase()) {
      return res.status(409).json({ message: "The verified Paystack email does not match this order. Confirm the customer identity before resolving this payment." });
    }
    if (!["mpesa", "paystack"].includes(order.paymentMethod)) {
      return res.status(409).json({ message: "This order is not configured for a Paystack payment" });
    }
    if (order.paymentStatus !== "paid" && order.status === "pending") {
      return res.status(409).json({ message: "The order is still awaiting availability; contact the customer before applying this payment" });
    }
    if (["refund_pending", "refunded"].includes(order.paymentStatus)) {
      return res.status(409).json({ message: "This order already has a payment under refund review" });
    }

    const expectedAmountSubunit = Math.round((Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)) * 100);
    if (unmatched.amountSubunit !== expectedAmountSubunit) {
      return res.status(409).json({ message: "The verified payment amount does not match the order balance due" });
    }

    const paymentClaim = await UnmatchedPayment.updateOne(
      { _id: unmatched._id, status: "open" },
      { $set: { status: "processing", resolvedBy: req.user._id } }
    );
    if (!paymentClaim.modifiedCount) return res.status(409).json({ message: "Another admin is reconciling this payment. Refresh and try again." });
    claimedPaymentId = unmatched._id;
    unmatched.status = "processing";

    // Re-read after claiming the unmatched transaction: a provider callback
    // may have completed the order payment while the admin was reviewing it.
    order = await Order.findById(order._id);
    if (!order) throw reconciliationError("The order disappeared during reconciliation", 404);
    const currentOrderEmail = order.user
      ? (await User.findById(order.user).select("email"))?.email
      : order.billingSnapshot?.email || order.guestInfo?.email;
    if (!unmatched.customerEmail || !currentOrderEmail || unmatched.customerEmail.trim().toLowerCase() !== currentOrderEmail.trim().toLowerCase()) {
      throw reconciliationError("The verified Paystack email no longer matches this order. Refresh and confirm the customer identity.");
    }
    if (["refund_pending", "refunded"].includes(order.paymentStatus)) {
      throw reconciliationError("This order entered refund review while the payment was being reconciled");
    }
    if (order.paymentStatus !== "paid" && order.status === "pending") {
      throw reconciliationError("The order is still awaiting availability; contact the customer before applying this payment");
    }
    const refreshedExpectedAmount = Math.round((Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)) * 100);
    if (unmatched.amountSubunit !== refreshedExpectedAmount) {
      throw reconciliationError("The order balance changed during reconciliation; refresh and review the payment again");
    }

    if (order.paymentStatus === "paid") {
      const existingExtraPayment = order.additionalPaymentRefunds.find((payment) => payment.reference === unmatched.reference);
      const existingExtraCredit = order.additionalPaymentCredits.find((payment) => payment.reference === unmatched.reference);
      const matchingAttempt = order.paymentAttempts.find((attempt) => attempt.reference === unmatched.reference);
      const isRecordedPrimaryPayment = order.paymentReference === unmatched.reference
        || (!order.paymentReference && matchingAttempt?.status === "paid" && !existingExtraCredit);
      if (existingExtraPayment) {
        unmatched.status = existingExtraPayment.status === "refunded" ? "refunded" : "refund_pending";
        unmatched.order = order._id;
        unmatched.resolutionNote = existingExtraPayment.status === "refunded"
          ? "This additional payment has already been recorded as refunded on the order."
          : "This additional payment is already recorded on the order and requires refund review.";
      } else if (existingExtraCredit) {
        const result = await issueAdditionalPaymentCredit(order._id, unmatched.reference, unmatched.amountSubunit / 100);
        order = result.order;
        unmatched.status = "linked";
        unmatched.order = order._id;
        unmatched.resolutionNote = result.credit?.claimStatus === "pending"
          ? `KSh ${Number(result.credit.amount).toLocaleString()} is waiting to be claimed in the customer's Store Balance.`
          : `KSh ${Number(result.credit?.amount || unmatched.amountSubunit / 100).toLocaleString()} was credited to the customer's Store Balance.`;
      } else if (isRecordedPrimaryPayment) {
        if (matchingAttempt) matchingAttempt.status = "paid";
        const orderEnded = ["cancelled", "expired", "unavailable"].includes(order.status);
        if (orderEnded && !order.storeBalanceCreditedAt) {
          await creditPaidOrderToStoreBalance(order, "Retry of verified payment credit after order ended");
          order.events.push({ type: "store_balance_issued", label: "Payment value added to Store Balance" });
          await order.save();
        }
        if (orderEnded) await restoreOrderStockOnce(order);
        unmatched.status = "linked";
        unmatched.order = order._id;
        unmatched.resolutionNote = orderEnded
          ? "The verified primary payment is linked and its Store Balance credit has been confirmed. Do not dispatch."
          : "Matched to an order whose primary payment reference was already recorded.";
      } else {
        const result = await issueAdditionalPaymentCredit(order._id, unmatched.reference, unmatched.amountSubunit / 100);
        order = result.order;
        unmatched.status = "linked";
        unmatched.order = order._id;
        unmatched.resolutionNote = result.credit?.claimStatus === "pending"
          ? `KSh ${unmatched.amountSubunit / 100} was added to pending Store Balance for ${orderEmail}; the customer must claim it with a verified account.`
          : `KSh ${unmatched.amountSubunit / 100} was credited to the customer's Store Balance.`;
        const recipientEmail = order.user ? orderEmail : order.guestInfo?.email;
        if (recipientEmail) {
          const message = result.credit?.claimStatus === "pending"
            ? `Your order payment is confirmed. An additional verified payment of KSh ${(unmatched.amountSubunit / 100).toLocaleString()} is ready to claim. Sign in or create an account with ${orderEmail}, then verify that email address to claim Store Balance.`
            : `Your original order payment remains confirmed. The additional verified payment of KSh ${(unmatched.amountSubunit / 100).toLocaleString()} has been added to Store Balance for a future order.`;
          sendOrderUpdateEmail(recipientEmail, order, "Additional payment added to Store Balance", message).catch((err) => console.error("Additional payment credit email failed:", err.message));
        }
      }
    } else {
      const latePayment = ["cancelled", "expired", "unavailable"].includes(order.status)
        || (order.status === "confirmed" && order.stockReservedUntil && order.stockReservedUntil <= new Date());
      if (latePayment && order.status === "confirmed") {
        order.status = "expired";
      }
      order.paymentStatus = "paid";
      order.paymentReference = unmatched.reference;
      order.paystackReference = unmatched.reference;
      const existingAttempt = order.paymentAttempts.find((attempt) => attempt.reference === unmatched.reference);
      if (existingAttempt) existingAttempt.status = "paid";
      else order.paymentAttempts.push({ provider: "paystack", reference: unmatched.reference, status: "paid" });
      order.receiptNumber = order.receiptNumber || `AS-R-${order._id.toString().slice(-8).toUpperCase()}`;
      order.receiptIssuedAt = new Date();
      order.events.push({
        type: latePayment ? "late_payment_reconciled" : "payment_reconciled",
        label: latePayment ? "Late payment reconciled" : "Payment reconciled",
        note: latePayment ? "Verified payment was linked by an admin after the order ended. Value returned to Store Balance; do not dispatch." : "Verified Paystack payment linked by an admin.",
        actor: req.user._id,
      });
      await order.save();
      if (latePayment) {
        await creditPaidOrderToStoreBalance(order, "Verified unmatched payment received after order ended");
        order.events.push({ type: "store_balance_issued", label: "Payment value added to Store Balance" });
        await order.save();
        await restoreOrderStockOnce(order);
      }
      unmatched.status = "linked";
      unmatched.order = order._id;
      unmatched.resolutionNote = latePayment ? "Matched to an ended order; value was returned to Store Balance. Do not dispatch." : "Verified payment linked to the order.";
      const recipientEmail = order.user ? (await User.findById(order.user))?.email : order.guestInfo?.email;
      if (recipientEmail) {
        const message = latePayment
          ? `Your payment was matched to the order after it had ended. ${customerStoreBalanceMessage(order)} This order will not be dispatched.`
          : "Your payment is confirmed and linked to this order. Your receipt is available in Billing.";
        sendOrderUpdateEmail(recipientEmail, order, latePayment ? "Late payment reconciled" : "Payment reconciled", message).catch((err) => console.error("Payment reconciliation email failed:", err.message));
      }
      const io = req.app.get("io");
      emitOrderEvent(io, "order-status-updated", order);
    }
    unmatched.resolvedBy = req.user._id;
    unmatched.resolvedAt = new Date();
    await unmatched.save();
    claimedPaymentId = null;
    return res.json({ payment: unmatched, order });
  } catch (err) {
    if (claimedPaymentId) {
      await UnmatchedPayment.updateOne(
        { _id: claimedPaymentId, status: "processing" },
        { $set: { status: "open", resolvedBy: null } }
      ).catch((resetError) => console.error("Could not release unmatched-payment reconciliation claim:", resetError.message));
    }
    next(err);
  }
});

router.put("/unmatched/:id/store-balance", protect, requireRole("admin"), async (req, res, next) => {
  let claimedPaymentId = null;
  try {
    const unmatched = await UnmatchedPayment.findOne({ _id: req.params.id, status: "open" });
    if (!unmatched) return res.status(404).json({ message: "Open unmatched payment not found" });
    if (!unmatched.issueReason || unmatched.currency !== "KES" || unmatched.domain !== "live" || !unmatched.order) {
      return res.status(409).json({ message: "Only a verified live KSh payment with a recorded order mismatch can be credited" });
    }
    let order = await Order.findById(unmatched.order);
    if (!order) return res.status(404).json({ message: "The related order could not be found" });
    const orderEmail = order.user
      ? (await User.findById(order.user).select("email"))?.email
      : order.billingSnapshot?.email || order.guestInfo?.email;
    if (!unmatched.customerEmail || !orderEmail || unmatched.customerEmail.trim().toLowerCase() !== orderEmail.trim().toLowerCase()) {
      return res.status(409).json({ message: "The verified payment email does not match the order. Confirm the customer identity before crediting Store Balance." });
    }
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ message: "This order already has a recorded payment. Review this transaction as an additional payment." });
    }
    const claim = await UnmatchedPayment.updateOne(
      { _id: unmatched._id, status: "open" },
      { $set: { status: "processing", resolvedBy: req.user._id } }
    );
    if (!claim.modifiedCount) return res.status(409).json({ message: "Another admin is resolving this payment. Refresh and try again." });
    claimedPaymentId = unmatched._id;

    order = await Order.findById(order._id);
    if (!order) throw reconciliationError("The related order disappeared during resolution", 404);
    if (order.paymentStatus === "paid") throw reconciliationError("The order was paid while this mismatch was being resolved. Refresh and review it as an additional payment.");

    const amount = unmatched.amountSubunit / 100;
    const issued = await issueStoreBalance({
      order,
      amount,
      reference: `payment:${unmatched.reference}:store-balance-credit`,
      description: "Verified payment did not match the order total",
    });
    const claimStatus = issued.pendingClaim ? "pending" : order.user ? "not_required" : "claimed";
    order.storeBalanceClaimStatus = claimStatus;
    const reviewedAttempt = order.paymentAttempts.find((attempt) => attempt.reference === unmatched.reference);
    if (reviewedAttempt) reviewedAttempt.status = "failed";
    if (!order.events.some((event) => event.type === "payment_mismatch_balance_issued" && event.note?.includes(unmatched.reference))) {
      order.events.push({
        type: "payment_mismatch_balance_issued",
        label: "Payment value added to Store Balance",
        note: `Verified KSh ${amount.toLocaleString()} payment ${unmatched.reference} was added to Store Balance. This order remains unpaid.`,
        actor: req.user._id,
      });
    }
    await order.save();

    unmatched.status = "linked";
    unmatched.resolvedBy = req.user._id;
    unmatched.resolvedAt = new Date();
    unmatched.resolutionNote = issued.pendingClaim
      ? `KSh ${amount.toLocaleString()} added to pending Store Balance for ${orderEmail}; the customer must claim it with a verified account. Order remains unpaid.`
      : `KSh ${amount.toLocaleString()} credited to the customer's Store Balance. Order remains unpaid.`;
    await unmatched.save();
    claimedPaymentId = null;

    const recipientEmail = order.user ? orderEmail : order.guestInfo?.email || order.billingSnapshot?.email;
    if (recipientEmail) {
      const message = issued.pendingClaim
        ? `The verified payment did not match your order total. KSh ${amount.toLocaleString()} is waiting in Store Balance to be claimed. Create or sign in to an account using ${orderEmail} and verify that email. Your order remains unpaid and will not be dispatched.`
        : `The verified payment did not match your order total. KSh ${amount.toLocaleString()} has been added to your Azard Store Balance. Your order remains unpaid and will not be dispatched.`;
      sendOrderUpdateEmail(recipientEmail, order, "Payment value added to Store Balance", message).catch((err) => console.error("Payment mismatch resolution email failed:", err.message));
    }
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);
    return res.json({ payment: unmatched, order });
  } catch (err) {
    if (claimedPaymentId) {
      await UnmatchedPayment.updateOne(
        { _id: claimedPaymentId, status: "processing" },
        { $set: { status: "open", resolvedBy: null } }
      ).catch((resetError) => console.error("Could not release unmatched-payment resolution claim:", resetError.message));
    }
    next(err);
  }
});

function canAccessOrder(order, req, contact) {
  if (req.user) return order.user && order.user.toString() === req.user._id.toString();
  const candidate = String(contact || "").trim();
  return Boolean(order.guestInfo?.email && candidate.toLowerCase() === order.guestInfo.email.toLowerCase())
    || Boolean(order.guestInfo?.phone && normalizePhone(candidate) === normalizePhone(order.guestInfo.phone));
}

async function getOrderContact(order) {
  if (order.user) {
    const user = await User.findById(order.user);
    return { phone: user?.phone || "", email: user?.email || "" };
  }
  return { phone: order.guestInfo?.phone || "", email: order.guestInfo?.email || "" };
}

async function confirmOrderPayment(order, reference, { sendEmail = true } = {}) {
  const paymentReference = String(reference || order.paymentReference || "");
  if (!paymentReference) return false;
  const receivedAt = new Date();
  const receiptNumber = order.receiptNumber || `AS-R-${order._id.toString().slice(-8).toUpperCase()}`;
  let persistedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $nin: ["paid", "refund_pending", "refunded"] },
      $or: [{ paystackReference: paymentReference }, { "paymentAttempts.reference": paymentReference }],
    },
    {
      $set: {
        paymentTestMode: false,
        paymentTestStatus: "",
        paymentStatus: "paid",
        paymentReference,
        receiptNumber,
        receiptIssuedAt: receivedAt,
        "paymentAttempts.$[attempt].status": "paid",
      },
      $push: { events: { type: "payment_received", label: "Payment received", createdAt: receivedAt } },
    },
    { new: true, arrayFilters: [{ "attempt.reference": paymentReference }] }
  );
  let paymentSettledNow = Boolean(persistedOrder);
  let extraPaymentRecorded = false;
  if (!persistedOrder) {
    persistedOrder = await Order.findById(order._id);
    paymentSettledNow = false;
    if (!persistedOrder) return false;
    const primaryReference = persistedOrder.paymentReference
      || (persistedOrder.paymentAttempts || []).find((attempt) => attempt.status === "paid")?.reference
      || persistedOrder.paystackReference
      || "";
    if (persistedOrder.paymentStatus === "paid" && paymentReference !== primaryReference) {
      const amount = Math.max(0, Number(persistedOrder.totalAmount || 0) - Number(persistedOrder.storeBalanceApplied || 0));
      const result = await issueAdditionalPaymentCredit(persistedOrder._id, paymentReference, amount);
      extraPaymentRecorded = result.newlyCredited;
      persistedOrder = result.order;
    }
  }

  if (!persistedOrder) return false;
  if (persistedOrder.status === "confirmed" && persistedOrder.stockReservedUntil && persistedOrder.stockReservedUntil <= receivedAt) {
    const expiry = await Order.updateOne(
      { _id: persistedOrder._id, status: "confirmed", paymentStatus: "paid", stockReservedUntil: { $lte: receivedAt } },
      {
        $set: { status: "expired" },
        $push: { events: { type: "late_payment_after_expiry", label: "Late payment received", note: "Payment added to store balance; do not dispatch.", createdAt: receivedAt } },
      }
    );
    if (expiry.modifiedCount) persistedOrder = await Order.findById(order._id);
  }

  const orderEnded = ["cancelled", "expired", "unavailable"].includes(persistedOrder.status);
  if (orderEnded && !persistedOrder.paymentTestMode && !persistedOrder.storeBalanceCreditedAt) {
    await creditPaidOrderToStoreBalance(persistedOrder, "Payment received after order ended");
    if (!persistedOrder.events.some((event) => event.type === "store_balance_issued" && event.note?.includes(paymentReference))) {
      persistedOrder.events.push({ type: "store_balance_issued", label: "Payment returned to store balance", note: `Payment reference ${paymentReference}` });
    }
    await persistedOrder.save();
  }

  order.status = persistedOrder.status;
  order.paymentStatus = persistedOrder.paymentStatus;
  order.paymentReference = persistedOrder.paymentReference;
  order.receiptNumber = persistedOrder.receiptNumber;
  order.receiptIssuedAt = persistedOrder.receiptIssuedAt;
  order.storeBalanceStatus = persistedOrder.storeBalanceStatus;
  order.storeBalanceCreditedAt = persistedOrder.storeBalanceCreditedAt;
  order.storeBalanceCreditedAmount = persistedOrder.storeBalanceCreditedAmount;
  order.storeBalanceClaimStatus = persistedOrder.storeBalanceClaimStatus;
  order.events = persistedOrder.events;
  order.additionalPaymentRefunds = persistedOrder.additionalPaymentRefunds;
  order.additionalPaymentCredits = persistedOrder.additionalPaymentCredits;
  for (const currentAttempt of order.paymentAttempts || []) {
    const persistedAttempt = (persistedOrder.paymentAttempts || []).find((attempt) => attempt.reference === currentAttempt.reference);
    if (persistedAttempt) currentAttempt.status = persistedAttempt.status;
  }

  const { email } = await getOrderContact(persistedOrder);
  if (email && sendEmail && (paymentSettledNow || extraPaymentRecorded)) {
    const latePayment = orderEnded;
    if (extraPaymentRecorded) {
      const extraCredit = (persistedOrder.additionalPaymentCredits || []).find((entry) => entry.reference === paymentReference);
      const amount = Number(extraCredit?.amount || 0).toLocaleString();
      const message = extraCredit?.claimStatus === "pending"
        ? `Your order payment remains confirmed. An additional verified payment of KSh ${amount} is ready to claim. Sign in or create an account with your order email, then verify that email address to claim Store Balance.`
        : `Your order payment remains confirmed. The additional verified payment of KSh ${amount} has been added to Store Balance for a future order.`;
      sendOrderUpdateEmail(email, order, "Additional payment added to Store Balance", message).catch((err) => console.error("Duplicate payment email failed:", err.message));
    } else {
      const title = latePayment ? "Payment received after order ended" : "Payment received";
      const message = latePayment
        ? `Your payment arrived after this order had ended. ${customerStoreBalanceMessage(persistedOrder)} This order will not be dispatched.`
        : persistedOrder.status === "pending"
          ? "Payment was received, but your order is still awaiting availability confirmation. Azard Stores will update you before preparing it."
          : "Your payment has been confirmed. Your receipt is now available and your order is being prepared.";
      sendOrderUpdateEmail(email, order, title, message).catch((err) => console.error("Payment confirmation email failed:", err.message));
    }
  }
  return true;
}

// A failed attempt leaves the order active and its stock reserved so the
// customer can retry payment. Only explicit cancellation releases stock.
async function markPaymentFailed(order, reason, customerMessage = reason, reference = "") {
  if (!order || (order.paymentTestMode && order.paymentTestStatus === "succeeded")) return null;
  const filter = {
    _id: order._id,
    status: { $nin: ["cancelled", "expired", "unavailable"] },
    paymentStatus: { $nin: ["paid", "failed", "refund_pending", "refunded"] },
  };
  const update = {
    $set: { paymentStatus: "failed" },
    $push: { events: { type: "payment_failed", label: "Payment attempt failed", note: customerMessage || "" } },
  };
  if (order.paymentTestMode) filter.paymentTestStatus = { $ne: "succeeded" };
  if (reference) {
    filter.paymentAttempts = { $elemMatch: { reference, status: "pending" } };
    update.$set["paymentAttempts.$.status"] = "failed";
  }
  // A provider's delayed failure callback must never overwrite a success
  // callback that already moved the order to paid.
  const updated = await Order.findOneAndUpdate(filter, update, { new: true });
  if (!updated) return null;
  console.log(`Order ${order._id} payment attempt failed; stock remains reserved: ${reason || ""}`);
  return updated;
}

function customerMpesaFailureMessage(resultDescription = "", resultCode = "") {
  const reason = String(resultDescription).toLowerCase();
  const code = String(resultCode);
  if (code === "1" || reason.includes("insufficient") || reason.includes("not enough funds") || reason.includes("balance is low") || reason.includes("balance is insufficient")) {
    return "The M-Pesa account did not have enough funds. Add funds and retry.";
  }
  if (["1037", "1019"].includes(code) || reason.includes("timeout") || reason.includes("timed out") || reason.includes("no response") || reason.includes("cannot be reached") || reason.includes("unreachable")) {
    return "The M-Pesa prompt expired or could not reach your phone. Check your signal and retry.";
  }
  if (code === "2001" || reason.includes("wrong pin") || reason.includes("incorrect pin")) {
    return "The M-Pesa PIN was not accepted. Check it and retry.";
  }
  if (code === "1032" || reason.includes("cancel")) {
    return "The payment was cancelled on the phone. Retry when you are ready.";
  }
  return "M-Pesa declined the payment. Check your wallet balance, transaction limits, and phone prompt, then retry.";
}

// New M-Pesa orders use Paystack's asynchronous mobile-money charge. The
// webhook is the primary confirmation path; this throttled verification is
// the fallback while the customer is still on the order page.
async function reconcilePaystackMpesa(order, req) {
  const attempt = [...(order.paymentAttempts || [])].reverse().find((entry) => entry.provider === "paystack" && entry.status === "pending");
  if (!isPaystackConfigured() || !attempt || order.paymentMethod !== "mpesa" || ["paid", "refund_pending", "refunded"].includes(order.paymentStatus)) return order;

  const staleBefore = new Date(Date.now() - 12000);
  let claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $nin: ["paid", "refund_pending", "refunded"] },
      paymentAttempts: { $elemMatch: { reference: attempt.reference, provider: "paystack", status: "pending" } },
      $or: [
        { paystackStatusQueriedAt: null },
        { paystackStatusQueriedAt: { $exists: false } },
        { paystackStatusQueriedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { paystackStatusQueriedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return (await Order.findById(order._id)) || order;

  try {
    const charge = await checkCharge(attempt.reference);
    if (charge.reference !== attempt.reference) throw new Error("Paystack returned a different M-Pesa charge reference");
    if (charge.status === "success") {
      // A successful charge lookup alone is not enough to settle an order;
      // verify amount, currency, reference, and live provider domain separately.
      const verified = await verifyTransaction(attempt.reference);
      if (isVerifiedPayment(verified, attempt.reference, claimed.totalAmount - Number(claimed.storeBalanceApplied || 0))) {
        await confirmOrderPayment(claimed, attempt.reference);
      } else if (await recordPaymentMismatch(claimed, attempt.reference, verified, claimed.totalAmount - Number(claimed.storeBalanceApplied || 0))) {
        // Keep the order unpaid and prevent another prompt until the verified
        // but mismatched payment has been reviewed by Azard Stores.
      } else if (["failed", "abandoned"].includes(verified.status)) {
        claimed = await markPaymentFailed(claimed, verified.gatewayResponse || "Paystack M-Pesa charge was not completed", "The M-Pesa payment was not completed. You can retry while your stock reservation is active.", attempt.reference)
          || await Order.findById(order._id)
          || claimed;
      }
    } else if (["failed", "timeout"].includes(charge.status)) {
      claimed = await markPaymentFailed(claimed, charge.message || `Paystack M-Pesa charge ended (${charge.status})`, "Paystack reports that this M-Pesa request was not completed. You can retry while your stock reservation is active.", attempt.reference)
        || await Order.findById(order._id)
        || claimed;
    }
    claimed = (await Order.findById(order._id)) || claimed;
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", claimed);
    return claimed;
  } catch (err) {
    console.error("Paystack M-Pesa status verification failed:", err.message);
    return (await Order.findById(order._id)) || claimed;
  }
}

// ── M-Pesa ──────────────────────────────────────────────────────────────────

// POST /api/payments/mpesa/initiate - body: { orderId }
router.post("/mpesa/initiate", paymentLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!isPaystackMpesaConfigured()) {
      return res.status(503).json({ message: "M-Pesa via Paystack is not enabled for checkout. Confirm that M-Pesa is active on the Paystack account and set PAYSTACK_MPESA_ENABLED=true." });
    }
    let order = await Order.findById(req.body.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canAccessOrder(order, req, req.body.contact)) return res.status(404).json({ message: "Order not found" });
    if (["cancelled", "unavailable"].includes(order.status)) return res.status(409).json({ message: "This order has ended and can no longer accept payment" });
    if (order.status === "expired") return res.status(409).json({ message: "This order has expired. Contact Azard Stores if you still want to place it." });
    if (order.paymentMethod !== "mpesa") {
      return res.status(400).json({ message: "This order isn't set up for M-Pesa payment" });
    }
    if (["refund_pending", "refunded"].includes(order.paymentStatus)) return res.status(409).json({ message: "This payment is under refund review and cannot be retried" });
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order has already been paid" });
    }
    if (order.paymentAttempts.some((attempt) => attempt.status === "review")) {
      return res.status(409).json({ message: "A successful payment needs review before another payment can be started. Do not try another payment; contact Azard Stores for help." });
    }
    if (order.paymentTestMode && order.paymentTestStatus === "succeeded") {
      return res.status(409).json({ message: "This payment has not been confirmed. Contact Azard Stores before trying again." });
    }
    if (order.status !== "confirmed" || !order.stockReservedAt || !order.stockReservedUntil || order.stockReservedUntil <= new Date()) {
      return res.status(409).json({ message: "Azard Stores must confirm availability first. Payment is available for 5 days after confirmation." });
    }

    const contact = await getOrderContact(order);
    if (!contact.phone) {
      return res.status(400).json({ message: "No phone number on file for this order" });
    }
    const email = contact.email || order.guestInfo?.email;
    if (!email) return res.status(400).json({ message: "An email address is required for M-Pesa payment" });
    const phone = normalizePhone(contact.phone);

    const pendingAttempt = [...(order.paymentAttempts || [])].reverse().find((entry) => entry.provider === "paystack" && entry.status === "pending");
    if (pendingAttempt) {
      try {
        const charge = await checkCharge(pendingAttempt.reference);
        if (charge.reference !== pendingAttempt.reference) throw new Error("Paystack returned a different M-Pesa charge reference");

        if (["failed", "timeout"].includes(charge.status)) {
          order = await markPaymentFailed(
            order,
            charge.message || `Paystack M-Pesa charge ended (${charge.status})`,
            "The previous M-Pesa request did not complete. Starting a new request.",
            pendingAttempt.reference
          ) || await Order.findById(order._id) || order;
        } else if (charge.status === "success") {
          const verified = await verifyTransaction(pendingAttempt.reference);
          if (isVerifiedPayment(verified, pendingAttempt.reference, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
            await confirmOrderPayment(order, pendingAttempt.reference);
            return res.json({ reference: pendingAttempt.reference, status: "success", displayText: "Payment confirmed." });
          }
          if (await recordPaymentMismatch(order, pendingAttempt.reference, verified, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
            return res.status(409).json({ message: "Your M-Pesa payment needs review. The order remains unpaid; do not try paying again until Azard Stores contacts you." });
          }
          if (["failed", "abandoned"].includes(verified.status)) {
            order = await markPaymentFailed(
              order,
              verified.gatewayResponse || "The previous M-Pesa request did not complete",
              "The previous M-Pesa request did not complete. Starting a new request.",
              pendingAttempt.reference
            ) || await Order.findById(order._id) || order;
          } else {
            return res.json({ reference: pendingAttempt.reference, status: verified.status, displayText: "Paystack is still confirming the M-Pesa payment. Wait for the current request to finish before retrying." });
          }
        } else {
          return res.json({ reference: pendingAttempt.reference, status: charge.status, displayText: "A payment request is already active. Approve it on your phone or wait for it to finish before retrying." });
        }
      } catch (err) {
        console.error("Paystack M-Pesa retry check failed:", err.message);
        return res.status(409).json({ message: "A previous M-Pesa request may still be active. Check your phone or try again in a few minutes." });
      }
    }
    const reference = `azard-mpesa-${order._id}-${Date.now()}`;
    const initiation = await claimPaymentInitiation(order, reference, { provider: "paystack", reference, phone, status: "pending" });
    if (!initiation) return res.status(409).json({ message: "A payment request is already starting or active. Refresh the order and check its payment status." });
    order = initiation.order;

    let charge;
    try {
      charge = await initiateMpesaCharge({
        email,
        phone: `+${phone}`,
        amount: Math.max(0, order.totalAmount - Number(order.storeBalanceApplied || 0)),
        reference,
        metadata: { orderId: order._id.toString(), paymentMethod: "mpesa" },
      });
    } catch (err) {
      console.error("Paystack M-Pesa charge initiation failed:", err.message);
      // The request may have reached Paystack even if our connection failed.
      // Keep this reference pending so a retry checks its provider status
      // instead of issuing a second phone prompt.
      await releasePaymentInitiation(order._id, initiation.initiatedAt);
      const providerReason = String(err.message || "").replace(/[\r\n]+/g, " ").slice(0, 180);
      return res.status(502).json({ message: `We could not confirm whether Paystack started the M-Pesa prompt${providerReason ? `: ${providerReason}` : ". Check your phone and order status before trying again."}` });
    }

    await releasePaymentInitiation(order._id, initiation.initiatedAt);

    res.json({
      reference: charge.reference,
      status: charge.status,
      displayText: charge.displayText,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/mpesa/status/:orderId - polled by the frontend while
// waiting on the STK push prompt. Requires the signed-in owner or guest contact.
router.get("/mpesa/status/:orderId", paymentStatusLimiter, optionalAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canAccessOrder(order, req, req.query.contact)) return res.status(404).json({ message: "Order not found" });
    const updatedOrder = await reconcilePaystackMpesa(order, req);
    res.json({ paymentStatus: updatedOrder.paymentStatus, orderStatus: updatedOrder.status, order: customerOrderView(updatedOrder) });
  } catch (err) {
    next(err);
  }
});

// ── Paystack ─────────────────────────────────────────────────────────────────

// POST /api/payments/paystack/initialize - body: { orderId }
router.post("/paystack/initialize", paymentLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!isPaystackConfigured()) {
      return res.status(503).json({ message: "Card payment isn't set up yet — please choose another payment method" });
    }
    let order = await Order.findById(req.body.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canAccessOrder(order, req, req.body.contact)) return res.status(404).json({ message: "Order not found" });
    if (["cancelled", "unavailable"].includes(order.status)) return res.status(409).json({ message: "This order has ended and can no longer accept payment" });
    if (order.status === "expired") return res.status(409).json({ message: "This order has expired. Contact Azard Stores if you still want to place it." });
    if (order.paymentMethod !== "paystack") {
      return res.status(400).json({ message: "This order isn't set up for card payment" });
    }
    if (["refund_pending", "refunded"].includes(order.paymentStatus)) return res.status(409).json({ message: "This payment is under refund review and cannot be retried" });
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order has already been paid" });
    }
    if (order.paymentAttempts.some((attempt) => attempt.status === "review")) {
      return res.status(409).json({ message: "A successful payment needs review before another payment can be started. Do not try another payment; contact Azard Stores for help." });
    }
    if (order.paymentTestMode && order.paymentTestStatus === "succeeded") {
      return res.status(409).json({ message: "This payment has not been confirmed. Contact Azard Stores before trying again." });
    }
    if (order.status !== "confirmed" || !order.stockReservedAt || !order.stockReservedUntil || order.stockReservedUntil <= new Date()) {
      return res.status(409).json({ message: "Azard Stores must confirm availability first. Payment is available for 5 days after confirmation." });
    }

    const pendingAttempt = [...(order.paymentAttempts || [])].reverse().find((entry) => entry.provider === "paystack" && entry.status === "pending");
    if (pendingAttempt) {
      try {
        const verified = await verifyTransaction(pendingAttempt.reference);
        if (isVerifiedPayment(verified, pendingAttempt.reference, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
          await confirmOrderPayment(order, pendingAttempt.reference);
          pendingAttempt.status = "paid";
          await order.save();
          return res.status(409).json({ message: "This order has already been paid" });
        }
        if (await recordPaymentMismatch(order, pendingAttempt.reference, verified, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
          return res.status(409).json({ message: "Paystack confirmed a payment that needs review. The order remains unpaid; do not try paying again until Azard Stores contacts you." });
        }
        if (!["failed", "abandoned"].includes(verified.status)) {
          return res.status(409).json({ message: "A card payment is still processing. Wait for Paystack to confirm it before trying again." });
        }
        order = await markPaymentFailed(order, verified.gatewayResponse || "The previous card payment was not completed", "The previous card payment was not completed. You can start a new payment.", pendingAttempt.reference)
          || await Order.findById(order._id)
          || order;
      } catch (err) {
        console.error("Paystack card retry check failed:", err.message);
        return res.status(409).json({ message: "A previous card payment may still be processing. Check its status before trying again." });
      }
    }

    const { email } = await getOrderContact(order);
    if (!email) {
      // Every guest checkout now requires an email address.
      return res.status(400).json({ message: "An email address is required for card payment" });
    }

    // A fresh, unique reference per attempt — reusing one across retries
    // isn't safe with Paystack's API.
    const reference = `azard-${order._id}-${Date.now()}`;
    const callbackUrl = new URL("/payment/callback", process.env.CLIENT_URL || "http://localhost:5173");
    callbackUrl.searchParams.set("access", createPaymentCallbackToken(reference));
    // Persist the reference before asking Paystack to initialize it. If the
    // provider creates a transaction and this process stops before saving,
    // its success callback would otherwise have no order to attach to.
    const initiation = await claimPaymentInitiation(order, reference, { provider: "paystack", reference, status: "pending" });
    if (!initiation) return res.status(409).json({ message: "A payment request is already starting or active. Refresh the order and check its payment status." });
    order = initiation.order;

    let authorizationUrl;
    try {
      ({ authorizationUrl } = await initializeTransaction({
        email,
        amount: Math.max(0, order.totalAmount - Number(order.storeBalanceApplied || 0)),
        reference,
        callbackUrl: callbackUrl.toString(),
        metadata: { orderId: order._id.toString() },
      }));
    } catch (err) {
      // Initialization can time out after Paystack created the transaction.
      // Keep the reference pending; the next attempt verifies this reference
      // before it is allowed to start another checkout.
      await releasePaymentInitiation(order._id, initiation.initiatedAt);
      return res.status(502).json({ message: "We could not confirm whether Paystack started the card checkout. Check the payment status before trying again." });
    }

    await releasePaymentInitiation(order._id, initiation.initiatedAt);

    res.json({ authorizationUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/paystack/webhook - public, called by Paystack directly.
// Needs the RAW request body for signature verification — server.js already
// captures this globally as req.rawBody (same mechanism the WhatsApp webhook
// uses), so no middleware changes were needed here.
router.post("/paystack/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    if (!verifyWebhookSignature(req.rawBody, signature)) {
      console.error("Paystack webhook: invalid signature");
      return res.status(400).end();
    }

    const { event, data } = req.body || {};
    // Paystack sends other signed event types too. They do not affect an
    // order's payment state, so acknowledge them before attempting a lookup
    // or verification that only applies to charge events.
    if (event !== "charge.success" && event !== "charge.failed") {
      return res.status(200).end();
    }
    if (typeof data?.reference !== "string" || !data.reference.trim()) {
      console.error("Paystack charge webhook is missing a transaction reference");
      return res.status(400).end();
    }
    let order = await Order.findOne({ $or: [{ paystackReference: data?.reference }, { "paymentAttempts.reference": data?.reference }] });
    if (!order) {
      console.error("Paystack webhook for unknown order, reference:", data?.reference);
      if (event === "charge.success" && data?.reference) {
        const verified = await verifyTransaction(data.reference);
        if (verified.status === "success"
          && verified.reference === data.reference
          && Number.isSafeInteger(verified.amountSubunit)
          && verified.amountSubunit > 0
          && verified.currency === "KES"
          && verified.domain === "live") {
          await UnmatchedPayment.updateOne(
            { reference: verified.reference },
            { $setOnInsert: {
              reference: verified.reference,
              amountSubunit: verified.amountSubunit,
              currency: verified.currency,
              domain: verified.domain,
              customerEmail: verified.customerEmail || "",
              metadataOrderId: verified.metadataOrderId || "",
              gatewayResponse: verified.gatewayResponse || "",
            } },
            { upsert: true }
          );
        }
      }
      return res.status(200).end();
    }

    if (event === "charge.success") {
      // Don't just trust the webhook payload — re-verify directly with
      // Paystack's API before marking paid, per their own recommendation.
      const verified = await verifyTransaction(data.reference);
      if (isVerifiedPayment(verified, data.reference, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
        await confirmOrderPayment(order, data.reference);
      } else if (await recordPaymentMismatch(order, data.reference, verified, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
        // The payment is safely retained for review; never label it as paid
        // or invite a duplicate payment attempt.
      } else {
        order = await markPaymentFailed(order, "webhook reported success but verification did not confirm it", "The provider has not confirmed this payment. The order remains unpaid; check the order status before trying again.", data.reference)
          || await Order.findById(order._id)
          || order;
      }
    } else if (event === "charge.failed") {
      order = await markPaymentFailed(order, event, "The payment was not completed. You can retry while the order reservation is active.", data?.reference)
        || await Order.findById(order._id)
        || order;
    }
    order = (await Order.findById(order._id)) || order;
    const io = req.app.get("io");
    emitOrderEvent(io, "order-status-updated", order);

    res.status(200).end();
  } catch (err) {
    console.error("Error processing Paystack webhook:", err.message);
    res.status(500).end(); // Ask Paystack to retry if processing failed before we could persist the payment.
  }
});

// GET /api/payments/paystack/verify/:reference - called by the frontend's
// callback page right when the customer returns from Paystack's hosted
// checkout, so they see a result immediately rather than waiting on the
// webhook (which can lag a few seconds behind the redirect).
router.get("/paystack/verify/:reference", paymentStatusLimiter, optionalAuth, async (req, res, next) => {
  try {
    let order = await Order.findOne({ $or: [{ paystackReference: req.params.reference }, { "paymentAttempts.reference": req.params.reference }] });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canAccessOrder(order, req, req.query.contact) && !isValidPaymentCallbackToken(req.params.reference, req.query.callbackToken)) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.paymentStatus !== "paid") {
      const verified = await verifyTransaction(req.params.reference);
      if (isVerifiedPayment(verified, req.params.reference, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
        await confirmOrderPayment(order, req.params.reference);
        const attempt = order.paymentAttempts.find((entry) => entry.reference === req.params.reference);
        if (attempt) attempt.status = "paid";
        await order.save();
        const io = req.app.get("io");
        emitOrderEvent(io, "order-status-updated", order);
      } else if (await recordPaymentMismatch(order, req.params.reference, verified, order.totalAmount - Number(order.storeBalanceApplied || 0))) {
        const io = req.app.get("io");
        emitOrderEvent(io, "order-status-updated", order);
      } else if (["failed", "abandoned"].includes(verified.status)) {
        order = await markPaymentFailed(order, verified.gatewayResponse || "Paystack reports that this payment did not complete", "The payment provider confirmed that this payment did not complete. You can start a new payment while the reservation is active.", req.params.reference)
          || await Order.findById(order._id)
          || order;
        const io = req.app.get("io");
        emitOrderEvent(io, "order-status-updated", order);
      } else if (!["cancelled", "unavailable"].includes(order.status)) {
        // Ongoing payments remain unpaid while the customer completes the
        // provider flow. Only a verified terminal result closes an attempt.
      }
    }

    res.json({ order: customerOrderView(order), paymentStatus: order.paymentStatus });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
