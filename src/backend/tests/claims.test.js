const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../app");
const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const { authHeader, createListing, createMatch, createMatchedPair, createUser } = require("./helpers");

const EVIDENCE_DIR = path.join(__dirname, "..", "private", "evidence");
const PHOTO = Buffer.from("not-really-a-jpeg-but-typed-as-one");
const EXPLANATION = "The case has my initials engraved and I lost it on Monday near the desk.";

function submitClaim(claimant, match, { text = EXPLANATION, photos = [] } = {}) {
  let req = request(app)
    .post(`/api/v1/matches/${match._id}/claims`)
    .set(authHeader(claimant));

  if (text !== null) {
    req = req.field("explanation", text);
  }

  for (const photo of photos) {
    req = req.attach("evidence", photo, { filename: "evidence.jpg", contentType: "image/jpeg" });
  }

  return req;
}

async function submittedClaim(setup) {
  const response = await submitClaim(setup.claimant, setup.match);
  expect(response.statusCode).toBe(201);
  return response.body.claim;
}

describe("Claim submission (FR-CLM-01)", () => {
  test("UT-CLM-01: a claimant submits valid evidence text and the claim is pending", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match);

    expect(response.statusCode).toBe(201);
    expect(response.body.claim.status).toBe("pending");
    expect(response.body.claim.explanation).toBe(EXPLANATION);
  });

  test("evidence text is stored encrypted at rest, not as plain text", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    const stored = await Claim.findById(claim.id).select("+explanationCiphertext");

    expect(stored.explanationCiphertext).not.toContain("initials");
    expect(stored.explanationCiphertext.split(":")).toHaveLength(3);
  });

  test("UT-CLM-02: a claim with two evidence photos is accepted and the photos are encrypted on disk", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, {
      photos: [PHOTO, PHOTO],
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.claim.evidence).toHaveLength(2);

    const stored = await Claim.findById(response.body.claim.id).select("+evidenceImages");
    const onDisk = fs.readFileSync(path.join(EVIDENCE_DIR, stored.evidenceImages[0].storedName));
    expect(onDisk.equals(PHOTO)).toBe(false);
  });

  test("UT-CLM-03: a blank description is rejected", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, { text: "   " });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Evidence description is required.");
  });

  test("a description over 1000 characters is rejected", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, { text: "x".repeat(1001) });

    expect(response.statusCode).toBe(400);
  });

  test("UT-CLM-04: an oversized photo is rejected and no claim is created", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, {
      photos: [Buffer.alloc(5 * 1024 * 1024 + 1)],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Each evidence photo must be no more than 5 MB.");
    expect(await Claim.countDocuments({})).toBe(0);
  });

  test("UT-CLM-13: a claim with three photos is rejected", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, {
      photos: [PHOTO, PHOTO, PHOTO],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("A claim can include at most 2 evidence photos.");
  });

  test("UT-AUTH-01: an unverified user cannot submit a claim", async () => {
    const setup = await createMatchedPair();
    const unverified = await createUser({ isEmailVerified: false });
    const response = await submitClaim(unverified, setup.match);

    expect(response.statusCode).toBe(403);
    expect(await Claim.countDocuments({})).toBe(0);
  });

  test("only the owner of the lost listing can claim the match", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.finder, setup.match);

    expect(response.statusCode).toBe(403);
  });

  test("a second active claim by the same claimant is refused", async () => {
    const setup = await createMatchedPair();
    await submittedClaim(setup);
    const response = await submitClaim(setup.claimant, setup.match);

    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe("You already have an active claim for this match.");
  });

  test("a claim for a match that no longer exists is refused", async () => {
    const setup = await createMatchedPair();
    await Listing.updateOne({ _id: setup.found._id }, { $set: { isDeleted: true } });
    const response = await submitClaim(setup.claimant, setup.match);

    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe("This match is no longer available for claiming.");
  });

  test("submitting requires a signed-in user", async () => {
    const setup = await createMatchedPair();
    const response = await request(app)
      .post(`/api/v1/matches/${setup.match._id}/claims`)
      .field("explanation", EXPLANATION);

    expect(response.statusCode).toBe(401);
  });
});

