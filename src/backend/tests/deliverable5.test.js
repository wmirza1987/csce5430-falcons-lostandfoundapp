const request = require("supertest");
const app = require("../app");
const AuditLog = require("../models/AuditLog");
const Listing = require("../models/Listing");
const Message = require("../models/Message");
const Report = require("../models/Report");
const {
  authHeader,
  createListing,
  createMatchedPair,
  createUser,
} = require("./helpers");

async function makeAdmin(overrides = {}) {
  return createUser({ ...overrides, role: "admin" });
}

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

function reportListing(reporter, listingId, reason = "Please review this listing for spam.") {
  return request(app)
    .post("/api/v1/reports")
    .set(authHeader(reporter))
    .send({ targetType: "listing", targetId: String(listingId), reason });
}

function reportMessage(reporter, messageId, reason = "This message needs moderation review.") {
  return request(app)
    .post("/api/v1/reports")
    .set(authHeader(reporter))
    .send({ targetType: "message", targetId: String(messageId), reason });
}

function decide(moderator, reportId, decision, decisionNote) {
  return request(app)
    .patch(`/api/v1/reports/${reportId}/decision`)
    .set(authHeader(moderator))
    .send({ decision, decisionNote });
}

describe("FR-ADM-01: reports and moderation", () => {
  test("a signed-in user reports a listing and moderators see it in the queue", async () => {
    const owner = await createUser();
    const reporter = await createUser();
    const moderator = await createUser({ role: "moderator" });
    const listing = await createListing(owner);

    const created = await reportListing(reporter, listing._id);
    expect(created.statusCode).toBe(201);
    expect(created.body.report.status).toBe("open");
    expect(created.body.report.targetType).toBe("listing");

    const queue = await request(app).get("/api/v1/reports").set(authHeader(moderator));
    expect(queue.statusCode).toBe(200);
    expect(queue.body.reports).toHaveLength(1);
    expect(queue.body.reports[0].reason).toBe("Please review this listing for spam.");
  });

  test("ordinary users cannot view the moderation queue", async () => {
    const user = await createUser();
    const response = await request(app).get("/api/v1/reports").set(authHeader(user));
    expect(response.statusCode).toBe(403);
  });

  test("a short reason and a duplicate open report are rejected", async () => {
    const owner = await createUser();
    const reporter = await createUser();
    const listing = await createListing(owner);

    const short = await reportListing(reporter, listing._id, "bad");
    expect(short.statusCode).toBe(400);

    await reportListing(reporter, listing._id);
    const duplicate = await reportListing(reporter, listing._id);
    expect(duplicate.statusCode).toBe(409);
  });

  test("hiding a listing removes it from public browse, detail, and map; restore brings it back", async () => {
    const owner = await createUser();
    const reporter = await createUser();
    const moderator = await createUser({ role: "moderator" });
    const listing = await createListing(owner, { location: { building: "Willis Library", zone: "North Quad" } });

    const reported = await reportListing(reporter, listing._id);
    const hidden = await decide(moderator, reported.body.report.id, "hide", "Confirmed spam listing.");
    expect(hidden.statusCode).toBe(200);
    expect(await Listing.findById(listing._id)).toMatchObject({ isHidden: true });

    const browse = await request(app).get("/api/v1/listings");
    expect(browse.body.listings.map((item) => String(item._id))).not.toContain(String(listing._id));

    const detail = await request(app).get(`/api/v1/listings/${listing._id}`).set(authHeader(reporter));
    expect(detail.statusCode).toBe(404);

    const map = await request(app).get("/api/v1/map/listings");
    expect(map.body.pins.map((pin) => String(pin.id))).not.toContain(String(listing._id));

    const restoreReport = await reportListing(reporter, listing._id, "Please restore this listing.");
    const restored = await decide(moderator, restoreReport.body.report.id, "restore", "Reviewed and restored.");
    expect(restored.statusCode).toBe(200);
    expect(await Listing.findById(listing._id)).toMatchObject({ isHidden: false });

    const browseAfter = await request(app).get("/api/v1/listings");
    expect(browseAfter.body.listings.map((item) => String(item._id))).toContain(String(listing._id));
  });

  test("hiding a message replaces its body with a placeholder for participants and moderators", async () => {
    const { claimant, claimId } = await approvedThread();
    const moderator = await createUser({ role: "moderator" });
    const sent = await request(app)
      .post(`/api/v1/claims/${claimId}/messages`)
      .set(authHeader(claimant))
      .send({ body: "SECRET-MESSAGE-BODY-DO-NOT-SHOW" });
    const messageId = sent.body.message.id;

    const reported = await reportMessage(claimant, messageId);
    await decide(moderator, reported.body.report.id, "hide", "Removed for policy violation.");

    const participantView = await request(app)
      .get(`/api/v1/claims/${claimId}/messages`)
      .set(authHeader(claimant));
    expect(participantView.statusCode).toBe(200);
    const json = JSON.stringify(participantView.body);
    expect(json).not.toContain("SECRET-MESSAGE-BODY-DO-NOT-SHOW");
    expect(await Message.findById(messageId)).toMatchObject({ isHidden: true });

    // A second, still-open report re-grants the moderator access to the thread;
    // the hidden message is shown only as a content-free placeholder.
    await reportMessage(claimant, messageId, "Second review request for this message.");
    const moderatorView = await request(app)
      .get(`/api/v1/claims/${claimId}/messages`)
      .set(authHeader(moderator));
    expect(moderatorView.statusCode).toBe(200);
    const hiddenView = moderatorView.body.messages.find((item) => item.id === messageId);
    expect(hiddenView).toBeDefined();
    expect(hiddenView.body).toBe("[hidden by moderation]");
    expect(JSON.stringify(moderatorView.body)).not.toContain("SECRET-MESSAGE-BODY-DO-NOT-SHOW");
  });
});

