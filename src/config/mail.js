const nodemailer = require("nodemailer");

// Primary: Brevo HTTP API (no IP whitelisting needed, requires API key)
// Fallback: SMTP relay (requires IP whitelisting OR IP blocking disabled)
const sendMail = async (mailOptions) => {
  const apiKey = process.env.BREVO_API_KEY || "";
  const sender = process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com";

  // Use Brevo HTTP API if BREVO_API_KEY is set
  if (apiKey && apiKey.length > 10) {
    const payload = {
      sender: {
        name: "Secure Exam Pro",
        email: sender
      },
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
  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: parseInt(process.env.BREVO_SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER || "a9e7fe001@smtp-brevo.com",
      pass: process.env.BREVO_SMTP_KEY || "",
    },
  });

  const result = await transporter.sendMail(mailOptions);
  console.log("✅ Email sent via SMTP relay, messageId:", result.messageId);
  return result;
};

module.exports = { sendMail };
