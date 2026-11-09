const request = require("supertest");
const app = require("../app");

describe("Authentication API", () => {
  test("POST /api/auth/register should reject missing fields", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "student@my.unt.edu",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("All fields are required.");
  });

  test("POST /api/auth/login should reject invalid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "invalid@my.unt.edu",
        password: "WrongPassword123",
      });

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Invalid email or password.");
  });

  test("GET /api/auth/profile should reject request without token", async () => {
    const response = await request(app)
      .get("/api/auth/profile");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Authentication required.");
  });

  // Corresponds to UT-AUTH-19 in the Deliverable 3 Test Cases document.
  test("GET /api/auth/verify-email/:token should reject an invalid token", async () => {
    const response = await request(app)
      .get("/api/auth/verify-email/not-a-real-token");

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "This verification link is invalid or has expired."
    );
  });

  // Corresponds to UT-AUTH-07: the response must not reveal whether the
  // email address actually has an account.
  test("POST /api/auth/forgot-password should return the same response for an unknown email", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "no-such-account@my.unt.edu" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe(
      "If an account exists for this email, a password reset link has been sent."
    );
  });

  test("POST /api/auth/forgot-password should reject a missing email", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({});

    expect(response.statusCode).toBe(400);
  });

  test("POST /api/auth/reset-password/:token should reject an invalid token", async () => {
    const response = await request(app)
      .post("/api/auth/reset-password/not-a-real-token")
      .send({ password: "NewPassword123" });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "This password reset link is invalid or has expired."
    );
  });

  test("POST /api/auth/reset-password/:token should reject a short password", async () => {
    const response = await request(app)
      .post("/api/auth/reset-password/not-a-real-token")
      .send({ password: "short" });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "A new password of at least 8 characters is required."
    );
  });
});