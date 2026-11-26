const StockRequest = require("../models/StockRequest");
const { expireLinkedStockOrder } = require("./stockRequest");

async function expireStockRequests(now = new Date(), io = null) {
  const dueRequests = await StockRequest.find({ status: "quoted", quoteExpiresAt: { $lte: now } }).select("_id");
  let expiredCount = 0;
  for (const dueRequest of dueRequests) {
    const request = await StockRequest.findOneAndUpdate(
      { _id: dueRequest._id, status: "quoted", quoteExpiresAt: { $lte: now } },
      {
        $set: { status: "expired" },
        $push: {
          events: {
            type: "quote_expired",
            label: "Quote expired",
            note: "Stock remains set aside until staff confirms it was returned to available stock.",
            createdAt: now,
          },
        },
      },
      { new: true }
    );
    if (!request) continue;
    expiredCount += 1;
    await expireLinkedStockOrder(request, "The confirmed quote expired before checkout. Held stock remains unavailable until staff confirms its release.", io);
  }
  return expiredCount;
}

function startStockRequestWorker(io = null) {
  const interval = setInterval(() => expireStockRequests(new Date(), io).catch((error) => {
    console.error("Stock request expiry worker failed:", error.message);
  }), 60_000);
  interval.unref?.();
  expireStockRequests(new Date(), io).catch((error) => {
    console.error("Stock request expiry worker failed:", error.message);
  });
  return interval;
}

module.exports = { expireStockRequests, startStockRequestWorker };
