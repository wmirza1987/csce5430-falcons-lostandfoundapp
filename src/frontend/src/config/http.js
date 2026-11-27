// Shared helpers for talking to the API (IF-SW-04). Every protected request
// sends the bearer token stored at sign-in.
export function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (error) {
    return null;
  }
}

export function formatDate(value) {
  if (!value) return "Not specified";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not specified";
  }

  // Listing dates are calendar dates stored at UTC midnight. Showing them in the
  // viewer's time zone would move them back a day for anyone west of UTC.
  const isCalendarDate = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z)?$/.test(String(value));

  return isCalendarDate ? date.toLocaleDateString(undefined, { timeZone: "UTC" }) : date.toLocaleDateString();
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function formatStatus(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Confidence is stored on a 0 to 1 scale (FR-MATCH-01).
export function formatConfidence(score) {
  return typeof score === "number" ? score.toFixed(2) : "n/a";
}

export async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}
