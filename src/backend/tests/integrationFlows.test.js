// Phase 2 end to end flows from the D4 test catalog (INT-01 to INT-24). These run
// through the real HTTP API and the database; only the email provider is mocked.
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
const notificationsRepo = require("../repos/notifications");
const usersRepo = require("../repos/users");
const emailService = require("../services/emailService");
const { retryFailedEmails } = require("../services/notificationService");
const { waitForPendingMatchJobs } = require("../services/matchingService");
const { JPEG_BYTES, authHeader, createUser, createMatchedPair } = require("./helpers");

const EXPLANATION = "The case has my initials engraved and a scratch on the lid.";

beforeEach(() => {
  emailService.sendNotificationEmail.mockReset();
  emailService.sendNotificationEmail.mockResolvedValue({ delivered: true, attempts: 1 });
});

function postListing(user, fields, withPhoto) {
  let req = request(app).post("/api/v1/listings").set(authHeader(user));
  for (const [key, value] of Object.entries(fields)) {
    req = req.field(key, value);
  }
  if (withPhoto) {
    req = req.attach("images", JPEG_BYTES, { filename: "item.jpg", contentType: "image/jpeg" });
  }
  return req;
}

const LOST = {
  type: "lost",
  title: "Black AirPods",
  category: "Electronics",
  description: "Lost black AirPods near Willis Library",
  date: "2026-10-01",
  building: "Willis Library",
  zone: "North Campus",
  privateDetails: "Engraved initials JD on the case",
};
const FOUND = {
  type: "found",
  title: "Black AirPods case",
  category: "Electronics",
  description: "Found black AirPods in Willis Library",
  date: "2026-10-01",
  building: "Willis Library",
  zone: "North Campus",
  privateDetails: "Engraved initials JD on the case",
};

async function matchedThroughApi({ emailLost = false } = {}) {
  const lostOwner = await createUser();
  const finder = await createUser();
  if (emailLost) {
    await usersRepo.setEmailNotifications(lostOwner._id, true);
  }
  expect((await postListing(lostOwner, LOST, false)).statusCode).toBe(201);
  await waitForPendingMatchJobs();
  const found = await postListing(finder, FOUND, true);
  expect(found.statusCode).toBe(201);
  await waitForPendingMatchJobs();

  const matches = await request(app).get("/api/v1/matches").set(authHeader(lostOwner));
  expect(matches.statusCode).toBe(200);
  const match = matches.body.matches[0];
  return { lostOwner, finder, match, foundId: found.body.listing.id || found.body.listing._id };
}

function claim(user, matchId, text = EXPLANATION) {
  return request(app).post(`/api/v1/matches/${matchId}/claims`).set(authHeader(user)).field("explanation", text);
}

function decide(user, claimId, action) {
  return request(app).patch(`/api/v1/claims/${claimId}/decision`).set(authHeader(user)).send({ action });
}

function say(user, claimId, body) {
  return request(app).post(`/api/v1/claims/${claimId}/messages`).set(authHeader(user)).send({ body });
}

describe("Match to claim to messaging flows", () => {
  test("INT-01 and INT-05: a new listing runs matching, notifies both owners, and the notice links to the claim form", async () => {
    const { lostOwner, finder, match } = await matchedThroughApi({ emailLost: true });

    expect(await notificationsRepo.countForUser(lostOwner._id, "match")).toBe(1);
    expect(await notificationsRepo.countForUser(finder._id, "match")).toBe(1);

    const notice = (await notificationsRepo.listForUser(lostOwner._id)).find((item) => item.type === "match");
    expect(notice.actionPath).toBe(`/matches/${match.id || match._id}/claim`);

    const mail = emailService.sendNotificationEmail.mock.calls.map((call) => call[0]).find((m) => m.to === lostOwner.email);
    expect(mail.text).toContain(notice.actionPath);
  });

  test("INT-02: the claimant follows the notification to submit a claim and the owner is notified", async () => {
    const { lostOwner, finder, match } = await matchedThroughApi();
    const response = await claim(lostOwner, match.id || match._id);
    expect(response.statusCode).toBe(201);
    expect(await notificationsRepo.countForUser(finder._id, "claim")).toBe(1);
  });

  test("INT-03: approval opens a thread where both parties can write", async () => {
    const { lostOwner, finder, match } = await matchedThroughApi();
    const claimId = (await claim(lostOwner, match.id || match._id)).body.claim.id;
    expect((await decide(finder, claimId, "approve")).statusCode).toBe(200);
    expect((await say(lostOwner, claimId, "Hello, when can I collect it?")).statusCode).toBe(201);
    expect((await say(finder, claimId, "Tomorrow at the library desk.")).statusCode).toBe(201);
  });

  test("INT-06 and INT-24: match, claim with evidence, approval, messages and notifications in one run", async () => {
    const { lostOwner, finder, match, foundId } = await matchedThroughApi();

    const submitted = await request(app)
      .post(`/api/v1/matches/${match.id || match._id}/claims`)
      .set(authHeader(lostOwner))
      .field("explanation", EXPLANATION)
      .attach("evidence", JPEG_BYTES, { filename: "proof.jpg", contentType: "image/jpeg" });
    expect(submitted.statusCode).toBe(201);
    const claimId = submitted.body.claim.id;

    const approved = await decide(finder, claimId, "approve");
    expect(approved.statusCode).toBe(200);
    expect(approved.body.listingStatus).toBe("resolved");

    await say(lostOwner, claimId, "Thank you, I will pick it up.");
    const final = await say(finder, claimId, "See you at the desk.");
    expect(final.statusCode).toBe(201);

    const thread = await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(lostOwner));
    expect(thread.body.messages.at(-1).body).toBe("See you at the desk.");

    const status = (await query("SELECT status FROM dbo.Listings WHERE id = @id", { id: foundId }))[0].status;
    expect(status).toBe("resolved");
    expect(await notificationsRepo.countForUser(finder._id, "claim")).toBe(1);
    expect(await notificationsRepo.countForUser(lostOwner._id, "claim_decision")).toBe(1);
    expect(await notificationsRepo.countForUser(lostOwner._id, "match")).toBe(1);
  });
});

