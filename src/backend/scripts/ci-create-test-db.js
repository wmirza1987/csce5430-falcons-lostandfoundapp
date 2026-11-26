// Creates the empty test database in the CI SQL Server container, retrying while
// the container starts. Exits non-zero if it never succeeds, so CI fails loudly.
const sql = require("mssql");

const database = process.env.DB_NAME_TEST || "lostfound_test";

if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error("Invalid DB_NAME_TEST.");
  process.exit(1);
}

async function attempt() {
  const pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  });

  try {
    await pool.request().query(`IF DB_ID('${database}') IS NULL CREATE DATABASE [${database}]`);
  } finally {
    await pool.close();
  }
}

(async () => {
  for (let i = 1; i <= 40; i += 1) {
    try {
      await attempt();
      console.log(`Database ${database} is ready.`);
      return;
    } catch (error) {
      console.log(`Attempt ${i} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.error("Could not create the test database.");
  process.exit(1);
})();
