const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { parseListQuery, escapeRegex } = require("../utils/listQuery");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Order = require("../models/Order");
const StoreBalanceTransaction = require("../models/StoreBalanceTransaction");
const { protect, requireRole, setAuthCookie, clearAuthCookie } = require("../middleware/auth");
const { sendPasswordResetEmail, sendVerificationEmail, sendCheckoutEmailCode } = require("../utils/email");
const { sendSms } = require("../utils/sms");
const { normalizePhone } = require("../utils/normalizePhone");
const { getVerificationCapabilities, isEmailVerificationLive } = require("../config/verification");
const { claimPendingGuestBalance } = require("../utils/storeBalance");
const { emitStoreBalanceUpdated } = require("../utils/orderRealtime");
const { digestOtp, verifyOtp } = require("../utils/otp");

const router = express.Router();
const PASSWORD_POLICY_MESSAGE = "Password must be at least 12 characters and no more than 72 UTF-8 bytes.";

function isValidPassword(password) {
  return typeof password === "string" && Array.from(password).length >= 12 && Buffer.byteLength(password, "utf8") <= 72;
}

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role, tokenVersion: Number(user.tokenVersion || 0) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    storeBalance: Number(user.storeBalance || 0),
    savedDeliveryAddress: user.savedDeliveryAddress || { county: "", town: "", address: "", routeId: "" },
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
  };
}