describe("Owner review (FR-CLM-02)", () => {
  test("UT-CLM-05: the owner sees the claim and its evidence in the review list", async () => {
    const setup = await createMatchedPair();
    await submittedClaim(setup);

    const response = await request(app)
      .get(`/api/v1/listings/${setup.found._id}/claims`)
      .set(authHeader(setup.finder));

    expect(response.statusCode).toBe(200);
    expect(response.body.claims).toHaveLength(1);
    expect(response.body.claims[0].explanation).toBe(EXPLANATION);
    expect(response.body.claims[0].claimant.firstName).toBe("Test");
  });

  test("the review list is refused to anyone who is not the owner", async () => {
    const setup = await createMatchedPair();
    await submittedClaim(setup);
    const stranger = await createUser();

    const response = await request(app)
      .get(`/api/v1/listings/${setup.found._id}/claims`)
      .set(authHeader(stranger));

    expect(response.statusCode).toBe(403);
  });

  test("the claim detail shows the owner's private details side by side with the evidence", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);

    const response = await request(app)
      .get(`/api/v1/claims/${claim.id}`)
      .set(authHeader(setup.finder));

    expect(response.body.claim.listing.privateDetails).toBe("Engraved initials on the case lid");
    expect(response.body.claim.explanation).toBe(EXPLANATION);
  });

  test("the claimant does not receive the owner's private details", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);

    const response = await request(app)
      .get(`/api/v1/claims/${claim.id}`)
      .set(authHeader(setup.claimant));

    expect(response.statusCode).toBe(200);
    expect(response.body.claim.listing.privateDetails).toBeUndefined();
  });

  test("UT-CLM-06: approving a claim resolves the listing, opens a thread, and notifies the claimant", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);

    const response = await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "approve" });

    expect(response.statusCode).toBe(200);
    expect(response.body.claim.status).toBe("approved");
    expect(response.body.listingStatus).toBe("resolved");

    const listing = await Listing.findById(setup.found._id);
    expect(listing.status).toBe("resolved");

    const systemMessages = await Message.countDocuments({ claim: claim.id, kind: "system" });
    expect(systemMessages).toBe(1);

    const notice = await Notification.findOne({ user: setup.claimant._id, type: "claim_decision" });
    expect(notice.actionPath).toBe(`/messages/${claim.id}`);
  });

  test("UT-CLM-07: rejecting a claim keeps the listing active for other claimants", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);

    const response = await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "reject", decisionNote: "Initials do not match" });

    expect(response.statusCode).toBe(200);
    expect(response.body.claim.status).toBe("rejected");
    expect((await Listing.findById(setup.found._id)).status).toBe("active");
  });

  test("UT-CLM-08 and UT-CLM-14: a non-owner cannot approve, and the claim is unchanged", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    const stranger = await createUser();

    const response = await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(stranger))
      .send({ action: "approve" });

    expect(response.statusCode).toBe(403);
    expect((await Claim.findById(claim.id)).status).toBe("pending");
  });

  test("UT-CLM-17: a claim cannot be approved twice", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    const decide = () =>
      request(app)
        .patch(`/api/v1/claims/${claim.id}/decision`)
        .set(authHeader(setup.finder))
        .send({ action: "approve" });

    expect((await decide()).statusCode).toBe(200);
    expect((await decide()).statusCode).toBe(409);
  });

  test("a rejected claim can be reconsidered and approved by the owner", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "reject" });

    const response = await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "approve" });

    expect(response.statusCode).toBe(200);
  });

  test("approving one claim closes competing pending claims and notifies their claimants", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);

    const secondClaimant = await createUser();
    const secondLost = await createListing(secondClaimant, {
      type: "lost",
      title: "AirPods case",
      description: "Lost AirPods case near the library",
    });
    const secondMatch = await createMatch(secondLost, setup.found);
    const competing = await submitClaim(secondClaimant, secondMatch);
    expect(competing.statusCode).toBe(201);

    await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "approve" });

    expect((await Claim.findById(competing.body.claim.id)).status).toBe("closed");
    const closedNotice = await Notification.findOne({ user: secondClaimant._id, type: "claim_closed" });
    expect(closedNotice).not.toBeNull();
  });

  test("UT-CLM-16 and INT-20: if the thread cannot be opened, the approval is reverted and not reported", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    const spy = jest.spyOn(Message, "create").mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "approve" });

    spy.mockRestore();

    expect(response.statusCode).toBe(500);
    expect((await Claim.findById(claim.id)).status).toBe("pending");
    expect((await Listing.findById(setup.found._id)).status).toBe("active");
    expect(await Message.countDocuments({ claim: claim.id })).toBe(0);
  });

  test("a rejected claimant cannot resubmit for the same match", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    await request(app)
      .patch(`/api/v1/claims/${claim.id}/decision`)
      .set(authHeader(setup.finder))
      .send({ action: "reject" });

    const response = await submitClaim(setup.claimant, setup.match);

    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe("This match is no longer available for claiming.");
  });
});

