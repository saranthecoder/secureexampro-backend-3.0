const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, sparse: true },
  rollNumber: { type: String, default: "" },
  registerId: { type: String, default: "", index: true },
  pin: { type: String, default: "" },
  password: { type: String, default: "" },
  isPinUpdated: { type: Boolean, default: false },
  createdBy: { type: String, default: "" },
  role: {
    type: String,
    enum: ["admin", "examiner", "student"],
    default: "student"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
