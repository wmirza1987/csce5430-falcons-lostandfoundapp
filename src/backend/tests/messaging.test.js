const request = require("supertest");
const app = require("../app");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const { authHeader, createListing, createMatch, createMatchedPair, createUser } = require("./helpers");

async function approvedThread() {
  const setup = await createMatchedPair();
  const claimResponse = await request(app)
    .post(`/api/v1/matches/${setup.match._id}/claims`)
    .set(authHeader(setup.claimant))
    .field("explanation", "I can describe the engraving on the case.");
  const claimId = claimResponse.body.claim.id;

  await request(app)
    .patch(`/api/v1/claims/${claimId}/decision`)
    .set(authHeader(setup.finder))
    .send({ action: "approve" });

  return { ...setup, claimId };
}

function sendMessage(user, claimId, body) {
  return request(app)
    .post(`/api/v1/claims/${claimId}/messages`)
    .set(authHeader(user))
    .send({ body });
}

function readThread(user, claimId, page) {
  const query = page ? `?page=${page}` : "";
  return request(app).get(`/api/v1/claims/${claimId}/messages${query}`).set(authHeader(user));
}

describe("Thread lifecycle (FR-CLM-03, FR-COM-01)", () => {
  test("UT-MSG-01: approval opens a thread visible to the claimant and the finder", async () => {
    const { finder, claimant, claimId } = await approvedThread();

    const forClaimant = await readThread(claimant, claimId);
    const forFinder = await readThread(finder, claimId);

    expect(forClaimant.statusCode).toBe(200);
    expect(forFinder.statusCode).toBe(200);
    expect(forFinder.body.messages[0].senderRole).toBe("System");
    expect(forFinder.body.thread.status).toBe("approved");
  });

  test("UT-MSG-02 and UT-MSG-03: the claimant and finder exchange messages with role labels", async () => {
    const { finder, claimant, claimId } = await approvedThread();

    const first = await sendMessage(claimant, claimId, "Hi, I can pick it up at the desk at 3pm.");
    expect(first.statusCode).toBe(201);

    const reply = await sendMessage(finder, claimId, "Sounds good, see you then.");
    expect(reply.statusCode).toBe(201);

    const view = await readThread(claimant, claimId);
    const roles = view.body.messages.map((message) => message.senderRole);
    expect(roles).toEqual(["System", "Claimant", "Finder"]);
    expect(view.body.messages[1].isOwn).toBe(true);
    expect(view.body.messages[2].isOwn).toBe(false);
  });

  test("messages are returned in timestamp order with a createdAt value (UT-MSG-13)", async () => {
    const { claimant, claimId } = await approvedThread();
    await sendMessage(claimant, claimId, "First");
    await sendMessage(claimant, claimId, "Second");

    const view = await readThread(claimant, claimId);
    const times = view.body.messages.map((message) => new Date(message.createdAt).getTime());

    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(view.body.messages.at(-1).body).toBe("Second");
  });

  test("messages before approval are refused", async () => {
    const setup = await createMatchedPair();
    const claimResponse = await request(app)
      .post(`/api/v1/matches/${setup.match._id}/claims`)
      .set(authHeader(setup.claimant))
      .field("explanation", "Pending evidence");

    const response = await sendMessage(setup.claimant, claimResponse.body.claim.id, "Hello?");

    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe("Messages open only after a claim is approved.");
  });

  test("UT-MSG-15 and INT-21: a message that cannot be stored is not reported as sent", async () => {
    const { claimant, claimId } = await approvedThread();
    const before = await Message.countDocuments({ claim: claimId });
    const spy = jest.spyOn(Message, "create").mockRejectedValueOnce(new Error("database unavailable"));

    const response = await sendMessage(claimant, claimId, "This should not be stored");
    spy.mockRestore();

    expect(response.statusCode).toBe(500);
    expect(await Message.countDocuments({ claim: claimId })).toBe(before);
  });
});

describe("Access control (FR-COM-02, FR-AUTH-03)", () => {
  test("UT-MSG-04: a third party cannot read the thread", async () => {
    const { claimId } = await approvedThread();
    const stranger = await createUser();

    const response = await readThread(stranger, claimId);

    expect(response.statusCode).toBe(403);
    expect(response.body.messages).toBeUndefined();
  });

  test("UT-MSG-05 and UT-AUTH-03: a third party cannot send, and nothing is stored", async () => {
    const { claimId } = await approvedThread();
    const stranger = await createUser();
    const before = await Message.countDocuments({ claim: claimId });

    const response = await sendMessage(stranger, claimId, "Intrusion");

    expect(response.statusCode).toBe(403);
    expect(await Message.countDocuments({ claim: claimId })).toBe(before);
  });

  test("UT-MSG-08: threads are listed only to their participants", async () => {
    const { claimant, finder, claimId } = await approvedThread();
    const stranger = await createUser();

    const forStranger = await request(app).get("/api/v1/messages/threads").set(authHeader(stranger));
    const forClaimant = await request(app).get("/api/v1/messages/threads").set(authHeader(claimant));
    const forFinder = await request(app).get("/api/v1/messages/threads").set(authHeader(finder));

    expect(forStranger.body.threads).toHaveLength(0);
    expect(forClaimant.body.threads.map((thread) => thread.claimId)).toContain(claimId);
    expect(forFinder.body.threads.map((thread) => thread.claimId)).toContain(claimId);
  });

  test("UT-MSG-09 and UT-AUTH-07: a moderator can read every conversation", async () => {
    const { claimId } = await approvedThread();
    const moderator = await createUser({ role: "moderator" });

    const response = await readThread(moderator, claimId);
    const threads = await request(app).get("/api/v1/messages/threads").set(authHeader(moderator));

    expect(response.statusCode).toBe(200);
    expect(response.body.thread.yourRole).toBe("Moderator");
    expect(threads.body.threads.map((thread) => thread.claimId)).toContain(claimId);
  });

  test("a moderator cannot post into a conversation they do not take part in", async () => {
    const { claimId } = await approvedThread();
    const moderator = await createUser({ role: "moderator" });

    const response = await sendMessage(moderator, claimId, "Speaking as a moderator");

    expect(response.statusCode).toBe(403);
  });
});

