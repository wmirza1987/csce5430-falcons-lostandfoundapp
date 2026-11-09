// Claim verification workflow (FR-CLM-01, FR-CLM-02, FR-CLM-03).
const Claim = require("../models/Claim");
const Listing = require("../models/Listing");
const Match = require("../models/Match");
const User = require("../models/User");
const { removeMatchesForListing } = require("../services/matchingService");
const {
  decryptText,
  deleteEncryptedFile,
  encryptText,
  readEncryptedFile,
  saveEncryptedFile,
} = require("../services/evidenceCrypto");
const {
  createThread,
} = require("../services/messagingService");
const {
  notifyClaimDecision,
  notifyCompetingClaimClosed,
  notifyNewClaim,
  notifyThreadOpened,
} = require("../services/notificationService");

const MAX_EXPLANATION_LENGTH = 1000;
const NO_LONGER_AVAILABLE = "This match is no longer available for claiming.";

function logError(context, error) {
  console.error(`${context}: ${error.message}`);
}

function isSameUser(id, user) {
  return Boolean(id) && id.toString() === user._id.toString();
}

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

function evidenceViews(claim) {
  return (claim.evidenceImages || []).map((image, index) => ({
    index,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    url: `/api/v1/claims/${claim._id}/evidence/${index}`,
  }));
}

// Builds the response for a claim. Evidence text and photos are included only
// for the claimant and the Found listing owner; everyone else never receives them.
function claimView(claim, { listing = null, claimant = null, includeOwnerDetails = false } = {}) {
  let explanation = null;

  try {
    explanation = claim.explanationCiphertext ? decryptText(claim.explanationCiphertext) : null;
  } catch (error) {
    logError(`Unable to read evidence for claim ${claim._id}`, error);
  }

  const view = {
    id: claim._id,
    matchId: claim.match,
    status: claim.status,
    explanation,
    evidence: evidenceViews(claim),
    decisionNote: claim.decisionNote,
    decidedAt: claim.decidedAt || null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };

  if (listing) {
    view.listing = publicListingView(listing);
  }

  if (includeOwnerDetails && claimant) {
    view.claimant = { firstName: claimant.firstName, lastName: claimant.lastName };
  }

  if (includeOwnerDetails && listing && listing.privateDetails) {
    // FR-CLM-02: the owner compares their private details with the evidence.
    view.listing.privateDetails = listing.privateDetails;
  }

  return view;
}

function removeStoredEvidence(images) {
  for (const image of images) {
    deleteEncryptedFile(image.storedName);
  }
}

// FR-CLM-01: the Lost listing owner submits evidence for one matched pair.
async function submitClaim(req, res) {
  const savedImages = [];

  try {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before submitting a claim.",
      });
    }

    const explanation = String(req.body.explanation ?? "").trim();

    if (!explanation) {
      return res.status(400).json({ message: "Evidence description is required." });
    }

    if (explanation.length > MAX_EXPLANATION_LENGTH) {
      return res.status(400).json({
        message: "Evidence description must be 1000 characters or fewer.",
      });
    }

    const match = await Match.findById(req.params.id)
      .populate("lostListing")
      .populate("foundListing");

    if (!match || !match.lostListing || !match.foundListing) {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    const lost = match.lostListing;
    const found = match.foundListing;

    if (!isSameUser(lost.createdBy, req.user)) {
      return res.status(403).json({
        message: "Only the owner of the lost listing can claim this match.",
      });
    }

    if (lost.isDeleted || found.isDeleted || lost.status !== "active" || found.status !== "active") {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    const previous = await Claim.findOne({
      match: match._id,
      claimant: req.user._id,
      status: { $in: ["pending", "approved", "rejected"] },
    }).select("status");

    if (previous && ["pending", "approved"].includes(previous.status)) {
      return res.status(409).json({
        message: "You already have an active claim for this match.",
      });
    }

    if (previous && previous.status === "rejected") {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    for (const file of req.files || []) {
      savedImages.push(saveEncryptedFile(file.buffer, file.mimetype));
    }

    const claim = await Claim.create({
      match: match._id,
      listing: found._id,
      claimant: req.user._id,
      explanationCiphertext: encryptText(explanation),
      evidenceImages: savedImages,
    });

    await notifyNewClaim(claim, found).catch((error) => {
      logError("Unable to notify owner of new claim", error);
    });

    return res.status(201).json({
      message: "Claim submitted. The owner will review your evidence.",
      claim: claimView(
        await Claim.findById(claim._id).select("+explanationCiphertext +evidenceImages")
      ),
    });
  } catch (error) {
    removeStoredEvidence(savedImages);

    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid match id." });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the submitted claim." });
    }

    logError("Unable to submit claim", error);
    return res.status(500).json({ message: "Unable to submit claim." });
  }
}

