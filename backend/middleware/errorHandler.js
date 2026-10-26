// 404 handler for unknown routes
function notFound(req, res, next) {
  res.status(404).json({ message: "Route not found" });
}

// Catches errors thrown/passed via next(err) anywhere in the app
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (process.env.NODE_ENV === "production") {
    console.error("Request failed", {
      name: err.name || "Error",
      status: err.statusCode || 500,
      method: req.method,
      path: req.path,
    });
  } else {
    console.error(err.stack || err);
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(", ") });
  }

  // Duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0];
    const message = field === "skuCodes" || field === "sku"
      ? "That SKU is already assigned to another product. Check the catalog and use a unique SKU."
      : field === "email"
        ? "An account with that email already exists."
        : "A record with those details already exists. Refresh and try again.";
    return res.status(409).json({ message });
  }

  const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  // The app uses 503 only for explicit provider/configuration outages whose
  // messages are written for customers. Unexpected 5xx errors stay generic.
  const canExposeMessage = status < 500 || status === 503 || err.expose === true;
  res.status(status).json({
    message: canExposeMessage ? (err.message || "The request could not be completed") : "Something went wrong on the server",
  });
}

module.exports = { notFound, errorHandler };
