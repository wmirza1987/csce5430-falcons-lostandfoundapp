const Match = require("../models/Match");
const Listing = require("../models/Listing");
const { notifyPotentialMatch } = require("./notificationService");

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const MINIMUM_MATCH_SCORE = 65;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "near",
  "from",
  "inside",
  "outside",
  "lost",
  "found",
  "item",
  "this",
  "that",
  "was",
  "were",
  "has",
  "have",
  "had",
  "into",
  "over",
  "under",
  "about",
  "around",
  "some",
  "any",
  "my",
  "our",
  "your",
  "their",
  "its",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "or",
  "is",
  "are",
  "be",
  "been",
  "it",
  "as",
  "if",
]);

function normalizeWord(word) {
  const normalized = String(word || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized.length <= 2 || STOP_WORDS.has(normalized)) {
    return "";
  }

  // Very small, deterministic normalization so "wallet"/"wallets" and
  // "book"/"books" count as the same public keyword.
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

  const text = [
    listing.title,
    listing.description,
    listing.brand,
    listing.color,
  ]
    .filter(Boolean)
    .join(" ");

  return new Set(
    text
      .split(/\s+/)
      .map(normalizeWord)
      .filter(Boolean)
  );
}

function calculateKeywordDetails(lostListing, foundListing) {
  const lostKeywords = getKeywords(lostListing);
  const foundKeywords = getKeywords(foundListing);

  const shared = [...lostKeywords]
    .filter((keyword) => foundKeywords.has(keyword))
    .sort();

  if (shared.length >= 3) {
    return { points: 20, shared };
  }

  if (shared.length >= 1) {
    return { points: 10, shared };
  }

  return { points: 0, shared: [] };
}

function calculateKeywordScore(lostListing, foundListing) {
  return calculateKeywordDetails(lostListing, foundListing).points;
}

function calculateCategoryDetails(lostListing, foundListing) {
  const lostCategory = String(lostListing?.category || "").trim().toLowerCase();
  const foundCategory = String(foundListing?.category || "").trim().toLowerCase();

  return {
    points:
      lostCategory && foundCategory && lostCategory === foundCategory ? 35 : 0,
  };
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

  if (daysApart <= 1) {
    return { points: 25, daysApart: Number(daysApart.toFixed(2)) };
  }

  if (daysApart <= 7) {
    return { points: 15, daysApart: Number(daysApart.toFixed(2)) };
  }

  return { points: 0, daysApart: Number(daysApart.toFixed(2)) };
}

function calculateLocationDetails(lostListing, foundListing) {
  const lostBuilding = String(lostListing?.location?.building || "")
    .trim()
    .toLowerCase();
  const foundBuilding = String(foundListing?.location?.building || "")
    .trim()
    .toLowerCase();
  const lostZone = String(lostListing?.location?.zone || "").trim().toLowerCase();
  const foundZone = String(foundListing?.location?.zone || "").trim().toLowerCase();

  if (lostBuilding && foundBuilding && lostBuilding === foundBuilding) {
    return { points: 20, basis: "same building" };
  }

  if (lostZone && foundZone && lostZone === foundZone) {
    return { points: 10, basis: "same campus zone" };
  }

  return { points: 0, basis: "" };
}

function calculateMatchDetails(lostListing, foundListing) {
  if (!lostListing || !foundListing) {
    return {
      score: 0,
      factors: {
        category: { points: 0 },
        date: { points: 0, daysApart: null },
        location: { points: 0, basis: "" },
        keywords: { points: 0, shared: [] },
      },
      explanation: [],
    };
  }

  const category = calculateCategoryDetails(lostListing, foundListing);
  const date = calculateDateDetails(lostListing, foundListing);
  const location = calculateLocationDetails(lostListing, foundListing);
  const keywords = calculateKeywordDetails(lostListing, foundListing);
  const score =
    category.points + date.points + location.points + keywords.points;

  const explanation = [];

  if (category.points > 0) {
    explanation.push(`Same category (${category.points} points)`);
  }

  if (date.points > 0) {
    explanation.push(
      `Dates ${date.daysApart} day${date.daysApart === 1 ? "" : "s"} apart (${date.points} points)`
    );
  }

  if (location.points > 0) {
    explanation.push(`${location.basis} (${location.points} points)`);
  }

  if (keywords.points > 0) {
    explanation.push(
      `Shared public keywords: ${keywords.shared.join(", ")} (${keywords.points} points)`
    );
  }

  return {
    score,
    factors: {
      category,
      date,
      location,
      keywords,
    },
    explanation,
  };
}

function calculateMatchScore(lostListing, foundListing) {
  return calculateMatchDetails(lostListing, foundListing).score;
}

function pairKey(lostId, foundId) {
  return `${lostId.toString()}:${foundId.toString()}`;
}

// Recomputes every candidate pair for one listing and persists the suggestions
// that meet the 65-point threshold. Also removes stale suggestions. Returns
// newly created matches so callers can emit notifications exactly once.
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

  const existingByPair = new Map(
    existingMatches.map((match) => [
      pairKey(match.lostListing, match.foundListing),
      match,
    ])
  );
  const seenPairs = new Set();
  const matches = [];
  const newMatches = [];

  for (const candidate of candidates) {
    const lostListing = listing.type === "lost" ? listing : candidate;
    const foundListing = listing.type === "found" ? listing : candidate;
    const key = pairKey(lostListing._id, foundListing._id);

    const details = calculateMatchDetails(lostListing, foundListing);

    if (details.score < MINIMUM_MATCH_SCORE) {
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
    .filter(
      (match) => !seenPairs.has(pairKey(match.lostListing, match.foundListing))
    )
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

async function removeMatchesForListing(listingId) {
  await Match.deleteMany({
    $or: [{ lostListing: listingId }, { foundListing: listingId }],
  });
}

module.exports = {
  MINIMUM_MATCH_SCORE,
  calculateMatchDetails,
  calculateMatchScore,
  calculateKeywordDetails,
  calculateKeywordScore,
  getKeywords,
  refreshMatchesForListing,
  removeMatchesForListing,
};
