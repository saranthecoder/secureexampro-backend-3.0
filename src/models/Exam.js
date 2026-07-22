const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question: String,
  options: {
    A: String,
    B: String,
    C: String,
    D: String
  },
  correctAnswer: String,
  marks: Number,
  negativeMarks: { type: Number, default: 0 },
  isMultipleCorrect: { type: Boolean, default: false },
  questionType: { type: String, enum: ["MCQ", "MSQ", "FIB", "NUM", "DES"], default: "MCQ" },
  isGraceAwarded: { type: Boolean, default: false },
  section: { type: String, default: "General" },
  codeSnippet: { type: String, default: "" },
  imageUrl: { type: String, default: "" }
});

const examSchema = new mongoose.Schema({
  title: String,
  examCode: { type: String, unique: true },
  duration: Number,
  startTime: Date,
  endTime: Date,
  questions: [questionSchema],
  createdBy: String,   // store admin email
  cameraMonitor: { type: Boolean, default: false },
  aiProctorActive: { type: Boolean, default: false },
  micMonitor: { type: Boolean, default: false },
  screenShareMonitor: { type: Boolean, default: false },
  trackTabSwitches: { type: Boolean, default: true },
  trackFullScreenExit: { type: Boolean, default: true },
  trackInternetIssues: { type: Boolean, default: true },
  maxTabSwitches: { type: Number, default: 3 },
  maxFullScreenExits: { type: Number, default: 3 },
  dispatchPolicy: { type: String, enum: ["automatic", "manual", "none"], default: "none" },
  assessmentType: { type: String, enum: ["standard", "coding_hybrid"], default: "standard" },
  questionSets: [{
    setName: { type: String, required: true },
    instructions: { type: String, default: "" },
    paperMaxMarks: { type: Number, default: 50 },
    executionMaxMarks: { type: Number, default: 50 },
    problemStatement: { type: String, default: "" },
    sampleInputOutput: { type: String, default: "" },
    driveUrl: { type: String, default: "" },
    codeTemplate: { type: String, default: "" },
    problems: [{
      title: { type: String, default: "Problem 1" },
      problemStatement: { type: String, default: "" },
      sampleInputOutput: { type: String, default: "" },
      instructions: { type: String, default: "" }
    }]
  }]
}, { timestamps: true });

module.exports = mongoose.model("Exam", examSchema);
