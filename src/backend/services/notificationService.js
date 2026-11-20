const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendNotificationEmail } = require("./emailService");

const MAX_EMAIL_ATTEMPTS = 3;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

function appBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:5173";
}

// Defense in depth for FR-NOTIF-02: contact details never leave in a
// notification, even if a template accidentally includes one.
function removeContactDetails(text) {
  return String(text || "")
    .replace(EMAIL_PATTERN, "[contact removed]")
    .replace(PHONE_PATTERN, "[contact removed]");
}

function buildEmailBody(text, actionPath) {
  const link = actionPath ? `\n\nOpen it in Lost and Found for Campus: ${appBaseUrl()}${actionPath}` : "";
  return `${removeContactDetails(text)}${link}\n\nSign in to view the details.`;
}

async function sendAndRecordEmail(notification, { to, subject, body }) {
  // Record the attempt before sending so a crash mid-send is visible, and only
  // mark "sent" once the provider reports success (UT-NOTIF-08).
  notification.emailStatus = "pending";
  notification.emailAttempts += 1;
  await notification.save();

  try {
    const result = await sendNotificationEmail({ to, subject, text: body });

    if (result.delivered) {
      notification.emailStatus = "sent";
    } else if (result.reason === "smtp_not_configured") {
      notification.emailStatus = "skipped";
    } else {
      notification.emailStatus = "failed";
    }
  } catch (error) {
    console.error(`Unable to deliver notification email: ${error.message}`);
    notification.emailStatus = "failed";
  }

  await notification.save();
  return notification;
}

// Creates the persisted in-app notification first (FR-NOTIF-01). Email is then
// attempted only if the user has opted in. Failures are logged and swallowed so
// they can never reverse the listing, claim, or message action that triggered them.
async function createNotification({
  userId,
  type,
  message,
  actionPath = "",
  listingId = null,
  claimId = null,
  emailSubject = "Lost and Found for Campus notification",
  emailText = null,
}) {
  let notification;

  try {
    notification = await Notification.create({
      user: userId,
      type,
      message: removeContactDetails(message),
      actionPath,
      listing: listingId,
      claim: claimId,
      emailSubject,
      emailBody: buildEmailBody(emailText || message, actionPath),
    });
  } catch (error) {
    console.error(`Unable to persist notification: ${error.message}`);
    return null;
  }

  try {
    const user = await User.findById(userId).select(
      "email emailNotifications isActive"
    );

    if (!user || !user.isActive || !user.emailNotifications) {
      return notification;
    }

    await sendAndRecordEmail(notification, {
      to: user.email,
      subject: emailSubject,
      body: notification.emailBody,
    });
  } catch (error) {
    console.error(`Unable to record notification email: ${error.message}`);
  }

  return notification;
}

// Re-attempts email for notifications whose earlier send failed (UT-NOTIF-09).
async function retryFailedEmails({ limit = 25 } = {}) {
  const failed = await Notification.find({
    emailStatus: "failed",
    emailAttempts: { $lt: MAX_EMAIL_ATTEMPTS },
  })
    .select("+emailSubject +emailBody")
    .sort({ createdAt: 1 })
    .limit(limit);

  let retried = 0;

  for (const notification of failed) {
    const user = await User.findById(notification.user).select(
      "email emailNotifications isActive"
    );

    if (!user || !user.isActive || !user.emailNotifications) {
      continue;
    }

    await sendAndRecordEmail(notification, {
      to: user.email,
      subject: notification.emailSubject,
      body: notification.emailBody,
    });
    retried += 1;
  }

  return { retried };
}

// FR-MATCH-01/02: alert both parties of a new match. The lost-item owner goes to
// the claim form; the found-item owner goes to the listing where matches appear.
async function notifyPotentialMatch({ match, lostListing, foundListing }) {
  const score = match?.score ?? 0;
  const confidence = score.toFixed(2);

  await createNotification({
    userId: lostListing.createdBy,
    type: "match",
    message: `A possible match was found for your Lost listing "${lostListing.title}" (confidence ${confidence}). Review it and submit a claim if it is yours.`,
    actionPath: `/matches/${match._id}/claim`,
    listingId: lostListing._id,
    emailSubject: "Possible match found",
    emailText: `A possible match was found for your Lost listing "${lostListing.title}" (confidence ${confidence}).`,
  });

  if (foundListing.createdBy.toString() !== lostListing.createdBy.toString()) {
    await createNotification({
      userId: foundListing.createdBy,
      type: "match",
      message: `A possible match was found for your Found listing "${foundListing.title}" (confidence ${confidence}).`,
      actionPath: `/listings/${foundListing._id}`,
      listingId: foundListing._id,
      emailSubject: "Possible match found",
      emailText: `A possible match was found for your Found listing "${foundListing.title}" (confidence ${confidence}).`,
    });
  }
}

