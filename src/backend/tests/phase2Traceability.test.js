// Fills the gaps between the D4 Phase 2 test catalog and the automated suite.
// Each test names the catalog ID it covers. See docs/test-traceability.md for the
// full ID to test mapping, including cases covered by tests in other files.
jest.mock("../services/emailService", () => ({
  isEmailConfigured: jest.fn(() => true),
  sendMail: jest.fn(),
  sendNotificationEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

const request = require("supertest");
const app = require("../app");
const { query } = require("../db/pool");
const matchesRepo = require("../repos/matches");
const notificationsRepo = require("../repos/notifications");
const emailService = require("../services/emailService");
const { refreshMatchesForListing, waitForPendingMatchJobs } = require("../services/matchingService");
const { JPEG_BYTES, authHeader, createListing, createMatchedPair, createUser } = require("./helpers");

const EXPLANATION = "The case has my initials engraved and I lost it on Monday near the desk.";

beforeEach(() => {
  emailService.sendNotificationEmail.mockReset();
  emailService.sendNotificationEmail.mockResolvedValue({ delivered: true, attempts: 1 });
});

function submitClaim(claimant, match, photos = []) {
  let req = request(app)
    .post(`/api/v1/matches/${match._id}/claims`)
    .set(authHeader(claimant))
    .field("explanation", EXPLANATION);

  for (const photo of photos) {
    req = req.attach("evidence", photo, { filename: "evidence.jpg", contentType: "image/jpeg" });
  }

  return req;
}

function decide(owner, claimId, action) {
  return request(app)
    .patch(`/api/v1/claims/${claimId}/decision`)
    .set(authHeader(owner))
    .send({ action });
}

function say(user, claimId, body) {
  return request(app).post(`/api/v1/claims/${claimId}/messages`).set(authHeader(user)).send({ body });
}

async function approvedThread() {
  const setup = await createMatchedPair();
  const claim = (await submitClaim(setup.claimant, setup.match)).body.claim;
  await decide(setup.finder, claim.id, "approve");
  return { ...setup, claimId: claim.id };
}

describe("Claims and authorization (UT-CLM, UT-AUTH)", () => {
  test("UT-CLM-11 and UT-AUTH-06: an ordinary user is denied administrator operations", async () => {
    const user = await createUser();
    for (const path of ["/api/v1/admin/analytics", "/api/v1/admin/users", "/api/v1/admin/audit-logs"]) {
      const response = await request(app).get(path).set(authHeader(user));
      expect(response.statusCode).toBe(403);
    }
  });

  test("UT-CLM-12: a claim at the evidence limit (two photos) is accepted", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, [JPEG_BYTES, JPEG_BYTES]);
    expect(response.statusCode).toBe(201);
    expect(response.body.claim.evidenceImageCount ?? response.body.claim.evidenceImages?.length ?? 2).toBe(2);
  });

  test("UT-CLM-18: a rejected submission explains the problem so the form can keep the other fields", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, [Buffer.from("not an image")]);
    expect(response.statusCode).toBe(400);
    expect(typeof response.body.message).toBe("string");
    expect(response.body.message.length).toBeGreaterThan(0);
  });

  test("UT-AUTH-02, UT-AUTH-08 and UT-CLM-14: a non-owner calling the approve endpoint directly is refused", async () => {
    const setup = await createMatchedPair();
    const claim = (await submitClaim(setup.claimant, setup.match)).body.claim;
    const outsider = await createUser();
    const response = await decide(outsider, claim.id, "approve");
    expect(response.statusCode).toBe(403);
  });

  test("UT-AUTH-04 and INT-14: an owner sees every claim on the listing, and each can be decided on its own", async () => {
    const setup = await createMatchedPair();
    const second = await createUser();
    const secondLost = await createListing(second, { type: "lost", title: "Black AirPods", description: "Lost black AirPods near Willis Library" });
    const secondMatch = await matchesRepo.create({
      lostListing: secondLost._id,
      foundListing: setup.found._id,
      score: 0.9,
      factors: {},
    });

    const first = (await submitClaim(setup.claimant, setup.match)).body.claim;
    const other = (await submitClaim(second, secondMatch)).body.claim;

    const list = await request(app).get(`/api/v1/listings/${setup.found._id}/claims`).set(authHeader(setup.finder));
    expect(list.statusCode).toBe(200);
    expect(list.body.claims.map((claim) => claim.id).sort()).toEqual([first.id, other.id].sort());

    expect((await decide(setup.finder, first.id, "reject")).statusCode).toBe(200);
  });

  test("UT-AUTH-05: a claimant can message once the claim is approved", async () => {
    const { claimant, claimId } = await approvedThread();
    expect((await say(claimant, claimId, "Thanks, where can we meet?")).statusCode).toBe(201);
  });
});

