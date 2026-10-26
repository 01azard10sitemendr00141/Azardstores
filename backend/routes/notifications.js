const express = require("express");
const EmailOutbox = require("../models/EmailOutbox");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/email-outbox", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const [queued, sending, failed, sent, messages] = await Promise.all([
      EmailOutbox.countDocuments({ status: "queued" }),
      EmailOutbox.countDocuments({ status: "sending" }),
      EmailOutbox.countDocuments({ status: "failed" }),
      EmailOutbox.countDocuments({ status: "sent" }),
      EmailOutbox.find().select("-html -text").sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    res.json({
      deliveryConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      counts: { queued, sending, failed, sent },
      messages,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/email-outbox/:id/retry", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const email = await EmailOutbox.findOneAndUpdate(
      { _id: req.params.id, status: "failed" },
      { $set: { status: "queued", attempts: 0, nextAttemptAt: new Date(), claimedAt: null, lastError: "" } },
      { new: true }
    ).select("-html -text");
    if (!email) return res.status(404).json({ message: "Failed email was not found. Refresh the queue." });
    res.json(email);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
