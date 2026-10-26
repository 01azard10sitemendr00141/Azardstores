const nodemailer = require("nodemailer");
const crypto = require("crypto");
const EmailOutbox = require("../models/EmailOutbox");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function htmlToText(html) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", times: "×", mdash: "—", ndash: "–", copy: "©" };
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[endif\]-->/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<div\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>\s*<td\b[^>]*>/gi, " — ")
    .replace(/<\/(p|h1|h2|h3|tr|table|div)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
      if (key[0] === "#") {
        const codePoint = key[1]?.toLowerCase() === "x" ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
        try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ""; } catch { return ""; }
      }
      return entities[key.toLowerCase()] ?? `&${key};`;
    })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email delivery is not configured. Set EMAIL_USER and EMAIL_PASS before sending.");
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Azard Stores" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || htmlToText(html),
  });
}

async function enqueueEmail({ to, subject, html, text, dedupeKey }) {
  const recipient = String(to || "").trim().toLowerCase();
  if (!recipient || !subject || !html) throw new Error("Email outbox requires a recipient, subject, and message");
  const message = { to: recipient, subject, html, text: text || htmlToText(html), status: "queued", nextAttemptAt: new Date() };
  if (!dedupeKey) return EmailOutbox.create(message);
  return EmailOutbox.findOneAndUpdate(
    { dedupeKey },
    { $setOnInsert: { ...message, dedupeKey } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ─── Shared branded template ───────────────────────────────────────────────
// Table-based layout with inline styles throughout — required for
// compatibility with Outlook and older mail clients, which don't support
// Flexbox, Grid, or most modern CSS. Web fonts aren't reliable in email
// either, so headings use a web-safe serif stack (standing in for Fraunces)
// and body text uses a web-safe sans stack (standing in for Inter).
//
// preheader: short hidden text shown as the inbox preview snippet.
// eyebrow: small uppercase label above the heading (matches the site's
//   eyebrow-label convention — orange, since that's the site's label color).
// bodyHtml: the message content, as a string of <p> tags.
// cta: optional { text, url } to render a button.
// footerNote: optional small print under the main card (e.g. "link expires in 1 hour").
function emailSection(title, contentHtml) {
  if (!contentHtml) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #DCE3EA;border-radius:10px;background:#F7F9FB;"><tr><td style="padding:15px 16px;"><p style="margin:0 0 9px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1.2px;color:#536174;">${escapeHtml(title)}</p><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#263447;">${contentHtml}</div></td></tr></table>`;
}

function wrapEmail({ preheader = "", eyebrow, heading, bodyHtml, cta, footerNote, greeting = "Hello,", detailsHtml = "", detailsTitle = "DETAILS", nextStepHtml = "", nextStepTitle = "NEXT STEP", signoff = "Kind regards,<br><strong>Azard Stores Customer Support</strong>" }) {
  const ctaWidth = cta ? Math.max(160, Math.min(300, String(cta.text || "").length * 8 + 48)) : 0;
  const ctaHtml = cta
    ? `
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(cta.url)}" style="height:48px;v-text-anchor:middle;width:${ctaWidth}px;" arcsize="17%" stroke="f" fillcolor="#1683FF">
        <w:anchorlock />
        <center style="color:#0F1B2D;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(cta.text)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 4px;">
        <tr>
          <td bgcolor="#1683FF" style="border-radius: 8px; background-color: #1683FF;">
            <a href="${escapeHtml(cta.url)}"
              style="display: inline-block; padding: 14px 24px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; line-height: 18px; color: #0F1B2D; text-decoration: none;">
              ${escapeHtml(cta.text)}
            </a>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    `
    : "";

  const footerNoteHtml = footerNote
    ? `<p style="margin: 20px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #536174; line-height: 1.5;">${escapeHtml(footerNote)}</p>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Azard Stores</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #F1F4F7;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F1F4F7;">
          <tr>
            <td align="center" style="padding: 32px 16px;">
              <!--[if mso]>
              <table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td>
              <![endif]-->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

                <!-- Wordmark -->
                <tr>
                  <td align="center" style="padding-bottom: 18px;">
                    <span style="font-family: Georgia, 'Times New Roman', serif; font-size: 21px; color: #142238; letter-spacing: 0.3px;">
                      Azard Stores
                    </span>
                  </td>
                </tr>

                <!-- Card -->
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E0E6EC; border-radius: 12px; padding: 32px;">
                    <p style="margin: 0 0 10px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #C34E00; font-weight: bold;">
                      ${escapeHtml(eyebrow)}
                    </p>
                    <h1 style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; color: #0F1B2D; line-height: 1.35;">
                      ${escapeHtml(heading)}
                    </h1>
                    ${greeting ? `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#263447;">${escapeHtml(greeting)}</p>` : ""}
                    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #263447; line-height: 1.7;">
                      ${bodyHtml}
                    </div>
                    ${emailSection(detailsTitle, detailsHtml)}
                    ${emailSection(nextStepTitle, nextStepHtml)}
                    ${ctaHtml}
                    ${signoff ? `<p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#263447;">${signoff}</p>` : ""}
                    ${footerNoteHtml}
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td align="center" style="padding-top: 20px;">
                    <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #657386;">
                      Azard Stores · Nairobi, Kenya
                    </p>
                    <p style="margin: 4px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #8793A1;">
                      This is an automated account message. Please do not reply.
                    </p>
                  </td>
                </tr>

              </table>
              <!--[if mso]>
              </td></tr></table>
              <![endif]-->
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendPasswordResetEmail(to, resetToken) {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  return enqueueEmail({
    to,
    subject: "Reset your Azard Stores password",
    dedupeKey: `account:password-reset:${crypto.createHash("sha256").update(resetToken).digest("hex")}`,
    html: wrapEmail({
      preheader: "Reset your Azard Stores password — this link expires in 1 hour.",
      eyebrow: "Account recovery",
      heading: "Reset your password",
      bodyHtml: `<p style="margin: 0 0 4px;">We received a request to change the password for your Azard Stores account. Use the button below to choose a new password.</p>`,
      cta: { text: "Choose a new password", url: resetUrl },
      footerNote: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't be changed.",
    }),
  });
}

async function sendVerificationEmail(to, verificationToken) {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
  return enqueueEmail({
    to,
    subject: "Verify your Azard Stores email",
    dedupeKey: `account:verification:${crypto.createHash("sha256").update(verificationToken).digest("hex")}`,
    html: wrapEmail({
      preheader: "Confirm your email to finish setting up your Azard Stores account.",
      eyebrow: "Welcome",
      heading: "Verify your email",
      bodyHtml: `<p style="margin: 0 0 4px;">Confirm this email address to finish setting up your Azard Stores account.</p>`,
      cta: { text: "Verify email address", url: verifyUrl },
      footerNote: "This link expires in 24 hours. If you didn't create an Azard Stores account, you can safely ignore this email.",
    }),
  });
}

async function sendCheckoutEmailCode(to, code) {
  await sendEmail({
    to,
    subject: "Your Azard Stores checkout code",
    html: wrapEmail({
      preheader: "Use this one-time code to verify your email and continue checkout.",
      eyebrow: "Checkout verification",
      heading: "Your verification code",
      bodyHtml: `<p style="margin: 0 0 14px;">Enter this one-time code in checkout to verify your email address.</p><p style="margin: 0; padding: 14px 18px; display: inline-block; background: #E8EEF5; border-radius: 10px; font-size: 30px; font-weight: bold; letter-spacing: 8px; color: #0F1B2D;">${escapeHtml(code)}</p>`,
      footerNote: "This code expires in 10 minutes. If you did not request it, you can ignore this email.",
    }),
  });
}

async function sendOrderConfirmationEmail(to, order) {
  const ref = order._id.toString().slice(-6).toUpperCase();
  const rowsHtml = order.items
    .map(
      (i) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #0F1B2D1A; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #0F1B2D;">
            ${i.quantity}&times; ${escapeHtml(i.name)}
          </td>
          <td align="right" style="padding: 10px 0; border-bottom: 1px solid #0F1B2D1A; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #0F1B2D; white-space: nowrap;">
            KSh ${(i.price * i.quantity).toLocaleString()}
          </td>
        </tr>
      `
    )
    .join("");

  const deliveryRowHtml = order.deliveryFee
    ? `
      <tr>
        <td style="padding: 10px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #0F1B2D99;">
          Delivery
        </td>
        <td align="right" style="padding: 10px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #0F1B2D99; white-space: nowrap;">
          KSh ${order.deliveryFee.toLocaleString()}
        </td>
      </tr>
    `
    : "";

  const itemsTableHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0 4px; border-top: 1px solid #0F1B2D1A;">
      ${rowsHtml}
      ${deliveryRowHtml}
      <tr>
        <td style="padding: 14px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #0F1B2D;">
          Total
        </td>
        <td align="right" style="padding: 14px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #0F1B2D; white-space: nowrap;">
          KSh ${order.totalAmount.toLocaleString()}
        </td>
      </tr>
    </table>
  `;

  await enqueueEmail({
    to,
    subject: `Order #${ref} received | Azard Stores`,
    dedupeKey: `order:${order._id}:confirmation`,
    html: wrapEmail({
      preheader: `Order #${ref} is received. We will check availability before payment is due.`,
      eyebrow: `Order #${ref}`,
      heading: "Thanks for your order",
      bodyHtml: `<p style="margin:0;">We have received your order and are checking item availability. We will contact you when the check is complete. No payment is due at this stage.</p>`,
      detailsTitle: "ORDER SUMMARY",
      detailsHtml: `${itemsTableHtml}${Number(order.storeBalanceApplied || 0) > 0 ? `<p style="margin:12px 0 0;">Store Balance ${order.storeBalanceStatus === "applied" ? "applied to" : "reserved for"} this order: KSh ${Number(order.storeBalanceApplied).toLocaleString()}</p>` : ""}`,
      nextStepTitle: "DELIVERY DETAILS & NEXT STEP",
      nextStepHtml: `<p style="margin:0 0 5px;">${escapeHtml(order.deliveryArea === "nairobi-cbd" ? "Nairobi CBD direct delivery" : order.deliveryArea === "nairobi-direct" ? "Nairobi County direct delivery" : "Parcel collection")}${[order.deliveryTown, order.deliveryCounty].filter(Boolean).length ? ` | ${escapeHtml([order.deliveryTown, order.deliveryCounty].filter(Boolean).join(", "))}` : ""}</p>${["nairobi-cbd", "nairobi-direct"].includes(order.deliveryArea) && order.deliveryAddress ? `<p style="margin:5px 0;">Address: ${escapeHtml(order.deliveryAddress)}</p>` : ""}${order.deliveryRoute?.serviceType === "parcel" && order.deliveryRoute?.carrier ? `<p style="margin:5px 0;">Parcel office: ${escapeHtml([order.deliveryRoute.carrier, order.deliveryRoute.officeName, order.deliveryRoute.officeAddress].filter(Boolean).join(" | "))}</p>` : ""}${order.deliveryInstructions ? `<p style="margin:5px 0;">${order.deliveryArea === "other" ? "Office notes" : "Delivery notes"}: ${escapeHtml(order.deliveryInstructions)}</p>` : ""}<p style="margin:10px 0 0;">${order.paymentMethod === "store_balance" ? "Your Store Balance will be applied after availability is confirmed." : order.paymentMethod === "cod" ? `For eligible Nairobi CBD orders, KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()} is due at handover.` : `If the items are available, KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()} will be due within 5 days of confirmation, before delivery or parcel dispatch.`}</p>`,
      cta: process.env.CLIENT_URL ? { text: "View order status", url: `${process.env.CLIENT_URL}/track-order/${order._id}` } : undefined,
    }),
  });
}

async function sendOrderUpdateEmail(to, order, heading, message) {
  const ref = order._id.toString().slice(-6).toUpperCase();
  const parcelInfoHtml = ["Parcel dispatched", "Ready for collection"].includes(heading) && order.deliveryRoute?.serviceType === "parcel"
    ? `<p style="margin:8px 0 0;">Parcel service: ${escapeHtml(order.deliveryRoute.carrier || "Parcel carrier")}</p>${order.collectionBranch || order.deliveryRoute.officeName ? `<p style="margin:4px 0 0;">Collection office: ${escapeHtml(order.collectionBranch || order.deliveryRoute.officeName)}</p>` : ""}${order.deliveryRoute.officeAddress ? `<p style="margin:4px 0 0;">Office address: ${escapeHtml(order.deliveryRoute.officeAddress)}</p>` : ""}`
    : "";
  await enqueueEmail({
    to,
    subject: `Order #${ref}: ${heading}`,
    dedupeKey: order.events?.length
      ? `order:${order._id}:event:${order.events[order.events.length - 1].type || "update"}:${new Date(order.events[order.events.length - 1].createdAt || 0).getTime()}:${heading}`
      : undefined,
    html: wrapEmail({
      preheader: `${heading} - update for Azard Stores order #${ref}.`,
      eyebrow: `Order #${ref}`,
      heading,
      bodyHtml: `<p style="margin:0;">${escapeHtml(message)}</p>`,
      detailsTitle: "ORDER DETAILS",
      detailsHtml: `<p style="margin:0 0 6px;"><strong>Order total:</strong> KSh ${Number(order.totalAmount || 0).toLocaleString()}</p>${order.paymentReference ? `<p style="margin:6px 0 0;"><strong>Payment reference:</strong> ${escapeHtml(order.paymentReference)}</p>` : ""}${order.parcelReference ? `<p style="margin:6px 0 0;"><strong>Parcel reference:</strong> ${escapeHtml(order.parcelReference)}</p>` : ""}${parcelInfoHtml}`,
      nextStepTitle: "WHAT HAPPENS NEXT",
      nextStepHtml: "Use the button below to review the latest order status and any available next steps.",
      cta: process.env.CLIENT_URL ? { text: "View order", url: `${process.env.CLIENT_URL}/track-order/${order._id}` } : undefined,
    }),
  });
}

async function sendPaymentReminderEmail(to, order, offsetMinutes) {
  const ref = order._id.toString().slice(-6).toUpperCase();
  const deadline = order.stockReservedUntil
    ? new Date(order.stockReservedUntil).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })
    : null;
  await enqueueEmail({
    to,
      subject: `Payment due for order #${ref} | Azard Stores`,
    dedupeKey: `order:${order._id}:payment-reminder:${offsetMinutes}`,
    html: wrapEmail({
      preheader: `Payment reminder for order #${ref}. Check the amount due and deadline.`,
      eyebrow: `Order #${ref}`,
      heading: "Payment is due for your order",
      bodyHtml: `<p style="margin:0;">Your available items remain reserved while payment is pending. Please complete payment by${deadline ? ` <strong>${escapeHtml(deadline)} (East Africa Time)</strong>` : " the end of the 5-day payment window"}. After this deadline, the reservation expires and the items are released.</p>`,
      detailsTitle: "PAYMENT DETAILS",
      detailsHtml: `<p style="margin:0;font-size:18px;font-weight:bold;color:#142238;">Amount due: KSh ${Math.max(0, Number(order.totalAmount || 0) - Number(order.storeBalanceApplied || 0)).toLocaleString()}</p>${Number(order.storeBalanceApplied || 0) > 0 ? `<p style="margin:8px 0 0;">Store Balance applied: KSh ${Number(order.storeBalanceApplied).toLocaleString()}</p>` : ""}${deadline ? `<p style="margin:8px 0 0;">Payment deadline: ${escapeHtml(deadline)} (East Africa Time)</p>` : ""}`,
      nextStepTitle: "NEXT STEP",
      nextStepHtml: "Open your order to continue payment securely. The order remains unpaid until the payment provider confirms settlement.",
      cta: process.env.CLIENT_URL ? { text: "View your order", url: `${process.env.CLIENT_URL}/track-order/${order._id}` } : undefined,
    }),
  });
}

module.exports = {
  escapeHtml,
  htmlToText,
  sendEmail,
  enqueueEmail,
  wrapEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendCheckoutEmailCode,
  sendOrderConfirmationEmail,
  sendOrderUpdateEmail,
  sendPaymentReminderEmail,
};
