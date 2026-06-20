const mongoose = require("mongoose");
const Exam = require("../models/Exam");
// const resultSchema = require("../models/Result");
const XLSX = require("xlsx");
const fs = require("fs");

exports.createExam = async (req, res) => {
  try {
    const { title, examCode, duration, startTime, endTime, adminEmail, cameraMonitor } = req.body;

    examCodeUpper = examCode.toUpperCase().trim();

    // 🔥 Check if examCode already exists
    const existingExam = await Exam.findOne({ examCode: examCodeUpper });

    if (existingExam) {
      return res.status(400).json({
        message: "Exam code already exists. Please use a different code."
      });
    }

    let questions = [];

    if (req.file) {
      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      questions = data.map(q => ({
        question: q["Question"],
        options: {
          A: q["Option A"],
          B: q["Option B"],
          C: q["Option C"],
          D: q["Option D"]
        },
        correctAnswer: q["Correct Answer"],
        marks: q["Marks"],
        section: q["Section"] ? q["Section"].trim() : "General",
        codeSnippet: q["Code Snippet"] ? q["Code Snippet"].toString().trim() : "",
        imageUrl: q["Image URL"] ? q["Image URL"].toString().trim() : ""
      }));
      fs.unlinkSync(req.file.path);
    } else if (req.body.questions) {
      questions = typeof req.body.questions === "string"
        ? JSON.parse(req.body.questions)
        : req.body.questions;
    } else {
      return res.status(400).json({
        message: "Excel file or questions payload is required"
      });
    }

    const exam = await Exam.create({
      title,
      examCode: examCodeUpper,
      duration,
      startTime,
      endTime,
      questions,
      createdBy: adminEmail,
      cameraMonitor: cameraMonitor === "true" || cameraMonitor === true
    });

    res.status(201).json({ message: "Exam created", exam });

  } catch (error) {

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Exam code already exists. Please choose a different code."
      });
    }
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET ALL EXAMS
exports.getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: exams.length,
      exams
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getExamByCode = async (req, res) => {
  try {
    const { examCode } = req.params;
    const { email } = req.query;

    const exam = await Exam.findOne({ examCode });

    if (!exam)
      return res.status(404).json({ message: "Exam not found" });

    const now = new Date();

    if (now > exam.endTime)
      return res.status(400).json({ message: "Exam ended" });

    // If not started yet, return metadata only (empty questions array)
    if (now < exam.startTime) {
      return res.json({
        title: exam.title,
        duration: exam.duration,
        examCode: exam.examCode,
        startTime: exam.startTime,
        endTime: exam.endTime,
        questions: [],
        notStartedYet: true,
        cameraMonitor: exam.cameraMonitor || false
      });
    }

    // ===============================
    // 🔥 DYNAMIC COLLECTION CHECK
    // ===============================

    if (email) {
      const collectionName = `${examCode}_results`;

      const resultCollection = mongoose.connection.collection(collectionName);

      const existingResult = await resultCollection.findOne({
        studentEmail: email,
      });

      if (existingResult) {
        return res.status(403).json({
          message: "You have already submitted this exam.",
        });
      }
    }


    // ===============================
    // Send Questions (without answers)
    // ===============================

    const questionsForStudent = exam.questions.map((q) => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      section: q.section || "General",
      codeSnippet: q.codeSnippet || "",
      imageUrl: q.imageUrl || "",
    }));

    res.json({
      title: exam.title,
      duration: exam.duration,
      examCode: exam.examCode,
      questions: questionsForStudent,
      cameraMonitor: exam.cameraMonitor || false
    });
  } catch (error) {
    console.error("Error fetching exam:", error);
    res.status(500).json({ error: error.message });
  }
};


