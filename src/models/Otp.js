const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String, default: "" },
  rollNumber: { type: String, default: "" },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  mode: { type: String, enum: ["login", "signup", "update_profile"], default: "signup" }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Separate collection to track OTP send count per email (daily limit)
const otpLimitSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  firstSentAt: { type: Date, default: Date.now }
});

// Auto-expire after 12 hours so limits reset
otpLimitSchema.index({ firstSentAt: 1 }, { expireAfterSeconds: 43200 });

const Otp = mongoose.model("Otp", otpSchema);
const OtpLimit = mongoose.model("OtpLimit", otpLimitSchema);

module.exports = { Otp, OtpLimit };