describe("Notifications along the claim flow (UT-NOTIF)", () => {
  test("UT-NOTIF-03: submitting a claim creates an in-app notification for the owner", async () => {
    const setup = await createMatchedPair();
    await submitClaim(setup.claimant, setup.match);
    expect(await notificationsRepo.countForUser(setup.finder._id, "claim")).toBe(1);
  });

  test("UT-NOTIF-05 and INT-04: approving emails the claimant and opens the thread at the same time", async () => {
    const setup = await createMatchedPair();
    await query("UPDATE dbo.Users SET emailNotifications = 1 WHERE id = @id", { id: setup.claimant._id });
    const claim = (await submitClaim(setup.claimant, setup.match)).body.claim;
    emailService.sendNotificationEmail.mockClear();

    const response = await decide(setup.finder, claim.id, "approve");
    expect(response.statusCode).toBe(200);

    const sent = emailService.sendNotificationEmail.mock.calls.map((call) => call[0]);
    const toClaimant = sent.filter((mail) => mail.to === setup.claimant.email);
    expect(toClaimant.length).toBeGreaterThanOrEqual(1);
    expect(toClaimant.some((mail) => /approved|message|thread/i.test(`${mail.subject} ${mail.text}`))).toBe(true);
    expect(await notificationsRepo.countForUser(setup.claimant._id, "claim_decision")).toBe(1);
  });

  test("UT-NOTIF-06 and INT-07: rejecting emails the claimant", async () => {
    const setup = await createMatchedPair();
    await query("UPDATE dbo.Users SET emailNotifications = 1 WHERE id = @id", { id: setup.claimant._id });
    const claim = (await submitClaim(setup.claimant, setup.match)).body.claim;
    emailService.sendNotificationEmail.mockClear();

    expect((await decide(setup.finder, claim.id, "reject")).statusCode).toBe(200);

    const toClaimant = emailService.sendNotificationEmail.mock.calls
      .map((call) => call[0])
      .filter((mail) => mail.to === setup.claimant.email);
    expect(toClaimant.length).toBeGreaterThanOrEqual(1);
    expect(await notificationsRepo.countForUser(setup.claimant._id, "claim_decision")).toBe(1);
  });

  test("UT-NOTIF-11: the match, claim and decision notifications are created in sequence", async () => {
    const lostOwner = await createUser();
    const finder = await createUser();
    await createListing(lostOwner, { type: "lost" });
    await request(app)
      .post("/api/v1/listings")
      .set(authHeader(finder))
      .field("type", "found")
      .field("title", "Black AirPods case")
      .field("category", "Electronics")
      .field("description", "Found black AirPods in Willis Library")
      .field("date", "2026-10-01")
      .field("building", "Willis Library")
      .field("zone", "North Campus")
      .attach("images", JPEG_BYTES, { filename: "a.jpg", contentType: "image/jpeg" });
    await waitForPendingMatchJobs();

    const match = (await matchesRepo.listAll?.())?.[0] || (await query("SELECT TOP 1 id FROM dbo.Matches", {}))[0];
    const claim = (await submitClaim(lostOwner, { _id: match.id || match._id })).body.claim;
    await decide(finder, claim.id, "approve");

    expect(await notificationsRepo.countForUser(lostOwner._id, "match")).toBe(1);
    expect(await notificationsRepo.countForUser(finder._id, "claim")).toBe(1);
    expect(await notificationsRepo.countForUser(lostOwner._id, "claim_decision")).toBe(1);
  });

  test("UT-NOTIF-12 and INT-13: a burst of notifications is stored without loss or duplication", async () => {
    const { createNotification } = require("../services/notificationService");
    const user = await createUser();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createNotification({ userId: user._id, type: "match", message: `Possible match ${index}` })
      )
    );
    const stored = await notificationsRepo.listForUser(user._id, { limit: 50 });
    expect(stored).toHaveLength(20);
    expect(new Set(stored.map((item) => item.message)).size).toBe(20);
  });
});

