const QUOTE_VALIDITY_MS = 12 * 60 * 60 * 1000;
const StockRequest = require("../models/StockRequest");
const Order = require("../models/Order");
const { emitOrderEvent } = require("./orderRealtime");

function quoteExpiryFrom(now = new Date()) {
  return new Date(now.getTime() + QUOTE_VALIDITY_MS);
}

function validateSetAsideQuantity(requestedQuantity, confirmedQuantity) {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    const error = new Error("The requested quantity is invalid.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(confirmedQuantity) || confirmedQuantity !== requestedQuantity) {
    const error = new Error(`Set aside exactly the requested quantity of ${requestedQuantity}.`);
    error.statusCode = 400;
    throw error;
  }
  return confirmedQuantity;
}

function canExtendQuote(request, now = new Date()) {
  return request.status === "quoted"
    && request.quoteExtensionCount < 1
    && request.quoteExpiresAt
    && new Date(request.quoteExpiresAt).getTime() > now.getTime();
}

function stockRequestCanCancel(request) {
  return ["checking", "partial", "quoted"].includes(request.status);
}

function stockRequestBelongsToUser(request, user) {
  const requestUserId = String(request?.user?._id || request?.user || "");
  const userId = String(user?._id || user?.id || "");
  if (requestUserId && requestUserId === userId) return true;
  const requestEmail = String(request?.guestInfo?.email || "").trim().toLowerCase();
  const userEmail = String(user?.email || "").trim().toLowerCase();
  return Boolean(requestEmail && userEmail && requestEmail === userEmail);
}

async function cancelLinkedStockRequest(order, note) {
  if (!order?.stockRequest) return;
  await StockRequest.updateOne(
    { _id: order.stockRequest, status: { $in: ["checking", "partial", "quoted", "converted"] } },
    {
      $set: { status: "cancelled" },
      $push: { events: { type: "stock_request_cancelled", label: "Stock request cancelled", note, createdAt: new Date() } },
    }
  );
}

async function expireLinkedStockOrder(stockRequest, note, io = null) {
  const order = await Order.findOneAndUpdate(
    { stockRequest: stockRequest._id, status: "pending", checkoutDetailsCompletedAt: null },
    {
      $set: { status: "expired" },
      $push: { events: { type: "order_expired", label: "Quote expired", note, createdAt: new Date() } },
    },
    { new: true }
  );
  if (order) emitOrderEvent(io, "order-status-updated", order);
  return order;
}

module.exports = {
  QUOTE_VALIDITY_MS,
  quoteExpiryFrom,
  validateSetAsideQuantity,
  canExtendQuote,
  stockRequestCanCancel,
  stockRequestBelongsToUser,
  cancelLinkedStockRequest,
  expireLinkedStockOrder,
};
