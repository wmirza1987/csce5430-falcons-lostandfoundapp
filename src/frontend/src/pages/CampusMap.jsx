import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiUrl } from "../config/api";
import { readJson } from "../config/http";

const CAMPUS_CENTER = [33.207, -97.149];
const CAMPUS_ZOOM = 16;

// FR-SRCH-03 / IF-SW-04: Leaflet renders OpenStreetMap tiles with attribution.
// The API returns only coarse building coordinates; this page never requests
// or renders a user's live or precise location, and it offers an equivalent
// list-based view for keyboard and screen-reader users.
function CampusMap() {
  const [buildings, setBuildings] = useState([]);
  const [zones, setZones] = useState([]);
  const [building, setBuilding] = useState("");
  const [zone, setZone] = useState("");
  const [type, setType] = useState("");
  const [pins, setPins] = useState([]);
  const [unplotted, setUnplotted] = useState([]);
  const [view, setView] = useState("map");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      try {
        const response = await fetch(apiUrl("/api/v1/map/buildings"));
        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(data.message || "Unable to load campus buildings.");
        }

        if (active) {
          setBuildings(data.buildings || []);
          setZones(data.zones || []);
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load campus buildings.");
      }
    }

    loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const params = new URLSearchParams();

    if (view === "list") params.set("view", "list");
    if (building) params.set("building", building);
    if (zone) params.set("zone", zone);
    if (type) params.set("type", type);

    async function loadPins() {
      try {
        const response = await fetch(apiUrl(`/api/v1/map/listings?${params.toString()}`));
        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(data.message || "Unable to load map listings.");
        }

        if (active) {
          setPins(data.pins || []);
          setUnplotted(data.unplotted || []);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load map listings.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPins();
    return () => {
      active = false;
    };
  }, [building, zone, type, view]);

  // Create the Leaflet map once the map view is mounted, then update markers
  // whenever the filtered pins change.
  useEffect(() => {
    if (view !== "map" || !containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: CAMPUS_CENTER,
      zoom: CAMPUS_ZOOM,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    const layer = markersRef.current;

    if (!layer) return;
    layer.clearLayers();

    for (const pin of pins) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: 8,
        color: "#1f6feb",
        fillColor: pin.type === "lost" ? "#ffe08a" : "#b7e4c7",
        fillOpacity: 0.9,
      })
        .bindTooltip(`${pin.title} — ${pin.building}`, { permanent: false })
        .bindPopup(`<strong>${pin.title}</strong><br>${pin.building}${pin.zone ? `, ${pin.zone}` : ""}<br>${pin.type}`)
        .addTo(layer);
    }
  }, [pins, view]);

  const buildingsInZone = zone ? buildings.filter((item) => item.zone === zone) : buildings;

  return (
    <div className="campus-map-page">
      <h1>Campus map</h1>
      <p className="hint">
        Pins show the approximate campus building for each listing. The app never stores or displays live or precise locations.
      </p>

      <div className="action-row" role="group" aria-label="Map or list view">
        <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
          Map view
        </button>
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
          List view
        </button>
      </div>

      <form className="stack-form" onSubmit={(event) => event.preventDefault()} aria-label="Filter campus map">
        <div className="form-field">
          <label htmlFor="map-zone">Zone</label>
          <select id="map-zone" value={zone} onChange={(event) => { setZone(event.target.value); setBuilding(""); }}>
            <option value="">All zones</option>
            {zones.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="map-building">Building</label>
          <select id="map-building" value={building} onChange={(event) => setBuilding(event.target.value)}>
            <option value="">All buildings</option>
            {buildingsInZone.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="map-type">Listing type</label>
          <select id="map-type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Lost and found</option>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </div>
      </form>

      <p role="status" aria-live="polite">
        {loading ? "Loading listings..." : `${pins.length} plotted listing${pins.length === 1 ? "" : "s"}.`}
      </p>

      {error && <p role="alert" className="field-error">{error}</p>}

      {view === "map" ? (
        <div
          ref={containerRef}
          className="leaflet-map"
          role="img"
          aria-label={`Map of ${pins.length} approximate listing locations`}
        />
      ) : (
        <section aria-labelledby="map-list-heading">
          <h2 id="map-list-heading">Listings by building</h2>
          {pins.length === 0 && unplotted.length === 0 ? (
            <p>No listings match these filters.</p>
          ) : (
            <ul className="plain-list">
              {pins.map((pin) => (
                <li key={pin.id}>
                  <strong>{pin.title}</strong> — {pin.building}{pin.zone ? `, ${pin.zone}` : ""} ({pin.type})
                </li>
              ))}
              {unplotted.map((pin) => (
                <li key={pin.id}>
                  <strong>{pin.title}</strong> — {pin.building}{pin.zone ? `, ${pin.zone}` : ""} ({pin.type})
                  <span className="hint"> (not plotted: building outside the campus catalog)</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default CampusMap;
