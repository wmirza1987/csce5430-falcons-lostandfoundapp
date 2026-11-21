const AuditLog = require("../models/AuditLog");

// FR-ADM-02 / FR-COM-02: every privileged action writes a non-content audit
// record. Callers pass IDs and a short reason, never message bodies, claim
// evidence, passwords, or tokens (NFR-PRIV-01).
const ACTIONS = {
  ROLE_CHANGED: "role.changed",
  CATEGORY_CREATED: "category.created",
  CATEGORY_UPDATED: "category.updated",
  CATEGORY_DEACTIVATED: "category.deactivated",
  REPORT_CREATED: "report.created",
  REPORT_REVIEW_STARTED: "report.review_started",
  REPORT_DECIDED: "report.decided",
  THREAD_ACCESSED: "thread.accessed",
  LISTING_HIDDEN: "listing.hidden",
  LISTING_RESTORED: "listing.restored",
  MESSAGE_HIDDEN: "message.hidden",
  MESSAGE_RESTORED: "message.restored",
  ACCOUNT_DEACTIVATED: "account.deactivated",
  ACCOUNT_DELETED: "account.deleted",
};

function safeDetail(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

async function recordAudit({ actor, action, targetType, targetId = null, detail = "" }) {
  return AuditLog.create({
    actor,
    action,
    targetType,
    targetId,
    detail: safeDetail(detail),
  });
}

module.exports = { ACTIONS, recordAudit, safeDetail };