function exactEmailRegex(email) {
  return new RegExp(`^${String(email || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

async function linkVerifiedGuestOrders(user, io = null) {
  if (!user?.isEmailVerified) return 0;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return 0;
  const matchingUsers = await User.find({ email: exactEmailRegex(email) }).select("_id").limit(2);
  if (matchingUsers.length !== 1 || String(matchingUsers[0]._id) !== String(user._id)) {
    const error = new Error("This email is linked to multiple accounts. Contact Azard Stores to resolve the duplicate before linking guest orders.");
    error.statusCode = 409;
    throw error;
  }
  await Order.updateMany(
    { user: null, "guestInfo.email": exactEmailRegex(email) },
    { $set: { user: user._id } }
  );
  const claimedAmount = await claimPendingGuestBalance(user);
  const refreshed = await User.findById(user._id).select("storeBalance");
  if (refreshed) user.storeBalance = refreshed.storeBalance;
  if (claimedAmount > 0 && io) {
    const claimedOrders = await Order.find({ user: user._id, "guestInfo.email": exactEmailRegex(email) }).select("_id").lean();
    emitStoreBalanceUpdated(io, user._id, claimedOrders.map((order) => order._id));
  }
  return claimedAmount;
}

// Limit auth attempts to slow down brute-force / credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many attempts, please try again later" },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many password reset attempts. Please try again later." },
});

// GET /api/auth/verification-methods - which verification channels are
// actually usable right now (public — the signup/settings UI reads this to
// know what to show, rather than hardcoding it on the frontend).
router.get("/verification-methods", (req, res) => {
  res.json(getVerificationCapabilities());
});

// POST /api/auth/signup
router.post(
  "/signup",
  authLimiter,
  [
    body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Name must be between 1 and 100 characters"),
    body("email").trim().isEmail().isLength({ max: 254 }).withMessage("Enter a valid email address up to 254 characters"),
    body("phone").optional({ values: "falsy" }).isString().custom((phone) => /^254[17]\d{8}$/.test(normalizePhone(phone))).withMessage("Enter a valid Kenyan mobile number"),
    body("password").custom(isValidPassword).withMessage(PASSWORD_POLICY_MESSAGE),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, email, password, phone } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const existing = await User.findOne({ email: exactEmailRegex(normalizedEmail) });
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const normalizedPhone = normalizePhone(phone);
      const user = await User.create({ name, email: normalizedEmail, password, phone: normalizedPhone });

      // Send an email verification link — required before checkout
      const verificationToken = crypto.randomBytes(32).toString("hex");
      user.emailVerificationToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
      user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
      await user.save();

      await sendVerificationEmail(user.email, verificationToken).catch((err) =>
        console.error("Failed to send verification email:", err.message)
      );

      const token = signToken(user);
      setAuthCookie(res, token);
      res.status(201).json({ token, user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  [
    body("email").trim().isEmail().isLength({ max: 254 }).withMessage("Enter a valid email address up to 254 characters"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { email, password } = req.body;
      const matchingUsers = await User.find({ email: exactEmailRegex(email) }).select("+password +tokenVersion").limit(2);
      if (matchingUsers.length > 1) {
        return res.status(409).json({ message: "This email is linked to multiple accounts. Contact Azard Stores to resolve the duplicate before signing in." });
      }
      const user = matchingUsers[0];

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      user.lastLoginAt = new Date();
      await user.save();
      await linkVerifiedGuestOrders(user, req.app.get("io"));

      // Guest orders are linked only by the explicit verified-email claim flow.

      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout - clears the browser session cookie.
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Signed out" });
});

// GET /api/auth/me - get current logged-in user
router.get("/me", protect, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// GET /api/auth/wishlist - account-owned customer wishlist.
router.get("/wishlist", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+wishlistSlugs");
    res.json({ slugs: user?.wishlistSlugs || [] });
  } catch (err) { next(err); }
});

// PUT /api/auth/wishlist - replace atomically with a bounded list of catalog slugs.
router.put("/wishlist", protect, async (req, res, next) => {
  try {
    const supplied = req.body?.slugs;
    if (!Array.isArray(supplied) || supplied.length > 500 || supplied.some((slug) => typeof slug !== "string" || slug.trim().length > 160)) {
      return res.status(400).json({ message: "Wishlist must contain no more than 500 valid product identifiers" });
    }
    const slugs = [...new Set(supplied.map((slug) => slug.trim()).filter(Boolean))];
    const result = await User.updateOne({ _id: req.user._id }, { $set: { wishlistSlugs: slugs } });
    if (!result.matchedCount) return res.status(404).json({ message: "Account not found" });
    res.json({ slugs });
  } catch (err) { next(err); }
});

router.get("/store-balance", protect, async (req, res, next) => {
  try {
    // Retry any verified guest-order claims when the customer opens Billing.
    // The claim ledger is idempotent, so this is safe after transient failures.
    const claimedAmount = await claimPendingGuestBalance(req.user);
    if (claimedAmount > 0) {
      const email = String(req.user.email || "").trim().toLowerCase();
      const claimedOrders = await Order.find({ user: req.user._id, "guestInfo.email": exactEmailRegex(email) }).select("_id").lean();
      emitStoreBalanceUpdated(req.app.get("io"), req.user._id, claimedOrders.map((order) => order._id));
    }
    const user = await User.findById(req.user._id).select("storeBalance");
    const ledgerOwner = await User.findById(req.user._id).select("+storeBalanceTransactions");
    const [ledgerTransactions, legacyTransactions] = await Promise.all([
      StoreBalanceTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Promise.resolve((ledgerOwner?.storeBalanceTransactions || []).slice(-100).reverse().map((entry) => entry.toObject())),
    ]);
    const uniqueTransactions = new Map();
    for (const entry of [...ledgerTransactions, ...legacyTransactions]) {
      if (!uniqueTransactions.has(entry.reference)) uniqueTransactions.set(entry.reference, entry);
    }
    const transactions = [...uniqueTransactions.values()]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 100);
    const orderIds = transactions.map((entry) => entry.order).filter(Boolean);
    const relatedOrders = await Order.find({ _id: { $in: orderIds } }).select("_id status paymentStatus").lean();
    const orderById = new Map(relatedOrders.map((order) => [String(order._id), order]));
    res.json({
      balance: Number(user?.storeBalance || 0),
      transactions: transactions.map((entry) => {
        const orderId = entry.order?._id || entry.order;
        const order = orderId ? orderById.get(String(orderId)) : null;
        return {
          ...entry,
          order: orderId || null,
          orderStatus: order?.status || "",
          orderPaymentStatus: order?.paymentStatus || "",
        };
      }),
    });
  } catch (err) { next(err); }
});

// GET /api/auth/admin/users - admin only. Paginated, searchable customer list.
router.get("/admin/users", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { search, page, limit } = parseListQuery(req.query);
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map(sanitizeUser),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/admin/users/:id - admin only. One customer's profile plus
// their order history, so support/admin work doesn't require cross-
// referencing the Orders list by hand.
router.get("/admin/users/:id", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 });

    res.json({ user: sanitizeUser(user), orders });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/me - update the logged-in user's own name/phone.
// Email is intentionally not editable here — it's tied to verification.
router.put(
  "/me",
  protect,
  [body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Name must be between 1 and 100 characters")],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, phone, savedDeliveryAddress } = req.body;
      req.user.name = name;
      if (savedDeliveryAddress !== undefined) {
        if (!savedDeliveryAddress || typeof savedDeliveryAddress !== "object" || Array.isArray(savedDeliveryAddress)) return res.status(400).json({ message: "Enter a valid saved delivery address" });
        const { county = "", town = "", address = "", routeId = "" } = savedDeliveryAddress;
        if (![county, town, address, routeId].every((value) => typeof value === "string") || county.length > 100 || town.length > 100 || address.length > 1000 || routeId.length > 64) return res.status(400).json({ message: "Saved delivery address details are invalid or too long" });
        req.user.savedDeliveryAddress = { county: county.trim(), town: town.trim(), address: address.trim(), routeId: routeId.trim() };
      }
      if (phone !== undefined) {
        if (typeof phone !== "string") return res.status(400).json({ message: "Enter a valid Kenyan mobile number" });
        const normalizedPhone = normalizePhone(phone);
        if (phone.trim() && !/^254[17]\d{8}$/.test(normalizedPhone)) return res.status(400).json({ message: "Enter a valid Kenyan mobile number" });
        if (normalizedPhone !== req.user.phone) {
          req.user.phone = normalizedPhone;
          req.user.isPhoneVerified = false;
          req.user.phoneOtpHash = undefined;
          req.user.phoneOtpExpires = undefined;
          req.user.phoneOtpAttempts = 0;
        }
      }
      await req.user.save();

      res.json({ user: sanitizeUser(req.user) });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/auth/change-password - logged-in users only. body: { currentPassword, newPassword }
router.put(
  "/change-password",
  protect,
  authLimiter,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").custom(isValidPassword).withMessage(PASSWORD_POLICY_MESSAGE),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select("+password +tokenVersion");

      if (!(await user.comparePassword(currentPassword))) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      user.password = newPassword; // pre-save hook hashes this
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await user.save();

      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ message: "Password updated successfully", token });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/verify-email?token=...
router.get("/verify-email", async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "Verification token is required" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    }).select("+emailVerificationToken +emailVerificationExpires");

    if (!user) {
      return res.status(400).json({ message: "Verification link is invalid or has expired" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    await linkVerifiedGuestOrders(user, req.app.get("io"));

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification-email - logged-in users only
router.post("/resend-verification-email", protect, authLimiter, async (req, res, next) => {
  try {
    if (req.user.isEmailVerified) {
      return res.json({ message: "Your email is already verified" });
    }
    if (!isEmailVerificationLive()) {
      return res.json({ message: "Email verification isn't set up yet — no action needed for now" });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    req.user.emailVerificationToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
    req.user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await req.user.save();

    await sendVerificationEmail(req.user.email, verificationToken).catch((err) =>
      console.error("Failed to send verification email:", err.message)
    );

    res.json({ message: "Verification email queued for delivery. It should arrive shortly." });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/send-checkout-email-otp - signed-in checkout verification
router.post("/send-checkout-email-otp", protect, authLimiter, async (req, res, next) => {
  try {
    if (req.user.isEmailVerified) return res.json({ message: "Your email is already verified", verified: true });
    if (!isEmailVerificationLive()) {
      return res.status(503).json({ message: "Email verification is not available right now. Please try again later." });
    }

    const user = await User.findById(req.user._id).select("+checkoutEmailOtpHash +checkoutEmailOtpExpires +checkoutEmailOtpAttempts +checkoutEmailOtpSentAt");
    const now = Date.now();
    if (user.checkoutEmailOtpSentAt && now - user.checkoutEmailOtpSentAt.getTime() < 60_000) {
      return res.status(429).json({ message: "Please wait a minute before requesting another code." });
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    user.checkoutEmailOtpHash = digestOtp(code);
    user.checkoutEmailOtpExpires = now + 10 * 60 * 1000;
    user.checkoutEmailOtpAttempts = 0;
    user.checkoutEmailOtpSentAt = now;
    await user.save();

    try {
      await sendCheckoutEmailCode(user.email, code);
    } catch (err) {
      user.checkoutEmailOtpHash = undefined;
      user.checkoutEmailOtpExpires = undefined;
      user.checkoutEmailOtpAttempts = 0;
      user.checkoutEmailOtpSentAt = undefined;
      await user.save();
      console.error("Failed to send checkout email code:", err.message);
      return res.status(502).json({ message: "We couldn't send your code. Please try again shortly." });
    }

    return res.json({ message: "A 6-digit verification code has been sent to your email." });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-checkout-email-otp - body: { code }
router.post(
  "/verify-checkout-email-otp",
  protect,
  authLimiter,
  [body("code").matches(/^\d{6}$/).withMessage("Enter the 6-digit code from your email")],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      if (req.user.isEmailVerified) return res.json({ message: "Your email is already verified", user: sanitizeUser(req.user) });

      const user = await User.findById(req.user._id).select("+checkoutEmailOtpHash +checkoutEmailOtpExpires +checkoutEmailOtpAttempts +emailVerificationToken +emailVerificationExpires");
      if (!user.checkoutEmailOtpHash || !user.checkoutEmailOtpExpires || user.checkoutEmailOtpExpires.getTime() <= Date.now()) {
        return res.status(400).json({ message: "That code has expired. Request a new one." });
      }
      if (user.checkoutEmailOtpAttempts >= 5) {
        user.checkoutEmailOtpHash = undefined;
        user.checkoutEmailOtpExpires = undefined;
        user.checkoutEmailOtpAttempts = 0;
        await user.save();
        return res.status(429).json({ message: "Too many incorrect attempts. Request a new code." });
      }

      if (!verifyOtp(req.body.code, user.checkoutEmailOtpHash)) {
        user.checkoutEmailOtpAttempts += 1;
        const attemptsLeft = Math.max(0, 5 - user.checkoutEmailOtpAttempts);
        if (!attemptsLeft) {
          user.checkoutEmailOtpHash = undefined;
          user.checkoutEmailOtpExpires = undefined;
        }
        await user.save();
        return res.status(attemptsLeft ? 400 : 429).json({
          message: attemptsLeft ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Request a new code.",
        });
      }

      user.isEmailVerified = true;
      user.checkoutEmailOtpHash = undefined;
      user.checkoutEmailOtpExpires = undefined;
      user.checkoutEmailOtpAttempts = 0;
      user.checkoutEmailOtpSentAt = undefined;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      await linkVerifiedGuestOrders(user, req.app.get("io"));
      return res.json({ message: "Email verified successfully", user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/send-phone-otp - logged-in users only. body: { phone, channel }
// For SMS: we send the code to the user directly, they type it back to us.
// For WhatsApp (loop trick): the code is never sent by us — we hand the
// frontend a pre-filled wa.me link, the USER sends the code to our business
// number, and the webhook (routes/webhooks.js) catches it on the way in.
router.post(
  "/send-phone-otp",
  protect,
  authLimiter,
  [
    body("phone").trim().notEmpty().withMessage("Phone number is required").custom((value) => /^254[17]\d{8}$/.test(normalizePhone(value))).withMessage("Enter a valid Kenyan mobile number"),
    body("channel").isIn(["sms", "whatsapp"]).withMessage("Choose a valid verification channel"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { channel } = req.body;
      const phone = normalizePhone(req.body.phone);
      if (req.user.isPhoneVerified && normalizePhone(req.user.phone) === phone) {
        return res.json({ message: "Your phone number is already verified.", verified: true });
      }
      const caps = getVerificationCapabilities();

      if (!caps[channel]) {
        return res.status(503).json({
          message: `${channel === "sms" ? "SMS" : "WhatsApp"} verification isn't available yet — check back soon`,
        });
      }

      const now = Date.now();
      const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
      const user = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          $or: [
            { phoneOtpSentAt: { $exists: false } },
            { phoneOtpSentAt: null },
            { phoneOtpSentAt: { $lte: new Date(now - 60_000) } },
          ],
        },
        {
          $set: {
            phone,
            phoneOtpHash: digestOtp(otp),
            phoneOtpExpires: new Date(now + 10 * 60 * 1000),
            phoneOtpAttempts: 0,
            phoneOtpSentAt: new Date(now),
            phoneOtpChannel: channel,
          },
        },
        { new: true, runValidators: true }
      ).select("+phoneOtpHash +phoneOtpExpires +phoneOtpAttempts +phoneOtpSentAt +phoneOtpChannel");
      if (!user) return res.status(429).json({ message: "Please wait a minute before requesting another verification code." });

      if (channel === "sms") {
        const message = `Your Azard Stores verification code is ${otp}. Enter it in your account to verify your phone. The code expires in 10 minutes.`;
        try {
          await sendSms(phone, message);
        } catch (err) {
          user.phoneOtpHash = undefined;
          user.phoneOtpExpires = undefined;
          user.phoneOtpAttempts = 0;
          user.phoneOtpSentAt = undefined;
          await user.save();
          console.error("Failed to send SMS OTP:", err.message);
          return res.status(502).json({ message: "We couldn't send the SMS code. Check the number or try again later." });
        }
        return res.json({ message: "We sent a verification code by SMS. Enter it here to verify your phone." });
      }

      // WhatsApp loop: build the deep link with the code pre-filled — the
      // frontend opens this so the user can just tap Send. The code is
      // deliberately visible here; the user is the one sending it to us,
      // not the other way round.
      const prefilledText = encodeURIComponent(`Verify my Azard Stores account: ${otp}`);
      const whatsappLink = `https://wa.me/${process.env.WHATSAPP_BUSINESS_NUMBER}?text=${prefilledText}`;

      res.json({
        message: "Open WhatsApp and tap Send to verify",
        whatsappLink,
        code: otp,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/phone-verification-status - logged-in users only. Polled by
// the frontend after opening the WhatsApp link, since verification happens
// asynchronously via the webhook, not as a direct response to any request
// the browser makes.
router.get("/phone-verification-status", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+phoneOtpHash +phoneOtpExpires");
    const pending = Boolean(user.phoneOtpHash && user.phoneOtpExpires && user.phoneOtpExpires.getTime() > Date.now());
    res.json({ verified: Boolean(user.isPhoneVerified), pending });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-phone-otp - logged-in users only. body: { otp }
router.post(
  "/verify-phone-otp",
  protect,
  authLimiter,
  [body("otp").isString().matches(/^\d{6}$/).withMessage("Enter the 6-digit code you received")],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const user = await User.findById(req.user._id).select("+phoneOtpHash +phoneOtpExpires +phoneOtpAttempts +phoneOtpSentAt");
      if (!user.phoneOtpHash || !user.phoneOtpExpires || user.phoneOtpExpires < Date.now()) {
        return res.status(400).json({ message: "Code has expired — request a new one" });
      }
      if (user.phoneOtpAttempts >= 5) {
        user.phoneOtpHash = undefined;
        user.phoneOtpExpires = undefined;
        user.phoneOtpAttempts = 0;
        user.phoneOtpSentAt = undefined;
        await user.save();
        return res.status(429).json({ message: "Too many incorrect codes. Request a new verification code." });
      }

      if (!verifyOtp(req.body.otp.trim(), user.phoneOtpHash)) {
        const failedAttempt = await User.findOneAndUpdate(
          { _id: user._id, phoneOtpHash: user.phoneOtpHash, phoneOtpExpires: { $gt: new Date() }, phoneOtpAttempts: { $lt: 5 } },
          { $inc: { phoneOtpAttempts: 1 } },
          { new: true }
        ).select("+phoneOtpAttempts");
        if (!failedAttempt) return res.status(409).json({ message: "This verification code is no longer active. Request a new one." });
        const attemptsLeft = Math.max(0, 5 - failedAttempt.phoneOtpAttempts);
        if (attemptsLeft === 0) {
          await User.updateOne(
            { _id: user._id, phoneOtpHash: user.phoneOtpHash, phoneOtpAttempts: { $gte: 5 } },
            { $unset: { phoneOtpHash: "", phoneOtpExpires: "", phoneOtpSentAt: "" }, $set: { phoneOtpAttempts: 0 } }
          );
          return res.status(429).json({ message: "Too many incorrect codes. Request a new verification code." });
        }
        return res.status(400).json({ message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.` });
      }

      user.isPhoneVerified = true;
      user.phoneOtpHash = undefined;
      user.phoneOtpExpires = undefined;
      user.phoneOtpAttempts = 0;
      user.phoneOtpSentAt = undefined;
      await user.save();

      res.json({ message: "Phone number verified", user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  passwordResetLimiter,
  [body("email").trim().isEmail().isLength({ max: 254 }).withMessage("Enter a valid email address up to 254 characters")],
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const resetToken = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const user = await User.findOneAndUpdate(
        {
          email: exactEmailRegex(email),
          $or: [
            { resetPasswordSentAt: null },
            { resetPasswordSentAt: { $exists: false } },
            { resetPasswordSentAt: { $lte: new Date(now.getTime() - 60_000) } },
          ],
        },
        { $set: {
          resetPasswordToken: crypto.createHash("sha256").update(resetToken).digest("hex"),
          resetPasswordExpires: new Date(now.getTime() + 60 * 60 * 1000),
          resetPasswordSentAt: now,
        } },
        { new: true }
      );

      // Keep the same response for unknown accounts and cooldown requests.
      if (!user) return res.json({ message: "If an account matches that email, a reset link is queued for delivery." });

      await sendPasswordResetEmail(user.email, resetToken).catch((err) =>
        console.error("Failed to send reset email:", err.message)
      );

      res.json({ message: "If an account matches that email, a reset link is queued for delivery." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  passwordResetLimiter,
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password").custom(isValidPassword).withMessage(PASSWORD_POLICY_MESSAGE),
  ],
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

      const tokenFilter = {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
      };
      const userExists = await User.exists(tokenFilter);

      if (!userExists) {
        return res.status(400).json({ message: "Reset link is invalid or has expired" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.findOneAndUpdate(
        tokenFilter,
        {
          $set: { password: passwordHash },
          $inc: { tokenVersion: 1 },
          $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
        },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(400).json({ message: "Reset link is invalid or has expired" });

      res.json({ message: "Password has been reset. You can now log in." });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
