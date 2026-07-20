const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
  port: parseInt(process.env.BREVO_SMTP_PORT || "587"),
  secure: false,
  pool: true, // Reuse SMTP TCP sockets for instant dispatch
  maxConnections: 5,
  maxMessages: 100,
  auth: {
    user: process.env.BREVO_SMTP_USER || "a9e7fe001@smtp-brevo.com",
    pass: process.env.BREVO_SMTP_KEY || "",
  },
});

module.exports = transporter;
