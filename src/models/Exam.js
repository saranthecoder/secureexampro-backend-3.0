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
  cameraMonitor: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Exam", examSchema);
