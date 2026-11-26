const express = require("express");
const { buildings, config, pins, tile } = require("../controllers/mapController");

const router = express.Router();

// Public read-only campus map data. No precise or live location is involved.
router.get("/map/buildings", buildings);
router.get("/map/listings", pins);
router.get("/map/config", config);
router.get("/map/tiles/:z/:x/:y.png", tile);

module.exports = router;
