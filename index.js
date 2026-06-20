require("dotenv").config();
const express = require("express");
const app = express();
const connectDB = require("./src/config/db");

const authRoutes = require("./src/routes/authRoutes");
const examRoutes = require("./src/routes/examRoutes");
const cors = require("cors");


connectDB();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/exam", examRoutes);

app.get("/", (req, res) => {
  res.send("Exam Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
