const request = require("supertest");
const app = require("../app");
const claimsRepo = require("../repos/claims");
const listingsRepo = require("../repos/listings");
const usersRepo = require("../repos/users");
const { authHeader, createListing, createMatch, createMatchedPair, createUser } = require("./helpers");

describe("Request validation and injection resistance", () => {
  test("object and array values in credentials are rejected with 400", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(login.statusCode).toBe(400);

    const arrayLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ["a@my.unt.edu"], password: "Password123" });
    expect(arrayLogin.statusCode).toBe(400);

    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: { $ne: null } });
    expect(forgot.statusCode).toBe(400);

    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({ firstName: { a: 1 }, lastName: "X", email: "x@my.unt.edu", password: "Password123" });
    expect(register.statusCode).toBe(400);

    const reset = await request(app)
      .post("/api/v1/auth/reset-password/sometoken")
      .send({ password: { $gt: "" } });
    expect(reset.statusCode).toBe(400);
  });

  test("an injection-style listing filter is rejected and SQL text in values is inert", async () => {
    const owner = await createUser();
    await createListing(owner, { title: "Plain wallet" });

    const nested = await request(app).get("/api/v1/listings?category[$ne]=x&type=lost&type=found");
    expect(nested.statusCode).toBe(400);

    const sqlish = await request(app).get("/api/v1/listings?search=" + encodeURIComponent("'; DROP TABLE dbo.Users; --"));
    expect(sqlish.statusCode).toBe(200);
    expect(sqlish.body.listings).toHaveLength(0);
    expect(await usersRepo.findById(owner._id)).not.toBeNull();
  });

  test("LIKE wildcards in search are matched literally", async () => {
    const owner = await createUser();
    await createListing(owner, { title: "Plain wallet" });
    await createListing(owner, { title: "100% cotton scarf" });

    const percent = await request(app).get("/api/v1/listings?search=" + encodeURIComponent("%"));
    expect(percent.body.listings.map((item) => item.title)).toEqual(["100% cotton scarf"]);

    const underscore = await request(app).get("/api/v1/listings?search=" + encodeURIComponent("_"));
    expect(underscore.body.listings).toHaveLength(0);

    const bracket = await request(app).get("/api/v1/listings?search=" + encodeURIComponent("[a-z]"));
    expect(bracket.body.listings).toHaveLength(0);
  });

  test("ids must be GUIDs: a malformed id is 400 and a missing GUID is 404", async () => {
    const user = await createUser();

    const bad = await request(app).get("/api/v1/listings/not-a-guid");
    expect(bad.statusCode).toBe(400);

    const missing = await request(app).get("/api/v1/listings/00000000-0000-4000-8000-000000000000");
    expect(missing.statusCode).toBe(404);

    const notification = await request(app)
      .patch("/api/v1/notifications/not-a-guid/read")
      .set(authHeader(user));
    expect(notification.statusCode).toBe(400);
  });

  test("a listing response populates the creator and hides private fields from others", async () => {
    const owner = await createUser({ firstName: "Ada", lastName: "Lovelace" });
    const listing = await createListing(owner, { privateDetails: "secret mark" });

    const list = await request(app).get("/api/v1/listings");
    expect(list.body.listings[0].createdBy).toEqual({
      _id: owner._id,
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(list.body.listings[0].location).toEqual({ building: "Willis Library", zone: "North Campus" });
    expect(list.text).not.toContain("secret mark");
    expect(list.text).not.toContain("hiddenReason");

    const anonymous = await request(app).get(`/api/v1/listings/${listing._id}`);
    expect(anonymous.body.listing.privateDetails).toBeUndefined();

    const asOwner = await request(app).get(`/api/v1/listings/${listing._id}`).set(authHeader(owner));
    expect(asOwner.body.listing.privateDetails).toBe("secret mark");
  });

  test("repository reads never expose private columns unless asked", async () => {
    const owner = await createUser();
    const listing = await createListing(owner, { privateDetails: "secret mark" });

    const plain = await listingsRepo.findById(listing._id);
    expect(plain).not.toHaveProperty("privateDetails");
    expect(plain).not.toHaveProperty("hiddenReason");

    const user = await usersRepo.findById(owner._id);
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
  });
});

describe("Email normalization and login", () => {
  test("registration lower-cases the email and login accepts any casing", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      firstName: "Pat",
      lastName: "Eagle",
      email: "  Pat.Eagle@My.UNT.edu ",
      password: "Password123",
    });
    expect(register.statusCode).toBe(201);
    expect(register.body.user.email).toBe("pat.eagle@my.unt.edu");

    const duplicate = await request(app).post("/api/v1/auth/register").send({
      firstName: "Pat",
      lastName: "Eagle",
      email: "PAT.EAGLE@my.unt.edu",
      password: "Password123",
    });
    expect(duplicate.statusCode).toBe(409);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "PAT.Eagle@MY.unt.edu", password: "Password123" });
    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeTruthy();

    const profile = await request(app)
      .get("/api/v1/auth/profile")
      .set({ Authorization: `Bearer ${login.body.token}` });
    expect(profile.statusCode).toBe(200);
    expect(profile.body.user.email).toBe("pat.eagle@my.unt.edu");
  });

  test("non-UNT email addresses are refused at registration", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      firstName: "Pat",
      lastName: "Eagle",
      email: "pat@example.com",
      password: "Password123",
    });
    expect(response.statusCode).toBe(400);
  });

  test("a reset token is single-use and only its hash is stored", async () => {
    const user = await createUser({ email: "reset-me@my.unt.edu" });
    const token = usersRepo.generateToken(60 * 1000);
    await usersRepo.setPasswordResetToken(user._id, token.tokenHash, token.expires);

    const first = await request(app)
      .post(`/api/v1/auth/reset-password/${token.rawToken}`)
      .send({ password: "BrandNewPass1" });
    expect(first.statusCode).toBe(200);

    const second = await request(app)
      .post(`/api/v1/auth/reset-password/${token.rawToken}`)
      .send({ password: "AnotherPass22" });
    expect(second.statusCode).toBe(400);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "reset-me@my.unt.edu", password: "BrandNewPass1" });
    expect(login.statusCode).toBe(200);
  });
});

describe("Concurrent approvals", () => {
  test("two claims for one listing cannot both be approved", async () => {
    const setup = await createMatchedPair();
    const secondClaimant = await createUser();
    const secondLost = await createListing(secondClaimant, { type: "lost", title: "AirPods case" });
    const secondMatch = await createMatch(secondLost, setup.found);

    const first = await request(app)
      .post(`/api/v1/matches/${setup.match._id}/claims`)
      .set(authHeader(setup.claimant))
      .field("explanation", "First claim evidence text");
    const second = await request(app)
      .post(`/api/v1/matches/${secondMatch._id}/claims`)
      .set(authHeader(secondClaimant))
      .field("explanation", "Second claim evidence text");

    const approve = (claimId) =>
      request(app)
        .patch(`/api/v1/claims/${claimId}/decision`)
        .set(authHeader(setup.finder))
        .send({ action: "approve" });

    const results = await Promise.all([approve(first.body.claim.id), approve(second.body.claim.id)]);
    const statuses = results.map((response) => response.statusCode).sort();

    expect(statuses).toEqual([200, 409]);

    const stored = await claimsRepo.findByListing(setup.found._id);
    expect(stored.filter((claim) => claim.status === "approved")).toHaveLength(1);
  });
});
