const express = require("express");
const { buildings, pins } = require("../controllers/mapController");

const router = express.Router();

// Public read-only campus map data. No precise or live location is involved.
router.get("/map/buildings", buildings);
router.get("/map/listings", pins);

module.exports = router;
