const mongoose = require("mongoose");
const Exam = require("../models/Exam");
// const resultSchema = require("../models/Result");
const XLSX = require("xlsx");
const fs = require("fs");

const activeSubmissions = new Set();

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

    let parsedQuestions = [];

    if (req.file) {
      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      let currentQuestion = null;

      data.forEach(q => {
        // Find question text dynamically across possible naming variants and blank Excel headers
        let questionText = "";
        const keys = Object.keys(q);
        const qKey = keys.find(k => k.toLowerCase().trim() === "question");

        if (qKey) {
          questionText = q[qKey].toString().trim();
        } else if (q["__EMPTY"]) {
          questionText = q["__EMPTY"].toString().trim();
        } else {
          const emptyKey = keys.find(k => k.startsWith("__EMPTY"));
          if (emptyKey) {
            questionText = q[emptyKey].toString().trim();
          }
        }

        // Case-insensitive key matching for option headers and attributes
        const optAKey = keys.find(k => k.toLowerCase().trim() === "option a");
        const optBKey = keys.find(k => k.toLowerCase().trim() === "option b");
        const optCKey = keys.find(k => k.toLowerCase().trim() === "option c");
        const optDKey = keys.find(k => k.toLowerCase().trim() === "option d");
        const ansKey = keys.find(k => k.toLowerCase().trim() === "correct answer");
        const marksKey = keys.find(k => k.toLowerCase().trim() === "marks");
        const negKey = keys.find(k => k.toLowerCase().trim() === "negative marks");
        const secKey = keys.find(k => k.toLowerCase().trim() === "section");
        const codeKey = keys.find(k => k.toLowerCase().trim() === "code snippet");
        const imgKey = keys.find(k => k.toLowerCase().trim() === "image url");

        // If Question is blank but we have a previous question, merge the options/answer details
        if (!questionText && currentQuestion) {
          if (optAKey && q[optAKey] !== undefined && q[optAKey] !== null) currentQuestion.options.A = q[optAKey].toString().trim();
          if (optBKey && q[optBKey] !== undefined && q[optBKey] !== null) currentQuestion.options.B = q[optBKey].toString().trim();
          if (optCKey && q[optCKey] !== undefined && q[optCKey] !== null) currentQuestion.options.C = q[optCKey].toString().trim();
          if (optDKey && q[optDKey] !== undefined && q[optDKey] !== null) currentQuestion.options.D = q[optDKey].toString().trim();
          if (ansKey && q[ansKey] !== undefined && q[ansKey] !== null) {
            currentQuestion.correctAnswer = q[ansKey].toString().trim();
            currentQuestion.isMultipleCorrect = currentQuestion.correctAnswer.includes(",");
          }
          return;
        }

        const corrAns = ansKey && q[ansKey] !== undefined && q[ansKey] !== null ? q[ansKey].toString().trim() : "";
        const isMulti = corrAns.includes(",");

        currentQuestion = {
          question: questionText || "Blank Question text",
          options: {
            A: optAKey && q[optAKey] !== undefined && q[optAKey] !== null ? q[optAKey].toString().trim() : "",
            B: optBKey && q[optBKey] !== undefined && q[optBKey] !== null ? q[optBKey].toString().trim() : "",
            C: optCKey && q[optCKey] !== undefined && q[optCKey] !== null ? q[optCKey].toString().trim() : "",
            D: optDKey && q[optDKey] !== undefined && q[optDKey] !== null ? q[optDKey].toString().trim() : ""
          },
          correctAnswer: corrAns,
          marks: marksKey && q[marksKey] !== undefined && q[marksKey] !== null ? Number(q[marksKey]) : 1,
          negativeMarks: negKey && q[negKey] !== undefined && q[negKey] !== null ? Number(q[negKey]) : 0,
          isMultipleCorrect: isMulti,
          section: secKey && q[secKey] !== undefined && q[secKey] !== null ? q[secKey].toString().trim() : "General",
          codeSnippet: codeKey && q[codeKey] !== undefined && q[codeKey] !== null ? q[codeKey].toString().trim() : "",
          imageUrl: imgKey && q[imgKey] !== undefined && q[imgKey] !== null ? q[imgKey].toString().trim() : ""
        };

        parsedQuestions.push(currentQuestion);
      });
      fs.unlinkSync(req.file.path);
    } else if (req.body.questions) {
      const rawQuestions = typeof req.body.questions === "string"
        ? JSON.parse(req.body.questions)
        : req.body.questions;

      parsedQuestions = rawQuestions.map(q => {
        const corrAns = q.correctAnswer ? q.correctAnswer.toString().trim() : "";
        const isMulti = corrAns.includes(",");
        return {
          question: q.question,
          options: {
            A: q.options?.A ? q.options.A.toString() : "",
            B: q.options?.B ? q.options.B.toString() : "",
            C: q.options?.C ? q.options.C.toString() : "",
            D: q.options?.D ? q.options.D.toString() : ""
          },
          correctAnswer: corrAns,
          marks: q.marks ? Number(q.marks) : 1,
          negativeMarks: q.negativeMarks ? Number(q.negativeMarks) : 0,
          isMultipleCorrect: isMulti,
          section: q.section ? q.section.trim() : "General",
          codeSnippet: q.codeSnippet ? q.codeSnippet.toString().trim() : "",
          imageUrl: q.imageUrl ? q.imageUrl.toString().trim() : ""
        };
      });
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
      questions: parsedQuestions,
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

    const hasNegativeMarking = exam.questions.some((q) => (q.negativeMarks || 0) > 0);
    const maxNegativeMark = hasNegativeMarking ? Math.max(...exam.questions.map(q => q.negativeMarks || 0)) : 0;

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
        cameraMonitor: exam.cameraMonitor || false,
        hasNegativeMarking,
        maxNegativeMark
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
      isMultipleCorrect: q.isMultipleCorrect || false,
      negativeMarks: q.negativeMarks || 0,
    }));

    res.json({
      title: exam.title,
      duration: exam.duration,
      examCode: exam.examCode,
      questions: questionsForStudent,
      cameraMonitor: exam.cameraMonitor || false,
      hasNegativeMarking,
      maxNegativeMark
    });
  } catch (error) {
    console.error("Error fetching exam:", error);
    res.status(500).json({ error: error.message });
  }
};


