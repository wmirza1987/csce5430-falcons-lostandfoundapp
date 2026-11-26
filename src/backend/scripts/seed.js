// Idempotent demo-data seed. Usage: node scripts/seed.js (or `pnpm seed`).
//
// Target database comes from the same env as the app (DB_AUTH, DB_SERVER,
// DB_NAME). Passwords are never hard-coded or printed:
//   DEMO_PASSWORD_STUDENT, DEMO_PASSWORD_FINDER, DEMO_PASSWORD_MODERATOR,
//   DEMO_PASSWORD_ADMIN supply them; any that is unset gets a random password
//   written only to the file named by SEED_PASSWORD_FILE.
// Existing accounts keep their password unless SEED_RESET_PASSWORDS=true.
require("dotenv").config();

// Seeding must never send real email or call Azure Communication Services.
delete process.env.ACS_ENDPOINT;
delete process.env.EMAIL_FROM;

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const fs = require("fs");
const { close, query } = require("../db/pool");
const categoriesRepo = require("../repos/categories");
const listingsRepo = require("../repos/listings");
const notificationsRepo = require("../repos/notifications");
const usersRepo = require("../repos/users");
const { getMatchThreshold, refreshMatchesForListing } = require("../services/matchingService");

const ACCOUNTS = [
  { key: "student", env: "DEMO_PASSWORD_STUDENT", email: "demo.student@my.unt.edu", firstName: "Demo", lastName: "Student", role: "user" },
  { key: "finder", env: "DEMO_PASSWORD_FINDER", email: "demo.finder@my.unt.edu", firstName: "Demo", lastName: "Finder", role: "user" },
  { key: "moderator", env: "DEMO_PASSWORD_MODERATOR", email: "demo.moderator@unt.edu", firstName: "Demo", lastName: "Moderator", role: "moderator" },
  { key: "admin", env: "DEMO_PASSWORD_ADMIN", email: "demo.admin@unt.edu", firstName: "Demo", lastName: "Admin", role: "admin" },
];

const CATEGORIES = [
  "Electronics",
  "Wallets and ID",
  "Keys",
  "Bags",
  "Clothing",
  "Books",
  "Water Bottles",
  "Jewelry",
  "Other",
];

const HOUR = 60 * 60 * 1000;

// owner is an ACCOUNTS key. hoursAgo keeps every date inside the last 5 days.
// The first six listings form three lost/found pairs that score above threshold.
const LISTINGS = [
  {
    owner: "student", type: "lost", hoursAgo: 96,
    title: "Black Apple AirPods Pro with charging case", category: "Electronics", brand: "Apple", color: "Black",
    description: "Black Apple AirPods Pro in the charging case, lost on the second floor study tables.",
    building: "Willis Library", zone: "Main Quad",
  },
  {
    owner: "finder", type: "found", hoursAgo: 90,
    title: "Black AirPods Pro charging case", category: "Electronics", brand: "Apple", color: "Black",
    description: "Found a black Apple AirPods Pro charging case on a second floor study table.",
    building: "Willis Library", zone: "Main Quad",
    privateDetails: "Small scratch on the lid and a blue sticker inside the case.",
  },
  {
    owner: "student", type: "lost", hoursAgo: 72,
    title: "Brown leather wallet with UNT student ID", category: "Wallets and ID", brand: "Fossil", color: "Brown",
    description: "Brown leather wallet with my UNT student ID and a debit card, lost near the food court.",
    building: "University Union", zone: "Main Quad",
  },
  {
    owner: "finder", type: "found", hoursAgo: 66,
    title: "Brown leather wallet with student ID card", category: "Wallets and ID", brand: "Fossil", color: "Brown",
    description: "Found a brown leather wallet with a UNT student ID card near the food court.",
    building: "University Union", zone: "Main Quad",
    privateDetails: "Wallet holds a library card and a folded bus pass behind the ID.",
  },
  {
    owner: "student", type: "lost", hoursAgo: 48,
    title: "Blue Hydro Flask water bottle with stickers", category: "Water Bottles", brand: "Hydro Flask", color: "Blue",
    description: "Blue Hydro Flask water bottle covered in stickers, left in the common area after class.",
    building: "Discovery Park", zone: "Discovery Park",
  },
  {
    owner: "finder", type: "found", hoursAgo: 40,
    title: "Blue Hydro Flask water bottle stickers", category: "Water Bottles", brand: "Hydro Flask", color: "Blue",
    description: "Found a blue Hydro Flask water bottle with stickers in the common area.",
    building: "Discovery Park", zone: "Discovery Park",
    privateDetails: "A dent near the base and a UNT eagle sticker on the left side.",
  },
  {
    owner: "student", type: "lost", hoursAgo: 24,
    title: "Calculus textbook with highlighted notes", category: "Books", brand: "Pearson", color: "Red",
    description: "Red calculus textbook with highlighted notes, lost in a lecture room.",
    building: "Business Leadership Building", zone: "West Campus",
  },
  {
    owner: "finder", type: "found", hoursAgo: 12,
    title: "Gray zip up hoodie", category: "Clothing", brand: "Nike", color: "Gray",
    description: "Gray Nike zip up hoodie found on a bench near the entrance.",
    building: "Gateway Center", zone: "Gateway",
    privateDetails: "Size medium with a laundry tag on the collar.",
  },
];

