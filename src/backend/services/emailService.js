// Sends transactional emails (verification, password reset) through an
// authenticated SMTP provider, consistent with IF COM 03 and the Deliverable 1
// free tier plan (a free SMTP account, Mailtrap, or Ethereal during development).
//
// If SMTP environment variables are not configured, this falls back to logging
// the email to the console instead of sending it, so local development and
// testing are not blocked on having a real provider account set up.
const nodemailer = require("nodemailer");

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    // Never log the recipient, subject, body, or links: they can contain
    // verification/reset tokens or private notification content (NFR-PRIV-01).
    console.log(
      "Email not sent: SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS to deliver mail."
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "no-reply@lostandfound.unt.edu",
    to,
    subject,
    text,
  });

  return { delivered: true };
}

// Sends a non-token notification email. A failed attempt is retried once.
// The caller treats failure as non-fatal so the underlying claim/listing action
// is never reversed (FR-COM-01).
async function sendNotificationEmail({ to, subject, text }) {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await sendMail({ to, subject, text });

      return {
        delivered: result.delivered,
        attempts: attempt,
        reason: result.reason,
      };
    } catch (error) {
      lastError = error;
      console.error(
        `Notification email attempt ${attempt} failed: ${error.message}`
      );
    }
  }

  return {
    delivered: false,
    attempts: 2,
    reason: "smtp_error",
    error: lastError?.message,
  };
}

async function sendVerificationEmail(toEmail, rawToken) {
  const verifyUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/verify-email/${rawToken}`;

  return sendMail({
    to: toEmail,
    subject: "Verify your Lost and Found for Campus account",
    text: `Welcome to Lost and Found for Campus. Please verify your email by visiting this link within 24 hours: ${verifyUrl}`,
  });
}

async function sendPasswordResetEmail(toEmail, rawToken) {
  const resetUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/reset-password/${rawToken}`;

  return sendMail({
    to: toEmail,
    subject: "Reset your Lost and Found for Campus password",
    text: `A password reset was requested for this account. This link expires in 1 hour: ${resetUrl}. If you did not request this, you can ignore this email.`,
  });
}

module.exports = {
  isSmtpConfigured,
  sendMail,
  sendNotificationEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
