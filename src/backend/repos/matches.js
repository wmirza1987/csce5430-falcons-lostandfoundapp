const { query } = require("../db/pool");
const { idOf, inList, lowerId, parseJson, runner } = require("./util");

const COLUMNS = ["id", "lostListing", "foundListing", "score", "factorsJson", "createdAt", "updatedAt"];
const SELECT = COLUMNS.map((column) => `m.${column}`).join(", ");
const OUTPUT = COLUMNS.map((column) => `inserted.${column}`).join(", ");

function mapMatch(row) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);

  return {
    _id: id,
    id,
    lostListing: lowerId(row.lostListing),
    foundListing: lowerId(row.foundListing),
    score: Number(row.score),
    factors: parseJson(row.factorsJson, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function create({ lostListing, foundListing, score, factors }, tx) {
  const rows = await runner(tx)(
    `INSERT INTO dbo.Matches (lostListing, foundListing, score, factorsJson)
     OUTPUT ${OUTPUT}
     VALUES (@lostListing, @foundListing, @score, @factorsJson)`,
    {
      lostListing: idOf(lostListing),
      foundListing: idOf(foundListing),
      score,
      factorsJson: JSON.stringify(factors),
    }
  );
  return mapMatch(rows[0]);
}

async function updateScore(id, { score, factors }) {
  const rows = await query(
    `UPDATE dbo.Matches SET score = @score, factorsJson = @factorsJson, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id`,
    { id: idOf(id), score, factorsJson: JSON.stringify(factors) }
  );
  return mapMatch(rows[0]);
}

async function findById(id) {
  const rows = await query(`SELECT ${SELECT} FROM dbo.Matches m WHERE m.id = @id`, {
    id: idOf(id),
  });
  return mapMatch(rows[0]);
}

async function findByListing(listingId) {
  const rows = await query(
    `SELECT ${SELECT} FROM dbo.Matches m
     WHERE m.lostListing = @listingId OR m.foundListing = @listingId
     ORDER BY m.score DESC, m.createdAt DESC`,
    { listingId: idOf(listingId) }
  );
  return rows.map(mapMatch);
}

// Matches that involve any undeleted listing owned by the user.
async function findByOwner(userId) {
  const rows = await query(
    `SELECT ${SELECT} FROM dbo.Matches m
     WHERE m.lostListing IN (SELECT id FROM dbo.Listings WHERE createdBy = @userId AND isDeleted = 0)
        OR m.foundListing IN (SELECT id FROM dbo.Listings WHERE createdBy = @userId AND isDeleted = 0)
     ORDER BY m.score DESC, m.createdAt DESC`,
    { userId: idOf(userId) }
  );
  return rows.map(mapMatch);
}

async function deleteByListing(listingId, tx) {
  const rows = await runner(tx)(
    `DELETE FROM dbo.Matches OUTPUT deleted.id
     WHERE lostListing = @listingId OR foundListing = @listingId`,
    { listingId: idOf(listingId) }
  );
  return rows.length;
}

async function deleteByIds(ids) {
  if (ids.length === 0) {
    return 0;
  }

  const { sql: placeholders, params } = inList("id", ids.map((id) => idOf(id)));
  const rows = await query(`DELETE FROM dbo.Matches OUTPUT deleted.id WHERE id IN (${placeholders})`, params);
  return rows.length;
}

async function count() {
  const rows = await query("SELECT COUNT(*) AS total FROM dbo.Matches");
  return rows[0].total;
}

module.exports = {
  count,
  create,
  deleteByIds,
  deleteByListing,
  findById,
  findByListing,
  findByOwner,
  updateScore,
};
