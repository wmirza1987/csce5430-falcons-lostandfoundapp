// Match queries (FR-MATCH-02). Responses carry the confidence score and the
// public listing details only. Scoring factors are never returned (FR-MATCH-03).
const Listing = require("../models/Listing");
const Match = require("../models/Match");

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
  const lostOwner = match.lostListing.createdBy.toString();
  const foundOwner = match.foundListing.createdBy.toString();
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

const MATCH_POPULATE = [
  { path: "lostListing" },
  { path: "foundListing" },
];

async function findMatchesQuery(listingIds) {
  return Match.find({
    $or: [{ lostListing: { $in: listingIds } }, { foundListing: { $in: listingIds } }],
  })
    .sort({ score: -1, createdAt: -1 })
    .populate(MATCH_POPULATE);
}

async function getListingMatches(req, res) {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "You can only view matches for your own listings.",
      });
    }

    const matches = await findMatchesQuery([listing._id]);

    return res.status(200).json({
      matches: matches.map((match) => matchView(match, req.user._id)),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    console.error(`Unable to retrieve matches: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve matches." });
  }
}

async function getMyMatches(req, res) {
  try {
    const listings = await Listing.find({
      createdBy: req.user._id,
      isDeleted: false,
    }).select("_id");

    const listingIds = listings.map((listing) => listing._id);

    if (listingIds.length === 0) {
      return res.status(200).json({ matches: [] });
    }

    const matches = await findMatchesQuery(listingIds);

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
    const match = await Match.findById(req.params.id).populate(MATCH_POPULATE);

    if (!match || !match.lostListing || !match.foundListing) {
      return res.status(404).json({
        message: "This match is no longer available for claiming.",
      });
    }

    const viewer = req.user._id.toString();
    const isParticipant =
      match.lostListing.createdBy.toString() === viewer ||
      match.foundListing.createdBy.toString() === viewer;

    if (!isParticipant) {
      return res.status(403).json({ message: "You do not have access to this match." });
    }

    return res.status(200).json({ match: matchView(match, req.user._id) });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid match id." });
    }

    console.error(`Unable to retrieve match: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve match." });
  }
}

module.exports = {
  getListingMatches,
  getMatchById,
  getMyMatches,
};
