require("dotenv").config();

const { close, query } = require("../db/pool");
const { migrate } = require("../db/migrate");

jest.setTimeout(30000);

// Child tables first, so foreign keys never block a delete.
const TABLES_IN_DELETE_ORDER = [
  "ClaimEvidence",
  "Messages",
  "Notifications",
  "Reports",
  "AuditLogs",
  "Claims",
  "Matches",
  "Listings",
  "Categories",
  "Users",
];

let migrated = null;

beforeAll(async () => {
  // The schema is applied once per test file process (idempotent).
  migrated = migrated || migrate();
  await migrated;
});

beforeEach(async () => {
  for (const table of TABLES_IN_DELETE_ORDER) {
    await query(`DELETE FROM dbo.${table}`);
  }
});

afterAll(async () => {
  await close();
});
