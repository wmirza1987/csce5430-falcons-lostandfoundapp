const { query } = require("../db/pool");
const { idOf, lowerId, optionalId } = require("./util");

const COLUMNS = ["id", "name", "description", "isActive", "createdBy", "createdAt", "updatedAt"];
const SELECT = COLUMNS.map((column) => `c.${column}`).join(", ");
const OUTPUT = COLUMNS.map((column) => `inserted.${column}`).join(", ");

function mapCategory(row) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);

  return {
    _id: id,
    id,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.isActive),
    createdBy: lowerId(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Category names are stored lower case.
async function create({ name, description = "", createdBy = null }) {
  const rows = await query(
    `INSERT INTO dbo.Categories (name, description, createdBy)
     OUTPUT ${OUTPUT}
     VALUES (@name, @description, @createdBy)`,
    {
      name: String(name).trim().toLowerCase(),
      description: String(description).trim(),
      createdBy: optionalId(createdBy),
    }
  );
  return mapCategory(rows[0]);
}

async function findById(id) {
  const rows = await query(`SELECT ${SELECT} FROM dbo.Categories c WHERE c.id = @id`, { id: idOf(id) });
  return mapCategory(rows[0]);
}

async function findByName(name) {
  const rows = await query(`SELECT ${SELECT} FROM dbo.Categories c WHERE c.name = @name`, {
    name: String(name).trim().toLowerCase(),
  });
  return mapCategory(rows[0]);
}

async function list({ includeInactive = false } = {}) {
  const rows = await query(
    `SELECT ${SELECT} FROM dbo.Categories c ${includeInactive ? "" : "WHERE c.isActive = 1"} ORDER BY c.name`
  );
  return rows.map(mapCategory);
}

// Updates only the fields that are present. Name is lower-cased.
async function update(id, { name, description, isActive }) {
  const assignments = [];
  const params = { id: idOf(id) };

  if (name !== undefined) {
    assignments.push("name = @name");
    params.name = String(name).trim().toLowerCase();
  }

  if (description !== undefined) {
    assignments.push("description = @description");
    params.description = String(description).trim();
  }

  if (isActive !== undefined) {
    assignments.push("isActive = @isActive");
    params.isActive = Boolean(isActive);
  }

  if (assignments.length === 0) {
    return findById(id);
  }

  const rows = await query(
    `UPDATE dbo.Categories SET ${assignments.join(", ")}, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id`,
    params
  );
  return mapCategory(rows[0]);
}

module.exports = { create, findById, findByName, list, update };
