const express = require("express");

const {
  createListing,
  getListings,
  getListingById,
  updateListing,
  deleteListing,
} = require("../controllers/listingController");

const { protect, optionalAuth } = require("../middleware/authMiddleware");
const { handleListingImageUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", getListings);
router.get("/:id", optionalAuth, getListingById);
router.post("/", protect, handleListingImageUpload, createListing);
router.put("/:id", protect, handleListingImageUpload, updateListing);
router.delete("/:id", protect, deleteListing);

module.exports = router;
