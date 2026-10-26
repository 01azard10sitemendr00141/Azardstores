const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const { normalizePhone } = require("../utils/normalizePhone");
const { verifyOtp } = require("../utils/otp");

const router = express.Router();

// GET /api/webhooks/whatsapp - Meta's one-time webhook verification handshake.
// When you register this URL in the Meta Developer dashboard, Meta calls this
// with a challenge; echoing it back (only if your verify token matches)
// proves you control this endpoint. WHATSAPP_VERIFY_TOKEN is a value you
// choose yourself and enter in both your .env and the Meta dashboard.
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/webhooks/whatsapp - receives inbound WhatsApp messages. This is
// the "loop trick" verification catch: a user texts our business number
// with their pre-filled code, and we match it here against a pending
// verification.
router.post("/whatsapp", (req, res) => {
  // Ack immediately — Meta retries aggressively on anything but a fast 200,
  // and a slow DB lookup here could cause duplicate deliveries.
  res.sendStatus(200);

  if (!isValidSignature(req)) {
    console.error("WhatsApp webhook: signature check failed, ignoring payload");
    return;
  }

  handleIncomingMessage(req.body).catch((err) =>
    console.error("WhatsApp webhook processing error:", err.message)
  );
});

// Verifies the X-Hub-Signature-256 header Meta sends with every webhook
// call, using your App Secret — this is what stops anyone else from POSTing
// fake "verified" payloads straight at this endpoint. Requires the raw
// request body bytes (captured in server.js), not the parsed JSON.
function isValidSignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !req.rawBody || !process.env.WHATSAPP_APP_SECRET) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(req.rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // mismatched lengths etc. — definitely not a match
  }
}

async function handleIncomingMessage(body) {
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || message.type !== "text") return;

  const fromPhone = normalizePhone(message.from);
  const text = message.text?.body || "";
  const codeMatch = text.match(/\b(\d{6})\b/); // pull the 6-digit code out of whatever they sent
  if (!codeMatch) return;

  const user = await User.findOne({
    phone: fromPhone,
    phoneOtpChannel: "whatsapp",
    phoneOtpExpires: { $gt: Date.now() },
  }).select("+phoneOtpHash +phoneOtpExpires +phoneOtpAttempts +phoneOtpSentAt +phoneOtpChannel");

  // Match on phone too, not just the code — a code alone shouldn't be
  // enough if two people's windows happened to overlap.
  if (!user) {
    console.log("WhatsApp webhook: no pending phone verification matched.");
    return;
  }

  if (user.phoneOtpAttempts >= 5) {
    user.phoneOtpHash = undefined;
    user.phoneOtpExpires = undefined;
    user.phoneOtpAttempts = 0;
    user.phoneOtpSentAt = undefined;
    await user.save();
    console.log("WhatsApp webhook: verification attempt limit reached.");
    return;
  }

  if (!verifyOtp(codeMatch[1], user.phoneOtpHash)) {
    const failedAttempt = await User.findOneAndUpdate(
      { _id: user._id, phoneOtpHash: user.phoneOtpHash, phoneOtpExpires: { $gt: new Date() }, phoneOtpAttempts: { $lt: 5 } },
      { $inc: { phoneOtpAttempts: 1 } },
      { new: true }
    ).select("+phoneOtpAttempts");
    if (!failedAttempt) {
      console.log("WhatsApp webhook: verification code was no longer active.");
      return;
    }
    if (failedAttempt.phoneOtpAttempts >= 5) {
      await User.updateOne(
        { _id: user._id, phoneOtpHash: user.phoneOtpHash, phoneOtpAttempts: { $gte: 5 } },
        { $unset: { phoneOtpHash: "", phoneOtpExpires: "", phoneOtpSentAt: "" }, $set: { phoneOtpAttempts: 0 } }
      );
    }
    console.log("WhatsApp webhook: verification code did not match.");
    return;
  }

  user.isPhoneVerified = true;
  user.phoneOtpHash = undefined;
  user.phoneOtpExpires = undefined;
  user.phoneOtpAttempts = 0;
  user.phoneOtpSentAt = undefined;
  await user.save();

  console.log(`WhatsApp loop verification succeeded for user ${user._id}`);
}

module.exports = router;