function generatePassword() {
  // 18 random bytes as base64url is 24 characters.
  return crypto.randomBytes(18).toString("base64url");
}

async function ensureAccount(account, passwordFor) {
  const existing = await usersRepo.findByEmail(account.email);

  if (!existing) {
    const user = await usersRepo.create({
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      password: passwordFor(account),
      role: account.role,
      isEmailVerified: true,
      emailNotifications: false,
    });
    return { user, created: true };
  }

  const params = {
    id: existing._id,
    firstName: account.firstName,
    lastName: account.lastName,
    role: account.role,
  };
  let passwordSql = "";

  if (process.env.SEED_RESET_PASSWORDS === "true") {
    params.passwordHash = await bcrypt.hash(passwordFor(account), 10);
    passwordSql = ", passwordHash = @passwordHash";
  }

  await query(
    `UPDATE dbo.Users SET firstName = @firstName, lastName = @lastName, role = @role,
       isEmailVerified = 1, isActive = 1, emailNotifications = 0${passwordSql},
       updatedAt = SYSUTCDATETIME()
     WHERE id = @id`,
    params
  );

  return { user: await usersRepo.findByEmail(account.email), created: false };
}

async function ensureCategories(adminId, log) {
  let created = 0;

  for (const name of CATEGORIES) {
    const found = await categoriesRepo.findByName(name);

    if (!found) {
      await categoriesRepo.create({ name, createdBy: adminId });
      created += 1;
    } else if (!found.isActive) {
      await categoriesRepo.update(found._id, { isActive: true });
    }
  }

  log(`Categories: ${CATEGORIES.length} ensured (${created} created).`);
}

async function ensureListing(spec, ownerId) {
  const rows = await query(
    "SELECT id FROM dbo.Listings WHERE createdBy = @owner AND type = @type AND title = @title",
    { owner: ownerId, type: spec.type, title: spec.title }
  );
  const date = new Date(Date.now() - spec.hoursAgo * HOUR);
  const location = { building: spec.building, zone: spec.zone };

  if (rows.length > 0) {
    // Keep the row (and its status), refresh content and move dates to "now".
    const listing = await listingsRepo.update(rows[0].id, {
      category: spec.category,
      brand: spec.brand,
      color: spec.color,
      description: spec.description,
      date,
      location,
      privateDetails: spec.privateDetails,
    });
    return { listing, created: false };
  }

  // Direct repo insert bypasses the "Found listings need a photo" API rule.
  const listing = await listingsRepo.create({
    type: spec.type,
    title: spec.title,
    category: spec.category,
    brand: spec.brand,
    color: spec.color,
    description: spec.description,
    date,
    location,
    images: [],
    privateDetails: spec.privateDetails,
    createdBy: ownerId,
    status: "active",
  });
  return { listing, created: true };
}

