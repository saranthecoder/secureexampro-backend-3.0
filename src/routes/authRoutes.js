const express = require("express");
const router = express.Router();
const { signup, login, sendOtp, verifyOtp } = require("../controller/authController");

router.post("/signup", signup);
router.post("/login", login);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

module.exports = router;
