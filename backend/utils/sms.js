const axios = require("axios");
const { getVerificationCapabilities } = require("../config/verification");

// Africa's Talking SMS API — https://developers.africastalking.com/docs/sms/sending
// Requires env vars: AT_API_KEY, AT_USERNAME, AT_SENDER_ID (and optionally
// AT_ENV=sandbox while testing before your Sender ID is approved).
async function sendSms(to, message) {
  const caps = getVerificationCapabilities();
  if (!caps.sms) {
    throw new Error("SMS verification is not configured");
  }

  const endpoint =
    process.env.AT_ENV === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

  const params = new URLSearchParams({
    username: process.env.AT_USERNAME,
    to,
    message,
    from: process.env.AT_SENDER_ID,
  });

  const res = await axios.post(endpoint, params, {
    headers: {
      apiKey: process.env.AT_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
  });

  return res.data;
}

module.exports = { sendSms };
