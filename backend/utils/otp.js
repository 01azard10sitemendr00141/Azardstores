const crypto = require("crypto");

function digestOtp(code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required to protect verification codes");
  return crypto.createHmac("sha256", secret).update(String(code)).digest("hex");
}

function verifyOtp(code, storedDigest) {
  if (typeof storedDigest !== "string" || !/^[a-f\d]{64}$/i.test(storedDigest)) return false;
  const candidate = Buffer.from(digestOtp(code), "hex");
  const stored = Buffer.from(storedDigest, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

module.exports = { digestOtp, verifyOtp };
