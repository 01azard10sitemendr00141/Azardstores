// Read-only retention report. This deliberately never deletes or anonymizes data.
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const User = require("../models/User");
const Order = require("../models/Order");
const PendingStoreBalance = require("../models/PendingStoreBalance");
const UnmatchedPayment = require("../models/UnmatchedPayment");
const StoreBalanceTransaction = require("../models/StoreBalanceTransaction");
const EmailOutbox = require("../models/EmailOutbox");

function yearsBefore(date, years) {
  const cutoff = new Date(date);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return cutoff;
}

async function auditRetention(now = new Date()) {
  const inactiveBefore = yearsBefore(now, 2);
  const recordsBefore = yearsBefore(now, 7);
  const unresolvedOrder = {
    $or: [
      { status: { $in: ["pending", "confirmed", "shipped", "ready_for_collection"] } },
      { paymentStatus: { $in: ["unpaid", "refund_pending"] } },
      { "availabilityIssue.resolutionStatus": "open" },
      { "cancellationRequests.status": "pending" },
      { "returnRequests.status": "pending" },
      { "deliveryIssueRequests.status": { $in: ["open", "investigating"] } },
    ],
  };

  const inactivityFilter = {
    role: "customer",
    $or: [
      { lastLoginAt: { $lt: inactiveBefore } },
      { lastLoginAt: null, createdAt: { $lt: inactiveBefore } },
    ],
  };
  const [usersWithOpenOrders, unclaimedBalanceEmails, openPaymentEmails] = await Promise.all([
    Order.distinct("user", { user: { $ne: null }, ...unresolvedOrder }),
    PendingStoreBalance.distinct("email", { claimedAt: null }),
    UnmatchedPayment.distinct("customerEmail", { status: { $in: ["open", "processing", "refund_pending"] }, customerEmail: { $ne: "" } }),
  ]);
  const accountsWithOrderOrPaymentLinks = [...new Set([...unclaimedBalanceEmails, ...openPaymentEmails])];

  const [eligibleAccounts, protectedAccounts, accountsWithOpenOrders, accountsWithUnclaimedCreditsOrPayments, eligibleOrders, protectedOldOrders] = await Promise.all([
    User.countDocuments({
      ...inactivityFilter,
      storeBalance: 0,
      _id: { $nin: usersWithOpenOrders },
      email: { $nin: accountsWithOrderOrPaymentLinks },
    }),
    User.countDocuments({
      ...inactivityFilter,
      storeBalance: { $gt: 0 },
    }),
    User.countDocuments({ ...inactivityFilter, _id: { $in: usersWithOpenOrders } }),
    User.countDocuments({ ...inactivityFilter, email: { $in: accountsWithOrderOrPaymentLinks } }),
    Order.countDocuments({ createdAt: { $lt: recordsBefore }, $nor: [unresolvedOrder] }),
    Order.countDocuments({ createdAt: { $lt: recordsBefore }, $or: unresolvedOrder.$or }),
  ]);

  const [
    openUnmatchedPayments,
    unclaimedBalances,
    oldEmailOutboxEntries,
    oldUnresolvedEmailOutboxEntries,
    oldStoreBalanceTransactions,
    oldPendingStoreBalanceEntries,
    oldUnclaimedStoreBalanceEntries,
    oldUnmatchedPaymentRecords,
    oldUnresolvedUnmatchedPayments,
  ] = await Promise.all([
    UnmatchedPayment.countDocuments({ status: { $in: ["open", "processing", "refund_pending"] } }),
    PendingStoreBalance.countDocuments({ claimedAt: null }),
    EmailOutbox.countDocuments({ createdAt: { $lt: recordsBefore } }),
    EmailOutbox.countDocuments({ createdAt: { $lt: recordsBefore }, status: { $in: ["queued", "sending", "failed"] } }),
    StoreBalanceTransaction.countDocuments({ createdAt: { $lt: recordsBefore } }),
    PendingStoreBalance.countDocuments({ createdAt: { $lt: recordsBefore } }),
    PendingStoreBalance.countDocuments({ createdAt: { $lt: recordsBefore }, claimedAt: null }),
    UnmatchedPayment.countDocuments({ createdAt: { $lt: recordsBefore } }),
    UnmatchedPayment.countDocuments({ createdAt: { $lt: recordsBefore }, status: { $in: ["open", "processing", "refund_pending"] } }),
  ]);

  return {
    generatedAt: now.toISOString(),
    cutoffs: { inactiveAccountsBefore: inactiveBefore.toISOString(), oldRecordsBefore: recordsBefore.toISOString() },
    inactiveAccountsWithZeroBalanceForReview: eligibleAccounts,
    inactiveAccountsProtectedByPositiveBalance: protectedAccounts,
    inactiveAccountsWithOpenOrders: accountsWithOpenOrders,
    inactiveAccountsLinkedToUnclaimedCreditsOrPayments: accountsWithUnclaimedCreditsOrPayments,
    oldOrdersWithoutDetectedOpenIssues: eligibleOrders,
    oldOrdersWithDetectedOpenIssues: protectedOldOrders,
    openUnmatchedPayments,
    unclaimedStoreBalances: unclaimedBalances,
    emailOutboxEntriesOlderThanSevenYears: oldEmailOutboxEntries,
    unresolvedEmailOutboxEntriesOlderThanSevenYears: oldUnresolvedEmailOutboxEntries,
    storeBalanceTransactionsOlderThanSevenYears: oldStoreBalanceTransactions,
    pendingStoreBalanceEntriesOlderThanSevenYears: oldPendingStoreBalanceEntries,
    unclaimedStoreBalanceEntriesOlderThanSevenYears: oldUnclaimedStoreBalanceEntries,
    unmatchedPaymentRecordsOlderThanSevenYears: oldUnmatchedPaymentRecords,
    unresolvedUnmatchedPaymentsOlderThanSevenYears: oldUnresolvedUnmatchedPayments,
    note: "Read-only counts only. Review legal holds, backups, related records, and privacy obligations before any deletion or anonymization.",
  };
}

if (require.main === module) {
  connectDB()
    .then(async () => {
      console.log(JSON.stringify(await auditRetention(), null, 2));
    })
    .catch((error) => {
      console.error(`Retention audit failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { auditRetention };
