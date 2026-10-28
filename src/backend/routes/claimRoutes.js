const express = require("express");
const {
  decideClaim,
  getClaimById,
  getListingClaims,
  getMyClaims,
  resolveListing,
  submitClaim,
} = require("../controllers/claimController");
const { protect } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many claim requests. Please try again later.",
});

router.post("/listings/:id/claims", protect, claimLimiter, submitClaim);
router.get("/listings/:id/claims", protect, getListingClaims);
router.patch("/listings/:id/resolve", protect, resolveListing);
router.get("/claims/mine", protect, getMyClaims);
router.get("/claims/:id", protect, getClaimById);
router.patch("/claims/:id/decision", protect, claimLimiter, decideClaim);

module.exports = router;