describe("Privacy and authorization across the flow", () => {
  test("INT-08: only the participants can read claim evidence; an outsider gets none", async () => {
    const { lostOwner, finder, match } = await matchedThroughApi();
    const claimId = (await claim(lostOwner, match.id || match._id)).body.claim.id;
    const outsider = await createUser();

    const owner = await request(app).get(`/api/v1/claims/${claimId}`).set(authHeader(finder));
    expect(owner.statusCode).toBe(200);
    expect(JSON.stringify(owner.body)).toContain("scratch on the lid");

    const denied = await request(app).get(`/api/v1/claims/${claimId}`).set(authHeader(outsider));
    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain("scratch on the lid");
  });

  test("INT-09: private details stay out of notifications and public listings but remain stored", async () => {
    const { lostOwner, finder, foundId } = await matchedThroughApi();

    for (const user of [lostOwner, finder]) {
      const notices = await notificationsRepo.listForUser(user._id);
      expect(JSON.stringify(notices)).not.toContain("Engraved initials");
    }
    const publicView = await request(app).get(`/api/v1/listings/${foundId}`);
    expect(JSON.stringify(publicView.body)).not.toContain("Engraved initials");
    const stored = (await query("SELECT privateDetails FROM dbo.Listings WHERE id = @id", { id: foundId }))[0];
    expect(stored.privateDetails).toContain("Engraved initials");
  });

  test("INT-10 and INT-12: participants read and write the thread; a third party can do neither", async () => {
    const setup = await createMatchedPair();
    const claimId = (await claim(setup.claimant, setup.match._id)).body.claim.id;
    await decide(setup.finder, claimId, "approve");
    const outsider = await createUser();

    expect((await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(setup.claimant))).statusCode).toBe(200);
    expect((await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(setup.finder))).statusCode).toBe(200);
    expect((await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(outsider))).statusCode).toBe(403);
    expect((await say(outsider, claimId, "Let me in")).statusCode).toBe(403);
  });

  test("INT-11: an unverified user cannot claim and a verified user can", async () => {
    const setup = await createMatchedPair();
    await query("UPDATE dbo.Users SET isEmailVerified = 0 WHERE id = @id", { id: setup.claimant._id });
    expect((await claim(setup.claimant, setup.match._id)).statusCode).toBe(403);
    await query("UPDATE dbo.Users SET isEmailVerified = 1 WHERE id = @id", { id: setup.claimant._id });
    expect((await claim(setup.claimant, setup.match._id)).statusCode).toBe(201);
  });
});

describe("Forms and reliability", () => {
  test("INT-18: the claim endpoint reports a specific error for a blank description and for a bad image", async () => {
    const setup = await createMatchedPair();
    const blank = await claim(setup.claimant, setup.match._id, "   ");
    expect(blank.statusCode).toBe(400);
    expect(blank.body.message).toMatch(/description|explanation|evidence/i);

    const badImage = await request(app)
      .post(`/api/v1/matches/${setup.match._id}/claims`)
      .set(authHeader(setup.claimant))
      .field("explanation", EXPLANATION)
      .attach("evidence", Buffer.from("not an image"), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(badImage.statusCode).toBe(400);
    expect(badImage.body.message).toMatch(/image|JPEG|PNG|WebP/i);
  });

  test("INT-19: a 1000 character message is accepted and appears in the thread", async () => {
    const setup = await createMatchedPair();
    const claimId = (await claim(setup.claimant, setup.match._id)).body.claim.id;
    await decide(setup.finder, claimId, "approve");
    const long = "a".repeat(1000);
    expect((await say(setup.claimant, claimId, long)).statusCode).toBe(201);
    const view = await request(app).get(`/api/v1/claims/${claimId}/messages`).set(authHeader(setup.finder));
    expect(view.body.messages.at(-1).body).toBe(long);
  });

  test("INT-22: a notification email that failed is delivered by the retry run", async () => {
    const user = await createUser({ emailNotifications: true });
    emailService.sendNotificationEmail.mockRejectedValueOnce(new Error("provider unavailable"));
    const { createNotification } = require("../services/notificationService");
    const notice = await createNotification({ userId: user._id, type: "match", message: "Possible match" });
    expect((await notificationsRepo.findById(notice._id)).emailStatus).toBe("failed");

    emailService.sendNotificationEmail.mockResolvedValue({ delivered: true, attempts: 1 });
    await retryFailedEmails();
    expect((await notificationsRepo.findById(notice._id)).emailStatus).toBe("sent");
  });
});
