const request = require("supertest");
const app = require("../app");

describe("Listing API", () => {
  test("GET /api/listings should return listings", async () => {
    const response = await request(app)
      .get("/api/listings");

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("listings");
    expect(Array.isArray(response.body.listings)).toBe(true);
  });

  test("GET /api/listings should support search", async () => {
    const response = await request(app)
      .get("/api/listings?search=Notebook");

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("listings");
  });

  test("GET /api/listings should support type filter", async () => {
    const response = await request(app)
      .get("/api/listings?type=lost");

    expect(response.statusCode).toBe(200);

    response.body.listings.forEach((listing) => {
      expect(listing.type).toBe("lost");
    });
  });

  test("GET /api/listings should limit page size to 20", async () => {
    const response = await request(app)
      .get("/api/listings?page=1&limit=50");

    expect(response.statusCode).toBe(200);
    expect(response.body.limit).toBe(20);
  });

  // Corresponds to the new GET /api/listings/:id endpoint added to fix the
  // Edit page relying on the paginated public list to find a listing by id.
  test("GET /api/listings/:id should return 400 for a malformed id", async () => {
    const response = await request(app)
      .get("/api/listings/not-a-valid-object-id");

    expect(response.statusCode).toBe(400);
  });

  test("GET /api/listings/:id should return 404 for a well formed but nonexistent id", async () => {
    const response = await request(app)
      .get("/api/listings/507f1f77bcf86cd799439011");

    expect(response.statusCode).toBe(404);
  });

  test("POST /api/listings should reject unauthenticated user", async () => {
    const response = await request(app)
      .post("/api/listings")
      .send({
        type: "lost",
        title: "Test Item",
        category: "Other",
        description: "Test description",
        date: "2026-10-01",
        location: {
          building: "Willis Library",
        },
        images: [],
      });

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Authentication required.");
  });
});