const User = require("../models/User");
const StoreBalanceTransaction = require("../models/StoreBalanceTransaction");

let storeBalanceLedgerReady;

function supportsStoreBalanceTransactions() {
  const topologyType = User.db.client?.topology?.description?.type;
  return ["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"].includes(topologyType);
}

async function migrateLegacyTransactions(userId, session) {
  const owner = await User.findById(userId).select("+storeBalanceTransactions").session(session);
  if (!owner) throw new Error("Store balance account was not found");
  const legacy = owner.storeBalanceTransactions || [];
  if (!legacy.length) return;
  await StoreBalanceTransaction.bulkWrite(legacy.map((entry) => ({
    updateOne: {
      filter: { user: userId, reference: entry.reference },
      update: { $setOnInsert: {
        user: userId,
        type: entry.type,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        reference: entry.reference,
        order: entry.order || null,
        description: entry.description || "",
        createdAt: entry.createdAt || new Date(),
      } },
      upsert: true,
    },
  })), { session, ordered: false });
  await User.updateOne({ _id: userId }, { $unset: { storeBalanceTransactions: 1 } }, { session });
}

async function changeBalanceTransactionally(userId, { amount, type, reference, orderId, description, value, increment }) {
  storeBalanceLedgerReady ||= StoreBalanceTransaction.init();
  await storeBalanceLedgerReady;
  const session = await User.db.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      await migrateLegacyTransactions(userId, session);
      const existing = await StoreBalanceTransaction.findOne({ user: userId, reference }).session(session).lean();
      if (existing) {
        outcome = { duplicate: true, amount: Number(existing.amount) };
        return;
      }
      const filter = { _id: userId };
      if (increment < 0) filter.storeBalance = { $gte: value };
      const updatedUser = await User.findOneAndUpdate(filter, { $inc: { storeBalance: increment } }, { new: true, session }).select("storeBalance");
      if (!updatedUser) {
        const exists = await User.exists({ _id: userId }).session(session);
        if (!exists) throw new Error("Store balance account was not found");
        if (increment < 0) throw new Error("Insufficient store balance");
        throw new Error("Store balance transaction could not be recorded");
      }
      await StoreBalanceTransaction.create([{
        user: userId,
        type,
        amount: value,
        balanceAfter: Number(updatedUser.storeBalance || 0),
        reference,
        order: orderId,
        description,
        createdAt: new Date(),
      }], { session });
      outcome = { duplicate: false, balance: Number(updatedUser.storeBalance || 0) };
    });
    return outcome;
  } finally {
    await session.endSession();
  }
}

function customerStoreBalanceMessage(order, amount = order.storeBalanceCreditedAmount ?? order.totalAmount, claimStatus = order.storeBalanceClaimStatus) {
  const formattedAmount = `KSh ${Number(amount || 0).toLocaleString()}`;
  if (order.user) return `${formattedAmount} has been added to your Store Balance.`;
  const email = order.guestInfo?.email || order.billingSnapshot?.email || "the order email address";
  if (claimStatus === "pending") {
    return `${formattedAmount} is ready to claim. Create an account or sign in with ${email}, then verify that email address to add it to Store Balance.`;
  }
  return `${formattedAmount} has been added to Store Balance for the verified account using ${email}.`;
}

function transaction(reference, type) {
  return { "storeBalanceTransactions.reference": reference, "storeBalanceTransactions.type": type };
}

async function existingBalanceTransaction(userId, reference) {
  const owner = await User.findOne({ _id: userId, "storeBalanceTransactions.reference": reference })
    .select("+storeBalanceTransactions");
  return owner?.storeBalanceTransactions?.find((entry) => entry.reference === reference) || null;
}