exports.submitExam = async (req, res) => {
  const { examCode } = req.params;
  const { studentEmail } = req.body;
  const lockKey = `${examCode}_${studentEmail}`;

  if (studentEmail) {
    if (activeSubmissions.has(lockKey)) {
      return res.status(400).json({ message: "Already submitted" });
    }
    activeSubmissions.add(lockKey);
  }

  try {
    const {
      answers,
      studentName,
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
    let positiveMarks = 0;
    let negativeMarksObtained = 0;
    let totalMarks = 0;

    exam.questions.forEach(q => {
      const questionMaxMarks = q.marks || 0;
      const questionNegMarks = q.negativeMarks || 0;
      totalMarks += questionMaxMarks;

      const ans = answers.find(
        a => a.questionId === q._id.toString()
      );

      if (!ans || !ans.selectedOption) {
        return;
      }

      const selected = ans.selectedOption.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
      const correct = q.correctAnswer.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);

      if (q.isMultipleCorrect || correct.length > 1) {
        const hasIncorrect = selected.some(opt => !correct.includes(opt));
        if (hasIncorrect) {
          negativeMarksObtained += questionNegMarks;
        } else {
          if (selected.length === correct.length) {
            positiveMarks += questionMaxMarks;
          } else if (selected.length > 0) {
            const fraction = selected.length / correct.length;
            positiveMarks += Number((questionMaxMarks * fraction).toFixed(2));
          }
        }
      } else {
        const isCorrect = selected.length === 1 && selected[0] === correct[0];
        if (isCorrect) {
          positiveMarks += questionMaxMarks;
        } else {
          negativeMarksObtained += questionNegMarks;
        }
      }
    });

    score = Number((positiveMarks - negativeMarksObtained).toFixed(2));

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
      positiveMarks: Number,
      negativeMarks: Number,
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

    if (alreadySubmitted) {
      if (studentEmail) activeSubmissions.delete(lockKey);
      return res.status(400).json({ message: "Already submitted" });
    }

    await DynamicResult.create({
      studentName,
      studentEmail,
      answers,
      score,
      positiveMarks,
      negativeMarks: negativeMarksObtained,
      totalMarks,
      terminated: finalTerminated,
      tabSwitched,
      tabSwitchCount,
      faceWarningCount,
      faceTurnTerminated,
      submittedAt: new Date()
    });

    if (studentEmail) activeSubmissions.delete(lockKey);

    res.json({
      message: "Exam submitted successfully",
      score,
      positiveMarks,
      negativeMarks: negativeMarksObtained,
      totalMarks,
      terminated: finalTerminated,
      storedIn: collectionName
    });

  } catch (error) {
    if (studentEmail) activeSubmissions.delete(lockKey);
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

// 🔥 DELETE EXAM
exports.deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findByIdAndDelete(id);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    // Drop results collection if it exists
    const collectionName = `${exam.examCode}_results`;
    try {
      await mongoose.connection.db.dropCollection(collectionName);
    } catch (e) {
      // Ignore if collection doesn't exist
    }

    res.json({ message: "Exam deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// In-memory store for active candidate metadata: { "examCode-email": { name: "...", timestamp: Date.now() } }
const activeCandidates = {};

// In-memory store for terminated students: { "examCode-email": true }
const terminatedStudents = {};

exports.heartbeat = async (req, res) => {
  try {
    const { examCode, email } = req.params;
    const { name } = req.body;

    const key = `${examCode.toUpperCase()}-${email.toLowerCase()}`;
    activeCandidates[key] = {
      name: name || (activeCandidates[key] ? activeCandidates[key].name : "Candidate"),
      timestamp: Date.now(),
    };

    const isTerminated = !!terminatedStudents[key];
    res.json({ success: true, terminated: isTerminated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveCandidates = async (req, res) => {
  try {
    const { examCode } = req.params;
    const prefix = `${examCode.toUpperCase()}-`;
    const results = {};

    for (const key in activeCandidates) {
      if (key.startsWith(prefix)) {
        const email = key.substring(prefix.length).toLowerCase();
        const data = activeCandidates[key];
        // Mark candidate as offline if no heartbeat was received in the last 15 seconds
        const isOffline = Date.now() - data.timestamp > 15000;
        results[email] = {
          name: data.name || "Candidate",
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

exports.terminateStudent = async (req, res) => {
  try {
    const { examCode, email } = req.params;
    const key = `${examCode.toUpperCase()}-${email.toLowerCase()}`;
    terminatedStudents[key] = true;
    res.json({ success: true, message: "Student marked as terminated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.checkStudentStatus = async (req, res) => {
  try {
    const { examCode, email } = req.params;
    const key = `${examCode.toUpperCase()}-${email.toLowerCase()}`;
    const isTerminated = !!terminatedStudents[key];
    res.json({ terminated: isTerminated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};