// Safety net so the Notifications page is never empty if matching made none.
async function ensureMatchNotifications(student, log) {
  const rows = await query(
    "SELECT COUNT(*) AS n FROM dbo.Notifications WHERE userId = @id AND type = 'match'",
    { id: student._id }
  );
  const have = rows[0].n;

  if (have < 2) {
    const matches = await query(
      `SELECT TOP (2) m.id AS matchId, l.id AS listingId, l.title, m.score
       FROM dbo.Matches m JOIN dbo.Listings l ON l.id = m.lostListing
       WHERE l.createdBy = @id ORDER BY l.title`,
      { id: student._id }
    );

    for (const row of matches.slice(have)) {
      await notificationsRepo.create({
        user: student._id,
        type: "match",
        message: `A possible match was found for your Lost listing "${row.title}" (confidence ${Number(row.score).toFixed(2)}). Review it and submit a claim if it is yours.`,
        actionPath: `/matches/${String(row.matchId).toLowerCase()}/claim`,
        listing: row.listingId,
      });
    }
  }

  const after = await query(
    "SELECT COUNT(*) AS n FROM dbo.Notifications WHERE userId = @id AND type = 'match'",
    { id: student._id }
  );
  log(`Match notifications for the student: ${after[0].n}.`);
}

async function seed({ log = (line) => console.log(line) } = {}) {
  const passwordFile = process.env.SEED_PASSWORD_FILE;
  const generated = [];

  // Called only when a password is actually needed (new account or reset).
  function passwordFor(account) {
    const configured = process.env[account.env];

    if (configured) {
      return configured;
    }

    if (!passwordFile) {
      throw new Error(`Set ${account.env} or SEED_PASSWORD_FILE to seed ${account.email}.`);
    }

    const password = generatePassword();
    generated.push(`${account.email}: ${password}`);
    return password;
  }

  const users = {};
  const createdEmails = [];

  for (const account of ACCOUNTS) {
    const { user, created } = await ensureAccount(account, passwordFor);
    users[account.key] = user;

    if (created) {
      createdEmails.push(account.email);
    }
  }

  if (generated.length > 0) {
    fs.appendFileSync(passwordFile, `${generated.join("\n")}\n`, { mode: 0o600 });
    log(`Generated ${generated.length} password(s); written to SEED_PASSWORD_FILE.`);
  }

  log(`Users: ${ACCOUNTS.length} ensured; created: ${createdEmails.length ? createdEmails.join(", ") : "none"}.`);

  await ensureCategories(users.admin._id, log);

  const seeded = [];
  let listingsCreated = 0;

  for (const spec of LISTINGS) {
    const { listing, created } = await ensureListing(spec, users[spec.owner]._id);
    listingsCreated += created ? 1 : 0;
    seeded.push(listing);
  }

  log(`Listings: ${seeded.length} ensured (${listingsCreated} created).`);

  // The app's own matching; email is skipped (ACS unset, demo users opted out).
  for (const listing of seeded) {
    await refreshMatchesForListing(listing._id);
  }

  const titles = LISTINGS.map((spec) => spec.title);
  const params = Object.fromEntries(titles.map((title, index) => [`t${index}`, title]));
  const matches = await query(
    `SELECT COUNT(*) AS n FROM dbo.Matches
     WHERE score >= @threshold AND lostListing IN
       (SELECT id FROM dbo.Listings WHERE title IN (${titles.map((_, i) => `@t${i}`).join(",")}))`,
    { ...params, threshold: getMatchThreshold() }
  );
  log(`Matches at or above the threshold: ${matches[0].n}.`);

  await ensureMatchNotifications(users.student, log);
  log("Seed complete. Claims were left empty for the live demo.");
}

module.exports = { ACCOUNTS, LISTINGS, seed };

if (require.main === module) {
  seed()
    .catch((error) => {
      console.error(`Seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(close);
}
