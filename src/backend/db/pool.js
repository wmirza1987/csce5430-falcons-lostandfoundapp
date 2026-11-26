// Azure SQL connection and query helpers. Every query goes through
// query()/tx.query() with named parameters; SQL text is never built from
// request input (fixes the NoSQL-style injection risk of the Mongoose layer).
// DB_AUTH=windows uses the msnodesqlv8 driver (Windows integrated auth) and is
// for a local SQL Server only. Azure uses the default tedious driver.
const sql = process.env.DB_AUTH === "windows" ? require("mssql/msnodesqlv8") : require("mssql");

let poolPromise = null;

function buildConfig() {
  const database =
    process.env.NODE_ENV === "test"
      ? process.env.DB_NAME_TEST
      : process.env.DB_NAME;

  if (!process.env.DB_SERVER || !database) {
    throw new Error("DB_SERVER and DB_NAME (DB_NAME_TEST for tests) must be set.");
  }

  if (process.env.NODE_ENV === "test" && database === process.env.DB_NAME) {
    throw new Error("Refusing to run tests against the application database.");
  }

  if (process.env.DB_AUTH === "windows") {
    return {
      connectionString:
        `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.DB_SERVER};` +
        `Database=${database};Trusted_Connection=Yes;`,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };
  }

  const base = {
    server: process.env.DB_SERVER,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };

  if (process.env.DB_AUTH === "sql") {
    return { ...base, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
  }

  // Managed identity in App Service; `az login` credentials locally.
  return {
    ...base,
    authentication: { type: "azure-active-directory-default", options: {} },
  };
}

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildConfig())
      .connect()
      .catch((error) => {
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
}

function bind(request, params) {
  for (const [name, value] of Object.entries(params || {})) {
    if (value instanceof Date) {
      request.input(name, sql.DateTime2, value);
    } else if (typeof value === "boolean") {
      request.input(name, sql.Bit, value);
    } else if (typeof value === "number") {
      request.input(name, Number.isInteger(value) ? sql.Int : sql.Float, value);
    } else {
      request.input(name, value === undefined ? null : value);
    }
  }
}

async function run(requestFactory, text, params) {
  const request = requestFactory();
  bind(request, params);
  const result = await request.query(text);
  return result.recordset || [];
}

// Runs one parameterized statement; returns the rows.
async function query(text, params) {
  const pool = await getPool();
  return run(() => pool.request(), text, params);
}

// Runs fn(tx) inside a real SQL transaction. tx.query has the same shape as
// query(). Commits on success and rolls back if fn throws.
async function withTransaction(fn) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const tx = { query: (text, params) => run(() => new sql.Request(transaction), text, params) };
    const result = await fn(tx);
    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      // The original error is the one worth reporting.
    }
    throw error;
  }
}

async function close() {
  if (poolPromise) {
    const pool = await poolPromise;
    poolPromise = null;
    await pool.close();
  }
}

module.exports = { close, getPool, query, sql, withTransaction };
