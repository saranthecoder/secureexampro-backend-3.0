const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  examCode: {
    type: String,
    required: true
  },
  studentName:{
    type: String,
    required: true
  },
  studentEmail: {
    type: String,
    required: true
  },
  studentRollNumber: {
    type: String,
    default: ""
  },
  answers: [{
    questionId: mongoose.Schema.Types.ObjectId,
    selectedOption: String
  }],

  score: {
    type: Number,
    default: 0
  },

  positiveMarks: {
    type: Number,
    default: 0
  },

  negativeMarks: {
    type: Number,
    default: 0
  },

  totalMarks: {
    type: Number,
    default: 0
  },

  // 🔥 Anti-cheating flags
  terminated: {
    type: Boolean,
    default: false
  },

  tabSwitched: {
    type: Boolean,
    default: false
  },

  // 🔥 Optional: count how many times tab switched
  tabSwitchCount: {
    type: Number,
    default: 0
  },

  faceWarningCount: {
    type: Number,
    default: 0
  },

  noiseWarningCount: {
    type: Number,
    default: 0
  },

  internetIssueCount: {
    type: Number,
    default: 0
  },

  fullScreenExitCount: {
    type: Number,
    default: 0
  },

  screenShareViolationCount: {
    type: Number,
    default: 0
  },

  isEmailed: {
    type: Boolean,
    default: false
  },
  submittedAt: Date

}, { timestamps: true });


// 🔥 Prevent multiple attempts
resultSchema.index({ examCode: 1, studentEmail: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);
