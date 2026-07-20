const nodemailer = require("nodemailer");

const getEnv = (key, fallback = "") => (process.env[key] || fallback).trim();

const sendMail = async (mailOptions) => {
  const apiKey = getEnv("BREVO_API_KEY");
  const sender = getEnv("BREVO_SMTP_SENDER", "aspiringmind05@gmail.com");

  // Primary: Brevo HTTP API (no IP whitelisting needed)
  if (apiKey && apiKey.length > 10) {
    console.log("📧 Sending email via Brevo HTTP API...");
    const payload = {
      sender: { name: "Secure Exam Pro", email: sender },
      to: [{ email: typeof mailOptions.to === "string" ? mailOptions.to.trim() : mailOptions.to }],
      subject: mailOptions.subject,
      htmlContent: mailOptions.html
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Brevo API Error ${response.status}: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log("✅ Email sent via Brevo HTTP API, messageId:", data.messageId);
    return data;
  }

  // Fallback: SMTP relay
  const smtpUser = getEnv("BREVO_SMTP_USER", "a9e7fe001@smtp-brevo.com");
  const smtpKey = getEnv("BREVO_SMTP_KEY");
  const smtpHost = getEnv("BREVO_SMTP_HOST", "smtp-relay.brevo.com");
  const smtpPort = parseInt(getEnv("BREVO_SMTP_PORT", "587"));

  console.log(`📧 Sending email via SMTP... Host: ${smtpHost}, Port: ${smtpPort}, User: ${smtpUser}, Key length: ${smtpKey.length}`);

  if (!smtpKey) {
    throw new Error("SMTP key is empty. Set BREVO_SMTP_KEY or BREVO_API_KEY in environment variables.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpKey,
    },
  });

  const result = await transporter.sendMail(mailOptions);
  console.log("✅ Email sent via SMTP, messageId:", result.messageId);
  return result;
};

module.exports = { sendMail };
