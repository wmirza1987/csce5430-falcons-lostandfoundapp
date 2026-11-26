const { withTransaction } = require("../db/pool");
const claimsRepo = require("../repos/claims");
const listingsRepo = require("../repos/listings");
const messagesRepo = require("../repos/messages");
const reportsRepo = require("../repos/reports");
const usersRepo = require("../repos/users");
const { isGuid } = require("./validation");
const { ACTIONS, recordAudit, safeDetail } = require("./auditService");
const { createNotification } = require("./notificationService");

class ReportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function canModerate(user) {
  return ["moderator", "admin"].includes(user.role);
}

function reportView(report) {
  return {
    id: report._id,
    reporter: report.reporter,
    targetType: report.targetType,
    targetId: report.targetId,
    listing: report.listing,
    claim: report.claim,
    reason: report.reason,
    status: report.status,
    decision: report.decision,
    decisionNote: report.decisionNote,
    handledBy: report.handledBy,
    handledAt: report.handledAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function notifyModerators(report) {
  const moderators = await usersRepo.listActiveStaff();

  for (const moderator of moderators) {
    await createNotification({
      userId: moderator._id,
      type: "moderation",
      message: `A new ${report.targetType} report is waiting for review.`,
      actionPath: `/moderation/reports/${report._id}`,
      listingId: report.listing,
      claimId: report.claim,
      emailSubject: "New moderation report",
      emailText: `A new ${report.targetType} report is waiting for review. Sign in to review it.`,
    });
  }
}

async function createReport({ user, targetType, targetId, reason }) {
  if (!["listing", "message"].includes(targetType)) {
    throw new ReportError(400, "Reports must target a listing or a message.");
  }

  const text = String(reason || "").trim();

  if (text.length < 10) {
    throw new ReportError(400, "Please explain the report in at least 10 characters.");
  }

  if (text.length > 500) {
    throw new ReportError(400, "A report reason must be 500 characters or fewer.");
  }

  if (!isGuid(targetId)) {
    throw new ReportError(400, "Invalid id.");
  }

  let listing = null;
  let claim = null;

  if (targetType === "listing") {
    listing = await listingsRepo.findById(targetId);

    if (!listing || listing.isDeleted) {
      throw new ReportError(404, "Listing not found.");
    }

    // Link an approved claim when possible so the report can also authorize a
    // moderator's access to the handoff thread (FR-COM-02).
    const approvedClaim = await claimsRepo.findLatestApprovedForListing(listing._id);

    claim = approvedClaim ? approvedClaim._id : null;
  } else {
    const message = await messagesRepo.findById(targetId);

    if (!message) {
      throw new ReportError(404, "Message not found.");
    }

    claim = message.claim;
    listing = message.listing;
  }

  const duplicate = await reportsRepo.findUnresolvedDuplicate({
    reporter: user._id,
    targetType,
    targetId,
  });

  if (duplicate) {
    throw new ReportError(409, "You already have an open report for this item.");
  }

  const report = await reportsRepo.create({
    reporter: user._id,
    targetType,
    targetId,
    listing: listing ? listing._id : null,
    claim,
    reason: text,
  });

  await recordAudit({
    actor: user._id,
    action: ACTIONS.REPORT_CREATED,
    targetType,
    targetId: report._id,
    detail: `report ${report._id}`,
  });

  await notifyModerators(report).catch((error) => {
    console.error(`Unable to notify moderators of a report: ${error.message}`);
  });

  return reportView(report);
}

async function listReports({ status } = {}) {
  if (status !== undefined && typeof status !== "string") {
    throw new ReportError(400, "Status must be a single text value.");
  }

  const reports = await reportsRepo.listPopulated({ status });

  return reports.map((report) => reportView(report));
}

async function getReport(reportId) {
  const report = await reportsRepo.findByIdPopulated(reportId);

  if (!report) {
    throw new ReportError(404, "Report not found.");
  }

  return reportView(report);
}

async function startReview(report, moderator) {
  if (report.status === "reviewing") {
    return report;
  }

  // open -> reviewing is a conditional update; if another moderator got there
  // first the report is already under review and nothing more is needed.
  const started = await reportsRepo.startReview(report._id, moderator._id);

  if (!started) {
    return report;
  }

  await recordAudit({
    actor: moderator._id,
    action: ACTIONS.REPORT_REVIEW_STARTED,
    targetType: "report",
    targetId: report._id,
    detail: `report ${report._id}`,
  });

  return started;
}

async function assertThreadAccess({ claim, listing, user }) {
  if (claim.claimant.toString() === user._id.toString()) {
    return { allowed: true, role: "claimant" };
  }

  if (listing.createdBy.toString() === user._id.toString()) {
    return { allowed: true, role: "owner" };
  }

  if (!canModerate(user)) {
    return { allowed: false, role: null };
  }

  // FR-COM-02: moderators may read a handoff thread only while a report linked
  // to that thread is open or being reviewed.
  const report = await reportsRepo.findActiveForClaim(claim._id);

  if (!report) {
    return { allowed: false, role: "moderator" };
  }

  await startReview(report, user);

  await recordAudit({
    actor: user._id,
    action: ACTIONS.THREAD_ACCESSED,
    targetType: "thread",
    targetId: claim._id,
    detail: `report ${report._id}`,
  });

  return { allowed: true, role: "moderator", reportId: report._id };
}

async function notifyReportResolution({ report, decision }) {
  const recipients = new Set();

  recipients.add(report.reporter.toString());

  if (report.listing) {
    const listing = await listingsRepo.findById(report.listing);

    if (listing) {
      recipients.add(listing.createdBy.toString());
    }
  }

  if (report.claim) {
    const claim = await claimsRepo.findById(report.claim);

    if (claim) {
      recipients.add(claim.claimant.toString());
    }
  }

  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "moderation",
      message: `Your report was reviewed. The moderation decision was "${decision}".`,
      actionPath: report.targetType === "message" && report.claim
        ? `/messages/${report.claim}`
        : report.listing
          ? `/listings/${report.listing}`
          : "/listings",
      listingId: report.listing,
      claimId: report.claim,
      emailSubject: "Moderation report resolved",
      emailText: `Your report was reviewed. The decision was "${decision}". Sign in for details.`,
    });
  }
}