async function changeBalance(userId, { amount, type, reference, orderId = null, description = "" }) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0 || !reference || !["credit", "reserve", "release", "claim"].includes(type)) {
    throw new Error("Invalid store balance transaction");
  }
  const increment = type === "reserve" ? -value : value;
  if (supportsStoreBalanceTransactions()) {
    return changeBalanceTransactionally(userId, { amount, type, reference, orderId, description, value, increment });
  }
  const existing = await existingBalanceTransaction(userId, reference);
  if (existing) return { duplicate: true, amount: Number(existing.amount) };
  const filter = {
    _id: userId,
    storeBalanceTransactions: { $not: { $elemMatch: { reference } } },
  };
  if (increment < 0) filter.storeBalance = { $gte: value };
  const nextBalance = { $add: [{ $ifNull: ["$storeBalance", 0] }, increment] };
  const transactionData = {
    type,
    amount: value,
    reference,
    order: orderId,
    description,
    createdAt: new Date(),
  };
  const result = await User.findOneAndUpdate(
    filter,
    [{
      $set: {
        storeBalance: nextBalance,
        storeBalanceTransactions: {
          $concatArrays: [
            { $ifNull: ["$storeBalanceTransactions", []] },
            [{ $mergeObjects: [{ $literal: transactionData }, { balanceAfter: nextBalance }] }],
          ],
        },
      },
    }],
    { new: true, projection: { storeBalance: 1 } }
  );
  if (!result) {
    const duplicate = await existingBalanceTransaction(userId, reference);
    if (duplicate) return { duplicate: true, amount: Number(duplicate.amount) };
    const currentUser = await User.findById(userId).select("storeBalance").lean();
    if (!currentUser) throw new Error("Store balance account was not found");
    if (increment < 0 && Number(currentUser.storeBalance || 0) < value) throw new Error("Insufficient store balance");
    throw new Error("Store balance transaction could not be recorded");
  }
  return { duplicate: false, balance: result.storeBalance };
}

async function releaseOrderBalance(order) {
  if (!order.user || !(order.storeBalanceApplied > 0)) return;
  const Order = require("../models/Order");
  let current = await Order.findById(order._id).select("user storeBalanceApplied storeBalanceStatus storeBalanceCreditedAt paymentStatus");
  if (!current || current.storeBalanceCreditedAt || ["released", "credited", "crediting"].includes(current.storeBalanceStatus)) return;
  if (current.storeBalanceStatus !== "releasing") {
    if (!["reserved", "applied"].includes(current.storeBalanceStatus) || !["unpaid", "failed"].includes(current.paymentStatus)) return;
    const claim = await Order.updateOne(
      { _id: current._id, storeBalanceStatus: current.storeBalanceStatus, paymentStatus: { $in: ["unpaid", "failed"] }, storeBalanceCreditedAt: null },
      { $set: { storeBalanceStatus: "releasing" } }
    );
    if (!claim.modifiedCount) {
      current = await Order.findById(order._id).select("user storeBalanceApplied storeBalanceStatus storeBalanceCreditedAt paymentStatus");
      if (!current || current.storeBalanceCreditedAt || current.storeBalanceStatus !== "releasing") return;
    }
  }
  await changeBalance(current.user, {
    amount: current.storeBalanceApplied,
    type: "release",
    reference: `order:${current._id}:release`,
    orderId: current._id,
    description: "Returned after order ended before payment",
  });
  await Order.updateOne({ _id: current._id, storeBalanceStatus: "releasing" }, { $set: { storeBalanceStatus: "released" } });
  order.storeBalanceStatus = "released";
}