describe("Message content rules (FR-COM-01, FR-COM-03)", () => {
  test("UT-MSG-06: an empty message is rejected", async () => {
    const { claimant, claimId } = await approvedThread();
    const response = await sendMessage(claimant, claimId, "   ");

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Message text is required.");
  });

  test("UT-MSG-11: a 1000 character message is stored unchanged, and 1001 characters is refused", async () => {
    const { claimant, claimId } = await approvedThread();
    const full = "a".repeat(1000);

    const accepted = await sendMessage(claimant, claimId, full);
    expect(accepted.statusCode).toBe(201);
    expect(accepted.body.message.body).toBe(full);

    const refused = await sendMessage(claimant, claimId, "a".repeat(1001));
    expect(refused.statusCode).toBe(400);
  });

  test("UT-MSG-12: script-like content is stored and returned as plain text", async () => {
    const { claimant, claimId } = await approvedThread();
    const payload = "<script>alert('x')</script>";

    const response = await sendMessage(claimant, claimId, payload);
    const view = await readThread(claimant, claimId);

    expect(response.statusCode).toBe(201);
    expect(view.body.messages.at(-1).body).toBe(payload);
  });

  test("FR-COM-03: a phone number is stored but the sender gets a privacy warning", async () => {
    const { claimant, claimId } = await approvedThread();

    const response = await sendMessage(claimant, claimId, "Text me at 940-555-0147");

    expect(response.statusCode).toBe(201);
    expect(response.body.warning).toMatch(/arrange handoff within the app/);
    expect(response.body.message.containsContactDetails).toBe(true);
  });

  test("UT-MSG-16 and UT-PRIV-05: participant email addresses are absent from message responses", async () => {
    const { claimant, finder, claimId } = await approvedThread();
    await sendMessage(finder, claimId, "Handoff at the front desk");

    const view = await readThread(claimant, claimId);

    expect(view.text).not.toContain(claimant.email);
    expect(view.text).not.toContain(finder.email);
    expect(view.text).not.toContain(String(finder._id));
  });

  test("UT-MSG-07 and UT-PRIV-04: message text never appears in public responses or notifications", async () => {
    const { claimant, claimId, found } = await approvedThread();
    await sendMessage(claimant, claimId, "SECRET-HANDOFF-TIME");

    const publicListing = await request(app).get(`/api/v1/listings/${found._id}`);
    const notices = await Notification.find({ type: "message" }).lean();

    expect(publicListing.text).not.toContain("SECRET-HANDOFF-TIME");
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) {
      expect(notice.message).not.toContain("SECRET-HANDOFF-TIME");
    }
  });

  test("pages hold 50 messages, newest page first", async () => {
    const { claimant, claimId } = await approvedThread();
    const { listing } = await Message.findOne({ claim: claimId }).lean();
    const inserts = Array.from({ length: 55 }, (_, index) => ({
      claim: claimId,
      listing,
      sender: claimant._id,
      kind: "user",
      body: `Message ${index + 1}`,
    }));
    await Message.insertMany(inserts);

    const pageOne = await readThread(claimant, claimId, 1);
    const pageTwo = await readThread(claimant, claimId, 2);

    expect(pageOne.body.messages).toHaveLength(50);
    expect(pageTwo.body.messages).toHaveLength(6);
    expect(pageOne.body.totalPages).toBe(2);
  });
});

describe("Moderation (FR-COM-02)", () => {
  test("UT-MSG-10: a moderator flags a message and both participants are notified generically", async () => {
    const { claimant, finder, claimId } = await approvedThread();
    const sent = await sendMessage(claimant, claimId, "Problematic content here");
    const moderator = await createUser({ role: "moderator" });

    const response = await request(app)
      .patch(`/api/v1/messages/${sent.body.message.id}/flag`)
      .set(authHeader(moderator))
      .send({ reason: "SENSITIVE-REASON-TEXT" });

    expect(response.statusCode).toBe(200);
    expect(response.body.flagged.flagged).toBe(true);

    const notices = await Notification.find({ type: "moderation" }).lean();
    const recipients = notices.map((notice) => String(notice.user)).sort();
    expect(recipients).toEqual([String(claimant._id), String(finder._id)].sort());
    for (const notice of notices) {
      expect(notice.message).not.toContain("SENSITIVE-REASON-TEXT");
    }
  });

  test("ordinary users cannot flag messages", async () => {
    const { claimant, claimId } = await approvedThread();
    const sent = await sendMessage(claimant, claimId, "Hello");

    const response = await request(app)
      .patch(`/api/v1/messages/${sent.body.message.id}/flag`)
      .set(authHeader(claimant))
      .send({ reason: "Not allowed" });

    expect(response.statusCode).toBe(403);
  });
});
