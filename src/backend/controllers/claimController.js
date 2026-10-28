const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const { removeMatchesForListing } = require("../services/matchingService");
const {
  notifyClaimDecision,
  notifyCompetingClaimClosed,
  notifyNewClaim,
  notifyResolution,
} = require("../services/notificationService");

const CLAIMANT_FIELDS = "firstName lastName";

function normalizePrivateDetails(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function logError(context, error) {
  console.error(`${context}: ${error.message}`);
}

// FR-CLM-01: a verified non-owner may claim an Active Found listing with an
// ownership explanation and at least two private identifying details.
async function submitClaim(req, res) {
  try {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before submitting a claim.",
      });
    }

    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.type !== "found") {
      return res.status(400).json({
        message: "Claims can only be submitted for Found listings.",
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "This listing is no longer accepting claims.",
      });
    }

    if (listing.createdBy.toString() === req.user._id.toString()) {
      return res.status(403).json({
        message: "You cannot claim your own listing.",
      });
    }

    const explanation = String(req.body.explanation || "").trim();
    const privateDetails = normalizePrivateDetails(req.body.privateDetails);

    if (!explanation) {
      return res.status(400).json({
        message: "An ownership explanation is required.",
      });
    }

    if (privateDetails.length < 2) {
      return res.status(400).json({
        message: "At least two private identifying details are required.",
      });
    }

    const existingClaim = await Claim.findOne({
      listing: listing._id,
      claimant: req.user._id,
      status: { $in: ["pending", "approved"] },
    });

    if (existingClaim) {
      return res.status(409).json({
        message: "You already have an active claim for this listing.",
      });
    }

    const claim = await Claim.create({
      listing: listing._id,
      claimant: req.user._id,
      explanation,
      privateDetails,
    });

    await notifyNewClaim(claim, listing).catch((error) => {
      logError("Unable to notify owner of new claim", error);
    });

    const responseClaim = claim.toObject();
    delete responseClaim.privateDetails;

    return res.status(201).json({
      message: "Claim submitted successfully. The owner will review it.",
      claim: responseClaim,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    logError("Unable to submit claim", error);
    return res.status(500).json({
      message: "Unable to submit claim.",
    });
  }
}

// Owner-only review list. Private evidence is included here for the owner,
// and nowhere else except the claimant's own claim view.
async function getListingClaims(req, res) {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Only the listing owner can review claims.",
      });
    }

    const claims = await Claim.find({ listing: listing._id })
      .select("+privateDetails")
      .populate("claimant", CLAIMANT_FIELDS)
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({ claims });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    logError("Unable to retrieve claims", error);
    return res.status(500).json({ message: "Unable to retrieve claims." });
  }
}

async function getMyClaims(req, res) {
  try {
    const claims = await Claim.find({ claimant: req.user._id })
      .select("+privateDetails")
      .populate("listing", "title type category brand color date status images")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ claims });
  } catch (error) {
    logError("Unable to retrieve my claims", error);
    return res.status(500).json({ message: "Unable to retrieve claims." });
  }
}

async function getClaimById(req, res) {
  try {
    const claim = await Claim.findById(req.params.id)
      .select("+privateDetails")
      .populate("claimant", CLAIMANT_FIELDS)
      .populate("listing", "title type category brand color date status images createdBy");

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const isClaimant = claim.claimant._id.toString() === req.user._id.toString();
    const isOwner =
      claim.listing.createdBy.toString() === req.user._id.toString();

    if (!isClaimant && !isOwner) {
      return res.status(403).json({
        message: "You do not have permission to view this claim.",
      });
    }

    return res.status(200).json({ claim });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    logError("Unable to retrieve claim", error);
    return res.status(500).json({ message: "Unable to retrieve claim." });
  }
}

// FR-CLM-02/03: owner approves one pending claim or rejects it. Approval moves
// the listing to Pending Return and closes every competing pending claim.
async function decideClaim(req, res) {
  try {
    const action = String(req.body.action || "").toLowerCase();

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        message: "Action must be either approve or reject.",
      });
    }

    const claim = await Claim.findById(req.params.id)
      .select("+privateDetails")
      .populate("listing");

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const listing = claim.listing;

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Only the listing owner can decide this claim.",
      });
    }

    if (claim.status !== "pending") {
      return res.status(409).json({
        message: "Only a pending claim can be approved or rejected.",
      });
    }

    claim.decisionNote = String(req.body.decisionNote || "").trim();
    claim.decidedBy = req.user._id;
    claim.decidedAt = new Date();

    if (action === "reject") {
      claim.status = "rejected";
      await claim.save();

      await notifyClaimDecision(claim, listing, false).catch((error) => {
        logError("Unable to notify claimant of rejection", error);
      });

      return res.status(200).json({
        message: "Claim rejected.",
        claim,
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "Only an active listing can have a claim approved.",
      });
    }

    const updatedListing = await Listing.findOneAndUpdate(
      { _id: listing._id, status: "active", isDeleted: false },
      { $set: { status: "pending_return" } },
      { new: true }
    );

    if (!updatedListing) {
      return res.status(409).json({
        message: "This listing is no longer available for claim approval.",
      });
    }

    claim.status = "approved";
    await claim.save();

    const competingClaims = await Claim.find({
      listing: listing._id,
      status: "pending",
      _id: { $ne: claim._id },
    });

    if (competingClaims.length > 0) {
      await Claim.updateMany(
        { _id: { $in: competingClaims.map((item) => item._id) } },
        {
          $set: {
            status: "closed",
            decidedBy: req.user._id,
            decidedAt: new Date(),
            decisionNote: "Another claim for this listing was approved.",
          },
        }
      );

      for (const competingClaim of competingClaims) {
        await notifyCompetingClaimClosed(competingClaim, updatedListing).catch(
          (error) => {
            logError("Unable to notify competing claimant", error);
          }
        );
      }
    }

    await notifyClaimDecision(claim, updatedListing, true).catch((error) => {
      logError("Unable to notify claimant of approval", error);
    });

    await removeMatchesForListing(listing._id).catch((error) => {
      logError("Unable to remove matches after claim approval", error);
    });

    return res.status(200).json({
      message: "Claim approved. The listing is now pending return.",
      claim,
      listingStatus: updatedListing.status,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    logError("Unable to decide claim", error);
    return res.status(500).json({
      message: "Unable to decide claim.",
    });
  }
}

// FR-CLM-03: after handoff, the owner can mark a Pending Return item Resolved.
async function resolveListing(req, res) {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Only the listing owner can mark it resolved.",
      });
    }

    if (listing.status !== "pending_return") {
      return res.status(409).json({
        message: "Only a pending return listing can be marked resolved.",
      });
    }

    const approvedClaim = await Claim.findOne({
      listing: listing._id,
      status: "approved",
    });

    if (!approvedClaim) {
      return res.status(409).json({
        message: "An approved claim is required before resolution.",
      });
    }

    listing.status = "resolved";
    await listing.save();

    await notifyResolution(approvedClaim, listing).catch((error) => {
      logError("Unable to notify resolution", error);
    });

    await removeMatchesForListing(listing._id).catch((error) => {
      logError("Unable to remove matches after resolution", error);
    });

    return res.status(200).json({
      message: "Listing marked resolved.",
      listing,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    logError("Unable to resolve listing", error);
    return res.status(500).json({
      message: "Unable to resolve listing.",
    });
  }
}

module.exports = {
  decideClaim,
  getClaimById,
  getListingClaims,
  getMyClaims,
  resolveListing,
  submitClaim,
};