async function creditPaidOrderToStoreBalance(order, description = "Paid order could not be fulfilled") {
  const Order = require("../models/Order");
  let current = await Order.findById(order._id);
  if (current?.storeBalanceCreditedAt) {
    order.storeBalanceCreditedAt = current.storeBalanceCreditedAt;
    order.storeBalanceCreditedAmount = current.storeBalanceCreditedAmount;
    order.storeBalanceStatus = current.storeBalanceStatus;
    order.storeBalanceClaimStatus = current.storeBalanceClaimStatus;
    return { duplicate: true, amount: Number(current.storeBalanceCreditedAmount || 0) };
  }
  if (!current || current.paymentStatus !== "paid" || !(current.totalAmount > 0)) throw new Error("Only a paid order can create store balance");

  // A release that claimed the wallet amount before a late payment must finish
  // first. The subsequent credit then returns only the externally paid amount.
  if (current.storeBalanceStatus === "releasing") {
    await releaseOrderBalance(current);
    current = await Order.findById(order._id);
  }

  if (current.storeBalanceStatus !== "crediting") {
    const creditAmount = current.storeBalanceStatus === "released"
      ? Math.max(0, Number(current.totalAmount || 0) - Number(current.storeBalanceApplied || 0))
      : Number(current.totalAmount || 0);
    const claim = await Order.updateOne(
      { _id: current._id, paymentStatus: "paid", storeBalanceCreditedAt: null, storeBalanceStatus: current.storeBalanceStatus },
      { $set: { storeBalanceStatus: "crediting", storeBalanceCreditedAmount: creditAmount } }
    );
    if (!claim.modifiedCount) {
      current = await Order.findById(order._id);
      if (current?.storeBalanceCreditedAt) {
        order.storeBalanceCreditedAt = current.storeBalanceCreditedAt;
        order.storeBalanceCreditedAmount = current.storeBalanceCreditedAmount;
        order.storeBalanceStatus = current.storeBalanceStatus;
        order.storeBalanceClaimStatus = current.storeBalanceClaimStatus;
        return { duplicate: true, amount: Number(current.storeBalanceCreditedAmount || 0) };
      }
      if (current?.storeBalanceStatus === "releasing") return creditPaidOrderToStoreBalance(order, description);
      throw new Error("Paid order Store Balance credit could not be claimed");
    }
    current.storeBalanceStatus = "crediting";
    current.storeBalanceCreditedAmount = creditAmount;
  }

  const intendedAmount = Math.max(0, Number(current.storeBalanceCreditedAmount ?? current.totalAmount));
  const issued = intendedAmount > 0
    ? await issueStoreBalance({ order: current, amount: intendedAmount, reference: `order:${order._id}:unfulfilled-credit`, description })
    : { pendingClaim: false, amount: 0 };
  const creditedAmount = Number(issued.amount ?? intendedAmount);
  const creditedAt = new Date();
  const claimStatus = issued.pendingClaim ? "pending" : current.user ? "not_required" : creditedAmount > 0 ? "claimed" : "not_required";
  const result = await Order.updateOne(
    { _id: current._id, paymentStatus: "paid", storeBalanceCreditedAt: null, storeBalanceStatus: "crediting" },
    { $set: { storeBalanceCreditedAt: creditedAt, storeBalanceCreditedAmount: creditedAmount, storeBalanceStatus: "credited", storeBalanceClaimStatus: claimStatus } }
  );
  if (!result.matchedCount) {
    const latest = await Order.findById(order._id).select("storeBalanceCreditedAt storeBalanceStatus storeBalanceClaimStatus");
    if (latest?.storeBalanceCreditedAt) {
      order.storeBalanceCreditedAt = latest.storeBalanceCreditedAt;
      order.storeBalanceCreditedAmount = latest.storeBalanceCreditedAmount;
      order.storeBalanceStatus = latest.storeBalanceStatus;
      order.storeBalanceClaimStatus = latest.storeBalanceClaimStatus;
      return { duplicate: true, amount: Number(latest.storeBalanceCreditedAmount || 0) };
    }
    throw new Error("Paid order could not be marked as credited to Store Balance");
  }
  order.storeBalanceCreditedAt = creditedAt;
  order.storeBalanceCreditedAmount = creditedAmount;
  order.storeBalanceStatus = "credited";
  order.storeBalanceClaimStatus = claimStatus;
  return { duplicate: false, amount: creditedAmount };
}

