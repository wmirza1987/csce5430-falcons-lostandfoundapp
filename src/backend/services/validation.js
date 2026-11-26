// Request value validation. Request bodies, params and query strings may carry
// objects or arrays (for example {"email":{"$gt":""}}); every value that reaches
// a query or a string operation is checked to be a plain string first.
const { isGuid } = require("../repos/util");

function isString(value) {
  return typeof value === "string";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// A single query-string value. Missing values become "", repeated or nested
// values (arrays, objects) are rejected.
function queryString(value) {
  if (value === undefined || value === null) {
    return { value: "" };
  }

  if (typeof value !== "string") {
    return { error: true };
  }

  return { value };
}

module.exports = { isGuid, isNonEmptyString, isString, queryString };
