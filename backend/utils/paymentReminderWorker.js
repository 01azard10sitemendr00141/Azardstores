const Order = require("../models/Order");
const User = require("../models/User");
const { sendPaymentReminderEmail, sendOrderUpdateEmail } = require("./email");
const { restoreOrderStockOnce, recoverAbandonedStockReservations } = require("./orderStock");
const crypto = require("crypto");
const { releaseOrderBalance, creditPaidOrderToStoreBalance, customerStoreBalanceMessage } = require("./storeBalance");
const { emitOrderEvent } = require("./orderRealtime");

const REMINDER_OFFSETS_MINUTES = [15, 240, 720, 1440, 2880];
let running = false;

async function recipientFor(order) {
  if (order.guestInfo?.email) return order.guestInfo.email;
  if (!order.user) return "";
  const user = await User.findById(order.user).select("email");
  return user?.email || "";
}

async function expireUnpaidParcelOrders(now, orderIds = null, io = null) {
  const scope = Array.isArray(orderIds) ? { _id: { $in: orderIds } } : {};
  const due = await Order.find({
    ...scope,
    status: "confirmed",
    paymentMethod: { $in: ["mpesa", "paystack"] },
    paymentStatus: { $in: ["unpaid", "failed"] },
    stockReservedUntil: { $lte: now },
    stockRestoredAt: null,
  }).limit(100);

  for (const candidate of due) {
    const expired = await Order.findOneAndUpdate(
      { _id: candidate._id, status: "confirmed", paymentStatus: { $in: ["unpaid", "failed"] }, stockReservedUntil: { $lte: now } },
      { $set: { status: "expired" }, $push: { events: { type: "order_expired", label: "Order expired", note: "Payment was not received within 5 days; reserved stock was released." } } },
      { new: true }
    );
    if (!expired) continue;

    await releaseOrderBalance(expired);
    await expired.save();
    await restoreOrderStockOnce(expired);
    emitOrderEvent(io, "order-status-updated", expired);
    const to = await recipientFor(expired);
    if (to) {
      const paymentStillProcessing = (expired.paymentAttempts || []).some((attempt) => attempt.provider === "paystack" && attempt.status === "pending");
      const paymentProvider = expired.paymentMethod === "mpesa" ? "M-Pesa via Paystack" : "Paystack";
      const title = paymentStillProcessing ? "Reservation ended while payment was processing" : "Order expired";
      const message = paymentStillProcessing
        ? `The 5-day payment deadline passed and the stock reservation was released. This order cannot be dispatched. Check My Orders for the payment status and do not start another payment while ${paymentProvider} is processing it. Any confirmed late payment will be added to Store Balance.`
        : "The 5-day payment deadline passed. This order expired and its stock reservation was released. Contact Azard Stores if you would still like to place the order.";
      sendOrderUpdateEmail(to, expired, title, message).catch((err) => console.error("Order expiry email failed:", err.message));
    }
  }

  // Recover reservations if a previous worker stopped after marking expiry.
  const pendingRestores = await Order.find({ ...scope, status: { $in: ["cancelled", "expired", "unavailable"] }, stockRestoredAt: null, stockReservedAt: { $ne: null } }).limit(100);
  for (const order of pendingRestores) {
    try {
      await restoreOrderStockOnce(order);
    } catch (error) {
      console.error(`Stock restoration needs review for order ${order._id}:`, error.message);
    }
  }

  const pendingBalanceReleases = await Order.find({
    ...scope,
    status: { $in: ["cancelled", "expired", "unavailable"] },
    paymentStatus: { $in: ["unpaid", "failed"] },
    storeBalanceStatus: { $in: ["reserved", "applied", "releasing"] },
  }).limit(100);
  for (const order of pendingBalanceReleases) {
    await releaseOrderBalance(order);
    await order.save();
    emitOrderEvent(io, "order-status-updated", order);
  }

  // Recover a paid order that ended before its Store Balance credit was
  // recorded (for example, if the server stopped during cancellation).
  const pendingPaidCredits = await Order.find({
    ...scope,
    status: { $in: ["cancelled", "expired", "unavailable"] },
    paymentStatus: "paid",
    paymentTestMode: { $ne: true },
    storeBalanceCreditedAt: null,
  }).limit(100);
  for (const order of pendingPaidCredits) {
    try {
      await creditPaidOrderToStoreBalance(order, "Recovered after interrupted order resolution");
      const recoveryNote = "Recovery worker completed an interrupted Store Balance credit.";
      const recorded = await Order.updateOne(
        {
          _id: order._id,
          storeBalanceCreditedAt: { $ne: null },
          events: { $not: { $elemMatch: { type: "store_balance_issued", note: recoveryNote } } },
        },
        { $push: { events: { type: "store_balance_issued", label: "Value added to Store Balance", note: recoveryNote } } }
      );
      if (recorded.modifiedCount) {
        emitOrderEvent(io, "order-status-updated", order);
        const to = await recipientFor(order);
        if (to) {
          sendOrderUpdateEmail(to, order, "Order value added to Store Balance", `${customerStoreBalanceMessage(order)} This order will not be dispatched. Store Balance can be used toward a future order; cash refunds are not offered.`)
            .catch((err) => console.error("Recovered Store Balance email failed:", err.message));
        }
      }
    } catch (error) {
      console.error(`Store Balance recovery needs review for order ${order._id}:`, error.message);
    }
  }
}