async function decideReport({ reportId, moderator, decision, decisionNote }) {
  if (!["hide", "restore", "dismiss"].includes(decision)) {
    throw new ReportError(400, "Decision must be hide, restore, or dismiss.");
  }

  const report = await reportsRepo.findById(reportId);

  if (!report) {
    throw new ReportError(404, "Report not found.");
  }

  if (report.status === "resolved") {
    throw new ReportError(409, "This report has already been resolved.");
  }

  const note = typeof decisionNote === "string" ? decisionNote.trim().slice(0, 500) : "";

  if ((decision === "hide" || decision === "restore") && note.length < 5) {
    throw new ReportError(400, "Record a short reason before hiding or restoring content.");
  }

  // Visibility change, audit records and the resolve step commit together. The
  // resolve is conditional, so two moderators cannot both decide one report.
  const resolved = await withTransaction(async (tx) => {
    const updated = await reportsRepo.resolve(
      report._id,
      { decision, decisionNote: note, handledBy: moderator._id },
      tx
    );

    if (!updated) {
      throw new ReportError(409, "This report has already been resolved.");
    }

    if (decision === "hide" || decision === "restore") {
      const hidden = decision === "hide";
      const change = { hidden, reason: note, hiddenBy: moderator._id };
      let action;

      if (report.targetType === "listing") {
        await listingsRepo.setHidden(report.listing || report.targetId, change, tx);
        action = hidden ? ACTIONS.LISTING_HIDDEN : ACTIONS.LISTING_RESTORED;
      } else {
        await messagesRepo.setHidden(report.targetId, change, tx);
        action = hidden ? ACTIONS.MESSAGE_HIDDEN : ACTIONS.MESSAGE_RESTORED;
      }

      await recordAudit(
        {
          actor: moderator._id,
          action,
          targetType: report.targetType,
          targetId: report.targetId,
          detail: `report ${report._id}`,
        },
        tx
      );
    }

    await recordAudit(
      {
        actor: moderator._id,
        action: ACTIONS.REPORT_DECIDED,
        targetType: "report",
        targetId: report._id,
        detail: `decision ${safeDetail(decision)}`,
      },
      tx
    );

    return updated;
  });

  await notifyReportResolution({ report: resolved, decision }).catch((error) => {
    console.error(`Unable to notify report resolution: ${error.message}`);
  });

  return reportView(resolved);
}

module.exports = {
  REPORT_REVIEW_STARTED: ACTIONS.REPORT_REVIEW_STARTED,
  ReportError,
  assertThreadAccess,
  canModerate,
  createReport,
  decideReport,
  getReport,
  listReports,
  reportView,
  startReview,
};