describe("Evidence privacy (NFR-PRIV-01)", () => {
  test("UT-CLM-09 and UT-PRIV-03: an uninvolved user cannot read a claim", async () => {
    const setup = await createMatchedPair();
    const claim = await submittedClaim(setup);
    const stranger = await createUser();

    const response = await request(app).get(`/api/v1/claims/${claim.id}`).set(authHeader(stranger));

    expect(response.statusCode).toBe(403);
    expect(response.text).not.toContain("initials");
  });

  test("UT-CLM-10: public listing responses never include claim evidence", async () => {
    const setup = await createMatchedPair();
    await submittedClaim(setup);

    const response = await request(app).get(`/api/v1/listings/${setup.found._id}`);

    expect(response.statusCode).toBe(200);
    expect(response.text).not.toContain("initials on the case");
    expect(response.text).not.toContain("explanation");
    expect(response.body.listing.privateDetails).toBeUndefined();
  });

  test("UT-CLM-15: the claimant and the owner read back the exact evidence, and evidence photos are served only to them", async () => {
    const setup = await createMatchedPair();
    const response = await submitClaim(setup.claimant, setup.match, { photos: [PHOTO] });
    const claimId = response.body.claim.id;

    const claimantRead = await request(app)
      .get(`/api/v1/claims/${claimId}`)
      .set(authHeader(setup.claimant));
    expect(claimantRead.body.claim.explanation).toBe(EXPLANATION);

    const photo = await request(app)
      .get(`/api/v1/claims/${claimId}/evidence/0`)
      .set(authHeader(setup.finder));
    expect(photo.statusCode).toBe(200);
    expect(Buffer.from(photo.body).equals(PHOTO)).toBe(true);
    expect(photo.headers["cache-control"]).toContain("no-store");

    const stranger = await createUser();
    const denied = await request(app)
      .get(`/api/v1/claims/${claimId}/evidence/0`)
      .set(authHeader(stranger));
    expect(denied.statusCode).toBe(403);

    const anonymous = await request(app).get(`/api/v1/claims/${claimId}/evidence/0`);
    expect(anonymous.statusCode).toBe(401);
  });

  test("the claimant's own claim list does not reveal the owner's private details", async () => {
    const setup = await createMatchedPair();
    await submittedClaim(setup);

    const response = await request(app).get("/api/v1/claims/mine").set(authHeader(setup.claimant));

    expect(response.statusCode).toBe(200);
    expect(response.text).not.toContain("Engraved initials");
  });
});
