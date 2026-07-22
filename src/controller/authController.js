const User = require("../models/User");
const { Otp, OtpLimit } = require("../models/Otp");
const { sendMail } = require("../config/mail");

const OTP_LIMIT = 5;

exports.signup = async (req, res) => {
  return exports.studentLogin(req, res);
};

// ======================== DIRECT STUDENT LOGIN VIA EMAIL & ROLL NUMBER ========================
exports.studentLogin = async (req, res) => {
  try {
    const { email, rollNumber, name } = req.body;

    if (!email || !rollNumber) {
      return res.status(400).json({ message: "Candidate Email and Roll Number are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanRoll = rollNumber.trim().toUpperCase();
    const cleanName = name && name.trim() ? name.trim() : cleanEmail.split("@")[0];

    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.create({
        name: cleanName,
        email: cleanEmail,
        rollNumber: cleanRoll,
        role: "student"
      });
    } else {
      user.rollNumber = cleanRoll;
      if (name && name.trim()) user.name = name.trim();
      await user.save();
    }

    return res.json({
      message: "Login successful",
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, rollNumber } = req.body;

    // If rollNumber is passed, handle as direct student login
    if (rollNumber) {
      return exports.studentLogin(req, res);
    }

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

    if (user && user.role === "student") {
      return exports.studentLogin(req, res);
    }

    return res.status(400).json({ message: "Invalid credentials." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== SEND OTP ========================
// Accepts mode: "signup" | "login" | "update_profile"
exports.sendOtp = async (req, res) => {
  let name = "";
  let email = "";
  let rollNumber = "";
  let cleanEmail = "";
  let otpCode = "";

  try {
    const mode = req.body.mode || "signup";
    ({ name, email, rollNumber } = req.body);

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    cleanEmail = email.toLowerCase().trim();

    // ---------- Mode-specific validation ----------
    if (mode === "signup") {
      if (!name || !rollNumber) {
        return res.status(400).json({ message: "Name, email, and roll number are required for signup." });
      }
      // Check if student already exists
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists. Please use Login instead." });
      }
    } else if (mode === "login") {
      // Check if student exists
      const existing = await User.findOne({ email: cleanEmail, role: "student" });
      if (!existing) {
        return res.status(404).json({ message: "No student account found with this email. Please Sign Up first." });
      }
      // Use existing student details for OTP email
      name = existing.name || "Student";
      rollNumber = existing.rollNumber || "";
    } else if (mode === "update_profile") {
      // Profile update — student must exist
      const existing = await User.findOne({ email: cleanEmail, role: "student" });
      if (!existing) {
        return res.status(404).json({ message: "Student account not found." });
      }
      name = name || existing.name || "Student";
      rollNumber = rollNumber || existing.rollNumber || "";
    }

    // ---------- Enforce 5 OTP limit per email (12-hour window) ----------
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    let limitRecord = await OtpLimit.findOne({ email: cleanEmail });

    if (limitRecord) {
      const windowExpired = Date.now() - new Date(limitRecord.firstSentAt).getTime() >= TWELVE_HOURS_MS;
      if (windowExpired) {
        // Reset limit window after 12 hours
        limitRecord.count = 1;
        limitRecord.firstSentAt = new Date();
        await limitRecord.save();
      } else if (limitRecord.count >= OTP_LIMIT) {
        return res.status(429).json({
          message: `Maximum ${OTP_LIMIT} OTP email attempts reached for this email ID. Please try again after 12 hours.`,
          otpCount: limitRecord.count,
          remainingAttempts: 0
        });
      } else {
        limitRecord.count += 1;
        await limitRecord.save();
      }
    } else {
      limitRecord = await OtpLimit.create({ email: cleanEmail, count: 1, firstSentAt: new Date() });
    }

    const currentCount = limitRecord.count;
    const remainingAttempts = OTP_LIMIT - currentCount;

    // ---------- Generate and store OTP ----------
    otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await Otp.findOneAndUpdate(
      { email: cleanEmail },
      { name, rollNumber, otp: otpCode, expiresAt, mode },
      { upsert: true, new: true }
    );

    // ---------- Send OTP email ----------
    const modeLabel = mode === "signup" ? "Sign Up" : mode === "login" ? "Login" : "Profile Update";

    const mailOptions = {
      from: `"Secure Exam Pro" <${process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com"}>`,
      to: cleanEmail,
      subject: `Verification OTP (${modeLabel}) - Secure Exam Pro`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1e3a8a; text-align: center;">Secure Exam Pro</h2>
          <p>Hello <strong>${name}</strong>,</p>
          ${rollNumber ? `<p>Your Roll Number: <strong>${rollNumber}</strong></p>` : ""}
          <p>You have requested an OTP for <strong>${modeLabel}</strong>. Please use the following verification code. This OTP is valid for the next 5 minutes.</p>
          <div style="text-align: center; margin: 25px 0;">
            <span style="font-size: 28px; font-weight: bold; background: #eff6ff; color: #1d4ed8; padding: 12px 24px; border-radius: 8px; border: 1px dashed #bfdbfe; letter-spacing: 4px;">
              ${otpCode}
            </span>
          </div>
          <p style="font-size: 11px; color: #94a3b8;">OTP attempts used: ${currentCount}/${OTP_LIMIT} for this email.</p>
          <p style="font-size: 11px; color: #64748b;">If you did not initiate this request, please disregard this email.</p>
        </div>
      `
    };

    await sendMail(mailOptions);
    res.json({
      message: "OTP sent successfully.",
      otpCount: currentCount,
      remainingAttempts
    });

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

// ======================== VERIFY OTP ========================
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

    const mode = record.mode || "signup";

    await Otp.deleteOne({ _id: record._id });

    if (mode === "signup") {
      // Create new student
      let user = await User.findOne({ email: cleanEmail });
      if (user) {
        return res.status(400).json({ message: "Account already exists. Please login instead." });
      }
      user = await User.create({
        name: record.name,
        email: cleanEmail,
        rollNumber: record.rollNumber,
        role: "student"
      });
      return res.json({
        message: "Signup successful",
        user
      });

    } else if (mode === "login") {
      // Login existing student
      const user = await User.findOne({ email: cleanEmail });
      if (!user) {
        return res.status(404).json({ message: "Student not found." });
      }
      return res.json({
        message: "Login successful",
        user
      });

    } else if (mode === "update_profile") {
      // Handled by updateProfile endpoint
      return res.json({
        message: "OTP verified for profile update.",
        verified: true
      });
    }

    return res.status(400).json({ message: "Invalid mode." });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== UPDATE PROFILE ========================
exports.updateProfile = async (req, res) => {
  try {
    const { email, name, rollNumber } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Candidate email is required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Update user profile
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ message: "Student not found." });
    }

    if (name && name.trim()) user.name = name.trim();
    if (rollNumber && rollNumber.trim()) user.rollNumber = rollNumber.trim().toUpperCase();
    await user.save();

    res.json({
      message: "Profile updated successfully.",
      user
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