async function runPaymentReminderSweep(now = new Date(), io = null) {
  if (running) return;
  running = true;
  try {
    await recoverAbandonedStockReservations(now);
    await expireUnpaidParcelOrders(now, null, io);
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
    const candidates = await Order.find({
      status: "confirmed",
      paymentMethod: { $in: ["mpesa", "paystack"] },
      paymentStatus: { $in: ["unpaid", "failed"] },
      stockReservedUntil: { $gt: now },
      availabilityConfirmedAt: { $lte: new Date(now.getTime() - REMINDER_OFFSETS_MINUTES[0] * 60_000) },
    }).limit(100);

    for (const order of candidates) {
      if (order.paymentStatus === "paid" || order.status === "cancelled") continue;
      const elapsedMinutes = (now.getTime() - order.availabilityConfirmedAt.getTime()) / 60_000;
      if (elapsedMinutes > REMINDER_OFFSETS_MINUTES[REMINDER_OFFSETS_MINUTES.length - 1]) continue;
      const dueOffset = [...REMINDER_OFFSETS_MINUTES].reverse().find((offset) =>
        elapsedMinutes >= offset && !order.paymentReminders.some((reminder) => reminder.offsetMinutes === offset && reminder.sentAt)
      );
      if (!dueOffset) continue;

      const to = await recipientFor(order);
      if (!to) continue;

      const claimToken = crypto.randomUUID();
      const staleClaimBefore = new Date(now.getTime() - 10 * 60_000);
      const claimFilter = {
          _id: order._id,
          paymentMethod: { $in: ["mpesa", "paystack"] },
          paymentStatus: { $in: ["unpaid", "failed"] },
          status: "confirmed",
          stockReservedUntil: { $gt: now },
      };
      const claimRecord = { offsetMinutes: dueOffset, sentAt: null, claimedAt: now, claimToken };
      const staleClaimFilter = {
        offsetMinutes: dueOffset,
        sentAt: null,
        $or: [{ claimedAt: { $lt: staleClaimBefore } }, { claimedAt: null }],
      };

      // Reclaim an expired in-progress reminder with an array-filter update.
      // MongoDB rejects a single update that $pulls and $pushes the same array.
      let claimedOrder = await Order.findOneAndUpdate(
        {
          ...claimFilter,
          paymentReminders: { $elemMatch: staleClaimFilter },
        },
        {
          $set: {
            "paymentReminders.$[reminder].claimedAt": now,
            "paymentReminders.$[reminder].claimToken": claimToken,
          },
        },
        {
          new: true,
          arrayFilters: [{ "reminder.offsetMinutes": dueOffset, "reminder.sentAt": null, $or: [{ "reminder.claimedAt": { $lt: staleClaimBefore } }, { "reminder.claimedAt": null }] }],
        }
      );

      // If no stale claim exists, append a claim only while this offset has
      // never been recorded. The predicate makes concurrent workers compete
      // atomically, so only one can send the reminder.
      if (!claimedOrder) {
        claimedOrder = await Order.findOneAndUpdate(
          {
            ...claimFilter,
            paymentReminders: { $not: { $elemMatch: { offsetMinutes: dueOffset } } },
          },
          { $push: { paymentReminders: claimRecord } },
          { new: true }
        );
      }
      if (!claimedOrder) continue;

      try {
        // The order may have been paid, cancelled, or expired while the
        // recipient was resolved and the reminder claim was acquired.
        // Recheck immediately before contacting the customer.
        const stillEligible = await Order.exists({
          _id: order._id,
          paymentMethod: { $in: ["mpesa", "paystack"] },
          paymentStatus: { $in: ["unpaid", "failed"] },
          status: "confirmed",
          stockReservedUntil: { $gt: new Date() },
          paymentReminders: {
            $elemMatch: { offsetMinutes: dueOffset, sentAt: null, claimToken },
          },
        });
        if (!stillEligible) {
          await Order.updateOne(
            { _id: order._id },
            { $pull: { paymentReminders: { offsetMinutes: dueOffset, claimToken } } }
          );
          continue;
        }

        await sendPaymentReminderEmail(to, order, dueOffset);
        await Order.updateOne(
          {
            _id: order._id,
            paymentStatus: { $in: ["unpaid", "failed"] },
            status: "confirmed",
            stockReservedUntil: { $gt: new Date() },
          },
          { $set: { "paymentReminders.$[reminder].sentAt": now, "paymentReminders.$[reminder].claimedAt": null, "paymentReminders.$[reminder].claimToken": "" } },
          { arrayFilters: [{ "reminder.offsetMinutes": dueOffset, "reminder.claimToken": claimToken }] }
        );
      } catch (err) {
        await Order.updateOne({ _id: order._id }, { $pull: { paymentReminders: { offsetMinutes: dueOffset, claimToken } } });
        console.error(`Payment reminder failed for order ${order._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Payment reminder sweep failed:", err.message);
  } finally {
    running = false;
  }
}

function startPaymentReminderWorker(io = null) {
  const interval = setInterval(() => runPaymentReminderSweep(new Date(), io), 60_000);
  interval.unref?.();
  runPaymentReminderSweep(new Date(), io);
  return interval;
}

module.exports = { startPaymentReminderWorker, runPaymentReminderSweep, expireUnpaidParcelOrders, REMINDER_OFFSETS_MINUTES };