// Owner-only review list for one Found listing.
async function getListingClaims(req, res) {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (!isSameUser(listing.createdBy, req.user)) {
      return res.status(403).json({ message: "Only the listing owner can review claims." });
    }

    const claims = await Claim.find({ listing: listing._id })
      .select("+explanationCiphertext +evidenceImages")
      .populate("claimant", "firstName lastName")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      claims: claims.map((claim) =>
        claimView(claim, { listing, claimant: claim.claimant, includeOwnerDetails: true })
      ),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    logError("Unable to retrieve claims", error);
    return res.status(500).json({ message: "Unable to retrieve claims." });
  }
}

// The claimant's own claims, shown without any owner-only details.
async function getMyClaims(req, res) {
  try {
    const claims = await Claim.find({ claimant: req.user._id })
      .select("+explanationCiphertext +evidenceImages")
      .sort({ createdAt: -1 });

    const views = [];

    for (const claim of claims) {
      const listing = await Listing.findById(claim.listing);
      views.push(claimView(claim, { listing }));
    }

    return res.status(200).json({ claims: views });
  } catch (error) {
    logError("Unable to retrieve my claims", error);
    return res.status(500).json({ message: "Unable to retrieve claims." });
  }
}

async function getClaimById(req, res) {
  try {
    const claim = await Claim.findById(req.params.id).select("+explanationCiphertext +evidenceImages");

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const listing = await Listing.findById(claim.listing).select("+privateDetails");

    if (!listing) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const isClaimant = isSameUser(claim.claimant, req.user);
    const isOwner = isSameUser(listing.createdBy, req.user);

    if (!isClaimant && !isOwner) {
      return res.status(403).json({
        message: "You do not have permission to view this claim.",
      });
    }

    const claimant = isOwner
      ? await User.findById(claim.claimant).select("firstName lastName")
      : null;

    return res.status(200).json({
      claim: claimView(claim, { listing, claimant, includeOwnerDetails: isOwner }),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    logError("Unable to retrieve claim", error);
    return res.status(500).json({ message: "Unable to retrieve claim." });
  }
}

// Serves one encrypted evidence photo to the claimant or the listing owner only.
async function getEvidenceImage(req, res) {
  try {
    const claim = await Claim.findById(req.params.id).select("+evidenceImages");

    if (!claim) {
      return res.status(404).json({ message: "Evidence not found." });
    }

    const listing = await Listing.findById(claim.listing);

    if (!listing) {
      return res.status(404).json({ message: "Evidence not found." });
    }

    if (!isSameUser(claim.claimant, req.user) && !isSameUser(listing.createdBy, req.user)) {
      return res.status(403).json({ message: "You do not have permission to view this evidence." });
    }

    const image = claim.evidenceImages[Number(req.params.index)];

    if (!image) {
      return res.status(404).json({ message: "Evidence not found." });
    }

    const bytes = readEncryptedFile(image);

    res.set("Content-Type", image.mimeType);
    res.set("Cache-Control", "private, no-store");
    return res.status(200).send(bytes);
  } catch (error) {
    logError("Unable to open evidence", error);
    return res.status(500).json({ message: "Unable to open evidence photo." });
  }
}

// FR-CLM-02: the owner approves or rejects a claim. Approval resolves the listing
// and opens a message thread (FR-CLM-03). Each step is confirmed before the next,
// and earlier steps are reverted if a later one fails (NFR-REL-01, INT-20).
async function decideClaim(req, res) {
  try {
    const action = String(req.body.action || "").toLowerCase();

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be either approve or reject." });
    }

    const decisionNote = String(req.body.decisionNote || "").trim().slice(0, 500);
    const claim = await Claim.findById(req.params.id);

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const listing = await Listing.findById(claim.listing);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (!isSameUser(listing.createdBy, req.user)) {
      return res.status(403).json({ message: "Only the listing owner can decide this claim." });
    }

    const decision = { decidedBy: req.user._id, decidedAt: new Date(), decisionNote };

    if (action === "reject") {
      const rejected = await Claim.findOneAndUpdate(
        { _id: claim._id, status: "pending" },
        { $set: { status: "rejected", ...decision } },
        { new: true }
      );

      if (!rejected) {
        return res.status(409).json({ message: "Only a pending claim can be rejected." });
      }

      await notifyClaimDecision(rejected, listing, false).catch((error) => {
        logError("Unable to notify claimant of rejection", error);
      });

      return res.status(200).json({
        message: "Claim rejected. The listing remains active for other claims.",
        claim: claimView(rejected, { listing }),
      });
    }

    if (claim.status === "approved") {
      return res.status(409).json({ message: "This claim has already been approved." });
    }

    if (claim.status === "closed") {
      return res.status(409).json({
        message: "This claim was closed because another claim was approved.",
      });
    }

    const resolved = await Listing.findOneAndUpdate(
      { _id: listing._id, status: "active", isDeleted: false },
      { $set: { status: "resolved" } },
      { new: true }
    );

    if (!resolved) {
      return res.status(409).json({ message: "This match is no longer available for claiming." });
    }

    const approved = await Claim.findOneAndUpdate(
      { _id: claim._id, status: { $in: ["pending", "rejected"] } },
      { $set: { status: "approved", ...decision } },
      { new: true }
    );

    if (!approved) {
      await Listing.updateOne({ _id: listing._id }, { $set: { status: "active" } });
      return res.status(409).json({ message: "Only a pending or rejected claim can be approved." });
    }

    try {
      await createThread(approved, resolved);
    } catch (error) {
      logError("Unable to open message thread; reverting approval", error);
      await Claim.updateOne(
        { _id: claim._id },
        {
          $set: {
            status: claim.status,
            decidedBy: claim.decidedBy || null,
            decidedAt: claim.decidedAt || null,
            decisionNote: claim.decisionNote,
          },
        }
      );
      await Listing.updateOne({ _id: listing._id }, { $set: { status: "active" } });
      return res.status(500).json({
        message: "Unable to approve claim. Nothing was changed; please try again.",
      });
    }

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

      for (const competing of competingClaims) {
        await notifyCompetingClaimClosed(competing, resolved).catch((error) => {
          logError("Unable to notify competing claimant", error);
        });
      }
    }

    await removeMatchesForListing(listing._id).catch((error) => {
      logError("Unable to remove matches after approval", error);
    });

    await notifyClaimDecision(approved, resolved, true).catch((error) => {
      logError("Unable to notify claimant of approval", error);
    });

    await notifyThreadOpened(approved, resolved, [approved.claimant, listing.createdBy]).catch(
      (error) => {
        logError("Unable to notify thread opened", error);
      }
    );

    return res.status(200).json({
      message: "Claim approved. The listing is resolved and a message thread is open.",
      claim: claimView(approved, { listing: resolved }),
      listingStatus: resolved.status,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    logError("Unable to decide claim", error);
    return res.status(500).json({ message: "Unable to decide claim." });
  }
}

module.exports = {
  decideClaim,
  getClaimById,
  getEvidenceImage,
  getListingClaims,
  getMyClaims,
  submitClaim,
};
