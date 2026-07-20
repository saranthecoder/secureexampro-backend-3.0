const SibApiV3Sdk = require("sib-api-v3-sdk");
const dotenv = require("dotenv");
dotenv.config();

// Configure API client
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY;

// Transactional Email API
const transactionalEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

const sendMail = async (toOrOptions, subject, text, html) => {
  // Refresh API key on each call to handle runtime updates
  const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || "").trim();
  client.authentications["api-key"].apiKey = apiKey;

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

  const senderName = process.env.MAIL_FROM_NAME || "Secure Exam Pro";
  const senderEmail = process.env.MAIL_FROM || process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com";

  try {
    const response = await transactionalEmailApi.sendTransacEmail({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: typeof to === "string" ? to.trim() : to }],
      subject: sub,
      htmlContent: contentHtml || undefined,
    });

    console.log("✅ Mail sent:", response.messageId);
    return response;

  } catch (error) {
    console.error(
      "❌ Brevo mail error:",
      error.response?.body || error.message
    );
    throw error;
  }
};

module.exports = { sendMail };
