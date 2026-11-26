// Applies db/schema.sql (idempotent). Usage: node db/migrate.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { close, query } = require("./pool");

async function migrate() {
  const script = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  // Each top-level statement starts at column 0 with IF; split on that.
  const statements = script
    .split(/\r?\n(?=IF )/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("--") || part.startsWith("IF"));

  for (const statement of statements) {
    await query(statement);
  }
}

if (require.main === module) {
  migrate()
    .then(() => console.log("Schema applied."))
    .catch((error) => {
      console.error(`Migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(close);
}

module.exports = { migrate };
