const mongoose = require("mongoose");

const emailOutboxSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, maxlength: 300 },
    html: { type: String, required: true },
    text: { type: String, default: "" },
    dedupeKey: { type: String, default: undefined, maxlength: 300 },
    status: { type: String, enum: ["queued", "sending", "sent", "failed"], default: "queued", index: true },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

emailOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
emailOutboxSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("EmailOutbox", emailOutboxSchema);
