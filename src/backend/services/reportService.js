const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const Message = require("../models/Message");
const Report = require("../models/Report");
const User = require("../models/User");
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
  const moderators = await User.find({
    role: { $in: ["moderator", "admin"] },
    isActive: true,
  }).select("_id");

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

  let listing = null;
  let claim = null;

  if (targetType === "listing") {
    listing = await Listing.findById(targetId);

    if (!listing || listing.isDeleted) {
      throw new ReportError(404, "Listing not found.");
    }

    // Link an approved claim when possible so the report can also authorize a
    // moderator's access to the handoff thread (FR-COM-02).
    const approvedClaim = await Claim.findOne({
      listing: listing._id,
      status: "approved",
    }).sort({ decidedAt: -1 });

    claim = approvedClaim ? approvedClaim._id : null;
  } else {
    const message = await Message.findById(targetId);

    if (!message) {
      throw new ReportError(404, "Message not found.");
    }

    claim = message.claim;
    listing = message.listing;
  }

  const duplicate = await Report.findOne({
    reporter: user._id,
    targetType,
    targetId,
    status: { $ne: "resolved" },
  });

  if (duplicate) {
    throw new ReportError(409, "You already have an open report for this item.");
  }

  const report = await Report.create({
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
  const query = status ? { status } : {};
  const reports = await Report.find(query)
    .sort({ createdAt: -1 })
    .populate("reporter", "firstName lastName")
    .populate("handledBy", "firstName lastName")
    .lean();

  return reports.map((report) => reportView(report));
}

async function getReport(reportId) {
  const report = await Report.findById(reportId)
    .populate("reporter", "firstName lastName")
    .populate("handledBy", "firstName lastName");

  if (!report) {
    throw new ReportError(404, "Report not found.");
  }

  return reportView(report);
}

async function startReview(report, moderator) {
  if (report.status === "reviewing") {
    return report;
  }

  report.status = "reviewing";
  report.handledBy = moderator._id;
  report.handledAt = new Date();
  report.threadAccessAt = new Date();
  await report.save();

  await recordAudit({
    actor: moderator._id,
    action: ACTIONS.REPORT_REVIEW_STARTED,
    targetType: "report",
    targetId: report._id,
    detail: `report ${report._id}`,
  });

  return report;
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
  const report = await Report.findOne({
    claim: claim._id,
    status: { $in: ["open", "reviewing"] },
  }).sort({ createdAt: -1 });

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
    const listing = await Listing.findById(report.listing).select("createdBy");

    if (listing) {
      recipients.add(listing.createdBy.toString());
    }
  }

  if (report.claim) {
    const claim = await Claim.findById(report.claim).select("claimant");

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

  const report = await Report.findById(reportId);

  if (!report) {
    throw new ReportError(404, "Report not found.");
  }

  if (report.status === "resolved") {
    throw new ReportError(409, "This report has already been resolved.");
  }

  const note = String(decisionNote || "").trim().slice(0, 500);

  if ((decision === "hide" || decision === "restore") && note.length < 5) {
    throw new ReportError(400, "Record a short reason before hiding or restoring content.");
  }

  let action = ACTIONS.REPORT_DECIDED;

  if (decision === "hide" || decision === "restore") {
    const hidden = decision === "hide";

    if (report.targetType === "listing") {
      await Listing.findByIdAndUpdate(report.listing || report.targetId, {
        $set: {
          isHidden: hidden,
          hiddenReason: hidden ? note : "",
          hiddenBy: hidden ? moderator._id : null,
          hiddenAt: hidden ? new Date() : null,
        },
      });

      action = hidden ? ACTIONS.LISTING_HIDDEN : ACTIONS.LISTING_RESTORED;
    } else {
      await Message.findByIdAndUpdate(report.targetId, {
        $set: {
          isHidden: hidden,
          hiddenReason: hidden ? note : "",
          hiddenBy: hidden ? moderator._id : null,
          hiddenAt: hidden ? new Date() : null,
        },
      });

      action = hidden ? ACTIONS.MESSAGE_HIDDEN : ACTIONS.MESSAGE_RESTORED;
    }

    await recordAudit({
      actor: moderator._id,
      action,
      targetType: report.targetType,
      targetId: report.targetId,
      detail: `report ${report._id}`,
    });
  }

  report.status = "resolved";
  report.decision = decision;
  report.decisionNote = note;
  report.handledBy = moderator._id;
  report.handledAt = new Date();
  report.threadAccessAt = null;
  await report.save();

  await recordAudit({
    actor: moderator._id,
    action: ACTIONS.REPORT_DECIDED,
    targetType: "report",
    targetId: report._id,
    detail: `decision ${safeDetail(decision)}`,
  });

  await notifyReportResolution({ report, decision }).catch((error) => {
    console.error(`Unable to notify report resolution: ${error.message}`);
  });

  return reportView(report);
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
