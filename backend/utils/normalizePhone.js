// Normalizes Kenyan phone numbers to a consistent digits-only form
// (2547XXXXXXXX) so the same number typed differently — 0712345678,
// +254712345678, 254712345678, with spaces or dashes — always matches
// when compared. Used anywhere a phone number is stored or matched:
// guest checkout, phone verification, order tracking, the WhatsApp webhook.
function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, ""); // strip +, spaces, dashes, everything but digits

  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.length === 9) return "254" + digits; // bare 7xxxxxxxx / 1xxxxxxxx, no prefix at all
  return digits; // unrecognized shape — return as-is rather than guess wrong
}

module.exports = { normalizePhone };