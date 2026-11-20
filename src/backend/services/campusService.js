// FR-SRCH-03 / IF-SW-04: the campus map uses a small, static catalog of
// approximate building coordinates. Coordinates are rounded to three decimal
// places (~100 m), so no user's live or precise location is stored or shown.
// OpenStreetMap attribution is rendered by the Leaflet client.
const BUILDINGS = [
  { name: "University Hall", zone: "North Quad", lat: 33.209, lng: -97.149 },
  { name: "Hurley Hall", zone: "North Quad", lat: 33.209, lng: -97.150 },
  { name: "Wise Hall", zone: "North Quad", lat: 33.209, lng: -97.147 },
  { name: "Reed Green Hall", zone: "Main Quad", lat: 33.208, lng: -97.148 },
  { name: "Fouts Field", zone: "Athletics", lat: 33.205, lng: -97.152 },
  { name: "Library", zone: "Main Quad", lat: 33.208, lng: -97.149 },
  { name: "Business Building", zone: "West Campus", lat: 33.207, lng: -97.152 },
  { name: "Engineering and Technology", zone: "West Campus", lat: 33.207, lng: -97.153 },
  { name: "Chemistry Building", zone: "West Campus", lat: 33.206, lng: -97.151 },
  { name: "Physical Therapy", zone: "Health Sciences", lat: 33.206, lng: -97.146 },
  { name: "Health and Wellness Center", zone: "Health Sciences", lat: 33.205, lng: -97.147 },
  { name: "Willis Library", zone: "Main Quad", lat: 33.208, lng: -97.149 },
  { name: "Sycamore Hall", zone: "South Campus", lat: 33.204, lng: -97.146 },
  { name: "Maples Hall", zone: "South Campus", lat: 33.203, lng: -97.147 },
  { name: "Chilton Hall", zone: "South Campus", lat: 33.204, lng: -97.149 },
  { name: "Purdy Hall", zone: "South Campus", lat: 33.204, lng: -97.150 },
  { name: "General Services Building", zone: "Service Area", lat: 33.203, lng: -97.151 },
  { name: "University Union", zone: "Main Quad", lat: 33.207, lng: -97.148 },
];

// Normalizes a name for case- and punctuation-insensitive matching.
function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const BUILDINGS_BY_NAME = new Map(BUILDINGS.map((building) => [normalize(building.name), building]));

function listBuildings() {
  return BUILDINGS.map(({ name, zone, lat, lng }) => ({ name, zone, lat, lng }));
}

function listZones() {
  return [...new Set(BUILDINGS.map((building) => building.zone))].sort();
}

// Resolves a listing's building text to an approximate pin. Known buildings
// map to the catalog coordinate; unknown names are still listed in the
// list-based view but are not plotted, so no precise location is invented.
function findBuilding(name) {
  return BUILDINGS_BY_NAME.get(normalize(name)) || null;
}

module.exports = { BUILDINGS, findBuilding, listBuildings, listZones, normalize };
