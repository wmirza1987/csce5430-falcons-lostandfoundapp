// Shared helpers for the repository modules. Nothing here ever builds SQL text
// from request-derived values: callers pass fixed SQL fragments and bind every
// value as a named parameter through db/pool.js.
const { query } = require("../db/pool");

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isGuid(value) {
  return typeof value === "string" && GUID_PATTERN.test(value);
}

// Thrown for ids that are not GUID strings. The name matches the error name the
// controllers already map to a 400 "Invalid ... id." response.
class InvalidIdError extends Error {
  constructor(message = "Invalid id.") {
    super(message);
    this.name = "InvalidIdError";
    this.status = 400;
  }
}

function requireGuid(value) {
  if (!isGuid(value)) {
    throw new InvalidIdError();
  }

  return value.toLowerCase();
}

// Accepts a GUID string or a row/object that has an `_id`. Returns lowercase.
function idOf(value) {
  if (value && typeof value === "object" && value._id !== undefined) {
    return requireGuid(String(value._id));
  }

  return requireGuid(typeof value === "string" ? value : String(value ?? ""));
}

function optionalId(value) {
  return value === null || value === undefined ? null : idOf(value);
}

function lowerId(value) {
  return value === null || value === undefined ? null : String(value).toLowerCase();
}

// Escapes LIKE wildcards. Use together with `ESCAPE '\'` in the SQL text.
function escapeLike(value) {
  return String(value).replace(/[\\%_[]/g, "\\$&");
}

function isUniqueViolation(error) {
  return Boolean(error) && (error.number === 2627 || error.number === 2601);
}

// Returns the executor for a repo call: the transaction's query function when a
// tx is passed, otherwise the shared pool.
function runner(tx) {
  return tx ? tx.query : query;
}

// Builds "@prefix0, @prefix1, ..." placeholders and the matching params for an
// IN list. The SQL text only ever contains fixed names and counters.
function inList(prefix, values) {
  const params = {};
  const names = values.map((value, index) => {
    params[`${prefix}${index}`] = value;
    return `@${prefix}${index}`;
  });

  return { sql: names.join(", "), params };
}

function chunk(values, size = 500) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  InvalidIdError,
  chunk,
  escapeLike,
  idOf,
  inList,
  isGuid,
  isUniqueViolation,
  lowerId,
  optionalId,
  parseJson,
  requireGuid,
  runner,
};
