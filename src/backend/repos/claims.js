const { query, withTransaction } = require("../db/pool");
const { chunk, idOf, inList, lowerId, optionalId, runner } = require("./util");

const PUBLIC_COLUMNS = [
  "id",
  "matchId",
  "listing",
  "claimant",
  "status",
  "decisionNote",
  "decidedBy",
  "decidedAt",
  "createdAt",
  "updatedAt",
];

// The encrypted explanation is only selected when explicitly requested.
function columnsFor({ includeExplanation = false } = {}) {
  return includeExplanation ? [...PUBLIC_COLUMNS, "explanationCiphertext"] : PUBLIC_COLUMNS;
}

function selectList(options, alias = "c") {
  return columnsFor(options)
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

function outputList(options) {
  return columnsFor(options)
    .map((column) => `inserted.${column}`)
    .join(", ");
}

function mapClaim(row, options = {}) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);
  const claim = {
    _id: id,
    id,
    match: lowerId(row.matchId),
    listing: lowerId(row.listing),
    claimant: lowerId(row.claimant),
    status: row.status,
    decisionNote: row.decisionNote,
    decidedBy: lowerId(row.decidedBy),
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (options.includeExplanation) {
    claim.explanationCiphertext = row.explanationCiphertext;
  }

  return claim;
}

// Adds `evidenceImages` (in upload order) to each claim. The stored blob name is
// exposed as `storedName`, the same field the evidence crypto helpers use.
async function attachEvidence(claims) {
  const byId = new Map(claims.map((claim) => [claim._id, claim]));

  for (const claim of claims) {
    claim.evidenceImages = [];
  }

  for (const part of chunk(claims.map((claim) => claim._id))) {
    if (part.length === 0) {
      continue;
    }

    const { sql: placeholders, params } = inList("c", part);
    const rows = await query(
      `SELECT claimId, blobName, mimeType, sizeBytes, iv, authTag FROM dbo.ClaimEvidence
       WHERE claimId IN (${placeholders}) ORDER BY claimId, idx`,
      params
    );

    for (const row of rows) {
      byId.get(lowerId(row.claimId)).evidenceImages.push({
        storedName: row.blobName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        iv: row.iv,
        authTag: row.authTag,
      });
    }
  }

  return claims;
}

async function finish(claims, options) {
  if (options.includeEvidence) {
    await attachEvidence(claims);
  }

  return claims;
}

// Creates a claim and its evidence rows in one transaction.
async function create(input) {
  const images = Array.isArray(input.evidenceImages) ? input.evidenceImages.slice(0, 2) : [];

  const created = await withTransaction(async (tx) => {
    const rows = await tx.query(
      `INSERT INTO dbo.Claims (matchId, listing, claimant, explanationCiphertext)
       OUTPUT ${outputList({})}
       VALUES (@matchId, @listing, @claimant, @explanation)`,
      {
        matchId: idOf(input.match),
        listing: idOf(input.listing),
        claimant: idOf(input.claimant),
        explanation: input.explanationCiphertext,
      }
    );
    const claim = mapClaim(rows[0]);

    for (const [index, image] of images.entries()) {
      await tx.query(
        `INSERT INTO dbo.ClaimEvidence (claimId, idx, blobName, mimeType, sizeBytes, iv, authTag)
         VALUES (@claimId, @idx, @blobName, @mimeType, @sizeBytes, @iv, @authTag)`,
        {
          claimId: claim._id,
          idx: index,
          blobName: image.storedName,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          iv: image.iv,
          authTag: image.authTag,
        }
      );
    }

    return claim;
  });

  created.evidenceImages = images.map((image) => ({ ...image }));
  return created;
}

async function findById(id, options = {}) {
  const rows = await query(`SELECT ${selectList(options)} FROM dbo.Claims c WHERE c.id = @id`, {
    id: idOf(id),
  });
  const claims = rows.map((row) => mapClaim(row, options));
  await finish(claims, options);
  return claims[0] || null;
}

async function findByListing(listingId, options = {}) {
  const rows = await query(
    `SELECT ${selectList(options)} FROM dbo.Claims c
     WHERE c.listing = @listingId ORDER BY c.createdAt ASC`,
    { listingId: idOf(listingId) }
  );
  return finish(rows.map((row) => mapClaim(row, options)), options);
}

