const request = require("supertest");
const app = require("../app");
const Listing = require("../models/Listing");
const {
  authHeader,
  createListing,
  createUser,
} = require("./helpers");

describe("Phase 1 listing fixes", () => {
  test("searches public brand and color fields", async () => {
    const owner = await createUser();

    await createListing(owner, {
      type: "lost",
      title: "Wireless earbuds",
      brand: "Apple",
      color: "Black",
      category: "Electronics",
    });

    await createListing(owner, {
      type: "lost",
      title: "Water bottle",
      brand: "Hydro Flask",
      color: "Blue",
      category: "Other",
    });

    const brandResponse = await request(app).get("/api/v1/listings?search=Apple");
    expect(brandResponse.statusCode).toBe(200);
    expect(brandResponse.body.listings).toHaveLength(1);
    expect(brandResponse.body.listings[0].brand).toBe("Apple");

    const colorResponse = await request(app).get("/api/v1/listings?color=Blue");
    expect(colorResponse.statusCode).toBe(200);
    expect(colorResponse.body.listings).toHaveLength(1);
    expect(colorResponse.body.listings[0].color).toBe("Blue");
  });

  test("rejects an invalid date range instead of returning an empty page", async () => {
    const response = await request(app).get(
      "/api/v1/listings?startDate=2026-10-10&endDate=2026-10-01"
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "Start date must be before or equal to end date."
    );
  });

  test("does not let an owner set listing status through the edit endpoint", async () => {
    const owner = await createUser();
    const listing = await createListing(owner);

    const response = await request(app)
      .put(`/api/v1/listings/${listing._id}`)
      .set(authHeader(owner))
      .send({ status: "resolved" });

    expect(response.statusCode).toBe(200);

    const stored = await Listing.findById(listing._id);
    expect(stored.status).toBe("active");
  });

  test("refuses to edit or delete a non-active listing", async () => {
    const owner = await createUser();
    const listing = await createListing(owner, { status: "pending_return" });

    const editResponse = await request(app)
      .put(`/api/v1/listings/${listing._id}`)
      .set(authHeader(owner))
      .send({ title: "Changed" });

    expect(editResponse.statusCode).toBe(409);

    const deleteResponse = await request(app)
      .delete(`/api/v1/listings/${listing._id}`)
      .set(authHeader(owner));

    expect(deleteResponse.statusCode).toBe(409);
  });

  test("escapes regular-expression characters in search", async () => {
    const owner = await createUser();

    await createListing(owner, { title: "Ordinary wallet" });
    await createListing(owner, { title: "A.*B literal title" });

    const response = await request(app).get("/api/v1/listings?search=.*");

    expect(response.statusCode).toBe(200);
    expect(response.body.listings).toHaveLength(1);
    expect(response.body.listings[0].title).toBe("A.*B literal title");
  });
});
