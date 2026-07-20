const SibApiV3Sdk = require("sib-api-v3-sdk");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const sendMail = async (toOrOptions, subject, text, html) => {
  let to, sub, contentHtml;

  if (typeof toOrOptions === "object" && toOrOptions !== null) {
    to = toOrOptions.to;
    sub = toOrOptions.subject;
    contentHtml = toOrOptions.html || toOrOptions.text;
  } else {
    to = toOrOptions;
    sub = subject;
    contentHtml = html || text;
  }

  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const mailUser = (process.env.MAIL_USER || process.env.GMAIL_USER || "").trim();
  const mailPass = (process.env.MAIL_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();
  const smtpKey = (process.env.BREVO_SMTP_KEY || "").trim();
  const senderEmail = (process.env.MAIL_FROM || process.env.BREVO_SMTP_SENDER || mailUser || "aspiringmind05@gmail.com").trim();
  const senderName = (process.env.MAIL_FROM_NAME || "Secure Exam Pro").trim();
  const targetEmail = typeof to === "string" ? to.trim() : to;

  // Strategy 1: Brevo HTTP API SDK (if BREVO_API_KEY starts with xkeysib)
  if (apiKey && apiKey.startsWith("xkeysib")) {
    try {
      console.log("📧 Strategy 1: Attempting email dispatch via Brevo HTTP API SDK...");
      const client = SibApiV3Sdk.ApiClient.instance;
      client.authentications["api-key"].apiKey = apiKey;
      const transactionalEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

      const response = await transactionalEmailApi.sendTransacEmail({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: targetEmail }],
        subject: sub,
        htmlContent: contentHtml || undefined,
      });

      console.log("✅ Mail sent via Brevo SDK:", response.messageId);
      return response;
    } catch (sdkErr) {
      console.warn("⚠️ Brevo SDK error, trying fallback strategy:", sdkErr.response?.body || sdkErr.message);
    }
  }

  // Strategy 2: Gmail SMTP with App Password (if MAIL_PASS is provided)
  if (mailPass) {
    try {
      console.log(`📧 Strategy 2: Attempting email dispatch via Gmail SMTP (${mailUser || senderEmail})...`);
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: mailUser || senderEmail,
          pass: mailPass
        }
      });

      const info = await transporter.sendMail({
        from: `"${senderName}" <${mailUser || senderEmail}>`,
        to: targetEmail,
        subject: sub,
        html: contentHtml
      });

      console.log("✅ Mail sent via Gmail SMTP:", info.messageId);
      return info;
    } catch (gmailErr) {
      console.warn("⚠️ Gmail SMTP error, trying fallback strategy:", gmailErr.message);
    }
  }

  // Strategy 3: Brevo SMTP Relay (xsmtpsib-...)
  console.log("📧 Strategy 3: Attempting email dispatch via Brevo SMTP Relay...");
  const smtpUser = (process.env.BREVO_SMTP_USER || "a9e7fe001@smtp-brevo.com").trim();
  const smtpHost = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
  const smtpPort = parseInt(process.env.BREVO_SMTP_PORT || "587");
  const passToUse = smtpKey || apiKey;

  if (!passToUse) {
    throw new Error("No valid mail credentials configured (BREVO_API_KEY, MAIL_PASS, or BREVO_SMTP_KEY).");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: passToUse
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const info = await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: targetEmail,
    subject: sub,
    html: contentHtml
  });

  console.log("✅ Mail sent via Brevo SMTP Relay:", info.messageId);
  return info;
};

module.exports = { sendMail };