exports.submitExam = async (req, res) => {
  try {
    const { examCode } = req.params;

    const {
      answers,
      studentName,
      studentEmail,
      terminated = false,
      tabSwitched = false,
      tabSwitchCount = 0,
      faceWarningCount = 0,
      faceTurnTerminated = false
    } = req.body;


    const exam = await Exam.findOne({ examCode });

    if (!exam)
      return res.status(404).json({ message: "Exam not found" });

    const now = new Date();

    if (now < exam.startTime)
      return res.status(400).json({ message: "Exam not started yet" });

    if (now > exam.endTime)
      return res.status(400).json({ message: "Exam ended" });

    let score = 0;
    let totalMarks = 0;

    exam.questions.forEach(q => {
      totalMarks += q.marks;

      const ans = answers.find(
        a => a.questionId === q._id.toString()
      );

      if (ans && ans.selectedOption === q.correctAnswer) {
        score += q.marks;
      }
    });

    // 🔥 Auto-terminate rule (optional)
    let finalTerminated = terminated;

    if (tabSwitchCount >= 3 || faceWarningCount >= 5 || faceTurnTerminated) {
      finalTerminated = true;
    }

    // 🔥 Dynamic Schema with Anti-cheating fields
    const resultSchema = new mongoose.Schema({
      studentName: {
        type: String,
        required: true
      },
      studentEmail: String,
      answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: String
      }],
      score: Number,
      totalMarks: Number,
      terminated: {
        type: Boolean,
        default: false
      },
      tabSwitched: {
        type: Boolean,
        default: false
      },
      tabSwitchCount: {
        type: Number,
        default: 0
      },
      faceWarningCount: {
        type: Number,
        default: 0
      },
      faceTurnTerminated: {
        type: Boolean,
        default: false
      },
      submittedAt: Date
    }, { timestamps: true });

    const collectionName = `${examCode}_results`;

    const DynamicResult =
      mongoose.models[collectionName] ||
      mongoose.model(collectionName, resultSchema, collectionName);

    // 🔥 Prevent Duplicate Submission
    const alreadySubmitted = await DynamicResult.findOne({
      studentEmail
    });

    if (alreadySubmitted)
      return res.status(400).json({ message: "Already submitted" });

    await DynamicResult.create({
      studentName,
      studentEmail,
      answers,
      score,
      totalMarks,
      terminated: finalTerminated,
      tabSwitched,
      tabSwitchCount,
      faceWarningCount,
      faceTurnTerminated,
      submittedAt: new Date()
    });

    res.json({
      message: "Exam submitted successfully",
      score,
      totalMarks,
      terminated: finalTerminated,
      storedIn: collectionName
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET EXAM RESULTS
exports.getExamResults = async (req, res) => {
  try {
    const { examCode } = req.params;
    const collectionName = `${examCode}_results`;
    const resultCollection = mongoose.connection.collection(collectionName);
    const results = await resultCollection.find().toArray();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔥 UPDATE EXAM DETAILS
exports.updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, duration, startTime, endTime } = req.body;
    const exam = await Exam.findByIdAndUpdate(
      id,
      {
        title,
        duration: Number(duration),
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      },
      { new: true }
    );
    res.json({ message: "Exam updated successfully", exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// In-memory store for active screen frames: { "examCode-email": { frame: "...", timestamp: Date.now() } }
const activeScreenFrames = {};

exports.saveScreenFrame = async (req, res) => {
  try {
    const { examCode, email } = req.params;
    const { frame } = req.body;

    const key = `${examCode.toUpperCase()}-${email.toLowerCase()}`;
    activeScreenFrames[key] = {
      frame,
      timestamp: Date.now(),
    };

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getScreenFrame = async (req, res) => {
  try {
    const { examCode, email } = req.params;
    const key = `${examCode.toUpperCase()}-${email.toLowerCase()}`;
    const data = activeScreenFrames[key];

    if (!data) {
      return res.json({ frame: null, isOffline: true });
    }

    // Mark as offline if no frame was sent in the last 18 seconds
    const isOffline = Date.now() - data.timestamp > 18000;

    res.json({
      frame: data.frame,
      isOffline,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllScreenFrames = async (req, res) => {
  try {
    const { examCode } = req.params;
    const prefix = `${examCode.toUpperCase()}-`;
    const results = {};

    for (const key in activeScreenFrames) {
      if (key.startsWith(prefix)) {
        const email = key.substring(prefix.length);
        const data = activeScreenFrames[key];
        const isOffline = Date.now() - data.timestamp > 18000;
        results[email] = {
          frame: data.frame,
          isOffline,
          timestamp: data.timestamp
        };
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};




