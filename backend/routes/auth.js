const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

// Limit auth attempts to slow down brute-force / credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many attempts, please try again later" },
});

// POST /api/auth/signup
router.post(
  "/signup",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("A valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { name, email, password, phone } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const user = await User.create({ name, email, password, phone });
      const token = signToken(user);

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
    body("email").isEmail().withMessage("A valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { email, password } = req.body;
      const user = await User.findOne({ email }).select("+password");

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = signToken(user);
      res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/me - get current logged-in user
router.get("/me", protect, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  authLimiter,
  [body("email").isEmail().withMessage("A valid email is required")],
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      // Always respond the same way, whether or not the email exists,
      // so attackers can't use this to discover registered emails
      if (!user) {
        return res.json({ message: "If that email exists, a reset link has been sent" });
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
      user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
      await user.save();

      // TODO: send email via utils/sendEmail.js with link:
      // `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`
      console.log("Password reset token (dev only):", resetToken);

      res.json({ message: "If that email exists, a reset link has been sent" });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
      }).select("+resetPasswordToken +resetPasswordExpires");

      if (!user) {
        return res.status(400).json({ message: "Reset link is invalid or has expired" });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({ message: "Password has been reset. You can now log in." });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
