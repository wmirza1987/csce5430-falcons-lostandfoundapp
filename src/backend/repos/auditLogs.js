const { query } = require("../db/pool");
const { idOf, lowerId, optionalId, runner } = require("./util");

// Inserts one non-content audit record.
async function create({ actor, action, targetType, targetId = null, detail = "" }, tx) {
  const rows = await runner(tx)(
    `INSERT INTO dbo.AuditLogs (actor, action, targetType, targetId, detail)
     OUTPUT inserted.id
     VALUES (@actor, @action, @targetType, @targetId, @detail)`,
    {
      actor: idOf(actor),
      action,
      targetType,
      targetId: optionalId(targetId),
      detail,
    }
  );
  return { _id: lowerId(rows[0].id), id: lowerId(rows[0].id) };
}

// Newest first, with the actor's name and role joined in. `action` and `actor`
// are bound as parameters; `actor` must be a GUID string.
async function list({ action, actor, limit = 100 } = {}) {
  const clauses = [];
  const params = { limit: Math.min(Math.max(Number(limit) || 100, 1), 200) };

  if (action) {
    clauses.push("a.action = @action");
    params.action = action;
  }

  if (actor) {
    clauses.push("a.actor = @actor");
    params.actor = idOf(actor);
  }

  const rows = await query(
    `SELECT TOP (@limit) a.id, a.actor, a.action, a.targetType, a.targetId, a.detail, a.createdAt,
       u.firstName AS actorFirstName, u.lastName AS actorLastName, u.role AS actorRole
     FROM dbo.AuditLogs a LEFT JOIN dbo.Users u ON u.id = a.actor
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY a.createdAt DESC, a.id`,
    params
  );

  return rows.map((row) => ({
    _id: lowerId(row.id),
    id: lowerId(row.id),
    actor:
      row.actorFirstName === null || row.actorFirstName === undefined
        ? null
        : {
            _id: lowerId(row.actor),
            firstName: row.actorFirstName,
            lastName: row.actorLastName,
            role: row.actorRole,
          },
    actorId: lowerId(row.actor),
    action: row.action,
    targetType: row.targetType,
    targetId: lowerId(row.targetId),
    detail: row.detail,
    createdAt: row.createdAt,
  }));
}

module.exports = { create, list };
