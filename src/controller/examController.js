const mongoose = require("mongoose");
const Exam = require("../models/Exam");
// const resultSchema = require("../models/Result");
const XLSX = require("xlsx");
const fs = require("fs");

const activeSubmissions = new Set();

function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function compareFIB(studentAns, correctAns) {
  if (!studentAns || !correctAns) return false;
  const alternatives = correctAns
    .split(/[|/,]/)
    .map(a => normalizeText(a))
    .filter(Boolean);
  
  const fullNormalized = normalizeText(correctAns);
  if (!alternatives.includes(fullNormalized)) {
    alternatives.push(fullNormalized);
  }
  
  const sNorm = normalizeText(studentAns);
  return alternatives.some(alt => sNorm === alt);
}

function compareNumerical(studentAns, correctAns) {
  if (!studentAns || !correctAns) return false;
  const sNormalized = studentAns.trim().replace(/\s+/g, "");
  const cNormalized = correctAns.trim().replace(/\s+/g, "");
  const sFloat = parseFloat(sNormalized);
  const cFloat = parseFloat(cNormalized);
  if (!isNaN(sFloat) && !isNaN(cFloat)) {
    return sFloat === cFloat;
  }
  return sNormalized === cNormalized;
}

function compareDescriptive(studentAns, correctAns) {
  if (!studentAns || !correctAns) return false;
  const sNorm = normalizeText(studentAns);
  const cNorm = normalizeText(correctAns);
  if (sNorm === cNorm) return true;
  if (sNorm.includes(cNorm)) return true;
  return false;
}

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
      const data = XLSX.utils.sheet_to_json(sheet, { raw: false });

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
        const typeKey = keys.find(k => k.toLowerCase().trim() === "question type");

        // If Question is blank but we have a previous question, merge the options/answer details
        if (!questionText && currentQuestion) {
          if (optAKey && q[optAKey] !== undefined && q[optAKey] !== null) currentQuestion.options.A = q[optAKey].toString().trim();
          if (optBKey && q[optBKey] !== undefined && q[optBKey] !== null) currentQuestion.options.B = q[optBKey].toString().trim();
          if (optCKey && q[optCKey] !== undefined && q[optCKey] !== null) currentQuestion.options.C = q[optCKey].toString().trim();
          if (optDKey && q[optDKey] !== undefined && q[optDKey] !== null) currentQuestion.options.D = q[optDKey].toString().trim();
          if (ansKey && q[ansKey] !== undefined && q[ansKey] !== null) {
            currentQuestion.correctAnswer = q[ansKey].toString().trim();
            if (currentQuestion.questionType === "MSQ" || currentQuestion.correctAnswer.includes(",")) {
              currentQuestion.isMultipleCorrect = true;
              currentQuestion.questionType = "MSQ";
            }
          }
          return;
        }

        const corrAns = ansKey && q[ansKey] !== undefined && q[ansKey] !== null ? q[ansKey].toString().trim() : "";
        let qType = typeKey && q[typeKey] !== undefined && q[typeKey] !== null ? q[typeKey].toString().trim().toUpperCase() : "";
        
        let isMulti = false;
        if (qType === "MSQ") {
          isMulti = true;
        } else if (qType === "MCQ") {
          isMulti = false;
        } else if (["FIB", "NUM", "DES"].includes(qType)) {
          isMulti = false;
        } else {
          isMulti = corrAns.includes(",");
          qType = isMulti ? "MSQ" : "MCQ";
        }

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
          questionType: qType,
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
        let qType = q.questionType ? q.questionType.toString().trim().toUpperCase() : "";
        let isMulti = false;
        if (qType === "MSQ") {
          isMulti = true;
        } else if (qType === "MCQ") {
          isMulti = false;
        } else if (["FIB", "NUM", "DES"].includes(qType)) {
          isMulti = false;
        } else {
          isMulti = corrAns.includes(",") || q.isMultipleCorrect || false;
          qType = isMulti ? "MSQ" : "MCQ";
        }
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
          questionType: qType,
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
      cameraMonitor: cameraMonitor === "true" || cameraMonitor === true,
      dispatchPolicy: req.body.dispatchPolicy || "none"
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
        maxNegativeMark,
        serverTime: now
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
      questionType: q.questionType || (q.isMultipleCorrect ? "MSQ" : "MCQ"),
      negativeMarks: q.negativeMarks || 0,
      marks: q.marks || 1,
    }));

    res.json({
      title: exam.title,
      duration: exam.duration,
      examCode: exam.examCode,
      questions: questionsForStudent,
      cameraMonitor: exam.cameraMonitor || false,
      hasNegativeMarking,
      maxNegativeMark,
      serverTime: now
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
      studentRollNumber = "",
      terminated = false,
      tabSwitched = false,
      tabSwitchCount = 0,
      faceWarningCount = 0,
      noiseWarningCount = 0,
      internetIssueCount = 0,
      fullScreenExitCount = 0,
      screenShareViolationCount = 0,
      faceTurnTerminated = false,
      terminatedByAdmin = false
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

      const type = q.questionType || (q.isMultipleCorrect ? "MSQ" : "MCQ");
      const studentVal = ans.selectedOption.trim();
      const correctVal = q.correctAnswer ? q.correctAnswer.trim() : "";

      let isCorrect = false;
      let isPartial = false;
      let partialScore = 0;

      if (type === "MCQ") {
        const selected = studentVal.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
        const correct = correctVal.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
        isCorrect = selected.length === 1 && selected[0] === correct[0];
      } else if (type === "MSQ") {
        const selected = studentVal.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
        const correct = correctVal.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
        const hasIncorrect = selected.some(opt => !correct.includes(opt));
        if (!hasIncorrect) {
          if (selected.length === correct.length) {
            isCorrect = true;
          } else if (selected.length > 0) {
            isPartial = true;
            const fraction = selected.length / correct.length;
            partialScore = Number((questionMaxMarks * fraction).toFixed(2));
          }
        }
      } else if (type === "FIB") {
        isCorrect = compareFIB(studentVal, correctVal);
      } else if (type === "NUM") {
        isCorrect = compareNumerical(studentVal, correctVal);
      } else if (type === "DES") {
        isCorrect = compareDescriptive(studentVal, correctVal);
      }

      if (isCorrect) {
        positiveMarks += questionMaxMarks;
      } else if (isPartial) {
        positiveMarks += partialScore;
      } else {
        negativeMarksObtained += questionNegMarks;
      }
    });

    score = Number((positiveMarks - negativeMarksObtained).toFixed(2));

    // 🔥 Auto-terminate rule (only if terminated explicitly by Admin)
    let finalTerminated = terminatedByAdmin || false;

    // 🔥 Dynamic Schema with Anti-cheating fields
    const resultSchema = new mongoose.Schema({
      studentName: {
        type: String,
        required: true
      },
      studentEmail: String,
      studentRollNumber: {
        type: String,
        default: ""
      },
      answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: String,
        timeSpent: {
          type: Number,
          default: 0
        }
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
      faceTurnTerminated: {
        type: Boolean,
        default: false
      },
      terminatedByAdmin: {
        type: Boolean,
        default: false
      },
      isEmailed: {
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
      studentRollNumber,
      answers,
      score,
      positiveMarks,
      negativeMarks: negativeMarksObtained,
      totalMarks,
      terminated: finalTerminated,
      tabSwitched,
      tabSwitchCount,
      faceWarningCount,
      noiseWarningCount,
      internetIssueCount,
      fullScreenExitCount,
      screenShareViolationCount,
      faceTurnTerminated,
      terminatedByAdmin,
      isEmailed: false,
      submittedAt: new Date()
    });

    if (studentEmail) activeSubmissions.delete(lockKey);

    if (exam.dispatchPolicy === "automatic") {
      try {
        await sendCandidateResultEmail(studentEmail, examCode, {
          studentName,
          studentEmail,
          studentRollNumber,
          score,
          positiveMarks,
          negativeMarks: negativeMarksObtained,
          totalMarks,
          tabSwitchCount,
          faceWarningCount,
          noiseWarningCount,
          fullScreenExitCount,
          internetIssueCount
        }, exam.title);

        await DynamicResult.updateOne(
          { studentEmail: studentEmail.toLowerCase().trim() },
          { isEmailed: true }
        );
      } catch (mailErr) {
        console.error("Automatic email delivery failed:", mailErr);
      }
    }

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

const recalculateResultsForExam = async (exam) => {
  const collectionName = `${exam.examCode}_results`;
  try {
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) return; // collection does not exist yet (no participants)

    const resultSchema = new mongoose.Schema({
      studentName: String,
      studentEmail: String,
      answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: String,
        timeSpent: { type: Number, default: 0 }
      }],
      score: Number,
      positiveMarks: Number,
      negativeMarks: Number,
      totalMarks: Number,
      terminated: { type: Boolean, default: false },
      tabSwitched: { type: Boolean, default: false },
      tabSwitchCount: { type: Number, default: 0 },
      faceWarningCount: { type: Number, default: 0 },
      noiseWarningCount: { type: Number, default: 0 },
      internetIssueCount: { type: Number, default: 0 },
      fullScreenExitCount: { type: Number, default: 0 },
      screenShareViolationCount: { type: Number, default: 0 },
      faceTurnTerminated: { type: Boolean, default: false },
      terminatedByAdmin: { type: Boolean, default: false },
      submittedAt: Date
    }, { timestamps: true });

    const DynamicResult =
      mongoose.models[collectionName] ||
      mongoose.model(collectionName, resultSchema, collectionName);

    const results = await DynamicResult.find({});

    for (const r of results) {
      let score = 0;
      let positiveMarks = 0;
      let negativeMarksObtained = 0;
      let totalMarks = 0;

      exam.questions.forEach(q => {
        const questionMaxMarks = q.marks || 0;
        const questionNegMarks = q.negativeMarks || 0;
        totalMarks += questionMaxMarks;

        // Check if grace marks are active for this question
        if (q.isGraceAwarded) {
          positiveMarks += questionMaxMarks; // Award full marks
          return;
        }

        const ans = r.answers.find(
          a => a.questionId === q._id.toString()
        );

        if (!ans || !ans.selectedOption) {
          return;
        }

        const type = q.questionType || (q.isMultipleCorrect ? "MSQ" : "MCQ");
        const studentVal = ans.selectedOption.trim();
        const correctVal = q.correctAnswer ? q.correctAnswer.trim() : "";

        let isCorrect = false;
        let isPartial = false;
        let partialScore = 0;

        if (type === "MCQ") {
          const selected = studentVal.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
          const correct = correctVal.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
          isCorrect = selected.length === 1 && selected[0] === correct[0];
        } else if (type === "MSQ") {
          const selected = studentVal.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
          const correct = correctVal.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
          const hasIncorrect = selected.some(opt => !correct.includes(opt));
          if (!hasIncorrect) {
            if (selected.length === correct.length) {
              isCorrect = true;
            } else if (selected.length > 0) {
              isPartial = true;
              const fraction = selected.length / correct.length;
              partialScore = Number((questionMaxMarks * fraction).toFixed(2));
            }
          }
        } else if (type === "FIB") {
          isCorrect = compareFIB(studentVal, correctVal);
        } else if (type === "NUM") {
          isCorrect = compareNumerical(studentVal, correctVal);
        } else if (type === "DES") {
          isCorrect = compareDescriptive(studentVal, correctVal);
        }

        if (isCorrect) {
          positiveMarks += questionMaxMarks;
        } else if (isPartial) {
          positiveMarks += partialScore;
        } else {
          negativeMarksObtained += questionNegMarks;
        }
      });

      score = Number((positiveMarks - negativeMarksObtained).toFixed(2));

      await DynamicResult.findByIdAndUpdate(r._id, {
        score,
        positiveMarks,
        negativeMarks: negativeMarksObtained,
        totalMarks
      });
    }
  } catch (err) {
    console.error("Failed to recalculate results:", err);
  }
};

