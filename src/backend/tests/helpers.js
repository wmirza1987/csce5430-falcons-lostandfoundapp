const jwt = require("jsonwebtoken");
const Listing = require("../models/Listing");
const User = require("../models/User");

let sequence = 0;

async function createUser(overrides = {}) {
  sequence += 1;

  const user = await User.create({
    firstName: overrides.firstName || "Test",
    lastName: overrides.lastName || "User",
    email:
      overrides.email ||
      `test-user-${Date.now()}-${sequence}@my.unt.edu`,
    password: overrides.password || "Password123",
    isEmailVerified: overrides.isEmailVerified ?? true,
    emailNotifications: overrides.emailNotifications ?? false,
    ...overrides,
  });

  return user;
}

function authHeader(user) {
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  return { Authorization: `Bearer ${token}` };
}

async function createListing(owner, overrides = {}) {
  const type = overrides.type || "lost";

  return Listing.create({
    type,
    title: overrides.title || "Black AirPods",
    category: overrides.category || "Electronics",
    brand: overrides.brand || "Apple",
    color: overrides.color || "Black",
    description:
      overrides.description || "Lost black AirPods near Willis Library",
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

module.exports = {
  authHeader,
  createListing,
  createUser,
};
