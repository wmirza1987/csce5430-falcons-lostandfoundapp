const { query } = require("../db/pool");
const { idOf, lowerId, optionalId, runner } = require("./util");

const COLUMNS = [
  "id",
  "reporter",
  "targetType",
  "targetId",
  "listing",
  "claim",
  "reason",
  "status",
  "decision",
  "decisionNote",
  "handledBy",
  "handledAt",
  "threadAccessAt",
  "createdAt",
  "updatedAt",
];
const SELECT = COLUMNS.map((column) => `r.${column}`).join(", ");
const OUTPUT = COLUMNS.map((column) => `inserted.${column}`).join(", ");

function mapReport(row) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);

  return {
    _id: id,
    id,
    reporter: lowerId(row.reporter),
    targetType: row.targetType,
    targetId: lowerId(row.targetId),
    listing: lowerId(row.listing),
    claim: lowerId(row.claim),
    reason: row.reason,
    status: row.status,
    decision: row.decision ?? null,
    decisionNote: row.decisionNote,
    handledBy: lowerId(row.handledBy),
    handledAt: row.handledAt,
    threadAccessAt: row.threadAccessAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Same as mapReport, but reporter and handledBy become {_id, firstName, lastName}
// (or null), matching the response shape clients already use.
function mapPopulated(row) {
  const report = mapReport(row);

  if (!report) {
    return null;
  }

  report.reporter = row.reporterFirstName === null || row.reporterFirstName === undefined
    ? null
    : { _id: lowerId(row.reporter), firstName: row.reporterFirstName, lastName: row.reporterLastName };
  report.handledBy = row.handlerFirstName === null || row.handlerFirstName === undefined
    ? null
    : { _id: lowerId(row.handledBy), firstName: row.handlerFirstName, lastName: row.handlerLastName };

  return report;
}

const POPULATE_COLUMNS = `, rep.firstName AS reporterFirstName, rep.lastName AS reporterLastName,
  hnd.firstName AS handlerFirstName, hnd.lastName AS handlerLastName`;
const POPULATE_JOINS = `LEFT JOIN dbo.Users rep ON rep.id = r.reporter
  LEFT JOIN dbo.Users hnd ON hnd.id = r.handledBy`;

async function create(input, tx) {
  const rows = await runner(tx)(
    `INSERT INTO dbo.Reports (reporter, targetType, targetId, listing, claim, reason)
     OUTPUT ${OUTPUT}
     VALUES (@reporter, @targetType, @targetId, @listing, @claim, @reason)`,
    {
      reporter: idOf(input.reporter),
      targetType: input.targetType,
      targetId: idOf(input.targetId),
      listing: optionalId(input.listing),
      claim: optionalId(input.claim),
      reason: String(input.reason).trim(),
    }
  );
  return mapReport(rows[0]);
}

async function findById(id) {
  const rows = await query(`SELECT ${SELECT} FROM dbo.Reports r WHERE r.id = @id`, { id: idOf(id) });
  return mapReport(rows[0]);
}

async function findByIdPopulated(id) {
  const rows = await query(
    `SELECT ${SELECT}${POPULATE_COLUMNS} FROM dbo.Reports r ${POPULATE_JOINS} WHERE r.id = @id`,
    { id: idOf(id) }
  );
  return mapPopulated(rows[0]);
}

// `status` has already been validated as a string by the caller; it is bound
// as a parameter and an unknown value simply matches nothing.
async function listPopulated({ status } = {}) {
  const rows = await query(
    `SELECT ${SELECT}${POPULATE_COLUMNS} FROM dbo.Reports r ${POPULATE_JOINS}
     ${status ? "WHERE r.status = @status" : ""}
     ORDER BY r.createdAt DESC, r.id`,
    { status: status || null }
  );
  return rows.map(mapPopulated);
}

async function listAll() {
  const rows = await query(`SELECT ${SELECT} FROM dbo.Reports r ORDER BY r.createdAt`);
  return rows.map(mapReport);
}

// A reporter's still-unresolved report for the same target.
async function findUnresolvedDuplicate({ reporter, targetType, targetId }) {
  const rows = await query(
    `SELECT TOP (1) ${SELECT} FROM dbo.Reports r
     WHERE r.reporter = @reporter AND r.targetType = @targetType AND r.targetId = @targetId
       AND r.status <> 'resolved'`,
    { reporter: idOf(reporter), targetType, targetId: idOf(targetId) }
  );
  return mapReport(rows[0]);
}

// Newest open or in-review report linked to a claim thread.
async function findActiveForClaim(claimId) {
  const rows = await query(
    `SELECT TOP (1) ${SELECT} FROM dbo.Reports r
     WHERE r.claim = @claim AND r.status IN ('open', 'reviewing')
     ORDER BY r.createdAt DESC`,
    { claim: idOf(claimId) }
  );
  return mapReport(rows[0]);
}

// open -> reviewing. Returns the report, or null if it was not open.
async function startReview(id, moderatorId) {
  const rows = await query(
    `UPDATE dbo.Reports SET status = 'reviewing', handledBy = @moderator,
       handledAt = SYSUTCDATETIME(), threadAccessAt = SYSUTCDATETIME(), updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id AND status = 'open'`,
    { id: idOf(id), moderator: idOf(moderatorId) }
  );
  return mapReport(rows[0]);
}

// Conditional resolve: succeeds only while the report is not yet resolved.
async function resolve(id, { decision, decisionNote, handledBy }, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Reports SET status = 'resolved', decision = @decision, decisionNote = @decisionNote,
       handledBy = @handledBy, handledAt = SYSUTCDATETIME(), threadAccessAt = NULL,
       updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id AND status <> 'resolved'`,
    { id: idOf(id), decision, decisionNote, handledBy: idOf(handledBy) }
  );
  return mapReport(rows[0]);
}

async function countByStatus() {
  const rows = await query("SELECT status, COUNT(*) AS n FROM dbo.Reports GROUP BY status");
  return rows.map((row) => ({ status: row.status, count: row.n }));
}

module.exports = {
  countByStatus,
  create,
  findActiveForClaim,
  findById,
  findByIdPopulated,
  findUnresolvedDuplicate,
  listAll,
  listPopulated,
  resolve,
  startReview,
};
