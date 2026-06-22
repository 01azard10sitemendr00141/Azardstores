// 404 handler for unknown routes
function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

// Catches errors thrown/passed via next(err) anywhere in the app
function errorHandler(err, req, res, next) {
  console.error(err.stack);

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
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `${field} already in use` });
  }

  res.status(err.statusCode || 500).json({
    message: err.message || "Something went wrong on the server",
  });
}

module.exports = { notFound, errorHandler };
