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
});