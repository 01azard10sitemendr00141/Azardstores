const rateLimit = require("express-rate-limit");

function createRateLimit(max, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });
}

module.exports = {
  contactLimiter: createRateLimit(5, "Too many contact requests. Please try again later."),
  orderLimiter: createRateLimit(10, "Too many order attempts. Please wait before trying again."),
  orderLookupLimiter: createRateLimit(60, "Too many order lookups. Please wait before checking again."),
  customerOrderActionLimiter: createRateLimit(10, "Too many order requests. Please wait before trying again."),
  paymentLimiter: createRateLimit(10, "Too many payment attempts. Please wait before trying again."),
  paymentStatusLimiter: createRateLimit(120, "Too many payment status checks. Please wait before checking again."),
};
