const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, default: "" },
    storeBalance: { type: Number, min: 0, default: 0 },
    storeBalanceTransactions: {
      type: [{
        type: { type: String, enum: ["credit", "reserve", "release", "claim"], required: true },
        amount: { type: Number, min: 0, required: true },
        balanceAfter: { type: Number, min: 0, required: true },
        reference: { type: String, required: true },
        order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
        description: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
      select: false,
    },
    savedDeliveryAddress: {
      county: { type: String, default: "", trim: true, maxlength: 100 },
      town: { type: String, default: "", trim: true, maxlength: 100 },
      address: { type: String, default: "", trim: true, maxlength: 1000 },
      routeId: { type: String, default: "", trim: true, maxlength: 64 },
    },
    // Store only product slugs. The public catalog API still controls which
    // products can be viewed; this list contains no private product data.
    wishlistSlugs: { type: [String], default: [], select: false },
    role: { type: String, enum: ["admin", "customer"], default: "customer" },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    resetPasswordSentAt: { type: Date, select: false },

    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    checkoutEmailOtpHash: { type: String, select: false },
    checkoutEmailOtpExpires: { type: Date, select: false },
    checkoutEmailOtpAttempts: { type: Number, default: 0, select: false },
    checkoutEmailOtpSentAt: { type: Date, select: false },

    isPhoneVerified: { type: Boolean, default: false },
    phoneOtpHash: { type: String, select: false },
    phoneOtpExpires: { type: Date, select: false },
    phoneOtpAttempts: { type: Number, default: 0, select: false },
    phoneOtpSentAt: { type: Date, select: false },
    phoneOtpChannel: { type: String, enum: ["sms", "whatsapp"], select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
