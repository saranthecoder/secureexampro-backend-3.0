const express = require("express");
const router = express.Router();
const multer = require("multer");
const isAdmin = require("../middleware/adminMiddleware");
const {
  createExam,
  submitExam,
  getExamByCode,
  getAllExams,
  getExamResults,
  updateExam,
  deleteExam,
  heartbeat,
  getActiveCandidates,
  terminateStudent,
  checkStudentStatus,
  updateProctorConfig,
  sendResultEmail,
  sendAllResultsEmail,
  resetStudentAttempt
} = require("../controller/examController");

const upload = multer({ dest: "uploads/" });

router.post(
  "/create",
  upload.single("file"),
  createExam
);

router.get("/all", getAllExams);
router.get("/results/:examCode", getExamResults);
router.put("/update/:id", updateExam);
router.delete("/delete/:id", deleteExam);
router.put("/proctor-config/:examCode", updateProctorConfig);
router.post("/send-result-email/:examCode", sendResultEmail);
router.post("/send-all-results/:examCode", sendAllResultsEmail);
router.post("/reset-attempt/:examCode", resetStudentAttempt);

// 🔥 Active candidate heartbeat & monitoring routes
router.post("/heartbeat/:examCode/:email", heartbeat);
router.get("/active-candidates/:examCode", getActiveCandidates);
router.post("/terminate/:examCode/:email", terminateStudent);
router.get("/status/:examCode/:email", checkStudentStatus);

// 🔥 Student fetch questions
router.get(
  "/:examCode",
  getExamByCode
);

// 🔥 Student submit
router.post(
  "/submit/:examCode",
  submitExam
);

module.exports = router;
