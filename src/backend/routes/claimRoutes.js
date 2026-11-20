const express = require("express");
const {
  decideClaim,
  getClaimById,
  getEvidenceImage,
  getListingClaims,
  getMyClaims,
  submitClaim,
} = require("../controllers/claimController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");
const { handleEvidenceUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

// NFR SEC 03: claim submission and decisions are rate limited.
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many claim requests. Please try again later.",
});

router.post("/matches/:id/claims", protect, claimLimiter, handleEvidenceUpload, submitClaim);
router.get("/listings/:id/claims", protect, getListingClaims);
router.get("/claims/mine", protect, getMyClaims);
router.get("/claims/:id", protect, getClaimById);
router.get("/claims/:id/evidence/:index", protect, getEvidenceImage);
router.patch("/claims/:id/decision", protect, claimLimiter, decideClaim);

module.exports = router;
