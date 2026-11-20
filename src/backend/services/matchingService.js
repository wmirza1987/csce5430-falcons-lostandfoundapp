const Match = require("../models/Match");
const Listing = require("../models/Listing");
const { notifyPotentialMatch } = require("./notificationService");

// FR-MATCH-01 scoring. Each component contributes a weighted share of a 0 to 1
// composite score. Weights sum to 1.0.
const WEIGHTS = {
  category: 0.35,
  date: 0.25,
  location: 0.2,
  keywords: 0.2,
};

const DEFAULT_MATCH_THRESHOLD = 0.6;
const FULL_DATE_WINDOW_DAYS = 1;
const DATE_WINDOW_DAYS = 7;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "near", "from", "inside", "outside", "lost",
  "found", "item", "this", "that", "was", "were", "has", "have", "had", "into",
  "over", "under", "about", "around", "some", "any", "my", "our", "your",
  "their", "its", "a", "an", "of", "to", "in", "on", "at", "by", "or", "is",
  "are", "be", "been", "it", "as", "if",
]);

// The threshold is configurable (MATCH_THRESHOLD, 0 to 1). It defaults to 0.6.
function getMatchThreshold() {
  const configured = Number(process.env.MATCH_THRESHOLD);

  if (Number.isFinite(configured) && configured > 0 && configured <= 1) {
    return configured;
  }

  return DEFAULT_MATCH_THRESHOLD;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeWord(word) {
  const normalized = String(word || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized.length <= 2 || STOP_WORDS.has(normalized)) {
    return "";
  }

  // Small deterministic normalization so "wallet"/"wallets" count as one word.
  if (normalized.length > 4 && normalized.endsWith("ies")) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (normalized.length > 3 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function getKeywords(listing) {
  if (!listing) {
    return new Set();
  }

  const text = [listing.title, listing.description, listing.brand, listing.color]
    .filter(Boolean)
    .join(" ");

  return new Set(text.split(/\s+/).map(normalizeWord).filter(Boolean));
}

function calculateCategoryDetails(lostListing, foundListing) {
  const lostCategory = String(lostListing?.category || "").trim().toLowerCase();
  const foundCategory = String(foundListing?.category || "").trim().toLowerCase();
  const matches = Boolean(lostCategory) && lostCategory === foundCategory;

  return { points: matches ? WEIGHTS.category : 0 };
}

function calculateDateDetails(lostListing, foundListing) {
  if (!lostListing?.date || !foundListing?.date) {
    return { points: 0, daysApart: null };
  }

  const lostDate = new Date(lostListing.date);
  const foundDate = new Date(foundListing.date);

  if (Number.isNaN(lostDate.getTime()) || Number.isNaN(foundDate.getTime())) {
    return { points: 0, daysApart: null };
  }

  const daysApart = Math.abs(foundDate - lostDate) / DAY_IN_MS;
  const shown = round(daysApart);

  if (daysApart <= FULL_DATE_WINDOW_DAYS) {
    return { points: WEIGHTS.date, daysApart: shown };
  }

  if (daysApart <= DATE_WINDOW_DAYS) {
    return { points: round(WEIGHTS.date / 2), daysApart: shown };
  }

  return { points: 0, daysApart: shown };
}

function calculateLocationDetails(lostListing, foundListing) {
  const lostBuilding = String(lostListing?.location?.building || "").trim().toLowerCase();
  const foundBuilding = String(foundListing?.location?.building || "").trim().toLowerCase();
  const lostZone = String(lostListing?.location?.zone || "").trim().toLowerCase();
  const foundZone = String(foundListing?.location?.zone || "").trim().toLowerCase();

  if (lostBuilding && lostBuilding === foundBuilding) {
    return { points: WEIGHTS.location, basis: "same building" };
  }

  if (lostZone && lostZone === foundZone) {
    return { points: round(WEIGHTS.location / 2), basis: "same campus zone" };
  }

  return { points: 0, basis: "" };
}

function calculateKeywordDetails(lostListing, foundListing) {
  const foundKeywords = getKeywords(foundListing);
  const shared = [...getKeywords(lostListing)]
    .filter((keyword) => foundKeywords.has(keyword))
    .sort();

  if (shared.length >= 3) {
    return { points: WEIGHTS.keywords, shared };
  }

  if (shared.length >= 1) {
    return { points: round(WEIGHTS.keywords / 2), shared };
  }

  return { points: 0, shared: [] };
}

// Returns the composite score and the per-component factors. Factors are for
// storage and tuning only; callers must not expose them publicly (FR-MATCH-03).
function calculateMatchDetails(lostListing, foundListing) {
  const factors = {
    category: calculateCategoryDetails(lostListing, foundListing),
    date: calculateDateDetails(lostListing, foundListing),
    location: calculateLocationDetails(lostListing, foundListing),
    keywords: calculateKeywordDetails(lostListing, foundListing),
  };

  const score = round(
    factors.category.points +
      factors.date.points +
      factors.location.points +
      factors.keywords.points
  );

  return { score, factors };
}

function calculateMatchScore(lostListing, foundListing) {
  return calculateMatchDetails(lostListing, foundListing).score;
}

function pairKey(lostId, foundId) {
  return `${lostId.toString()}:${foundId.toString()}`;
}

// Recomputes every opposite-type candidate for one listing, persists matches at
// or above the threshold, removes stale ones, and notifies both parties of new
// matches. Returns the newly created matches.
async function refreshMatchesForListing(listingOrId) {
  const listing =
    typeof listingOrId === "string" || listingOrId?._bsontype
      ? await Listing.findById(listingOrId)
      : listingOrId;

  if (!listing) {
    return { listing: null, matches: [], newMatches: [] };
  }

  const listingId = listing._id;
  const existingMatches = await Match.find({
    $or: [{ lostListing: listingId }, { foundListing: listingId }],
  });

  if (listing.isDeleted || listing.status !== "active") {
    await Match.deleteMany({
      _id: { $in: existingMatches.map((match) => match._id) },
    });
    return { listing, matches: [], newMatches: [] };
  }

  const oppositeType = listing.type === "lost" ? "found" : "lost";
  const candidates = await Listing.find({
    _id: { $ne: listingId },
    type: oppositeType,
    status: "active",
    isDeleted: false,
  });

  const threshold = getMatchThreshold();
  const existingByPair = new Map(
    existingMatches.map((match) => [pairKey(match.lostListing, match.foundListing), match])
  );
  const seenPairs = new Set();
  const matches = [];
  const newMatches = [];

  for (const candidate of candidates) {
    const lostListing = listing.type === "lost" ? listing : candidate;
    const foundListing = listing.type === "found" ? listing : candidate;
    const key = pairKey(lostListing._id, foundListing._id);
    const details = calculateMatchDetails(lostListing, foundListing);

    if (details.score < threshold) {
      continue;
    }

    seenPairs.add(key);

    const existing = existingByPair.get(key);

    if (existing) {
      existing.score = details.score;
      existing.factors = details.factors;
      await existing.save();
      matches.push(existing);
    } else {
      const match = await Match.create({
        lostListing: lostListing._id,
        foundListing: foundListing._id,
        score: details.score,
        factors: details.factors,
      });
      matches.push(match);
      newMatches.push({ match, lostListing, foundListing });
    }
  }

  const staleIds = existingMatches
    .filter((match) => !seenPairs.has(pairKey(match.lostListing, match.foundListing)))
    .map((match) => match._id);

  if (staleIds.length > 0) {
    await Match.deleteMany({ _id: { $in: staleIds } });
  }

  matches.sort((left, right) => right.score - left.score);

  for (const newMatch of newMatches) {
    await notifyPotentialMatch(newMatch);
  }

  return { listing, matches, newMatches };
}

// Matching is an optional dependency of listing creation (NFR REL 02). Jobs run
// in the background so a slow or failing match run never blocks or fails the
// listing request that triggered it.
const pendingMatchJobs = new Set();

function scheduleMatchRefresh(listing) {
  const job = refreshMatchesForListing(listing)
    .catch((error) => {
      console.error(`Matching failed for listing ${listing._id}: ${error.message}`);
    })
    .finally(() => pendingMatchJobs.delete(job));

  pendingMatchJobs.add(job);
  return job;
}

async function waitForPendingMatchJobs() {
  await Promise.allSettled([...pendingMatchJobs]);
}

async function removeMatchesForListing(listingId) {
  await Match.deleteMany({
    $or: [{ lostListing: listingId }, { foundListing: listingId }],
  });
}

module.exports = {
  DEFAULT_MATCH_THRESHOLD,
  WEIGHTS,
  calculateKeywordDetails,
  calculateMatchDetails,
  calculateMatchScore,
  getKeywords,
  getMatchThreshold,
  refreshMatchesForListing,
  removeMatchesForListing,
  scheduleMatchRefresh,
  waitForPendingMatchJobs,
};
