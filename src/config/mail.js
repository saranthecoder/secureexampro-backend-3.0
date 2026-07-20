const SibApiV3Sdk = require("sib-api-v3-sdk");

const sendMail = async (mailOptions) => {
  const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || "").trim();
  
  if (!apiKey) {
    throw new Error("BREVO_API_KEY or BREVO_SMTP_KEY is not configured in environment variables.");
  }

  // Configure API client dynamically per call
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications["api-key"].apiKey = apiKey;

  const transactionalEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();
  const senderName = (process.env.MAIL_FROM_NAME || "Secure Exam Pro").trim();
  const senderEmail = (process.env.MAIL_FROM || process.env.BREVO_SMTP_SENDER || "aspiringmind05@gmail.com").trim();
  const toEmail = typeof mailOptions.to === "string" ? mailOptions.to.trim() : mailOptions.to;

  try {
    const response = await transactionalEmailApi.sendTransacEmail({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: toEmail }],
      subject: mailOptions.subject,
      htmlContent: mailOptions.html || undefined,
    });

    console.log("✅ Mail sent via Brevo SDK, messageId:", response.messageId);
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
