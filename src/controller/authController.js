const User = require("../models/User");

// ======================== STUDENT LOGIN VIA REGISTER ID & 6-DIGIT PIN ========================
exports.studentLogin = async (req, res) => {
  try {
    const { registerId, rollNumber, pin, email, name } = req.body;

    const idToSearch = (registerId || rollNumber || "").trim().toUpperCase();

    if (!idToSearch) {
      return res.status(400).json({ message: "Register ID / Roll Number is required." });
    }

    if (!pin) {
      return res.status(400).json({ message: "6-digit PIN is required." });
    }

    const cleanPin = String(pin).trim();

    // Find student by registerId or rollNumber or email
    let user = await User.findOne({
      $or: [
        { registerId: idToSearch },
        { rollNumber: idToSearch },
        { email: (email || "").toLowerCase().trim() }
      ]
    });

    if (!user) {
      return res.status(403).json({
        message: "Student account not found. Direct self-registration is disabled. Only candidates provisioned by the System Admin are permitted to log in."
      });
    }

    // Verify 6-digit PIN if set on user
    if (user.pin && user.pin !== cleanPin) {
      return res.status(400).json({ message: "Invalid 6-digit PIN. Please verify your assigned PIN." });
    }

    // If PIN wasn't set yet on existing user, update it
    if (!user.pin) {
      user.pin = cleanPin;
    }

    if (idToSearch && !user.registerId) user.registerId = idToSearch;
    if (idToSearch && !user.rollNumber) user.rollNumber = idToSearch;
    await user.save();

    return res.json({
      message: "Login successful",
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== UPDATE STUDENT 6-DIGIT PIN ========================
exports.updatePin = async (req, res) => {
  try {
    const { userId, registerId, oldPin, newPin } = req.body;

    if (!newPin || String(newPin).trim().length !== 6) {
      return res.status(400).json({ message: "New PIN must be a 6-digit numeric code." });
    }

    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (registerId) {
      const cleanReg = registerId.trim().toUpperCase();
      user = await User.findOne({ $or: [{ registerId: cleanReg }, { rollNumber: cleanReg }] });
    }

    if (!user) {
      return res.status(404).json({ message: "Student record not found." });
    }

    if (user.pin && oldPin && user.pin !== String(oldPin).trim()) {
      return res.status(400).json({ message: "Incorrect existing PIN." });
    }

    user.pin = String(newPin).trim();
    user.isPinUpdated = true;
    await user.save();

    return res.json({
      message: "PIN updated successfully.",
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== ADMIN & EXAMINER LOGIN ========================
exports.login = async (req, res) => {
  try {
    const { email, password, registerId, rollNumber, pin } = req.body;

    // Direct student login delegation
    if (registerId || (rollNumber && pin)) {
      return exports.studentLogin(req, res);
    }

    const cleanEmail = (email || "").toLowerCase().trim();

    // 1. Core Admin check
    if (cleanEmail === "coreadmin@secureexam.com" || cleanEmail === "admin@secureexam.com") {
      let adminUser = await User.findOne({ email: cleanEmail });
      if (!adminUser) {
        adminUser = await User.create({
          name: "System Admin",
          email: cleanEmail,
          password: password || "Secure@123",
          role: "admin"
        });
      } else if (adminUser.password !== password) {
        return res.status(400).json({ message: "Invalid admin password" });
      }
      return res.json({ message: "Admin login successful", user: adminUser });
    }

    // 2. Database User check (Admin / Examiner / Student)
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ message: "User account not found." });
    }

    if (user.role === "admin" || user.role === "examiner") {
      if (user.password !== password) {
        return res.status(400).json({ message: "Invalid credentials." });
      }
      return res.json({ message: "Login successful", user });
    }

    if (user.role === "student") {
      return exports.studentLogin(req, res);
    }

    return res.status(400).json({ message: "Invalid credentials." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== CREATE EXAMINER ACCOUNT (ADMIN) ========================
exports.createExaminer = async (req, res) => {
  try {
    const { name, email, password, createdBy } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required for examiner account creation." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    const examiner = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: password,
      role: "examiner",
      createdBy: createdBy || "admin"
    });

    res.status(201).json({
      message: "Examiner account created successfully",
      examiner
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== GET ALL EXAMINERS ========================
exports.getExaminers = async (req, res) => {
  try {
    const examiners = await User.find({ role: "examiner" }).sort({ createdAt: -1 });
    res.json(examiners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================== BULK IMPORT STUDENTS (ADMIN / EXAMINER) ========================
exports.bulkImportStudents = async (req, res) => {
  try {
    const { students, createdBy } = req.body; // Array of { registerId, name, email, pin }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: "A non-empty list of students is required." });
    }

    const createdList = [];
    const updatedList = [];
    const errors = [];

    for (let index = 0; index < students.length; index++) {
      const item = students[index];
      const regId = (item.registerId || item.rollNumber || "").trim().toUpperCase();
      const sName = (item.name || regId || "Student").trim();
      const sEmail = item.email ? item.email.toLowerCase().trim() : `${regId.toLowerCase()}@student.local`;
      const sPin = String(item.pin || item.password || "123456").trim() || "123456";

      if (!regId) {
        errors.push(`Row ${index + 1}: Missing Register ID / Roll Number`);
        continue;
      }

      let existing = await User.findOne({
        $or: [{ registerId: regId }, { rollNumber: regId }, { email: sEmail }]
      });

      if (existing) {
        existing.name = sName;
        existing.email = sEmail;
        existing.registerId = regId;
        existing.rollNumber = regId;
        if (sPin) existing.pin = sPin;
        await existing.save();
        updatedList.push(existing);
      } else {
        const newUser = await User.create({
          name: sName,
          email: sEmail,
          registerId: regId,
          rollNumber: regId,
          pin: sPin,
          role: "student",
          createdBy: createdBy || "admin",
          isPinUpdated: false
        });
        createdList.push(newUser);
      }
    }

    res.json({
      message: `Bulk import processed successfully. ${createdList.length} created, ${updatedList.length} updated.`,
      createdCount: createdList.length,
      updatedCount: updatedList.length,
      errors
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to process bulk import", error: error.message });
  }
};

// ======================== GET ALL STUDENTS ========================
exports.getStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student" }).sort({ createdAt: -1 });
    const formatted = students.map(s => {
      const doc = s.toObject();
      if (!doc.pin) doc.pin = "123456";
      return doc;
    });
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Legacy fallback methods to preserve interface compatibility
exports.signup = exports.studentLogin;
exports.sendOtp = async (req, res) => res.json({ message: "OTP flow deprecated; use Register ID and PIN." });
exports.verifyOtp = async (req, res) => res.json({ message: "OTP verification deprecated." });
exports.updateProfile = async (req, res) => {
  try {
    const { email, name, rollNumber, registerId } = req.body;
    const user = await User.findOne({
      $or: [{ email: (email || "").toLowerCase().trim() }, { registerId }, { rollNumber }]
    });
    if (!user) return res.status(404).json({ message: "Student not found." });
    if (name) user.name = name.trim();
    if (rollNumber) user.rollNumber = rollNumber.trim().toUpperCase();
    if (registerId) user.registerId = registerId.trim().toUpperCase();
    await user.save();
    res.json({ message: "Profile updated successfully.", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, registerId, rollNumber, email, pin } = req.body;

    const user = await User.findById(studentId);
    if (!user) {
      return res.status(404).json({ message: "Student account not found." });
    }

    if (name !== undefined) user.name = name.trim();
    if (registerId !== undefined) {
      user.registerId = registerId.trim().toUpperCase();
      user.rollNumber = registerId.trim().toUpperCase();
    }
    if (rollNumber !== undefined) user.rollNumber = rollNumber.trim().toUpperCase();
    if (email !== undefined) user.email = email.trim().toLowerCase();
    if (pin !== undefined && pin.trim()) user.pin = pin.trim();

    await user.save();
    res.json({ message: "Student account updated successfully.", student: user });
  } catch (error) {
    res.status(500).json({ message: "Failed to update student account.", error: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    await User.findByIdAndDelete(studentId);
    res.json({ message: "Student account deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete student account.", error: error.message });
  }
};

exports.cleanupNARecords = async (req, res) => {
  try {
    const query = {
      role: "student",
      $or: [
        { registerId: { $in: [null, "", "N/A", "NA"] } },
        { rollNumber: { $in: [null, "", "N/A", "NA"] } },
        { registerId: { $exists: false } },
        { rollNumber: { $exists: false } }
      ]
    };
    const result = await User.deleteMany(query);
    res.json({
      message: `Successfully deleted ${result.deletedCount} student records with missing or N/A Roll Numbers.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to cleanup N/A student records.", error: error.message });
  }
};
