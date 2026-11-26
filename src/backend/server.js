require("dotenv").config();

// Telemetry first so instrumentation can patch http/express before they load.
require("./services/telemetry").startTelemetry();

const app = require("./app");
const { query } = require("./db/pool");

const PORT = process.env.PORT || 5000;

// Verifies connectivity only. The schema is applied separately with
// `node db/migrate.js`, so a normal start never changes the database.
const startServer = async () => {
  try {
    await query("SELECT 1 AS ok");
    console.log("Azure SQL connection verified.");
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // NFR-PRIV-02: delete resolved content after 90 days and old audit records after a year.
  require("./services/retentionService").startRetentionJob();
};

startServer();