// 🔥 UPDATE EXAM DETAILS
exports.updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, duration, startTime, endTime, questions } = req.body;
    const updateData = {};
    
    if (title !== undefined) updateData.title = title;
    if (duration !== undefined) updateData.duration = Number(duration);
    if (startTime !== undefined) updateData.startTime = startTime ? new Date(startTime) : undefined;
    if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : undefined;
    if (questions !== undefined) updateData.questions = questions;

    const exam = await Exam.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (exam && questions !== undefined) {
      await recalculateResultsForExam(exam);
    }

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
      faceWarningCount: req.body.faceWarningCount || 0,
      noiseWarningCount: req.body.noiseWarningCount || 0,
      tabSwitchCount: req.body.tabSwitchCount || 0,
      fullScreenExitCount: req.body.fullScreenExitCount || 0,
      internetIssueCount: req.body.internetIssueCount || 0,
      screenShareViolationCount: req.body.screenShareViolationCount || 0
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
          timestamp: data.timestamp,
          faceWarningCount: data.faceWarningCount || 0,
          noiseWarningCount: data.noiseWarningCount || 0,
          tabSwitchCount: data.tabSwitchCount || 0,
          fullScreenExitCount: data.fullScreenExitCount || 0,
          internetIssueCount: data.internetIssueCount || 0,
          screenShareViolationCount: data.screenShareViolationCount || 0
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

    // Persist a database record in ${examCode}_results to ensure persistence
    const exam = await Exam.findOne({ examCode: examCode.toUpperCase() });
    if (exam) {
      const candName = activeCandidates[key]?.name || "Candidate";
      const totalMarks = exam.questions.reduce((sum, q) => sum + (q.marks || 0), 0);

      const resultSchema = new mongoose.Schema({
        studentName: { type: String, required: true },
        studentEmail: String,
        answers: [{
          questionId: mongoose.Schema.Types.ObjectId,
          selectedOption: String
        }],
        score: Number,
        positiveMarks: Number,
        negativeMarks: Number,
        totalMarks: Number,
        terminated: { type: Boolean, default: false },
        tabSwitched: { type: Boolean, default: false },
        tabSwitchCount: { type: Number, default: 0 },
        faceWarningCount: { type: Number, default: 0 },
        noiseWarningCount: { type: Number, default: 0 },
        internetIssueCount: { type: Number, default: 0 },
        fullScreenExitCount: { type: Number, default: 0 },
        screenShareViolationCount: { type: Number, default: 0 },
        faceTurnTerminated: { type: Boolean, default: false },
        terminatedByAdmin: { type: Boolean, default: false },
        submittedAt: Date
      }, { timestamps: true });

      const collectionName = `${examCode.toUpperCase()}_results`;
      const DynamicResult =
        mongoose.models[collectionName] ||
        mongoose.model(collectionName, resultSchema, collectionName);

      const alreadySubmitted = await DynamicResult.findOne({ studentEmail: email.toLowerCase() });
      if (!alreadySubmitted) {
        const candData = activeCandidates[key] || {};
        await DynamicResult.create({
          studentName: candName,
          studentEmail: email.toLowerCase(),
          answers: [],
          score: 0,
          positiveMarks: 0,
          negativeMarks: 0,
          totalMarks: totalMarks,
          terminated: true,
          tabSwitched: (candData.tabSwitchCount || 0) > 0,
          tabSwitchCount: candData.tabSwitchCount || 0,
          faceWarningCount: candData.faceWarningCount || 0,
          noiseWarningCount: candData.noiseWarningCount || 0,
          internetIssueCount: candData.internetIssueCount || 0,
          fullScreenExitCount: candData.fullScreenExitCount || 0,
          screenShareViolationCount: candData.screenShareViolationCount || 0,
          faceTurnTerminated: false,
          terminatedByAdmin: true,
          submittedAt: new Date()
        });
      }
    }

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