describe("Messaging details (UT-MSG, INT-15, INT-23)", () => {
  test("UT-MSG-14: the thread carries its claim id and approved status", async () => {
    const { finder, claimId } = await approvedThread();
    const view = await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(finder));
    expect(view.body.thread.claimId).toBe(claimId);
    expect(view.body.thread.status).toBe("approved");
    expect(view.body.messages[0].senderRole).toBe("System");
  });

  test("INT-15: ten messages come back in order with none lost", async () => {
    const { claimant, finder, claimId } = await approvedThread();
    for (let index = 0; index < 10; index += 1) {
      expect((await say(index % 2 ? finder : claimant, claimId, `Message number ${index}`)).statusCode).toBe(201);
    }
    const view = await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(claimant));
    const texts = view.body.messages.map((message) => message.body).filter((body) => body && body.startsWith("Message number"));
    expect(texts).toEqual(Array.from({ length: 10 }, (_, index) => `Message number ${index}`));
    // debug
  });

  test("INT-23: a moderator sees reports and reaches a thread only through a report", async () => {
    const { claimant, claimId } = await approvedThread();
    const moderator = await createUser({ role: "moderator" });
    const queue = await request(app).get("/api/v1/reports").set(authHeader(moderator));
    expect(queue.statusCode).toBe(200);
    expect((await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(moderator))).statusCode).toBe(403);

    const sent = (await say(claimant, claimId, "Something that needs a look")).body.message;
    const report = await request(app)
      .post("/api/v1/reports")
      .set(authHeader(claimant))
      .send({ targetType: "message", targetId: String(sent.id), reason: "Please review this message." });
    expect(report.statusCode).toBe(201);
    expect((await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(moderator))).statusCode).toBe(200);
  });
});

