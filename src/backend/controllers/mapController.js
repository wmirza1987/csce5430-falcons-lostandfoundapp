// FR-SRCH-03 / IF-SW-04: campus map data built from the coarse building
// catalog. Only approximate building coordinates are returned; no live or
// precise location is stored or exposed. The same endpoint powers the required
// list-based navigation alternative.
const Listing = require("../models/Listing");
const { findBuilding, listBuildings, listZones } = require("../services/campusService");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildings(req, res) {
  try {
    return res.status(200).json({
      buildings: listBuildings(),
      zones: listZones(),
      attribution: "© OpenStreetMap contributors",
    });
  } catch (error) {
    console.error(`Unable to list campus buildings: ${error.message}`);
    return res.status(500).json({ message: "Unable to list campus buildings." });
  }
}

// Returns public listing pins grouped by building. Supports filtering by
// building, zone, and type, and a `view=list` flag used by the list view.
async function pins(req, res) {
  try {
    const { building, zone, type, status = "active", view } = req.query;

    // Hidden and deleted listings never appear on the public map.
    const query = { isDeleted: false, isHidden: { $ne: true } };

    if (["active", "resolved"].includes(status)) {
      query.status = status;
    }

    if (["lost", "found"].includes(type)) {
      query.type = type;
    }

    if (building) {
      query["location.building"] = { $regex: new RegExp(`^${escapeRegExp(building)}$`, "i") };
    }

    if (zone) {
      query["location.zone"] = { $regex: new RegExp(`^${escapeRegExp(zone)}$`, "i") };
    }

    const listings = await Listing.find(query)
      .select("title type category location createdAt")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const pins = [];
    const unplotted = [];

    for (const listing of listings) {
      const catalogBuilding = findBuilding(listing.location?.building);
      const item = {
        id: listing._id,
        title: listing.title,
        type: listing.type,
        category: listing.category,
        building: listing.location?.building || "",
        zone: listing.location?.zone || "",
      };

      // A pin exists only for a known campus building with a coarse coordinate.
      if (catalogBuilding) {
        pins.push({
          ...item,
          lat: catalogBuilding.lat,
          lng: catalogBuilding.lng,
        });
      } else {
        // Unknown building names remain available in the list-based view but
        // are never plotted with an invented or precise coordinate.
        unplotted.push(item);
      }
    }

    return res.status(200).json({
      view: view === "list" ? "list" : "map",
      pins,
      unplotted,
      attribution: "© OpenStreetMap contributors",
    });
  } catch (error) {
    console.error(`Unable to build campus map pins: ${error.message}`);
    return res.status(500).json({ message: "Unable to build campus map data." });
  }
}

module.exports = { buildings, pins };
