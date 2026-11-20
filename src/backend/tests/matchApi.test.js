const request = require("supertest");
const app = require("../app");
const Match = require("../models/Match");
const {
  waitForPendingMatchJobs,
} = require("../services/matchingService");
const { authHeader, createListing, createMatchedPair, createUser } = require("./helpers");

describe("Match API (FR-MATCH-02, FR-MATCH-03)", () => {
  test("returns matches with a 0 to 1 confidence score to the listing owner", async () => {
    const setup = await createMatchedPair();

    const response = await request(app)
      .get(`/api/v1/listings/${setup.lost._id}/matches`)
      .set(authHeader(setup.claimant));

    expect(response.statusCode).toBe(200);
    expect(response.body.matches).toHaveLength(1);
    expect(response.body.matches[0].score).toBeGreaterThan(0);
    expect(response.body.matches[0].score).toBeLessThanOrEqual(1);
    expect(response.body.matches[0].yourRole).toBe("lost");
    expect(response.body.matches[0].canClaim).toBe(true);
  });

  test("UT-MATCH-12, UT-PRIV-02 and UT-PRIV-07: scoring factors never appear in any match response", async () => {
    const setup = await createMatchedPair();

    const owner = await request(app)
      .get(`/api/v1/listings/${setup.found._id}/matches`)
      .set(authHeader(setup.finder));
    const mine = await request(app).get("/api/v1/matches").set(authHeader(setup.claimant));
    const single = await request(app)
      .get(`/api/v1/matches/${setup.match._id}`)
      .set(authHeader(setup.claimant));

    for (const body of [owner.text, mine.text, single.text]) {
      expect(body).not.toContain("factors");
      expect(body).not.toContain("shared");
    }
    expect(owner.body.matches[0].yourRole).toBe("found");
    expect(owner.body.matches[0].canClaim).toBe(false);
  });

  test("another user cannot list matches for a listing they do not own", async () => {
    const setup = await createMatchedPair();
    const stranger = await createUser();

    const response = await request(app)
      .get(`/api/v1/listings/${setup.lost._id}/matches`)
      .set(authHeader(stranger));

    expect(response.statusCode).toBe(403);
  });

  test("a single match is visible only to the owners of its two listings", async () => {
    const setup = await createMatchedPair();
    const stranger = await createUser();

    const allowed = await request(app)
      .get(`/api/v1/matches/${setup.match._id}`)
      .set(authHeader(setup.finder));
    const denied = await request(app)
      .get(`/api/v1/matches/${setup.match._id}`)
      .set(authHeader(stranger));

    expect(allowed.statusCode).toBe(200);
    expect(denied.statusCode).toBe(403);
  });

  test("anonymous users cannot read matches", async () => {
    const setup = await createMatchedPair();
    const response = await request(app).get(`/api/v1/matches/${setup.match._id}`);

    expect(response.statusCode).toBe(401);
  });

  test("UT-MATCH-13: creating a Found listing through the API triggers matching and notifies both owners", async () => {
    const lostOwner = await createUser({ emailNotifications: false });
    const finder = await createUser({ emailNotifications: false });
    await createListing(lostOwner, { type: "lost" });

    const response = await request(app)
      .post("/api/v1/listings")
      .set(authHeader(finder))
      .field("type", "found")
      .field("title", "Black AirPods case")
      .field("category", "Electronics")
      .field("description", "Found black AirPods in Willis Library")
      .field("date", "2026-10-01")
      .field("building", "Willis Library")
      .field("zone", "North Campus")
      .attach("images", Buffer.from("img"), { filename: "a.jpg", contentType: "image/jpeg" });

    expect(response.statusCode).toBe(201);

    await waitForPendingMatchJobs();

    expect(await Match.countDocuments({})).toBe(1);

    const Notification = require("../models/Notification");
    expect(await Notification.countDocuments({ user: lostOwner._id, type: "match" })).toBe(1);
    expect(await Notification.countDocuments({ user: finder._id, type: "match" })).toBe(1);
  });
});
