require("dotenv").config();
const express = require("express");
const app = express();
const connectDB = require("./src/config/db");

const authRoutes = require("./src/routes/authRoutes");
const examRoutes = require("./src/routes/examRoutes");
const cors = require("cors");


connectDB();

app.use(cors({
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  credentials: true,
  allowedHeaders: "Origin,X-Requested-With,Content-Type,Accept,Authorization"
}));
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/exam", examRoutes);

app.get("/", (req, res) => {
  res.send("Exam Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`📧 Mail config: BREVO_API_KEY=${process.env.BREVO_API_KEY ? "SET(" + process.env.BREVO_API_KEY.length + " chars)" : "NOT SET"}`);
  console.log(`📧 Mail config: BREVO_SMTP_KEY=${process.env.BREVO_SMTP_KEY ? "SET(" + process.env.BREVO_SMTP_KEY.length + " chars)" : "NOT SET"}`);
  console.log(`📧 Mail config: BREVO_SMTP_USER=${process.env.BREVO_SMTP_USER || "NOT SET"}`);
  console.log(`📧 Mail config: BREVO_SMTP_SENDER=${process.env.BREVO_SMTP_SENDER || "NOT SET"}`);
});
