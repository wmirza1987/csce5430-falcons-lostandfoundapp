const express = require("express");
const {
  getListingMatches,
  getMatchById,
  getMyMatches,
} = require("../controllers/matchController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/listings/:id/matches", protect, getListingMatches);
router.get("/matches", protect, getMyMatches);
router.get("/matches/:id", protect, getMatchById);

module.exports = router;
