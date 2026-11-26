const jwt = require("jsonwebtoken");
const listingsRepo = require("../repos/listings");
const matchesRepo = require("../repos/matches");
const usersRepo = require("../repos/users");
const { calculateMatchDetails } = require("../services/matchingService");

// Minimal buffers that start with the real magic bytes of each image type.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png-body"),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake-jpeg-body")]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from("WEBPfake"),
]);

let sequence = 0;

async function createUser(overrides = {}) {
  sequence += 1;

  return usersRepo.create({
    firstName: overrides.firstName || "Test",
    lastName: overrides.lastName || "User",
    email: overrides.email || `test-user-${Date.now()}-${sequence}@my.unt.edu`,
    password: overrides.password || "Password123",
    isEmailVerified: overrides.isEmailVerified ?? true,
    emailNotifications: overrides.emailNotifications ?? false,
    role: overrides.role || "user",
  });
}

function authHeader(user) {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  return { Authorization: `Bearer ${token}` };
}

// Creates a listing directly, without triggering background matching, so each
// test controls exactly which matches exist.
async function createListing(owner, overrides = {}) {
  const type = overrides.type || "lost";

  return listingsRepo.create(
    {
      type,
      title: overrides.title || "Black AirPods",
      category: overrides.category || "Electronics",
      brand: overrides.brand || "Apple",
      color: overrides.color || "Black",
      description: overrides.description || "Lost black AirPods near Willis Library",
      date: overrides.date || new Date("2026-10-01"),
      location: overrides.location || {
        building: "Willis Library",
        zone: "North Campus",
      },
      images:
        overrides.images ||
        (type === "found" ? ["11111111-1111-4111-8111-111111111111.jpg"] : []),
      privateDetails: overrides.privateDetails,
      createdBy: owner._id,
      status: overrides.status || "active",
      isDeleted: overrides.isDeleted || false,
    },
    null,
    { includePrivate: true }
  );
}

// Persists a match using the same scoring code the engine uses.
async function createMatch(lostListing, foundListing) {
  const details = calculateMatchDetails(lostListing, foundListing);

  return matchesRepo.create({
    lostListing: lostListing._id,
    foundListing: foundListing._id,
    score: details.score,
    factors: details.factors,
  });
}

// Lost and Found pair owned by two different users, linked by a match.
async function createMatchedPair({ finder, claimant } = {}) {
  const foundOwner = finder || (await createUser());
  const lostOwner = claimant || (await createUser());

  const lost = await createListing(lostOwner, {
    type: "lost",
    title: "Black AirPods",
    description: "Lost black AirPods near Willis Library",
  });

  const found = await createListing(foundOwner, {
    type: "found",
    title: "Black AirPods case",
    description: "Found black AirPods case in Willis Library",
    privateDetails: "Engraved initials on the case lid",
  });

  const match = await createMatch(lost, found);

  return { finder: foundOwner, claimant: lostOwner, lost, found, match };
}

module.exports = {
  JPEG_BYTES,
  PNG_BYTES,
  WEBP_BYTES,
  authHeader,
  createListing,
  createMatch,
  createMatchedPair,
  createUser,
};
