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
  saveScreenFrame,
  getScreenFrame,
  getAllScreenFrames,
  terminateStudent,
  checkStudentStatus
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

// 🔥 Screen Frame streaming routes
router.post("/screen-frame/:examCode/:email", saveScreenFrame);
router.get("/screen-frame/:examCode/:email", getScreenFrame);
router.get("/screen-frames/:examCode", getAllScreenFrames);
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
