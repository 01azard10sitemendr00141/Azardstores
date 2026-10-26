const EmailOutbox = require("../models/EmailOutbox");
const { sendEmail } = require("./email");

const MAX_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const CLAIM_STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
let running = false;

function retryDelayMs(attempts) {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS);
}

async function claimNextEmail(now) {
  return EmailOutbox.findOneAndUpdate(
    {
      $or: [
        { status: "queued", attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
        { status: "sending", claimedAt: { $lte: new Date(now.getTime() - CLAIM_STALE_AFTER_MS) } },
      ],
    },
    { $set: { status: "sending", claimedAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { createdAt: 1 } }
  );
}

async function runEmailOutboxSweep() {
  if (running || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  running = true;
  try {
    for (let index = 0; index < MAX_BATCH_SIZE; index += 1) {
      const now = new Date();
      const email = await claimNextEmail(now);
      if (!email) break;
      if (email.attempts > MAX_ATTEMPTS) {
        await EmailOutbox.updateOne(
          { _id: email._id, status: "sending", claimedAt: now },
          { $set: { status: "failed", claimedAt: null, lastError: "Email worker stopped before recording the final delivery attempt." } }
        );
        continue;
      }
      try {
        await sendEmail({ to: email.to, subject: email.subject, html: email.html, text: email.text });
        await EmailOutbox.updateOne(
          { _id: email._id, status: "sending", claimedAt: now },
          {
            $set: { status: "sent", sentAt: new Date(), claimedAt: null, lastError: "" },
            // Sent messages cannot be retried, so discard their rendered
            // contents, which may include order and delivery details.
            $unset: { html: "", text: "" },
          }
        );
      } catch (error) {
        const attempts = Number(email.attempts || 0);
        const exhausted = attempts >= MAX_ATTEMPTS;
        const message = String(error?.message || "Email delivery failed").slice(0, 1000);
        await EmailOutbox.updateOne(
          { _id: email._id, status: "sending", claimedAt: now },
          {
            $set: {
              status: exhausted ? "failed" : "queued",
              claimedAt: null,
              nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
              lastError: message,
            },
          }
        );
        console.error(`Email ${email._id} ${exhausted ? "failed after its final attempt" : `will retry (attempt ${attempts})`}:`, message);
      }
    }
  } catch (error) {
    console.error("Email outbox sweep failed:", error.message);
  } finally {
    running = false;
  }
}

function startEmailOutboxWorker() {
  const interval = setInterval(() => runEmailOutboxSweep(), 10_000);
  interval.unref?.();
  runEmailOutboxSweep();
  return interval;
}

module.exports = { startEmailOutboxWorker, runEmailOutboxSweep, retryDelayMs };
