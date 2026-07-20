const SibApiV3Sdk = require("sib-api-v3-sdk");
const nodemailer = require("nodemailer");

const sendMail = async (mailOptions) => {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const smtpKey = (process.env.BREVO_SMTP_KEY || "").trim();
  const smtpUser = (process.env.BREVO_SMTP_USER || "a9e7fe001@smtp-brevo.com").trim();
  const smtpHost = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
  const smtpPort = parseInt(process.env.BREVO_SMTP_PORT || "587");
  const senderEmail = (process.env.BREVO_SMTP_SENDER || process.env.MAIL_FROM || "aspiringmind05@gmail.com").trim();
  const senderName = (process.env.MAIL_FROM_NAME || "Secure Exam Pro").trim();
  const toEmail = typeof mailOptions.to === "string" ? mailOptions.to.trim() : mailOptions.to;

  // 1. Try Brevo HTTP API SDK if BREVO_API_KEY is provided and valid for HTTP API
  if (apiKey && apiKey.startsWith("xkeysib")) {
    try {
      console.log("📧 Attempting email dispatch via Brevo HTTP API SDK...");
      const client = SibApiV3Sdk.ApiClient.instance;
      client.authentications["api-key"].apiKey = apiKey;
      const transactionalEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

      const response = await transactionalEmailApi.sendTransacEmail({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html || undefined,
      });

      console.log("✅ Mail sent successfully via Brevo HTTP API SDK:", response.messageId);
      return response;
    } catch (apiErr) {
      console.warn("⚠️ Brevo HTTP API failed, falling back to SMTP relay:", apiErr.response?.body || apiErr.message);
    }
  }

  // 2. Fallback to Nodemailer SMTP (uses BREVO_SMTP_KEY / xsmtpsib-...)
  console.log(`📧 Attempting email dispatch via Nodemailer SMTP (${smtpHost}:${smtpPort}, User: ${smtpUser})...`);
  const effectivePass = smtpKey || apiKey;
  
  if (!effectivePass) {
    throw new Error("Neither BREVO_API_KEY nor BREVO_SMTP_KEY is configured.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: effectivePass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const result = await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: toEmail,
    subject: mailOptions.subject,
    html: mailOptions.html
  });

  console.log("✅ Mail sent successfully via Nodemailer SMTP:", result.messageId);
  return result;
};

module.exports = { sendMail };
