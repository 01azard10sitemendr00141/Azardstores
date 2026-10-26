const express = require("express");
const { sendEmail, wrapEmail, escapeHtml } = require("../utils/email");
const { contactLimiter } = require("../middleware/rateLimits");
const Settings = require("../models/Settings");

const router = express.Router();

// POST /api/contact - public contact form submission
router.post("/", contactLimiter, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ message: "Enter your contact details and message" });
    }
    const { name: rawName, email: rawEmail, subject: rawSubject = "", message: rawMessage } = req.body;
    if (typeof rawName !== "string" || typeof rawEmail !== "string" || typeof rawMessage !== "string" || typeof rawSubject !== "string") {
      return res.status(400).json({ message: "Name, email, subject, and message must be text" });
    }
    const name = rawName.trim();
    const email = rawEmail.trim();
    const subject = rawSubject;
    const message = rawMessage.trim();

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }
    if (name.length > 100 || email.length > 254 || message.length > 5000) {
      return res.status(400).json({ message: "Name must be 100 characters or fewer and message must be 5,000 characters or fewer." });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const safeSubject = String(subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "New contact form message";

    // The admin-configured contact email takes priority (Settings page), so
    // changing it there actually changes where these messages land — falls
    // back to env vars for installs that haven't set it via Settings yet.
    const settings = await Settings.findOne();
    const destination = settings?.contactEmail || process.env.CONTACT_EMAIL || process.env.EMAIL_USER;

    // Notify the store
    await sendEmail({
      to: destination,
      subject: `[Contact] ${safeSubject}`,
      html: wrapEmail({
        preheader: `New message from ${name} — ${safeSubject}`,
        eyebrow: "Contact form",
        heading: safeSubject,
        greeting: "",
        signoff: "",
        detailsTitle: "SENDER DETAILS",
        detailsHtml: `<p style="margin:0;"><strong>Name:</strong> ${escapeHtml(name)}</p><p style="margin:6px 0 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>`,
        nextStepTitle: "MESSAGE",
        nextStepHtml: `<p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>`,
        bodyHtml: `
          <p style="margin:0;">A customer has submitted a message through the website contact form.</p>
        `,
      }),
    });

    // Confirm receipt to the sender
    await sendEmail({
      to: email,
      subject: "We've received your message — Azard Stores",
      html: wrapEmail({
        preheader: "Your message has been received by Azard Stores Customer Support.",
        eyebrow: "Message received",
        heading: "We have received your message",
        greeting: `Dear ${name},`,
        bodyHtml: `
          <p style="margin: 0 0 4px;">Our customer support team has received your message and will respond as soon as possible.</p>
          <p style="margin: 20px 0 4px; font-weight: bold;">Your message:</p>
          <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        `,
      }),
    });

    res.status(200).json({ message: "Thanks for reaching out. Your message has been sent to Azard Stores." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
