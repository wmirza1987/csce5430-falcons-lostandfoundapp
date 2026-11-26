const { query } = require("../db/pool");
const { idOf, lowerId, optionalId } = require("./util");

const PUBLIC_COLUMNS = [
  "id",
  "userId",
  "type",
  "message",
  "actionPath",
  "listing",
  "claim",
  "isRead",
  "emailStatus",
  "emailAttempts",
  "createdAt",
  "updatedAt",
];

// The stored email subject and body are only selected when explicitly asked for.
const EMAIL_COLUMNS = ["emailSubject", "emailBody"];

function columnsFor({ includeEmail = false } = {}) {
  return includeEmail ? [...PUBLIC_COLUMNS, ...EMAIL_COLUMNS] : PUBLIC_COLUMNS;
}

function selectList(options) {
  return columnsFor(options)
    .map((column) => `n.${column}`)
    .join(", ");
}

function outputList(options) {
  return columnsFor(options)
    .map((column) => `inserted.${column}`)
    .join(", ");
}

function mapNotification(row, options = {}) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);
  const notification = {
    _id: id,
    id,
    user: lowerId(row.userId),
    type: row.type,
    message: row.message,
    actionPath: row.actionPath,
    listing: lowerId(row.listing),
    claim: lowerId(row.claim),
    isRead: Boolean(row.isRead),
    emailStatus: row.emailStatus,
    emailAttempts: row.emailAttempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (options.includeEmail) {
    notification.emailSubject = row.emailSubject ?? undefined;
    notification.emailBody = row.emailBody ?? undefined;
  }

  return notification;
}

async function create(input) {
  const rows = await query(
    `INSERT INTO dbo.Notifications
       (userId, type, message, actionPath, listing, claim, emailSubject, emailBody)
     OUTPUT ${outputList({})}
     VALUES (@userId, @type, @message, @actionPath, @listing, @claim, @emailSubject, @emailBody)`,
    {
      userId: idOf(input.user),
      type: input.type,
      message: String(input.message).trim(),
      actionPath: String(input.actionPath || "").trim(),
      listing: optionalId(input.listing),
      claim: optionalId(input.claim),
      emailSubject: input.emailSubject === undefined ? null : String(input.emailSubject).trim(),
      emailBody: input.emailBody === undefined ? null : String(input.emailBody),
    }
  );
  return mapNotification(rows[0]);
}

async function findById(id, options = {}) {
  const rows = await query(
    `SELECT ${selectList(options)} FROM dbo.Notifications n WHERE n.id = @id`,
    { id: idOf(id) }
  );
  return mapNotification(rows[0], options);
}

// A user's notifications, newest first. The related listing is populated with
// the same four fields the previous data layer returned.
async function listForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  const rows = await query(
    `SELECT TOP (@limit) ${selectList({})},
       l.id AS listingId, l.title AS listingTitle, l.type AS listingType, l.status AS listingStatus
     FROM dbo.Notifications n LEFT JOIN dbo.Listings l ON l.id = n.listing
     WHERE n.userId = @userId ${unreadOnly ? "AND n.isRead = 0" : ""}
     ORDER BY n.createdAt DESC, n.id`,
    { userId: idOf(userId), limit: Math.min(Math.max(Number(limit) || 50, 1), 100) }
  );

  return rows.map((row) => {
    const notification = mapNotification(row);

    if (row.listingId) {
      notification.listing = {
        _id: lowerId(row.listingId),
        title: row.listingTitle,
        type: row.listingType,
        status: row.listingStatus,
      };
    }

    return notification;
  });
}

async function markRead(id, userId) {
  const rows = await query(
    `UPDATE dbo.Notifications SET isRead = 1, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})} WHERE id = @id AND userId = @userId`,
    { id: idOf(id), userId: idOf(userId) }
  );
  return mapNotification(rows[0]);
}

async function markAllRead(userId) {
  const rows = await query(
    `UPDATE dbo.Notifications SET isRead = 1, updatedAt = SYSUTCDATETIME()
     OUTPUT inserted.id WHERE userId = @userId AND isRead = 0`,
    { userId: idOf(userId) }
  );
  return rows.length;
}

// Records an email attempt before sending: status becomes pending and the
// attempt counter goes up by one.
async function markEmailPending(id) {
  const rows = await query(
    `UPDATE dbo.Notifications SET emailStatus = 'pending', emailAttempts = emailAttempts + 1,
       updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})} WHERE id = @id`,
    { id: idOf(id) }
  );
  return mapNotification(rows[0]);
}

async function setEmailStatus(id, status) {
  const rows = await query(
    `UPDATE dbo.Notifications SET emailStatus = @status, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})} WHERE id = @id`,
    { id: idOf(id), status }
  );
  return mapNotification(rows[0]);
}

async function findFailedForRetry({ maxAttempts, limit }) {
  const rows = await query(
    `SELECT TOP (@limit) ${selectList({ includeEmail: true })} FROM dbo.Notifications n
     WHERE n.emailStatus = 'failed' AND n.emailAttempts < @maxAttempts
     ORDER BY n.createdAt ASC`,
    { limit, maxAttempts }
  );
  return rows.map((row) => mapNotification(row, { includeEmail: true }));
}

async function listByType(type, options = {}) {
  const rows = await query(
    `SELECT ${selectList(options)} FROM dbo.Notifications n WHERE n.type = @type ORDER BY n.createdAt`,
    { type }
  );
  return rows.map((row) => mapNotification(row, options));
}

async function listAll(options = {}) {
  const rows = await query(`SELECT ${selectList(options)} FROM dbo.Notifications n ORDER BY n.createdAt`);
  return rows.map((row) => mapNotification(row, options));
}

async function countForUser(userId, type) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM dbo.Notifications WHERE userId = @userId ${
      type ? "AND type = @type" : ""
    }`,
    { userId: idOf(userId), type: type || null }
  );
  return rows[0].total;
}

module.exports = {
  countForUser,
  create,
  findById,
  findFailedForRetry,
  listAll,
  listByType,
  listForUser,
  markAllRead,
  markEmailPending,
  markRead,
  setEmailStatus,
};
