// FR-ADM-03: aggregate-only dashboard data. This service intentionally selects
// only non-sensitive fields. Private claim evidence, message bodies, user
// emails, and listing private details are never queried or returned.
const Listing = require("../models/Listing");
const Report = require("../models/Report");
const { findBuilding } = require("./campusService");

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function countBy(items, keyFn, limit = 6) {
  const counts = new Map();

  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

async function getDashboardAnalytics() {
  // Only non-private fields used for grouping and counts.
  const listings = await Listing.find({ isDeleted: false })
    .select("status type category location isHidden createdAt updatedAt")
    .lean();

  const visible = listings.filter((listing) => !listing.isHidden);
  const resolved = visible.filter((listing) => listing.status === "resolved");
  const active = visible.filter((listing) => listing.status === "active");

  const resolutionRate = visible.length === 0 ? 0 : round((resolved.length / visible.length) * 100, 1);

  const totalResolutionMs = resolved.reduce((sum, listing) => {
    const start = new Date(listing.createdAt).getTime();
    const end = new Date(listing.updatedAt).getTime();
    return sum + Math.max(end - start, 0);
  }, 0);
  const averageResolutionDays =
    resolved.length === 0 ? 0 : round(totalResolutionMs / resolved.length / DAY_MS, 1);

  const commonCategories = countBy(visible, (listing) => listing.category, 6);

  // Hotspots are building/zone counts joined to the coarse campus catalog.
  const buildingCounts = countBy(visible, (listing) => listing.location?.building, 6);
  const hotspots = buildingCounts.map((entry) => {
    const building = findBuilding(entry.name);
    return {
      name: entry.name,
      zone: building ? building.zone : (visible.find((l) => l.location?.building === entry.name)?.location?.zone || ""),
      count: entry.count,
      lat: building ? building.lat : null,
      lng: building ? building.lng : null,
    };
  });

  const reportStatuses = await Report.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const reportSummary = { open: 0, reviewing: 0, resolved: 0, total: 0 };
  for (const row of reportStatuses) {
    if (row._id in reportSummary) reportSummary[row._id] = row.count;
    reportSummary.total += row.count;
  }

  return {
    listings: {
      total: visible.length,
      active: active.length,
      resolved: resolved.length,
      resolutionRate,
      averageResolutionDays,
    },
    byType: {
      lost: visible.filter((listing) => listing.type === "lost").length,
      found: visible.filter((listing) => listing.type === "found").length,
    },
    commonCategories,
    hotspots,
    reports: reportSummary,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getDashboardAnalytics };
