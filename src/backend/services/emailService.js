// Sends transactional emails (verification, password reset, notifications)
// through Azure Communication Services Email. The client authenticates with
// DefaultAzureCredential (managed identity in App Service, az login locally).
//
// If ACS_ENDPOINT or EMAIL_FROM is not set, the email is not sent and the call
// returns { delivered: false, reason: "email_not_configured" }, so local
// development and tests are not blocked on Azure resources.
const { EmailClient } = require("@azure/communication-email");
const { DefaultAzureCredential } = require("@azure/identity");

const POLL_INTERVAL_MS = 2000;
const SEND_TIMEOUT_MS = 60 * 1000;

let client = null;

function isEmailConfigured() {
  return Boolean(process.env.ACS_ENDPOINT && process.env.EMAIL_FROM);
}

function getClient() {
  if (!client) {
    client = new EmailClient(process.env.ACS_ENDPOINT, new DefaultAzureCredential());
  }

  return client;
}

// For tests only.
function resetClient() {
  client = null;
}

async function sendMail({ to, subject, text }) {
  if (!isEmailConfigured()) {
    // Never log the recipient, subject, body, or links: they can contain
    // verification/reset tokens or private notification content (NFR-PRIV-01).
    console.log(
      "Email not sent: Azure Communication Services is not configured. Set ACS_ENDPOINT and EMAIL_FROM to deliver mail."
    );
    return { delivered: false, reason: "email_not_configured" };
  }

  const poller = await getClient().beginSend({
    senderAddress: process.env.EMAIL_FROM,
    content: { subject, plainText: text },
    recipients: { to: [{ address: to }] },
  });

  const result = await poller.pollUntilDone({
    abortSignal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    updateIntervalInMs: POLL_INTERVAL_MS,
  });

  if (result.status !== "Succeeded") {
    throw new Error(`Email send ended with status ${result.status}.`);
  }

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
    reason: "email_error",
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
  isEmailConfigured,
  resetClient,
  sendMail,
  sendNotificationEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
