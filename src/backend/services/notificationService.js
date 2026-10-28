const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendNotificationEmail } = require("./emailService");

function notificationTextForEmail(notification) {
  return `${notification.message}\n\nSign in to Lost and Found for Campus to view the details.`;
}

// Creates a persisted in-app notification and optionally attempts an email.
// Notification/email failures are logged and swallowed: they must never reverse
// the listing or claim action that triggered them (FR-COM-01).
async function createNotification({
  userId,
  type,
  message,
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
      message,
      listing: listingId,
      claim: claimId,
    });
  } catch (error) {
    console.error(`Unable to persist notification: ${error.message}`);
    return null;
  }

  try {
    const user = await User.findById(userId).select(
      "email emailNotifications isEmailVerified isActive"
    );

    if (!user || !user.isActive || !user.emailNotifications) {
      return notification;
    }

    const result = await sendNotificationEmail({
      to: user.email,
      subject: emailSubject,
      text: emailText || notificationTextForEmail(notification),
    });

    notification.emailAttempts = result.attempts;

    if (result.delivered) {
      notification.emailStatus = "sent";
    } else if (result.reason === "smtp_not_configured") {
      notification.emailStatus = "skipped";
    } else {
      notification.emailStatus = "failed";
    }

    await notification.save();
  } catch (error) {
    console.error(`Unable to deliver notification email: ${error.message}`);

    try {
      notification.emailStatus = "failed";
      notification.emailAttempts = 2;
      await notification.save();
    } catch (saveError) {
      console.error(
        `Unable to record notification email failure: ${saveError.message}`
      );
    }
  }

  return notification;
}

async function notifyPotentialMatch({ match, lostListing, foundListing }) {
  const score = match?.score ?? 0;
  const lostOwner = lostListing?.createdBy;
  const foundOwner = foundListing?.createdBy;

  const recipients = new Map();

  if (lostOwner) {
    recipients.set(lostOwner.toString(), {
      userId: lostOwner,
      listing: lostListing,
    });
  }

  if (foundOwner && !recipients.has(foundOwner.toString())) {
    recipients.set(foundOwner.toString(), {
      userId: foundOwner,
      listing: foundListing,
    });
  }

  for (const recipient of recipients.values()) {
    await createNotification({
      userId: recipient.userId,
      type: "match",
      message: `A possible match was found for "${recipient.listing.title}" (score ${score}).`,
      listingId: recipient.listing._id,
      emailSubject: "Possible match found",
      emailText: `A possible match was found for "${recipient.listing.title}" with a score of ${score}. Sign in to view the contributing factors.`,
    });
  }
}

async function notifyNewClaim(claim, listing) {
  return createNotification({
    userId: listing.createdBy,
    type: "claim",
    message: `A new claim was submitted for "${listing.title}".`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: "New claim submitted",
    emailText: `A new claim was submitted for "${listing.title}". Sign in to review the private evidence and decide whether to approve it.`,
  });
}

async function notifyClaimDecision(claim, listing, approved) {
  return createNotification({
    userId: claim.claimant,
    type: "claim_decision",
    message: approved
      ? `Your claim for "${listing.title}" was approved.`
      : `Your claim for "${listing.title}" was rejected.`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: `Claim ${approved ? "approved" : "rejected"}`,
    emailText: `Your claim for "${listing.title}" was ${
      approved ? "approved" : "rejected"
    }. Sign in to view the claim status.`,
  });
}

async function notifyCompetingClaimClosed(claim, listing) {
  return createNotification({
    userId: claim.claimant,
    type: "claim_closed",
    message: `Another claim for "${listing.title}" was approved, so your pending claim was closed.`,
    listingId: listing._id,
    claimId: claim._id,
    emailSubject: "Claim closed",
    emailText: `Another claim for "${listing.title}" was approved, so your pending claim was closed.`,
  });
}

async function notifyResolution(claim, listing) {
  const recipients = new Set([
    listing.createdBy.toString(),
    claim.claimant.toString(),
  ]);

  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "resolution",
      message: `"${listing.title}" was marked resolved.`,
      listingId: listing._id,
      claimId: claim._id,
      emailSubject: "Listing resolved",
      emailText: `"${listing.title}" was marked resolved after the return handoff.`,
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
  notifyNewClaim,
  notifyPotentialMatch,
  notifyResolution,
};
