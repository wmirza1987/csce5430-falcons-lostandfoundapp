// Match queries (FR-MATCH-02). Responses carry the confidence score and the
// public listing details only. Scoring factors are never returned (FR-MATCH-03).
const listingsRepo = require("../repos/listings");
const matchesRepo = require("../repos/matches");
const { isGuid } = require("../services/validation");

function publicListingView(listing) {
  return {
    id: listing._id,
    type: listing.type,
    title: listing.title,
    category: listing.category,
    brand: listing.brand,
    color: listing.color,
    description: listing.description,
    date: listing.date,
    location: listing.location,
    images: listing.images,
    status: listing.status,
  };
}

function matchView(match, viewerId) {
  const lostOwner = match.lostListing.createdBy;
  const foundOwner = match.foundListing.createdBy;
  const viewer = viewerId.toString();

  let yourRole = null;

  if (lostOwner === viewer) {
    yourRole = "lost";
  } else if (foundOwner === viewer) {
    yourRole = "found";
  }

  return {
    id: match._id,
    score: match.score,
    createdAt: match.createdAt,
    yourRole,
    canClaim:
      yourRole === "lost" &&
      match.lostListing.status === "active" &&
      match.foundListing.status === "active",
    lostListing: publicListingView(match.lostListing),
    foundListing: publicListingView(match.foundListing),
  };
}

// Replaces the listing ids on each match with the listing rows (a join
// populate). A match whose listing no longer exists gets null for that side.
async function attachListings(matches) {
  const ids = matches.flatMap((match) => [match.lostListing, match.foundListing]);
  const rows = await listingsRepo.findByIds(ids);
  const byId = new Map(rows.map((row) => [row._id, row]));

  return matches.map((match) => ({
    ...match,
    lostListing: byId.get(match.lostListing) || null,
    foundListing: byId.get(match.foundListing) || null,
  }));
}

async function getListingMatches(req, res) {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const listing = await listingsRepo.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.createdBy !== req.user._id) {
      return res.status(403).json({
        message: "You can only view matches for your own listings.",
      });
    }

    const matches = (await attachListings(await matchesRepo.findByListing(listing._id))).filter(
      (match) => match.lostListing && match.foundListing
    );

    return res.status(200).json({
      matches: matches.map((match) => matchView(match, req.user._id)),
    });
  } catch (error) {
    console.error(`Unable to retrieve matches: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve matches." });
  }
}

async function getMyMatches(req, res) {
  try {
    const matches = (await attachListings(await matchesRepo.findByOwner(req.user._id))).filter(
      (match) => match.lostListing && match.foundListing
    );

    return res.status(200).json({
      matches: matches.map((match) => matchView(match, req.user._id)),
    });
  } catch (error) {
    console.error(`Unable to retrieve matches: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve matches." });
  }
}

// A single match, visible only to the owners of its two listings.
async function getMatchById(req, res) {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid match id." });
    }

    const found = await matchesRepo.findById(req.params.id);
    const match = found ? (await attachListings([found]))[0] : null;

    if (!match || !match.lostListing || !match.foundListing) {
      return res.status(404).json({
        message: "This match is no longer available for claiming.",
      });
    }

    const viewer = req.user._id;
    const isParticipant =
      match.lostListing.createdBy === viewer || match.foundListing.createdBy === viewer;

    if (!isParticipant) {
      return res.status(403).json({ message: "You do not have access to this match." });
    }

    return res.status(200).json({ match: matchView(match, req.user._id) });
  } catch (error) {
    console.error(`Unable to retrieve match: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve match." });
  }
}

module.exports = {
  getListingMatches,
  getMatchById,
  getMyMatches,
};