// FR-NOTIF-01: the owner learns a claim arrived. The evidence itself is never
// included (UT-PRIV-09); the owner reviews it inside the app.
async function notifyNewClaim(claim, listing) {
  return createNotification({
    userId: listing.createdBy,
    type: "claim",
    message: `A new claim was submitted for your Found listing "${listing.title}". Review the evidence in the app.`,
    actionPath: `/claims/${claim._id}`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: "New claim submitted",
    emailText: `A new claim was submitted for your Found listing "${listing.title}". Review the evidence in the app.`,
  });
}

async function notifyClaimDecision(claim, listing, approved) {
  const outcome = approved ? "approved" : "rejected";

  return createNotification({
    userId: claim.claimant,
    type: "claim_decision",
    message: approved
      ? `Your claim for "${listing.title}" was approved. A message thread is now open.`
      : `Your claim for "${listing.title}" was rejected. The listing remains active.`,
    actionPath: approved ? `/messages/${claim._id}` : `/claims/${claim._id}`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: `Claim ${outcome}`,
    emailText: `Your claim for "${listing.title}" was ${outcome}.`,
  });
}

async function notifyCompetingClaimClosed(claim, listing) {
  return createNotification({
    userId: claim.claimant,
    type: "claim_closed",
    message: `Another claim for "${listing.title}" was approved, so your pending claim was closed.`,
    actionPath: `/claims/${claim._id}`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: "Claim closed",
    emailText: `Another claim for "${listing.title}" was approved, so your pending claim was closed.`,
  });
}

// FR-CLM-03 / FR-NOTIF-01: both parties learn that a message thread is open.
async function notifyThreadOpened(claim, listing, userIds) {
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: "message",
      message: `A message thread is open for "${listing.title}". Use it to arrange the handoff.`,
      actionPath: `/messages/${claim._id}`,
      listingId: listing._id,
      claimId: claim._id,
      emailSubject: "Message thread opened",
      emailText: `A message thread is open for "${listing.title}". Use it to arrange the handoff.`,
    });
  }
}

// FR-COM-02: a new-message alert names only the other party's role, never the
// message text or any contact detail.
async function notifyNewMessage(claim, listing, recipientId, senderRole) {
  return createNotification({
    userId: recipientId,
    type: "message",
    message: `The ${senderRole} sent you a new message about "${listing.title}".`,
    actionPath: `/messages/${claim._id}`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: "New message",
    emailText: `The ${senderRole} sent you a new message about "${listing.title}".`,
  });
}

// Moderation notices are generic. The reason is never shared with participants (UT-PRIV-10).
async function notifyModerationReview(claim, listing, userIds) {
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: "moderation",
      message: `A message in your conversation for "${listing.title}" was reviewed by moderation.`,
      actionPath: `/messages/${claim._id}`,
      listingId: listing._id,
      claimId: claim._id,
      emailSubject: "Message reviewed",
      emailText: `A message in your conversation for "${listing.title}" was reviewed by moderation.`,
    });
  }
}

async function notifyResolution(claim, listing) {
  const recipients = new Set([listing.createdBy.toString(), claim.claimant.toString()]);

  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "resolution",
      message: `"${listing.title}" was marked resolved.`,
      actionPath: `/listings/${listing._id}`,
      listingId: listing._id,
      claimId: claim._id,
      emailSubject: "Listing resolved",
      emailText: `"${listing.title}" was marked resolved.`,
    });
  }
}

async function getUserNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  const query = { user: userId };

  if (unreadOnly) {
    query.isRead = false;
  }

  return Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
    .populate("listing", "title type status")
    .lean();
}

async function markNotificationRead(notificationId, userId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { isRead: true } },
    { new: true }
  );
}

async function markAllNotificationsRead(userId) {
  return Notification.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true } }
  );
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyClaimDecision,
  notifyCompetingClaimClosed,
  notifyModerationReview,
  notifyNewClaim,
  notifyNewMessage,
  notifyPotentialMatch,
  notifyResolution,
  notifyThreadOpened,
  removeContactDetails,
  retryFailedEmails,
};