async function issueStoreBalance({ order, amount, reference, description }) {
  const PendingStoreBalance = require("../models/PendingStoreBalance");
  const existingPending = await PendingStoreBalance.findOne({ reference }).select("amount email");
  if (existingPending) {
    const email = String(existingPending.email || order.guestInfo?.email || order.billingSnapshot?.email || "").trim().toLowerCase();
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const verifiedMatches = email
      ? await User.find({ email: { $regex: `^${escapedEmail}$`, $options: "i" }, isEmailVerified: true }).select("_id isEmailVerified email").limit(2)
      : [];
    if (verifiedMatches.length === 1) {
      await claimPendingGuestBalance(verifiedMatches[0]);
      order.storeBalanceClaimStatus = "claimed";
      return { pendingClaim: false, amount: Number(existingPending.amount) };
    }
    order.storeBalanceClaimStatus = "pending";
    return { pendingClaim: true, amount: Number(existingPending.amount) };
  }
  if (order.user) {
    const result = await changeBalance(order.user, { amount, type: "credit", reference, orderId: order._id, description });
    return { pendingClaim: false, amount: result.amount ?? amount };
  }
  const email = String(order.guestInfo?.email || order.billingSnapshot?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Guest order has no email for balance claim");
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const verifiedEmail = { $regex: `^${escapedEmail}$`, $options: "i" };
  const verifiedMatches = await User.find({ email: verifiedEmail, isEmailVerified: true }).select("_id isEmailVerified email").limit(2);
  if (verifiedMatches.length === 1) {
    const verified = verifiedMatches[0];
    const result = await changeBalance(verified._id, { amount, type: "credit", reference, orderId: order._id, description });
    order.storeBalanceClaimStatus = "claimed";
    return { pendingClaim: false, amount: result.amount ?? amount };
  }
  await PendingStoreBalance.updateOne({ reference }, { $setOnInsert: { order: order._id, reference, email, amount } }, { upsert: true });
  const pending = await PendingStoreBalance.findOne({ reference }).select("amount");
  const pendingAmount = Number(pending?.amount ?? amount);
  order.storeBalanceClaimStatus = "pending";
  const verifiedAfterWriteMatches = await User.find({ email: verifiedEmail, isEmailVerified: true }).select("_id isEmailVerified email").limit(2);
  if (verifiedAfterWriteMatches.length === 1) {
    const verifiedAfterWrite = verifiedAfterWriteMatches[0];
    await claimPendingGuestBalance(verifiedAfterWrite);
    order.storeBalanceClaimStatus = "claimed";
    return { pendingClaim: false, amount: pendingAmount };
  }
  return { pendingClaim: true, amount: pendingAmount };
}

async function claimPendingGuestBalance(user) {
  if (!user?.isEmailVerified) return 0;
  const email = String(user.email || "").toLowerCase();
  const PendingStoreBalance = require("../models/PendingStoreBalance");
  const touchedOrderIds = new Set();
  let total = 0;
  while (true) {
    const pending = await PendingStoreBalance.findOne({ email, claimedAt: null }).sort({ createdAt: 1 });
    if (!pending) break;
    touchedOrderIds.add(String(pending.order));
    const result = await changeBalance(user._id, { amount: pending.amount, type: "claim", reference: `balance:${pending.reference}:claim`, orderId: pending.order, description: "Claimed from a paid guest order" });
    if (!result.duplicate) total += pending.amount;
    const pendingForOrder = await PendingStoreBalance.exists({ order: pending.order, _id: { $ne: pending._id }, claimedAt: null });
    const Order = require("../models/Order");
    const update = { $set: { storeBalanceClaimStatus: pendingForOrder ? "pending" : "claimed" } };
    const returnRequestId = String(pending.reference || "").match(/^order:[^:]+:return:([^:]+):balance$/)?.[1];
    if (returnRequestId) {
      update.$set["returnRequests.$[request].storeBalanceClaimStatus"] = "claimed";
      await Order.updateOne({ _id: pending.order }, update, { arrayFilters: [{ "request._id": returnRequestId }] });
    } else {
      await Order.updateOne({ _id: pending.order }, update);
    }
    // Record the order/request state before closing the pending claim. If this
    // update fails, the pending row remains retryable and the wallet reference
    // makes the next attempt idempotent.
    await PendingStoreBalance.updateOne({ _id: pending._id, claimedAt: null }, { $set: { claimedAt: new Date(), claimedBy: user._id } });
  }
  if (touchedOrderIds.size) {
    const orderIds = [...touchedOrderIds];
    const outstandingOrderIds = await PendingStoreBalance.distinct("order", { order: { $in: orderIds }, claimedAt: null });
    const outstanding = new Set(outstandingOrderIds.map(String));
    const fullyClaimedOrderIds = orderIds.filter((orderId) => !outstanding.has(orderId));
    if (fullyClaimedOrderIds.length) {
      await require("../models/Order").updateMany(
        { _id: { $in: fullyClaimedOrderIds }, storeBalanceClaimStatus: "pending" },
        { $set: { storeBalanceClaimStatus: "claimed" } }
      );
    }
  }
  return total;
}

module.exports = { changeBalance, releaseOrderBalance, creditPaidOrderToStoreBalance, issueStoreBalance, claimPendingGuestBalance, customerStoreBalanceMessage };
