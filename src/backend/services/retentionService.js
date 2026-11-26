// NFR-PRIV-02 retention: resolved listings and their claims, messages, matches,
// notifications and stored images are deleted 90 days after resolution; audit
// records (which hold no content) are kept for one year. Anything tied to an
// unresolved moderation case (an open or reviewing report) is kept.
const { query, withTransaction } = require("../db/pool");
const storage = require("./storage");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONTENT_DAYS = 90;
const DEFAULT_AUDIT_DAYS = 365;
const BATCH_SIZE = 100;

function idParams(ids) {
  const params = {};
  const names = ids.map((id, index) => {
    params[`i${index}`] = id;
    return `@i${index}`;
  });
  return { list: names.join(","), params };
}

function parseImages(json) {
  try {
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : [];
  } catch (error) {
    return [];
  }
}

// Deletes one batch of expired resolved listings. Returns how many were removed.
async function purgeBatch(cutoff) {
  const expired = await query(
    `SELECT TOP (${BATCH_SIZE}) l.id, l.imagesJson FROM dbo.Listings l
     WHERE l.status = 'resolved' AND l.updatedAt < @cutoff
       AND NOT EXISTS (
         SELECT 1 FROM dbo.Reports r
         WHERE r.status IN ('open','reviewing')
           AND (r.listing = l.id OR r.targetId = l.id
                OR r.claim IN (SELECT c.id FROM dbo.Claims c WHERE c.listing = l.id)))`,
    { cutoff }
  );

  if (expired.length === 0) {
    return { listings: 0, listingBlobs: [], evidenceBlobs: [] };
  }

  const ids = expired.map((row) => row.id);
  const { list, params } = idParams(ids);
  const listingBlobs = expired.flatMap((row) => parseImages(row.imagesJson));

  const evidence = await query(
    `SELECT e.blobName FROM dbo.ClaimEvidence e
     JOIN dbo.Claims c ON c.id = e.claimId WHERE c.listing IN (${list})`,
    params
  );
  const evidenceBlobs = evidence.map((row) => row.blobName);

  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM dbo.Messages WHERE listing IN (${list})`, params);
    await tx.query(
      `DELETE FROM dbo.ClaimEvidence WHERE claimId IN (SELECT id FROM dbo.Claims WHERE listing IN (${list}))`,
      params
    );
    await tx.query(`DELETE FROM dbo.Reports WHERE status = 'resolved' AND (listing IN (${list}) OR targetId IN (${list}))`, params);
    await tx.query(`DELETE FROM dbo.Claims WHERE listing IN (${list})`, params);
    await tx.query(`DELETE FROM dbo.Matches WHERE lostListing IN (${list}) OR foundListing IN (${list})`, params);
    await tx.query(`DELETE FROM dbo.Notifications WHERE listing IN (${list})`, params);
    await tx.query(`DELETE FROM dbo.Listings WHERE id IN (${list})`, params);
  });

  return { listings: ids.length, listingBlobs, evidenceBlobs };
}

async function removeBlobs(container, names) {
  let removed = 0;

  for (const name of names) {
    try {
      await storage.remove(container, name);
      removed += 1;
    } catch (error) {
      // A blob that is already gone is fine; the row is what matters.
    }
  }

  return removed;
}

async function purgeExpired({ now = new Date(), contentDays = DEFAULT_CONTENT_DAYS, auditDays = DEFAULT_AUDIT_DAYS } = {}) {
  const contentCutoff = new Date(now.getTime() - contentDays * DAY_MS);
  const auditCutoff = new Date(now.getTime() - auditDays * DAY_MS);
  const totals = { listings: 0, images: 0, evidence: 0, auditLogs: 0 };

  for (;;) {
    const batch = await purgeBatch(contentCutoff);

    if (batch.listings === 0) {
      break;
    }

    totals.listings += batch.listings;
    totals.images += await removeBlobs("listings", batch.listingBlobs);
    totals.evidence += await removeBlobs("evidence", batch.evidenceBlobs);
  }

  const audit = await query(
    "DELETE FROM dbo.AuditLogs OUTPUT deleted.id WHERE createdAt < @cutoff",
    { cutoff: auditCutoff }
  );
  totals.auditLogs = audit.length;

  return totals;
}

// Runs the purge once shortly after start and then daily. Failures are logged and
// never stop the server. The timer is unref'd so it cannot keep a process alive.
function startRetentionJob({ intervalMs = DAY_MS } = {}) {
  const run = () =>
    purgeExpired()
      .then((totals) => {
        if (totals.listings > 0 || totals.auditLogs > 0) {
          console.log(`Retention purge removed ${totals.listings} listings and ${totals.auditLogs} audit records.`);
        }
      })
      .catch((error) => console.error(`Retention purge failed: ${error.message}`));

  setTimeout(run, 60 * 1000).unref();
  setInterval(run, intervalMs).unref();
}

module.exports = { purgeExpired, startRetentionJob };
