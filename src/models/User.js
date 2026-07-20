const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  rollNumber: { type: String, default: "" },
  password: { type: String, default: "" },
  role: {
    type: String,
    enum: ["admin", "student"],
    default: "student"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
