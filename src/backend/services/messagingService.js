// In-app messaging for approved claims (FR-CLM-03, FR-COM-01 to 03).
// A thread is the set of Message rows for one claim. Only the claimant and
// the Found listing owner can read or write it. FR-COM-02: a moderator may read
// a thread only while reviewing an open/reviewing report linked to that thread,
// and every such access is audit logged.
const claimsRepo = require("../repos/claims");
const listingsRepo = require("../repos/listings");
const messagesRepo = require("../repos/messages");
const { ACTIONS, recordAudit } = require("./auditService");
const { notifyModerationReview, notifyNewMessage } = require("./notificationService");
const { assertThreadAccess, canModerate: isModerator } = require("./reportService");

const PAGE_SIZE = 50;
const MAX_BODY_LENGTH = 1000;
const CONTACT_WARNING =
  "Sharing contact details may compromise privacy; please arrange handoff within the app.";
const EMAIL_TEST = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_TEST = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const THREAD_OPEN_TEXT =
  "Messaging is open for this claim. Use this thread to arrange the handoff.";
const HIDDEN_PLACEHOLDER = "[hidden by moderation]";

class MessagingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns "owner" (Found listing owner), "claimant", "moderator", or null.
// This is the static role only: moderator thread access is checked separately.
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

// Resolves a role for thread access. When `requireReport` is true, a moderator
// is only admitted while an open/reviewing report exists for the thread; that
// check also records the review + audit events (FR-COM-02).
async function resolvedRole(claim, listing, user, { requireReport = false } = {}) {
  const role = roleFor(claim, listing, user);

  if (role !== "moderator" || !requireReport) {
    return role;
  }

  const access = await assertThreadAccess({ claim, listing, user });
  return access.allowed ? "moderator" : null;
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
  const claim = await claimsRepo.findById(claimId);

  if (!claim) {
    throw new MessagingError(404, "Conversation not found.");
  }

  const listing = await listingsRepo.findById(claim.listing);

  if (!listing) {
    throw new MessagingError(404, "Conversation not found.");
  }

  return { claim, listing };
}

// Opens the thread for an approved claim by writing its opening system message.
// Notifications are sent by the caller after this write is confirmed. Pass the
// approval transaction so the opening message commits or rolls back with it.
async function createThread(claim, listing, tx) {
  return messagesRepo.create(
    {
      claim: claim._id,
      listing: listing._id,
      sender: null,
      kind: "system",
      body: THREAD_OPEN_TEXT,
    },
    tx
  );
}

function toMessageView(message, claim, userId, { hidden = false } = {}) {
  const senderRole =
    message.kind === "system"
      ? "System"
      : message.sender && message.sender.toString() === claim.claimant.toString()
        ? "Claimant"
        : "Finder";

  // A hidden message is never rendered with its real body to a moderator
  // either; only a content-free placeholder is shown (NFR-PRIV-01).
  const body = hidden ? HIDDEN_PLACEHOLDER : message.body;

  return {
    id: message._id,
    body,
    kind: message.kind,
    senderRole,
    isOwn: Boolean(message.sender) && message.sender.toString() === userId.toString(),
    containsContactDetails: hidden ? false : message.containsContactDetails,
    flagged: hidden || message.flagged,
    isHidden: hidden,
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

  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  if (!body) {
    throw new MessagingError(400, "Message text is required.");
  }

  if (body.length > MAX_BODY_LENGTH) {
    throw new MessagingError(400, "Messages must be 1000 characters or fewer.");
  }

  const detected = containsContactDetails(body);

  // NFR-REL-01: the message is confirmed in the database before success is reported.
  const message = await messagesRepo.create({
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
  const role = await resolvedRole(claim, listing, user, { requireReport: true });

  if (!role) {
    throw new MessagingError(403, "You do not have access to this conversation.");
  }

  const pageNumber = Math.min(
    Math.max(parseInt(typeof page === "string" ? page : "1", 10) || 1, 1),
    100000
  );

  // Participants never see hidden messages. A moderator reviewing a report
  // sees a content-free placeholder only.
  const includeHidden = role === "moderator";

  const total = await messagesRepo.countForClaim(claim._id, { includeHidden });
  const messages = await messagesRepo.listPageForClaim(claim._id, {
    includeHidden,
    skip: (pageNumber - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

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
    messages: messages
      .reverse()
      .map((message) =>
        toMessageView(message, claim, user._id, {
          hidden: role === "moderator" && Boolean(message.isHidden),
        })
      ),
  };
}

// Threads visible to the user: approved claims they are part of. Moderators
// only see threads with an open/reviewing report they can review (FR-COM-02).
async function listThreads(user) {
  const claims = isModerator(user)
    ? await claimsRepo.listApprovedThreadsUnderReport({ limit: 100 })
    : await claimsRepo.listApprovedThreadsForUser(user._id, { limit: 100 });
  const threads = [];

  for (const claim of claims) {
    const listing = await listingsRepo.findById(claim.listing);

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
// generic notice. The reason is stored for moderators only. Access is limited
// to a thread the moderator is currently reviewing via a report.
async function flagMessage(messageId, moderator, reason) {
  const message = await messagesRepo.findById(messageId);

  if (!message) {
    throw new MessagingError(404, "Message not found.");
  }

  const { claim, listing } = await loadClaimThread(message.claim);
  const role = await resolvedRole(claim, listing, moderator, { requireReport: true });

  if (role !== "moderator") {
    throw new MessagingError(403, "You do not have access to this conversation.");
  }

  const flaggedMessage = await messagesRepo.setFlagged(message._id, {
    flaggedBy: moderator._id,
    reason: typeof reason === "string" ? reason : "",
  });

  await recordAudit({
    actor: moderator._id,
    action: ACTIONS.REPORT_REVIEW_STARTED,
    targetType: "message",
    targetId: message._id,
    detail: `flag message ${message._id}`,
  });

  await notifyModerationReview(claim, listing, [claim.claimant, listing.createdBy]).catch(
    (error) => {
      console.error(`Unable to notify moderation review: ${error.message}`);
    }
  );

  return toMessageView(flaggedMessage, claim, moderator._id);
}

module.exports = {
  CONTACT_WARNING,
  HIDDEN_PLACEHOLDER,
  MessagingError,
  PAGE_SIZE,
  containsContactDetails,
  createThread,
  flagMessage,
  getThreadMessages,
  isModerator,
  listThreads,
  postMessage,
  resolvedRole,
  roleFor,
};
