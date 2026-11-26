const request = require("supertest");
const app = require("../app");
const claimsRepo = require("../repos/claims");
const listingsRepo = require("../repos/listings");
const storage = require("../services/storage");
const { JPEG_BYTES, PNG_BYTES, WEBP_BYTES, authHeader, createMatchedPair, createUser } = require("./helpers");

const NAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

function listingRequest(user) {
  return request(app)
    .post("/api/v1/listings")
    .set(authHeader(user))
    .field("type", "found")
    .field("title", "Blue umbrella")
    .field("category", "Other")
    .field("description", "Found a blue umbrella in the library")
    .field("date", "2026-10-01")
    .field("building", "Willis Library")
    .field("zone", "North Campus");
}

function claimRequest(setup) {
  return request(app)
    .post(`/api/v1/matches/${setup.match._id}/claims`)
    .set(authHeader(setup.claimant))
    .field("explanation", "It is mine, it has my initials.");
}

describe("Listing photo uploads", () => {
  test("a file with an image MIME type but text content is rejected", async () => {
    const user = await createUser();
    const response = await listingRequest(user).attach("images", Buffer.from("<html>hi</html>"), {
      filename: "photo.png",
      contentType: "image/png",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Only JPEG, PNG, or WebP images are allowed.");
  });

  test("real PNG bytes in a .html file are stored under a server generated .png name", async () => {
    const user = await createUser();
    const response = await listingRequest(user).attach("images", PNG_BYTES, {
      filename: "evil.html",
      contentType: "image/png",
    });

    expect(response.statusCode).toBe(201);

    const [url] = response.body.listing.images;
    expect(url).toMatch(/^\/api\/v1\/images\/[0-9a-f-]{36}\.png$/);
    expect(url).not.toContain("evil");

    const blob = await storage.get("listings", url.split("/").pop());
    expect(blob.buffer.equals(PNG_BYTES)).toBe(true);
    expect(blob.contentType).toBe("image/png");
  });

  test("extensions come from the sniffed type, not the client file name or MIME", async () => {
    const user = await createUser();
    const response = await listingRequest(user)
      .attach("images", JPEG_BYTES, { filename: "a.png", contentType: "image/png" })
      .attach("images", WEBP_BYTES, { filename: "b.jpg", contentType: "image/jpeg" });

    expect(response.statusCode).toBe(201);
    const names = response.body.listing.images.map((url) => url.split("/").pop());
    expect(names[0]).toMatch(/\.jpg$/);
    expect(names[1]).toMatch(/\.webp$/);
    names.forEach((name) => expect(name).toMatch(NAME_PATTERN));
  });

  test("the listing keeps blob names and the API returns URLs", async () => {
    const user = await createUser();
    const response = await listingRequest(user).attach("images", PNG_BYTES, {
      filename: "x.png",
      contentType: "image/png",
    });
    const name = response.body.listing.images[0].split("/").pop();
    const fetched = await request(app).get(`/api/v1/listings/${response.body.listing._id}`);

    expect(fetched.body.listing.images).toEqual([`/api/v1/images/${name}`]);
    expect(await listingsRepo.findById(response.body.listing._id)).toMatchObject({
      images: [`/api/v1/images/${name}`],
    });
  });
});

describe("GET /api/v1/images/:name", () => {
  test("serves a stored photo with hardened headers", async () => {
    const name = "22222222-2222-4222-8222-222222222222.png";
    await storage.put("listings", name, PNG_BYTES, "image/png");

    for (const base of ["/api/v1/images/", "/api/images/"]) {
      const response = await request(app).get(`${base}${name}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-disposition"]).toBe("inline");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
      expect(Buffer.from(response.body).equals(PNG_BYTES)).toBe(true);
    }
  });

  test("a missing image is 404", async () => {
    const response = await request(app).get(
      "/api/v1/images/33333333-3333-4333-8333-333333333333.jpg"
    );
    expect(response.statusCode).toBe(404);
  });

  test("names that do not match the pattern are 404", async () => {
    const bad = [
      "x.png",
      "..%2F..%2F.env",
      "44444444-4444-4444-8444-444444444444.html",
      "44444444-4444-4444-8444-444444444444.png.html",
    ];

    for (const name of bad) {
      const response = await request(app).get(`/api/v1/images/${name}`);
      expect(response.statusCode).toBe(404);
    }
  });

  test("the old /uploads static route is gone", async () => {
    const response = await request(app).get("/uploads/listings/anything.jpg");
    expect(response.statusCode).toBe(404);
  });
});

describe("Claim evidence uploads", () => {
  test("evidence that is not a real image is rejected", async () => {
    const setup = await createMatchedPair();
    const response = await claimRequest(setup).attach("evidence", Buffer.from("plain text"), {
      filename: "e.jpg",
      contentType: "image/jpeg",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Only JPEG, PNG, or WebP images are allowed.");
  });

  test("evidence is stored encrypted under a random extensionless name and served back intact", async () => {
    const setup = await createMatchedPair();
    const response = await claimRequest(setup).attach("evidence", PNG_BYTES, {
      filename: "evil.html",
      contentType: "image/png",
    });

    expect(response.statusCode).toBe(201);

    const stored = await claimsRepo.findById(response.body.claim.id, { includeEvidence: true });
    const image = stored.evidenceImages[0];
    expect(image.storedName).toMatch(/^[0-9a-f-]{36}$/);
    expect(image.mimeType).toBe("image/png");

    const blob = await storage.get("evidence", image.storedName);
    expect(blob.buffer.includes(Buffer.from("fake-png-body"))).toBe(false);
    expect(blob.buffer.subarray(0, 8).equals(PNG_BYTES.subarray(0, 8))).toBe(false);

    const served = await request(app)
      .get(`/api/v1/claims/${response.body.claim.id}/evidence/0`)
      .set(authHeader(setup.claimant));

    expect(served.statusCode).toBe(200);
    expect(served.headers["cache-control"]).toBe("private, no-store");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(served.body).equals(PNG_BYTES)).toBe(true);
  });
});

describe("Evidence key configuration", () => {
  const original = { env: process.env.NODE_ENV, key: process.env.EVIDENCE_ENCRYPTION_KEY };

  afterEach(() => {
    process.env.NODE_ENV = original.env;

    if (original.key === undefined) {
      delete process.env.EVIDENCE_ENCRYPTION_KEY;
    } else {
      process.env.EVIDENCE_ENCRYPTION_KEY = original.key;
    }

    jest.resetModules();
  });

  test("loading the module in production without EVIDENCE_ENCRYPTION_KEY throws", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EVIDENCE_ENCRYPTION_KEY;
    jest.resetModules();

    expect(() => require("../services/evidenceCrypto")).toThrow(/EVIDENCE_ENCRYPTION_KEY/);
  });

  test("production with a key loads fine", () => {
    process.env.NODE_ENV = "production";
    process.env.EVIDENCE_ENCRYPTION_KEY = "a".repeat(64);
    jest.resetModules();

    expect(() => require("../services/evidenceCrypto")).not.toThrow();
  });
});
