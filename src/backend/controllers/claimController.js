// Claim verification workflow (FR-CLM-01, FR-CLM-02, FR-CLM-03).
const { withTransaction } = require("../db/pool");
const claimsRepo = require("../repos/claims");
const listingsRepo = require("../repos/listings");
const matchesRepo = require("../repos/matches");
const usersRepo = require("../repos/users");
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
const { isGuid } = require("../services/validation");

const MAX_EXPLANATION_LENGTH = 1000;
const NO_LONGER_AVAILABLE = "This match is no longer available for claiming.";

// Raised inside the approval transaction to roll it back and answer with a
// specific status and message.
class DecisionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function logError(context, error) {
  console.error(`${context}: ${error.message}`);
}

function isSameUser(id, user) {
  return Boolean(id) && String(id) === String(user._id);
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

    const rawExplanation = (req.body || {}).explanation;
    const explanation = typeof rawExplanation === "string" ? rawExplanation.trim() : "";

    if (!explanation) {
      return res.status(400).json({ message: "Evidence description is required." });
    }

    if (explanation.length > MAX_EXPLANATION_LENGTH) {
      return res.status(400).json({
        message: "Evidence description must be 1000 characters or fewer.",
      });
    }

    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid match id." });
    }

    const match = await matchesRepo.findById(req.params.id);
    const lost = match ? await listingsRepo.findById(match.lostListing) : null;
    const found = match ? await listingsRepo.findById(match.foundListing) : null;

    if (!match || !lost || !found) {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    if (!isSameUser(lost.createdBy, req.user)) {
      return res.status(403).json({
        message: "Only the owner of the lost listing can claim this match.",
      });
    }

    if (lost.isDeleted || found.isDeleted || lost.status !== "active" || found.status !== "active") {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    const previous = await claimsRepo.findPriorStatuses(match._id, req.user._id);

    if (previous.some((status) => ["pending", "approved"].includes(status))) {
      return res.status(409).json({
        message: "You already have an active claim for this match.",
      });
    }

    if (previous.includes("rejected")) {
      return res.status(409).json({ message: NO_LONGER_AVAILABLE });
    }

    for (const file of req.files || []) {
      savedImages.push(saveEncryptedFile(file.buffer, file.mimetype));
    }

    const claim = await claimsRepo.create({
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
        await claimsRepo.findById(claim._id, { includeExplanation: true, includeEvidence: true })
      ),
    });
  } catch (error) {
    removeStoredEvidence(savedImages);

    logError("Unable to submit claim", error);
    return res.status(500).json({ message: "Unable to submit claim." });
  }
}

// Owner-only review list for one Found listing.
async function getListingClaims(req, res) {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const listing = await listingsRepo.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (!isSameUser(listing.createdBy, req.user)) {
      return res.status(403).json({ message: "Only the listing owner can review claims." });
    }

    const claims = await claimsRepo.findByListing(listing._id, {
      includeExplanation: true,
      includeEvidence: true,
    });
    const claimants = new Map();
    const views = [];

    for (const claim of claims) {
      if (!claimants.has(claim.claimant)) {
        claimants.set(claim.claimant, await usersRepo.findById(claim.claimant));
      }

      views.push(
        claimView(claim, {
          listing,
          claimant: claimants.get(claim.claimant),
          includeOwnerDetails: true,
        })
      );
    }

    return res.status(200).json({ claims: views });
  } catch (error) {
    logError("Unable to retrieve claims", error);
    return res.status(500).json({ message: "Unable to retrieve claims." });
  }
}

// The claimant's own claims, shown without any owner-only details.
async function getMyClaims(req, res) {
  try {
    const claims = await claimsRepo.findByClaimant(req.user._id, {
      includeExplanation: true,
      includeEvidence: true,
    });

    const views = [];

    for (const claim of claims) {
      const listing = await listingsRepo.findById(claim.listing);
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
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    const claim = await claimsRepo.findById(req.params.id, {
      includeExplanation: true,
      includeEvidence: true,
    });

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const listing = await listingsRepo.findById(claim.listing, { includePrivate: true });

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

    const claimant = isOwner ? await usersRepo.findById(claim.claimant) : null;

    return res.status(200).json({
      claim: claimView(claim, { listing, claimant, includeOwnerDetails: isOwner }),
    });
  } catch (error) {
    logError("Unable to retrieve claim", error);
    return res.status(500).json({ message: "Unable to retrieve claim." });
  }
}

// Serves one encrypted evidence photo to the claimant or the listing owner only.
async function getEvidenceImage(req, res) {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    const claim = await claimsRepo.findById(req.params.id, { includeEvidence: true });

    if (!claim) {
      return res.status(404).json({ message: "Evidence not found." });
    }

    const listing = await listingsRepo.findById(claim.listing);

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
// and opens a message thread (FR-CLM-03). All database steps of an approval run
// in one SQL transaction (NFR-REL-01, INT-20): if any step fails or a
// conditional update changes no row, everything is rolled back.
async function decideClaim(req, res) {
  try {
    const body = req.body || {};
    const action = typeof body.action === "string" ? body.action.toLowerCase() : "";

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be either approve or reject." });
    }

    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim id." });
    }

    const decisionNote =
      typeof body.decisionNote === "string" ? body.decisionNote.trim().slice(0, 500) : "";
    const claim = await claimsRepo.findById(req.params.id);

    if (!claim) {
      return res.status(404).json({ message: "Claim not found." });
    }

    const listing = await listingsRepo.findById(claim.listing);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (!isSameUser(listing.createdBy, req.user)) {
      return res.status(403).json({ message: "Only the listing owner can decide this claim." });
    }

    const decision = { decidedBy: req.user._id, decidedAt: new Date(), decisionNote };

    if (action === "reject") {
      const rejected = await claimsRepo.reject(claim._id, decision);

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

    let outcome;

    try {
      outcome = await withTransaction(async (tx) => {
        // Only an active, undeleted listing can be resolved. This conditional
        // update is what stops two concurrent approvals from both succeeding.
        const resolved = await listingsRepo.markResolvedIfActive(listing._id, tx);

        if (!resolved) {
          throw new DecisionError(409, NO_LONGER_AVAILABLE);
        }

        const approved = await claimsRepo.approve(claim._id, decision, tx);

        if (!approved) {
          throw new DecisionError(409, "Only a pending or rejected claim can be approved.");
        }

        await createThread(approved, resolved, tx);

        const closed = await claimsRepo.closeCompetingPending(
          listing._id,
          claim._id,
          {
            decidedBy: req.user._id,
            decidedAt: new Date(),
            decisionNote: "Another claim for this listing was approved.",
          },
          tx
        );

        await removeMatchesForListing(listing._id, tx);

        return { resolved, approved, closed };
      });
    } catch (error) {
      if (error instanceof DecisionError) {
        return res.status(error.status).json({ message: error.message });
      }

      logError("Unable to approve claim; transaction rolled back", error);
      return res.status(500).json({
        message: "Unable to approve claim. Nothing was changed; please try again.",
      });
    }

    const { resolved, approved, closed } = outcome;

    // Notifications run after the commit and can never undo or fail the approval.
    for (const competing of closed) {
      await notifyCompetingClaimClosed(competing, resolved).catch((error) => {
        logError("Unable to notify competing claimant", error);
      });
    }

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
