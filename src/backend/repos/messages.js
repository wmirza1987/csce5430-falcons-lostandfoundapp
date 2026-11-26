const { query } = require("../db/pool");
const { idOf, lowerId, optionalId, runner } = require("./util");

const PUBLIC_COLUMNS = [
  "id",
  "claim",
  "listing",
  "sender",
  "kind",
  "body",
  "containsContactDetails",
  "flagged",
  "flaggedBy",
  "flaggedAt",
  "isHidden",
  "createdAt",
  "updatedAt",
];

// flagReason and the hidden* audit columns are private to moderation.
const PRIVATE_COLUMNS = ["flagReason", "hiddenBy", "hiddenAt", "hiddenReason"];

function columnsFor({ includePrivate = false } = {}) {
  return includePrivate ? [...PUBLIC_COLUMNS, ...PRIVATE_COLUMNS] : PUBLIC_COLUMNS;
}

function selectList(options) {
  return columnsFor(options)
    .map((column) => `m.${column}`)
    .join(", ");
}

function outputList(options) {
  return columnsFor(options)
    .map((column) => `inserted.${column}`)
    .join(", ");
}

function mapMessage(row, options = {}) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);
  const message = {
    _id: id,
    id,
    claim: lowerId(row.claim),
    listing: lowerId(row.listing),
    sender: lowerId(row.sender),
    kind: row.kind,
    body: row.body,
    containsContactDetails: Boolean(row.containsContactDetails),
    flagged: Boolean(row.flagged),
    flaggedBy: lowerId(row.flaggedBy),
    flaggedAt: row.flaggedAt,
    isHidden: Boolean(row.isHidden),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (options.includePrivate) {
    message.flagReason = row.flagReason ?? undefined;
    message.hiddenBy = lowerId(row.hiddenBy);
    message.hiddenAt = row.hiddenAt;
    message.hiddenReason = row.hiddenReason;
  }

  return message;
}

// Inserts a message. Pass a transaction to make it part of a larger unit of work.
async function create(input, tx) {
  const rows = await runner(tx)(
    `INSERT INTO dbo.Messages (claim, listing, sender, kind, body, containsContactDetails)
     OUTPUT ${outputList({})}
     VALUES (@claim, @listing, @sender, @kind, @body, @containsContactDetails)`,
    {
      claim: idOf(input.claim),
      listing: idOf(input.listing),
      sender: optionalId(input.sender),
      kind: input.kind || "user",
      body: String(input.body).trim(),
      containsContactDetails: Boolean(input.containsContactDetails),
    }
  );
  return mapMessage(rows[0]);
}

async function findById(id, options = {}) {
  const rows = await query(`SELECT ${selectList(options)} FROM dbo.Messages m WHERE m.id = @id`, {
    id: idOf(id),
  });
  return mapMessage(rows[0], options);
}

async function findFirstForClaim(claimId) {
  const rows = await query(
    `SELECT TOP (1) ${selectList({})} FROM dbo.Messages m WHERE m.claim = @claim ORDER BY m.createdAt`,
    { claim: idOf(claimId) }
  );
  return mapMessage(rows[0]);
}

// Hidden messages are filtered out unless includeHidden is true.
async function countForClaim(claimId, { includeHidden = true, kind } = {}) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM dbo.Messages WHERE claim = @claim ${
      includeHidden ? "" : "AND isHidden = 0"
    } ${kind ? "AND kind = @kind" : ""}`,
    { claim: idOf(claimId), kind: kind || null }
  );
  return rows[0].total;
}

// One page of a thread, newest first (the caller reverses it for display).
async function listPageForClaim(claimId, { includeHidden, skip, take }) {
  const rows = await query(
    `SELECT ${selectList({})} FROM dbo.Messages m
     WHERE m.claim = @claim ${includeHidden ? "" : "AND m.isHidden = 0"}
     ORDER BY m.createdAt DESC, m.id
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    { claim: idOf(claimId), skip, take }
  );
  return rows.map((row) => mapMessage(row));
}

async function setFlagged(id, { flaggedBy, reason }) {
  const rows = await query(
    `UPDATE dbo.Messages SET flagged = 1, flaggedBy = @flaggedBy, flaggedAt = SYSUTCDATETIME(),
       flagReason = @reason, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})} WHERE id = @id`,
    { id: idOf(id), flaggedBy: idOf(flaggedBy), reason: String(reason || "").trim().slice(0, 300) }
  );
  return mapMessage(rows[0]);
}

async function setHidden(id, { hidden, reason = "", hiddenBy = null }, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Messages SET isHidden = @hidden, hiddenReason = @reason, hiddenBy = @hiddenBy,
       hiddenAt = @hiddenAt, updatedAt = SYSUTCDATETIME()
     OUTPUT inserted.id WHERE id = @id`,
    {
      id: idOf(id),
      hidden: Boolean(hidden),
      reason: hidden ? String(reason) : "",
      hiddenBy: hidden ? optionalId(hiddenBy) : null,
      hiddenAt: hidden ? new Date() : null,
    }
  );
  return rows.length > 0;
}

module.exports = {
  countForClaim,
  create,
  findById,
  findFirstForClaim,
  listPageForClaim,
  setFlagged,
  setHidden,
};
