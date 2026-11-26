// FR-ADM-03: aggregate-only dashboard data. The queries behind this service are
// SQL GROUP BY aggregates that read only non-sensitive columns. Private claim
// evidence, message bodies, user emails, and listing private details are never
// queried or returned.
const listingsRepo = require("../repos/listings");
const reportsRepo = require("../repos/reports");
const { findBuilding } = require("./campusService");

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Highest count first, ties by name; keeps the top `limit` groups.
function topGroups(groups, limit = 6) {
  return groups
    .map((group) => ({ ...group }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

async function getDashboardAnalytics() {
  const { totals, categories, buildings } = await listingsRepo.analytics();

  const sum = (rows, predicate, field = "count") =>
    rows.filter(predicate).reduce((total, row) => total + row[field], 0);

  const visibleCount = sum(totals, () => true);
  const resolvedCount = sum(totals, (row) => row.status === "resolved");
  const activeCount = sum(totals, (row) => row.status === "active");

  const resolutionRate = visibleCount === 0 ? 0 : round((resolvedCount / visibleCount) * 100, 1);

  const totalResolutionMs = sum(totals, (row) => row.status === "resolved", "resolutionMs");
  const averageResolutionDays =
    resolvedCount === 0 ? 0 : round(totalResolutionMs / resolvedCount / DAY_MS, 1);

  const commonCategories = topGroups(categories).map(({ name, count }) => ({ name, count }));

  // Hotspots are building/zone counts joined to the coarse campus catalog.
  const hotspots = topGroups(buildings).map((entry) => {
    const building = findBuilding(entry.name);
    return {
      name: entry.name,
      zone: building ? building.zone : entry.zone || "",
      count: entry.count,
      lat: building ? building.lat : null,
      lng: building ? building.lng : null,
    };
  });

  const reportSummary = { open: 0, reviewing: 0, resolved: 0, total: 0 };
  for (const row of await reportsRepo.countByStatus()) {
    if (row.status in reportSummary) reportSummary[row.status] = row.count;
    reportSummary.total += row.count;
  }

  return {
    listings: {
      total: visibleCount,
      active: activeCount,
      resolved: resolvedCount,
      resolutionRate,
      averageResolutionDays,
    },
    byType: {
      lost: sum(totals, (row) => row.type === "lost"),
      found: sum(totals, (row) => row.type === "found"),
    },
    commonCategories,
    hotspots,
    reports: reportSummary,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getDashboardAnalytics };
