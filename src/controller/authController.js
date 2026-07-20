const User = require("../models/User");
const Otp = require("../models/Otp");
const { sendMail } = require("../config/mail");

exports.signup = async (req, res) => {
  return res.status(400).json({ message: "Signup is disabled. Please login via OTP." });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === "coreadmin@secureexam.com") {
      const user = await User.findOne({ email });
      if (!user || user.password !== password) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
      return res.json({
        message: "Login successful",
        user
      });
    }

    const user = await User.findOne({ email });
    if (user && user.role === "admin") {
      if (user.password !== password) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
      return res.json({
        message: "Login successful",
        user
      });
    }

    return res.status(400).json({ message: "Students must log in via OTP." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.sendOtp = async (req, res) => {
  let name = "";
  let email = "";
  let rollNumber = "";
  let cleanEmail = "";
  let otpCode = "";

  try {
    ({ name, email, rollNumber } = req.body);

    if (!name || !email || !rollNumber) {
      return res.status(400).json({ message: "Name, email, and roll number are required." });
    }

    cleanEmail = email.toLowerCase().trim();
    otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await Otp.findOneAndUpdate(
      { email: cleanEmail },
      { name, rollNumber, otp: otpCode, expiresAt },
      { upsert: true, new: true }
    );

    const mailOptions = {
      from: `"Secure Exam Pro" <${process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com"}>`,
      to: cleanEmail,
      subject: "Verification OTP - Secure Exam Pro",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1e3a8a; text-align: center;">Secure Exam Pro</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your Roll Number: <strong>${rollNumber}</strong></p>
          <p>Please use the following verification OTP to access the examination lobby. This OTP is valid for the next 5 minutes.</p>
          <div style="text-align: center; margin: 25px 0;">
            <span style="font-size: 28px; font-weight: bold; background: #eff6ff; color: #1d4ed8; padding: 12px 24px; border-radius: 8px; border: 1px dashed #bfdbfe; letter-spacing: 4px;">
              ${otpCode}
            </span>
          </div>
          <p style="font-size: 11px; color: #64748b;">If you did not initiate this login request, please disregard this email.</p>
        </div>
      `
    };

    await sendMail(mailOptions);
    res.json({ message: "OTP sent successfully." });

  } catch (error) {
    console.error("Error sending OTP:", error);
    console.log("\n========================================================");
    console.log(`🔑 EMERGENCY OTP BYPASS (SMTP AUTHENTICATION FAILED)`);
    console.log(`Candidate Name: ${name}`);
    console.log(`Candidate Email: ${cleanEmail}`);
    console.log(`Candidate Roll Number: ${rollNumber}`);
    console.log(`Generated OTP: ${otpCode}`);
    console.log("========================================================\n");
    
    res.status(500).json({ 
      message: "Mail service authentication failed. The OTP has been logged to the server console for local testing.",
      error: error.message 
    });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.trim();

    const record = await Otp.findOne({ email: cleanEmail });

    if (!record || record.otp !== cleanOtp) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    await Otp.deleteOne({ _id: record._id });

    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      user = await User.create({
        name: record.name,
        email: cleanEmail,
        rollNumber: record.rollNumber,
        role: "student"
      });
    } else {
      user.name = record.name;
      user.rollNumber = record.rollNumber;
      await user.save();
    }

    res.json({
      message: "Login successful",
      user
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