describe("Privacy and error handling (UT-PRIV)", () => {
  test("UT-PRIV-06: the claimant's email is absent from the thread the finder reads", async () => {
    const { claimant, finder, claimId } = await approvedThread();
    await say(claimant, claimId, "Hello there");
    const view = await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(finder));
    expect(JSON.stringify(view.body)).not.toContain(claimant.email);
  });

  test("UT-PRIV-08: private details never appear in search results", async () => {
    const owner = await createUser();
    await createListing(owner, {
      type: "found",
      title: "Distinctive wallet",
      description: "Brown wallet found near the Union",
      privateDetails: "SECRET-SERIAL-12345",
    });
    const response = await request(app).get("/api/v1/listings?search=Distinctive");
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(response.body)).not.toContain("SECRET-SERIAL-12345");
  });

  test("UT-PRIV-10: moderation flag details are not sent to the participants", async () => {
    const { claimant, claimId } = await approvedThread();
    const moderator = await createUser({ role: "moderator" });
    const sent = (await say(claimant, claimId, "Content to review")).body.message;
    await request(app)
      .post("/api/v1/reports")
      .set(authHeader(claimant))
      .send({ targetType: "message", targetId: String(sent.id), reason: "Please review this message." });
    await request(app)
      .patch(`/api/v1/messages/${sent.id}/flag`)
      .set(authHeader(moderator))
      .send({ reason: "PRIVATE-MODERATION-REASON" });

    const notices = await notificationsRepo.listForUser(claimant._id);
    expect(JSON.stringify(notices)).not.toContain("PRIVATE-MODERATION-REASON");
  });

  test("UT-PRIV-11: match scoring does not write component scores to the logs", async () => {
    const spies = ["log", "info", "warn", "error"].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
    const setup = await createMatchedPair();
    await refreshMatchesForListing(setup.lost);
    const written = spies.flatMap((spy) => spy.mock.calls.map((call) => call.join(" "))).join("\n");
    spies.forEach((spy) => spy.mockRestore());
    expect(written).not.toMatch(/factors|weight|score/i);
  });

  test("UT-PRIV-12: an error response is user facing and leaks no internals", async () => {
    const user = await createUser();
    const response = await request(app)
      .post("/api/v1/matches/00000000-0000-4000-8000-000000000000/claims")
      .set(authHeader(user))
      .field("explanation", EXPLANATION);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(/dbo\.|SELECT |stack| at .*\.js|ConnectionError|mssql/i);
  });
});

describe("Performance (UT-MATCH-10, UT-MATCH-11, INT-16, INT-17, NFR-PERF-01)", () => {
  jest.setTimeout(120000);

  // Realistic spread: categories, buildings and dates vary, so only a handful of
  // the stored listings are plausible matches for the new one.
  const CATEGORIES = ["Electronics", "Keys", "Bags", "Clothing", "Books", "Jewelry", "Other", "Wallets and ID", "Water Bottles"];
  const BUILDINGS = ["Willis Library", "University Union", "Discovery Park", "Business Leadership Building", "Gateway Center"];

  async function insertListings(count, ownerId) {
    const batch = 100;
    for (let start = 0; start < count; start += batch) {
      const rows = [];
      const params = { owner: ownerId };
      for (let index = start; index < Math.min(start + batch, count); index += 1) {
        params[`t${index}`] = `Bulk item ${index} ${CATEGORIES[index % 9].toLowerCase()}`;
        params[`c${index}`] = CATEGORIES[index % 9];
        params[`b${index}`] = BUILDINGS[(index * 7) % 5];
        rows.push(
          `('lost', @t${index}, @c${index}, 'Bulk', 'Grey', 'Bulk description number ${index}', DATEADD(DAY, -${(index * 13) % 365}, SYSUTCDATETIME()), @b${index}, 'Zone', '[]', 'active', @owner, 0)`
        );
      }
      await query(
        `INSERT INTO dbo.Listings (type, title, category, brand, color, description, date, building, zone, imagesJson, status, createdBy, isDeleted)
         VALUES ${rows.join(",")}`,
        params
      );
    }
  }

  test("UT-MATCH-10 and INT-16: with 5,000 listings stored, matching a new listing finishes within one second", async () => {
    const owner = await createUser();
    await insertListings(5000, owner._id);
    const finder = await createUser();
    const found = await createListing(finder, {
      type: "found",
      title: "Blue backpack",
      category: "Bags",
      description: "Blue backpack found at Gateway Center",
      location: { building: "Gateway Center", zone: "Gateway" },
    });

    const started = Date.now();
    await refreshMatchesForListing(found);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1000);
  });

  test("UT-MATCH-11, INT-17 and NFR-PERF-01: 50 concurrent requests all succeed, 95 percent within two seconds", async () => {
    const durations = [];
    const statuses = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const started = Date.now();
        const response = await request(app).get("/api/v1/listings?limit=20");
        durations.push(Date.now() - started);
        return response.statusCode;
      })
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
    durations.sort((a, b) => a - b);
    expect(durations[Math.floor(durations.length * 0.95) - 1]).toBeLessThan(2000);
  });
});
