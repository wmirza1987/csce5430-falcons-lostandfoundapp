const request = require("supertest");
const app = require("../app");
const { query } = require("../db/pool");
const usersRepo = require("../repos/users");
const { purgeExpired } = require("../services/retentionService");
const { authHeader, createListing, createMatchedPair, createUser, JPEG_BYTES } = require("./helpers");

const DAY = 24 * 60 * 60 * 1000;

async function approveClaim(setup) {
  const claim = await request(app)
    .post(`/api/v1/matches/${setup.match._id}/claims`)
    .set(authHeader(setup.claimant))
    .field("explanation", "I can describe the engraving on the case.")
    .attach("evidence", JPEG_BYTES, { filename: "p.jpg", contentType: "image/jpeg" });
  const claimId = claim.body.claim.id;
  await request(app).patch(`/api/v1/claims/${claimId}/decision`).set(authHeader(setup.finder)).send({ action: "approve" });
  await request(app).post(`/api/v1/claims/${claimId}/messages`).set(authHeader(setup.claimant)).send({ body: "See you at the desk." });
  return claimId;
}

describe("Account deletion (NFR-PRIV-02)", () => {
  test("requires the correct password", async () => {
    const user = await createUser({ password: "Password123" });
    const none = await request(app).delete("/api/v1/auth/account").set(authHeader(user)).send({});
    const wrong = await request(app).delete("/api/v1/auth/account").set(authHeader(user)).send({ password: "WrongPass999" });
    expect(none.statusCode).toBe(400);
    expect(wrong.statusCode).toBe(401);
    expect((await usersRepo.findById(user._id)).isActive).toBe(true);
  });

  test("disables access immediately and de-identifies the profile", async () => {
    const user = await createUser({ password: "Password123", firstName: "Casey", lastName: "Jones" });
    const listing = await createListing(user, { type: "lost" });

    const response = await request(app).delete("/api/v1/auth/account").set(authHeader(user)).send({ password: "Password123" });
    expect(response.statusCode).toBe(200);

    const row = (await query("SELECT firstName, lastName, email, isActive, passwordResetTokenHash FROM dbo.Users WHERE id = @id", { id: user._id }))[0];
    expect(row.isActive).toBe(false);
    expect(row.firstName).toBe("Deleted");
    expect(row.email).toMatch(/@deleted\.invalid$/);
    expect(JSON.stringify(row)).not.toContain("Casey");
    expect(JSON.stringify(row)).not.toContain(user.email);

    // The old token no longer works and the listing is gone from public browse.
    expect((await request(app).get("/api/v1/auth/profile").set(authHeader(user))).statusCode).toBe(401);
    expect((await request(app).get(`/api/v1/listings/${listing._id}`)).statusCode).toBe(404);

    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "Password123" });
    expect(login.statusCode).toBeGreaterThanOrEqual(400);

    const audit = await query("SELECT detail, action FROM dbo.AuditLogs WHERE action = 'account.deleted' AND targetId = @id", { id: user._id });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(user.email);
  });

  test("administrator accounts cannot be deleted through this route", async () => {
    const admin = await createUser({ role: "admin", password: "Password123" });
    const response = await request(app).delete("/api/v1/auth/account").set(authHeader(admin)).send({ password: "Password123" });
    expect(response.statusCode).toBe(409);
  });
});

describe("Retention purge (NFR-PRIV-02)", () => {
  test("removes resolved content older than 90 days and keeps recent or unresolved content", async () => {
    const oldSetup = await createMatchedPair();
    const oldClaimId = await approveClaim(oldSetup);
    const recentSetup = await createMatchedPair();
    const recentClaimId = await approveClaim(recentSetup);
    const active = await createListing(await createUser(), { type: "lost", title: "Still active" });

    await query("UPDATE dbo.Listings SET updatedAt = DATEADD(DAY, -91, SYSUTCDATETIME()) WHERE id = @id", { id: oldSetup.found._id });

    const totals = await purgeExpired();
    expect(totals.listings).toBe(1);

    const left = async (table, column, id) => (await query(`SELECT COUNT(*) AS n FROM dbo.${table} WHERE ${column} = @id`, { id }))[0].n;
    expect(await left("Listings", "id", oldSetup.found._id)).toBe(0);
    expect(await left("Claims", "id", oldClaimId)).toBe(0);
    expect(await left("Messages", "claim", oldClaimId)).toBe(0);
    expect(await left("ClaimEvidence", "claimId", oldClaimId)).toBe(0);
    expect(await left("Matches", "foundListing", oldSetup.found._id)).toBe(0);

    expect(await left("Listings", "id", recentSetup.found._id)).toBe(1);
    expect(await left("Claims", "id", recentClaimId)).toBe(1);
    expect(await left("Listings", "id", active._id)).toBe(1);
  });

  test("keeps an old resolved listing while a moderation report on it is still open", async () => {
    const setup = await createMatchedPair();
    await approveClaim(setup);
    const reporter = await createUser();
    await request(app)
      .post("/api/v1/reports")
      .set(authHeader(reporter))
      .send({ targetType: "listing", targetId: String(setup.found._id), reason: "This listing needs a moderator." });
    await query("UPDATE dbo.Listings SET updatedAt = DATEADD(DAY, -200, SYSUTCDATETIME()) WHERE id = @id", { id: setup.found._id });

    const totals = await purgeExpired();
    expect(totals.listings).toBe(0);
    expect((await query("SELECT COUNT(*) AS n FROM dbo.Listings WHERE id = @id", { id: setup.found._id }))[0].n).toBe(1);
  });

  test("deletes audit records after one year and keeps newer ones", async () => {
    const { recordAudit, ACTIONS } = require("../services/auditService");
    const actor = await createUser();
    await recordAudit({ actor: actor._id, action: ACTIONS.ROLE_CHANGED, targetType: "user", targetId: actor._id });
    await recordAudit({ actor: actor._id, action: ACTIONS.ROLE_CHANGED, targetType: "user", targetId: actor._id });
    await query(
      "UPDATE TOP (1) dbo.AuditLogs SET createdAt = DATEADD(DAY, -400, SYSUTCDATETIME()) WHERE actor = @id",
      { id: actor._id }
    );
    const totals = await purgeExpired();
    expect(totals.auditLogs).toBe(1);
    expect((await query("SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE actor = @id", { id: actor._id }))[0].n).toBe(1);
  });
});
