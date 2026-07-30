const express = require("express");
const router = express.Router();
const {
  signup,
  login,
  studentLogin,
  updatePin,
  createExaminer,
  getExaminers,
  bulkImportStudents,
  getStudents,
  sendOtp,
  verifyOtp,
  updateProfile,
  updateStudent,
  deleteStudent,
  cleanupNARecords
} = require("../controller/authController");

router.post("/signup", signup);
router.post("/login", login);
router.post("/student-login", studentLogin);
router.post("/update-pin", updatePin);
router.post("/create-examiner", createExaminer);
router.get("/examiners", getExaminers);
router.post("/bulk-import-students", bulkImportStudents);
router.get("/students", getStudents);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/update-profile", updateProfile);
router.put("/student/:studentId", updateStudent);
router.delete("/student/:studentId", deleteStudent);
router.delete("/students/cleanup-na", cleanupNARecords);

module.exports = router;