async function findByClaimant(userId, options = {}) {
  const rows = await query(
    `SELECT ${selectList(options)} FROM dbo.Claims c
     WHERE c.claimant = @userId ORDER BY c.createdAt DESC`,
    { userId: idOf(userId) }
  );
  return finish(rows.map((row) => mapClaim(row, options)), options);
}

// Statuses of this claimant's earlier claims for a match that still count
// toward the one-claim-per-match rule.
async function findPriorStatuses(matchId, claimantId) {
  const rows = await query(
    `SELECT status FROM dbo.Claims
     WHERE matchId = @matchId AND claimant = @claimantId
       AND status IN ('pending', 'approved', 'rejected')`,
    { matchId: idOf(matchId), claimantId: idOf(claimantId) }
  );
  return rows.map((row) => row.status);
}

async function findLatestApprovedForListing(listingId) {
  const rows = await query(
    `SELECT TOP (1) ${selectList({})} FROM dbo.Claims c
     WHERE c.listing = @listingId AND c.status = 'approved' ORDER BY c.decidedAt DESC`,
    { listingId: idOf(listingId) }
  );
  return mapClaim(rows[0]);
}

// Approved claims (message threads) the user takes part in, as claimant or as
// the owner of the claimed listing.
async function listApprovedThreadsForUser(userId, { limit = 100 } = {}) {
  const rows = await query(
    `SELECT TOP (@limit) ${selectList({})} FROM dbo.Claims c
     WHERE c.status = 'approved'
       AND (c.claimant = @userId
            OR c.listing IN (SELECT id FROM dbo.Listings WHERE createdBy = @userId))
     ORDER BY c.decidedAt DESC`,
    { userId: idOf(userId), limit }
  );
  return rows.map((row) => mapClaim(row));
}

// Approved claims that have an open or in-review report (moderator view).
async function listApprovedThreadsUnderReport({ limit = 100 } = {}) {
  const rows = await query(
    `SELECT TOP (@limit) ${selectList({})} FROM dbo.Claims c
     WHERE c.status = 'approved'
       AND c.id IN (SELECT claim FROM dbo.Reports
                    WHERE status IN ('open', 'reviewing') AND claim IS NOT NULL)
     ORDER BY c.decidedAt DESC`,
    { limit }
  );
  return rows.map((row) => mapClaim(row));
}

function decisionParams(id, decision) {
  return {
    id: idOf(id),
    decidedBy: optionalId(decision.decidedBy),
    decidedAt: decision.decidedAt || new Date(),
    decisionNote: decision.decisionNote || "",
  };
}

// Conditional rejection: only a pending claim can be rejected. Returns the
// updated claim or null when the condition did not hold.
async function reject(id, decision, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Claims SET status = 'rejected', decidedBy = @decidedBy, decidedAt = @decidedAt,
       decisionNote = @decisionNote, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})}
     WHERE id = @id AND status = 'pending'`,
    decisionParams(id, decision)
  );
  return mapClaim(rows[0]);
}

// Conditional approval: only a pending or previously rejected claim.
async function approve(id, decision, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Claims SET status = 'approved', decidedBy = @decidedBy, decidedAt = @decidedAt,
       decisionNote = @decisionNote, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})}
     WHERE id = @id AND status IN ('pending', 'rejected')`,
    decisionParams(id, decision)
  );
  return mapClaim(rows[0]);
}

// Closes every other pending claim for the listing. Returns the closed claims.
async function closeCompetingPending(listingId, exceptClaimId, decision, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Claims SET status = 'closed', decidedBy = @decidedBy, decidedAt = @decidedAt,
       decisionNote = @decisionNote, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})}
     WHERE listing = @listingId AND status = 'pending' AND id <> @exceptId`,
    {
      listingId: idOf(listingId),
      exceptId: idOf(exceptClaimId),
      decidedBy: optionalId(decision.decidedBy),
      decidedAt: decision.decidedAt || new Date(),
      decisionNote: decision.decisionNote || "",
    }
  );
  return rows.map((row) => mapClaim(row));
}

async function count() {
  const rows = await query("SELECT COUNT(*) AS total FROM dbo.Claims");
  return rows[0].total;
}

module.exports = {
  approve,
  closeCompetingPending,
  count,
  create,
  findById,
  findByClaimant,
  findByListing,
  findLatestApprovedForListing,
  findPriorStatuses,
  listApprovedThreadsForUser,
  listApprovedThreadsUnderReport,
  reject,
};
