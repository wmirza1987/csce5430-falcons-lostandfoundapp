// FR-SRCH-03 / IF-SW-04: campus map data built from the coarse building
// catalog. Only approximate building coordinates are returned; no live or
// precise location is stored or exposed. The same endpoint powers the required
// list-based navigation alternative.
const listingsRepo = require("../repos/listings");
const { findBuilding, listBuildings, listZones } = require("../services/campusService");
const { queryString } = require("../services/validation");


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
    const values = {};

    for (const name of ["building", "zone", "type", "status", "view"]) {
      const result = queryString(req.query[name]);

      if (result.error) {
        return res.status(400).json({
          message: `Query parameter ${name} must be a single text value.`,
        });
      }

      values[name] = result.value;
    }

    const { building, zone, type, view } = values;
    const status = req.query.status === undefined ? "active" : values.status;

    // Hidden and deleted listings never appear on the public map; the
    // repository applies that filter.
    const listings = await listingsRepo.listForMap(
      {
        status: ["active", "resolved"].includes(status) ? status : "",
        type: ["lost", "found"].includes(type) ? type : "",
        building,
        zone,
      },
      { limit: 200 }
    );

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
