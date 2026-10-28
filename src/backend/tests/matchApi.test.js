const request = require("supertest");
const app = require("../app");
const { refreshMatchesForListing } = require("../services/matchingService");
const {
  authHeader,
  createListing,
  createUser,
} = require("./helpers");

describe("Match API", () => {
  test("returns explainable matches only to the listing owner", async () => {
    const owner = await createUser();
    const other = await createUser();

    const lost = await createListing(owner, {
      type: "lost",
      title: "Black AirPods",
      description: "Lost black AirPods near Willis Library",
    });

    await createListing(owner, {
      type: "found",
      title: "Found AirPods",
      description: "Found black AirPods in Willis Library",
      privateDetails: "Serial suffix 9999",
    });

    await refreshMatchesForListing(lost._id);

    const ownerResponse = await request(app)
      .get(`/api/v1/listings/${lost._id}/matches`)
      .set(authHeader(owner));

    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.body.matches).toHaveLength(1);
    expect(ownerResponse.body.matches[0].score).toBeGreaterThanOrEqual(65);
    expect(ownerResponse.body.matches[0].factors.category.points).toBe(35);
    expect(ownerResponse.body.matches[0].foundListing.privateDetails).toBeUndefined();

    const forbiddenResponse = await request(app)
      .get(`/api/v1/listings/${lost._id}/matches`)
      .set(authHeader(other));

    expect(forbiddenResponse.statusCode).toBe(403);

    const myMatches = await request(app)
      .get("/api/v1/matches")
      .set(authHeader(owner));

    expect(myMatches.statusCode).toBe(200);
    expect(myMatches.body.matches).toHaveLength(1);
  });
});
