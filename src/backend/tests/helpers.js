const jwt = require("jsonwebtoken");
const Listing = require("../models/Listing");
const Match = require("../models/Match");
const User = require("../models/User");
const { calculateMatchDetails } = require("../services/matchingService");

let sequence = 0;

async function createUser(overrides = {}) {
  sequence += 1;

  return User.create({
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

  return Listing.create({
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
      (type === "found" ? ["/uploads/listings/test-found.jpg"] : []),
    privateDetails: overrides.privateDetails,
    createdBy: owner._id,
    status: overrides.status || "active",
    isDeleted: overrides.isDeleted || false,
  });
}

// Persists a match using the same scoring code the engine uses.
async function createMatch(lostListing, foundListing) {
  const details = calculateMatchDetails(lostListing, foundListing);

  return Match.create({
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
  authHeader,
  createListing,
  createMatch,
  createMatchedPair,
  createUser,
};
