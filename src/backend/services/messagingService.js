// In-app messaging for approved claims (FR-CLM-03, FR-COM-01 to 03).
// A thread is the set of Message documents for one claim. Only the claimant and
// the Found listing owner can read or write it. Moderators can read and flag.
const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const Message = require("../models/Message");
const { notifyModerationReview, notifyNewMessage } = require("./notificationService");

const PAGE_SIZE = 50;
const MAX_BODY_LENGTH = 1000;
const CONTACT_WARNING =
  "Sharing contact details may compromise privacy; please arrange handoff within the app.";
const EMAIL_TEST = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_TEST = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const THREAD_OPEN_TEXT =
  "Messaging is open for this claim. Use this thread to arrange the handoff.";

class MessagingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isModerator(user) {
  return ["moderator", "admin"].includes(user.role);
}

// Returns "owner" (Found listing owner), "claimant", "moderator", or null.
function roleFor(claim, listing, user) {
  if (claim.claimant.toString() === user._id.toString()) {
    return "claimant";
  }

  if (listing.createdBy.toString() === user._id.toString()) {
    return "owner";
  }

  if (isModerator(user)) {
    return "moderator";
  }

  return null;
}

function labelFor(role) {
  if (role === "owner") return "Finder";
  if (role === "claimant") return "Claimant";
  return "System";
}

function containsContactDetails(text) {
  return EMAIL_TEST.test(text) || PHONE_TEST.test(text);
}

async function loadClaimThread(claimId) {
  const claim = await Claim.findById(claimId);

  if (!claim) {
    throw new MessagingError(404, "Conversation not found.");
  }

  const listing = await Listing.findById(claim.listing);

  if (!listing) {
    throw new MessagingError(404, "Conversation not found.");
  }

  return { claim, listing };
}

// Opens the thread for an approved claim by writing its opening system message.
// Notifications are sent by the caller after this write is confirmed.
async function createThread(claim, listing) {
  return Message.create({
    claim: claim._id,
    listing: listing._id,
    sender: null,
    kind: "system",
    body: THREAD_OPEN_TEXT,
  });
}

function toMessageView(message, claim, userId) {
  const senderRole =
    message.kind === "system"
      ? "System"
      : message.sender && message.sender.toString() === claim.claimant.toString()
        ? "Claimant"
        : "Finder";

  return {
    id: message._id,
    body: message.body,
    kind: message.kind,
    senderRole,
    isOwn: Boolean(message.sender) && message.sender.toString() === userId.toString(),
    containsContactDetails: message.containsContactDetails,
    flagged: message.flagged,
    createdAt: message.createdAt,
  };
}

async function postMessage(claimId, user, rawBody) {
  const { claim, listing } = await loadClaimThread(claimId);
  const role = roleFor(claim, listing, user);

  if (role !== "owner" && role !== "claimant") {
    throw new MessagingError(403, "You do not have access to this conversation.");
  }

  if (claim.status !== "approved") {
    throw new MessagingError(409, "Messages open only after a claim is approved.");
  }

  const body = String(rawBody ?? "").trim();

  if (!body) {
    throw new MessagingError(400, "Message text is required.");
  }

  if (body.length > MAX_BODY_LENGTH) {
    throw new MessagingError(400, "Messages must be 1000 characters or fewer.");
  }

  const detected = containsContactDetails(body);

  // NFR-REL-01: the message is confirmed in the database before success is reported.
  const message = await Message.create({
    claim: claim._id,
    listing: listing._id,
    sender: user._id,
    kind: "user",
    body,
    containsContactDetails: detected,
  });

  if (detected) {
    // Log the detection event only. The message text is never logged (UT-PRIV-04).
    console.warn(`Contact details detected in message ${message._id}`);
  }

  const recipientId = role === "owner" ? claim.claimant : listing.createdBy;

  await notifyNewMessage(claim, listing, recipientId, labelFor(role)).catch((error) => {
    console.error(`Unable to notify new message: ${error.message}`);
  });

  return {
    message: toMessageView(message, claim, user._id),
    warning: detected ? CONTACT_WARNING : null,
  };
}

// Newest page first; messages inside a page are returned oldest to newest.
async function getThreadMessages(claimId, user, page = 1) {
  const { claim, listing } = await loadClaimThread(claimId);
  const role = roleFor(claim, listing, user);

  if (!role) {
    throw new MessagingError(403, "You do not have access to this conversation.");
  }

  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const total = await Message.countDocuments({ claim: claim._id });
  const messages = await Message.find({ claim: claim._id })
    .sort({ createdAt: -1 })
    .skip((pageNumber - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE);

  return {
    thread: {
      claimId: claim._id,
      listingTitle: listing.title,
      status: claim.status,
      yourRole: role === "moderator" ? "Moderator" : labelFor(role),
    },
    page: pageNumber,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    messages: messages.reverse().map((message) => toMessageView(message, claim, user._id)),
  };
}

// Threads visible to the user: approved claims they are part of, or every
// approved thread for moderators (UT-AUTH-07, UT-MSG-08).
async function listThreads(user) {
  let claimQuery = { status: "approved" };

  if (!isModerator(user)) {
    const ownedListingIds = (await Listing.find({ createdBy: user._id }).select("_id")).map(
      (listing) => listing._id
    );

    claimQuery = {
      status: "approved",
      $or: [{ claimant: user._id }, { listing: { $in: ownedListingIds } }],
    };
  }

  const claims = await Claim.find(claimQuery).sort({ decidedAt: -1 }).limit(100);
  const threads = [];

  for (const claim of claims) {
    const listing = await Listing.findById(claim.listing).select("title createdBy");

    if (!listing) {
      continue;
    }

    const role = roleFor(claim, listing, user);

    threads.push({
      claimId: claim._id,
      listingTitle: listing.title,
      yourRole: role === "moderator" ? "Moderator" : labelFor(role),
      updatedAt: claim.updatedAt,
    });
  }

  return threads;
}

// FR-COM-02 moderation: flags a message and notifies both participants with a
// generic notice. The reason is stored for moderators only.
async function flagMessage(messageId, moderator, reason) {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new MessagingError(404, "Message not found.");
  }

  const { claim, listing } = await loadClaimThread(message.claim);

  message.flagged = true;
  message.flaggedBy = moderator._id;
  message.flaggedAt = new Date();
  message.flagReason = String(reason || "").trim().slice(0, 300);
  await message.save();

  await notifyModerationReview(claim, listing, [claim.claimant, listing.createdBy]).catch(
    (error) => {
      console.error(`Unable to notify moderation review: ${error.message}`);
    }
  );

  return toMessageView(message, claim, moderator._id);
}

module.exports = {
  CONTACT_WARNING,
  MessagingError,
  PAGE_SIZE,
  containsContactDetails,
  createThread,
  flagMessage,
  getThreadMessages,
  isModerator,
  listThreads,
  postMessage,
  roleFor,
};
