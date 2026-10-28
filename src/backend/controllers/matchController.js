const Listing = require("../models/Listing");
const Match = require("../models/Match");

const LISTING_FIELDS =
  "title type category brand color description date location images status createdBy";
const USER_FIELDS = "firstName lastName";

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

    const matches = await Match.find({
      $or: [{ lostListing: listing._id }, { foundListing: listing._id }],
    })
      .sort({ score: -1, createdAt: -1 })
      .populate("lostListing", LISTING_FIELDS)
      .populate("foundListing", LISTING_FIELDS)
      .populate({
        path: "lostListing",
        populate: { path: "createdBy", select: USER_FIELDS },
      })
      .populate({
        path: "foundListing",
        populate: { path: "createdBy", select: USER_FIELDS },
      })
      .lean();

    return res.status(200).json({ matches });
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

    const matches = await Match.find({
      $or: [
        { lostListing: { $in: listingIds } },
        { foundListing: { $in: listingIds } },
      ],
    })
      .sort({ score: -1, createdAt: -1 })
      .populate("lostListing", LISTING_FIELDS)
      .populate("foundListing", LISTING_FIELDS)
      .populate({
        path: "lostListing",
        populate: { path: "createdBy", select: USER_FIELDS },
      })
      .populate({
        path: "foundListing",
        populate: { path: "createdBy", select: USER_FIELDS },
      })
      .lean();

    return res.status(200).json({ matches });
  } catch (error) {
    console.error(`Unable to retrieve matches: ${error.message}`);
    return res.status(500).json({ message: "Unable to retrieve matches." });
  }
}

module.exports = {
  getListingMatches,
  getMyMatches,
};
