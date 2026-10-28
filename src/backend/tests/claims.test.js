const request = require("supertest");
const app = require("../app");
const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const {
  authHeader,
  createListing,
  createUser,
} = require("./helpers");

describe("Claim workflow", () => {
  test("submits private evidence, closes competing claims, and resolves", async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const otherClaimant = await createUser();

    const listing = await createListing(owner, {
      type: "found",
      title: "Found AirPods",
      description: "Found black AirPods in Willis Library",
    });

    const firstClaim = await request(app)
      .post(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(claimant))
      .send({
        explanation: "I lost these on Monday near the library desk.",
        privateDetails: ["Serial suffix 4821", "Small blue sticker on the case"],
      });

    expect(firstClaim.statusCode).toBe(201);
    expect(firstClaim.body.claim.status).toBe("pending");
    expect(firstClaim.body.claim.privateDetails).toBeUndefined();

    const otherClaim = await request(app)
      .post(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(otherClaimant))
      .send({
        explanation: "These are mine; I left them in a study room.",
        privateDetails: ["Name written inside the lid", "Cracked left ear tip"],
      });

    expect(otherClaim.statusCode).toBe(201);

    const forbiddenReview = await request(app)
      .get(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(otherClaimant));

    expect(forbiddenReview.statusCode).toBe(403);

    const ownerReview = await request(app)
      .get(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(owner));

    expect(ownerReview.statusCode).toBe(200);
    expect(ownerReview.body.claims).toHaveLength(2);
    expect(ownerReview.body.claims[0].privateDetails).toHaveLength(2);

    const approval = await request(app)
      .patch(`/api/v1/claims/${firstClaim.body.claim._id}/decision`)
      .set(authHeader(owner))
      .send({ action: "approve", decisionNote: "Evidence matches." });

    expect(approval.statusCode).toBe(200);
    expect(approval.body.claim.status).toBe("approved");
    expect(approval.body.listingStatus).toBe("pending_return");

    const secondApproval = await request(app)
      .patch(`/api/v1/claims/${otherClaim.body.claim._id}/decision`)
      .set(authHeader(owner))
      .send({ action: "approve" });

    expect(secondApproval.statusCode).toBe(409);

    const closedClaim = await Claim.findById(otherClaim.body.claim._id);
    expect(closedClaim.status).toBe("closed");

    const resolution = await request(app)
      .patch(`/api/v1/listings/${listing._id}/resolve`)
      .set(authHeader(owner))
      .send({});

    expect(resolution.statusCode).toBe(200);
    expect(resolution.body.listing.status).toBe("resolved");

    const updatedListing = await Listing.findById(listing._id);
    expect(updatedListing.status).toBe("resolved");

    const claimantNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(authHeader(claimant));

    expect(claimantNotifications.statusCode).toBe(200);
    expect(
      claimantNotifications.body.notifications.some(
        (notification) => notification.type === "claim_decision"
      )
    ).toBe(true);
    expect(
      claimantNotifications.body.notifications.some(
        (notification) => notification.type === "resolution"
      )
    ).toBe(true);

    const otherNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(authHeader(otherClaimant));

    expect(
      otherNotifications.body.notifications.some(
        (notification) => notification.type === "claim_closed"
      )
    ).toBe(true);
  });

  test("rejects claims from the owner and from unverified users", async () => {
    const owner = await createUser();
    const unverified = await createUser({ isEmailVerified: false });
    const listing = await createListing(owner, { type: "found" });

    const ownerClaim = await request(app)
      .post(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(owner))
      .send({
        explanation: "This is my own listing.",
        privateDetails: ["One", "Two"],
      });

    expect(ownerClaim.statusCode).toBe(403);

    const unverifiedClaim = await request(app)
      .post(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(unverified))
      .send({
        explanation: "I think this is mine.",
        privateDetails: ["One", "Two"],
      });

    expect(unverifiedClaim.statusCode).toBe(403);
  });

  test("requires at least two private identifying details", async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const listing = await createListing(owner, { type: "found" });

    const response = await request(app)
      .post(`/api/v1/listings/${listing._id}/claims`)
      .set(authHeader(claimant))
      .send({
        explanation: "This is mine.",
        privateDetails: ["Only one detail"],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "At least two private identifying details are required."
    );
  });
});