describe("FR-ADM-02: administration and audit", () => {
  test("only an administrator can manage users, categories, and audit records", async () => {
    const regular = await createUser();
    const moderator = await createUser({ role: "moderator" });

    for (const path of ["/api/v1/admin/users", "/api/v1/admin/categories", "/api/v1/admin/audit", "/api/v1/admin/analytics"]) {
      expect((await request(app).get(path).set(authHeader(regular))).statusCode).toBe(403);
      expect((await request(app).get(path).set(authHeader(moderator))).statusCode).toBe(403);
    }
  });

  test("an administrator changes a user to moderator and the role change is audited", async () => {
    const admin = await makeAdmin();
    const user = await createUser();

    const response = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/role`)
      .set(authHeader(admin))
      .send({ role: "moderator" });
    expect(response.statusCode).toBe(200);
    expect(response.body.user.role).toBe("moderator");

    const logs = await AuditLog.find({ action: "role.changed" }).lean();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].actor)).toBe(String(admin._id));
    expect(String(logs[0].targetId)).toBe(String(user._id));
    expect(logs[0].detail).toBe("user to moderator");
  });

  test("the admin role cannot be granted or removed through the role endpoint", async () => {
    const admin = await makeAdmin();
    const other = await createUser();

    const escalate = await request(app)
      .patch(`/api/v1/admin/users/${other._id}/role`)
      .set(authHeader(admin))
      .send({ role: "admin" });
    expect(escalate.statusCode).toBe(400);

    const demote = await request(app)
      .patch(`/api/v1/admin/users/${admin._id}/role`)
      .set(authHeader(admin))
      .send({ role: "user" });
    expect(demote.statusCode).toBe(409);
  });

  test("an administrator manages categories and deactivation hides them from the public catalog", async () => {
    const admin = await makeAdmin();

    const created = await request(app)
      .post("/api/v1/admin/categories")
      .set(authHeader(admin))
      .send({ name: "  Keys  ", description: "Keyrings and house keys" });
    expect(created.statusCode).toBe(201);
    expect(created.body.category.name).toBe("keys");

    const duplicate = await request(app)
      .post("/api/v1/admin/categories")
      .set(authHeader(admin))
      .send({ name: "Keys" });
    expect(duplicate.statusCode).toBe(409);

    const active = await request(app).get("/api/v1/admin/categories").set(authHeader(admin));
    expect(active.body.categories.map((item) => item.name)).toContain("keys");

    const deactivated = await request(app)
      .patch(`/api/v1/admin/categories/${created.body.category.id}`)
      .set(authHeader(admin))
      .send({ isActive: false });
    expect(deactivated.statusCode).toBe(200);

    const after = await request(app).get("/api/v1/admin/categories").set(authHeader(admin));
    expect(after.body.categories.map((item) => item.name)).not.toContain("keys");

    const withInactive = await request(app)
      .get("/api/v1/admin/categories?includeInactive=true")
      .set(authHeader(admin));
    expect(withInactive.body.categories.map((item) => item.name)).toContain("keys");
  });

  test("audit records never contain private content such as emails, passwords, or message bodies", async () => {
    const admin = await makeAdmin();
    const user = await createUser({ email: "private-person@my.unt.edu" });
    await request(app)
      .patch(`/api/v1/admin/users/${user._id}/role`)
      .set(authHeader(admin))
      .send({ role: "moderator" });

    const { claimId, claimant } = await approvedThread();
    const sent = await request(app)
      .post(`/api/v1/claims/${claimId}/messages`)
      .set(authHeader(claimant))
      .send({ body: "A-PRIVATE-MESSAGE-BODY" });
    await reportMessage(claimant, sent.body.message.id);
    await decide(admin, (await Report.findOne({}))._id, "hide", "Policy reason for hiding.");

    const response = await request(app).get("/api/v1/admin/audit").set(authHeader(admin));
    expect(response.statusCode).toBe(200);
    expect(response.body.auditLogs.length).toBeGreaterThan(0);

    const json = JSON.stringify(response.body);
    expect(json).not.toContain("private-person@my.unt.edu");
    expect(json).not.toContain("Password123");
    expect(json).not.toContain("A-PRIVATE-MESSAGE-BODY");
    expect(json).not.toContain("Policy reason for hiding.");
  });
});

describe("FR-ADM-03: aggregate analytics", () => {
  test("the dashboard reports aggregate counts without private evidence or message contents", async () => {
    const admin = await makeAdmin();
    const owner = await createUser();

    await createListing(owner, { category: "Electronics", location: { building: "Willis Library", zone: "North Quad" } });
    await createListing(owner, { category: "Electronics", location: { building: "Willis Library", zone: "North Quad" } });
    await createListing(owner, {
      category: "Books",
      status: "resolved",
      privateDetails: "TOP-SECRET-PRIVATE-DETAILS",
      location: { building: "University Hall", zone: "North Quad" },
    });

    const response = await request(app).get("/api/v1/admin/analytics").set(authHeader(admin));
    expect(response.statusCode).toBe(200);

    const { analytics } = response.body;
    expect(analytics.listings.total).toBe(3);
    expect(analytics.listings.active).toBe(2);
    expect(analytics.listings.resolved).toBe(1);
    expect(analytics.listings.resolutionRate).toBe(33.3);
    expect(typeof analytics.listings.averageResolutionDays).toBe("number");
    expect(analytics.commonCategories[0]).toEqual({ name: "Electronics", count: 2 });
    expect(analytics.hotspots[0].name).toBe("Willis Library");
    expect(analytics.hotspots[0]).toHaveProperty("lat");

    const json = JSON.stringify(response.body);
    expect(json).not.toContain("TOP-SECRET-PRIVATE-DETAILS");
    expect(json).not.toContain(owner.email);
  });

  test("a hidden listing is excluded from aggregate counts", async () => {
    const admin = await makeAdmin();
    const owner = await createUser();
    const reporter = await createUser();
    const moderator = await createUser({ role: "moderator" });
    const listing = await createListing(owner, { category: "Electronics" });

    const report = await reportListing(reporter, listing._id);
    await decide(moderator, report.body.report.id, "hide", "Confirmed policy issue.");

    const response = await request(app).get("/api/v1/admin/analytics").set(authHeader(admin));
    expect(response.body.analytics.listings.total).toBe(0);
  });
});

describe("FR-SRCH-03: campus map", () => {
  test("the building catalog provides coarse coordinates, zones, and attribution", async () => {
    const response = await request(app).get("/api/v1/map/buildings");
    expect(response.statusCode).toBe(200);
    expect(response.body.buildings.length).toBeGreaterThan(0);
    expect(response.body.zones.length).toBeGreaterThan(0);
    expect(response.body.attribution).toContain("OpenStreetMap");

    for (const building of response.body.buildings) {
      expect(building.lat).toBeGreaterThan(-90);
      expect(building.lat).toBeLessThan(90);
      expect(String(building.lat).split(".")[1]?.length || 0).toBeLessThanOrEqual(3);
      expect(String(building.lng).split(".")[1]?.length || 0).toBeLessThanOrEqual(3);
    }
  });

  test("only known campus buildings are plotted; unknown ones remain in the list view", async () => {
    const owner = await createUser();
    await createListing(owner, { location: { building: "Willis Library", zone: "North Quad" } });
    await createListing(owner, { location: { building: "Off Campus Unknown Place", zone: "Denton" } });

    const map = await request(app).get("/api/v1/map/listings");
    expect(map.statusCode).toBe(200);
    expect(map.body.pins).toHaveLength(1);
    expect(map.body.pins[0].building).toBe("Willis Library");
    expect(map.body.unplotted).toHaveLength(1);
    expect(map.body.unplotted[0].building).toBe("Off Campus Unknown Place");

    const list = await request(app).get("/api/v1/map/listings?view=list");
    expect(list.body.view).toBe("list");

    const filtered = await request(app).get("/api/v1/map/listings?zone=North%20Quad");
    expect(filtered.body.pins).toHaveLength(1);
    expect(JSON.stringify(map.body)).not.toContain("privateDetails");
  });
});