exports.updateProctorConfig = async (req, res) => {
  try {
    const { examCode } = req.params;
    const {
      aiProctorActive,
      cameraMonitor,
      micMonitor,
      screenShareMonitor,
      trackTabSwitches,
      trackFullScreenExit,
      trackInternetIssues,
      dispatchPolicy
    } = req.body;

    const updateFields = {
      aiProctorActive: !!aiProctorActive,
      cameraMonitor: !!cameraMonitor,
      micMonitor: !!micMonitor,
      screenShareMonitor: !!screenShareMonitor,
      trackTabSwitches: !!trackTabSwitches,
      trackFullScreenExit: !!trackFullScreenExit,
      trackInternetIssues: !!trackInternetIssues
    };

    if (dispatchPolicy !== undefined) {
      updateFields.dispatchPolicy = dispatchPolicy;
    }

    const exam = await Exam.findOneAndUpdate(
      { examCode: examCode.toUpperCase() },
      updateFields,
      { new: true }
    );

    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json({ success: true, message: "Configurations updated successfully", exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔥 RESET STUDENT ATTEMPT (Allow Re-Attempt)
exports.resetStudentAttempt = async (req, res) => {
  try {
    const { examCode } = req.params;
    const { studentEmail } = req.body;

    if (!studentEmail) {
      return res.status(400).json({ message: "Student email is required." });
    }

    const collectionName = `${examCode.toUpperCase()}_results`;
    const resultCollection = mongoose.connection.collection(collectionName);

    const existing = await resultCollection.findOne({ 
      studentEmail: studentEmail.toLowerCase().trim() 
    });

    if (!existing) {
      return res.status(404).json({ message: "No submission found for this student." });
    }

    await resultCollection.deleteOne({ 
      studentEmail: studentEmail.toLowerCase().trim() 
    });

    // Also clear from active submissions lock if present
    const lockKey = `${examCode}_${studentEmail}`;
    activeSubmissions.delete(lockKey);

    res.json({ 
      message: `Submission for ${studentEmail} has been removed. The student can now re-attempt the exam.`,
      deletedStudent: existing.studentName
    });
  } catch (error) {
    console.error("Failed to reset student attempt:", error);
    res.status(500).json({ error: error.message });
  }
};

const sendCandidateResultEmail = async (studentEmail, examCode, resultData, examTitle) => {
  const cleanEmail = studentEmail.toLowerCase().trim();
  const mailOptions = {
    from: `"Secure Exam Pro" <${process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com"}>`,
    to: cleanEmail,
    subject: `Exam Result Report - ${examTitle || examCode}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Secure Exam Pro</h2>
        <h3 style="color: #3b82f6;">Placement Assessment Scorecard</h3>
        <p>Hello <strong>${resultData.studentName}</strong>,</p>
        <p>Here are your scorecard details for the assessment <strong>${examTitle || examCode}</strong>:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Name</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.studentName}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Email</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.studentEmail}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Roll Number</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.studentRollNumber || "N/A"}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Final Score</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #16a34a;">${resultData.score} / ${resultData.totalMarks}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Correct Answers Marks</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #16a34a;">+${resultData.positiveMarks}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Negative Marks Deducted</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #dc2626;">-${resultData.negativeMarks}</td>
          </tr>
        </table>

        <h3 style="color: #475569; margin-top: 25px;">Proctor Safety & Warning Audits</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Tab Switch Violations</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.tabSwitchCount || 0}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Head Shifts/Gaze Warnings</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.faceWarningCount || 0}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Noise/Speaking Violations</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.noiseWarningCount || 0}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Fullscreen Exits</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.fullScreenExitCount || 0}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Network Disconnections</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${resultData.internetIssueCount || 0}</td>
          </tr>
        </table>
        
        <p style="margin-top: 25px; font-size: 12px; color: #94a3b8; text-align: center;">This is an automated performance report dispatched by Secure Exam Pro.</p>
      </div>
    `
  };

  const { sendMail } = require("../config/mail");
  await sendMail(mailOptions);
};

exports.sendResultEmail = async (req, res) => {
  try {
    const { examCode } = req.params;
    const { studentEmail } = req.body;

    const collectionName = `${examCode}_results`;
    const resultCollection = mongoose.connection.collection(collectionName);
    const resultData = await resultCollection.findOne({ studentEmail: studentEmail.toLowerCase().trim() });

    if (!resultData) {
      return res.status(404).json({ message: "Student result record not found." });
    }

    const exam = await Exam.findOne({ examCode });

    await sendCandidateResultEmail(studentEmail, examCode, {
      studentName: resultData.studentName,
      studentEmail: resultData.studentEmail,
      studentRollNumber: resultData.studentRollNumber || "",
      score: resultData.score,
      positiveMarks: resultData.positiveMarks,
      negativeMarks: resultData.negativeMarks,
      totalMarks: resultData.totalMarks,
      tabSwitchCount: resultData.tabSwitchCount || 0,
      faceWarningCount: resultData.faceWarningCount || 0,
      noiseWarningCount: resultData.noiseWarningCount || 0,
      fullScreenExitCount: resultData.fullScreenExitCount || 0,
      internetIssueCount: resultData.internetIssueCount || 0
    }, exam ? exam.title : examCode);

    await resultCollection.updateOne(
      { studentEmail: studentEmail.toLowerCase().trim() },
      { $set: { isEmailed: true } }
    );

    res.json({ message: "Result email dispatched successfully." });
  } catch (error) {
    console.error("Failed to manually dispatch result email:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.sendAllResultsEmail = async (req, res) => {
  try {
    const { examCode } = req.params;

    const exam = await Exam.findOne({ examCode: examCode.toUpperCase() });
    const collectionName = `${examCode.toUpperCase()}_results`;
    const resultCollection = mongoose.connection.collection(collectionName);
    const results = await resultCollection.find().toArray();

    if (!results || results.length === 0) {
      return res.status(404).json({ message: "No candidate result records found for this exam." });
    }

    let successCount = 0;
    let failCount = 0;

    for (const r of results) {
      if (!r.studentEmail) continue;
      try {
        await sendCandidateResultEmail(r.studentEmail, examCode, {
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          studentRollNumber: r.studentRollNumber || "",
          score: r.score,
          positiveMarks: r.positiveMarks,
          negativeMarks: r.negativeMarks,
          totalMarks: r.totalMarks,
          tabSwitchCount: r.tabSwitchCount || 0,
          faceWarningCount: r.faceWarningCount || 0,
          noiseWarningCount: r.noiseWarningCount || 0,
          fullScreenExitCount: r.fullScreenExitCount || 0,
          internetIssueCount: r.internetIssueCount || 0
        }, exam ? exam.title : examCode);

        await resultCollection.updateOne(
          { _id: r._id },
          { $set: { isEmailed: true } }
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to manually email result to ${r.studentEmail}:`, err);
        failCount++;
      }
    }

    res.json({
      message: `Mailing cycle completed. Sent successfully: ${successCount}, Failed: ${failCount}.`,
      successCount,
      failCount
    });
  } catch (error) {
    console.error("Failed to execute batch email dispatch:", error);
    res.status(500).json({ error: error.message });
  }
};






