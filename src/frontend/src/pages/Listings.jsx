import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl, API_BASE_URL } from "../config/api";
import { formatDate } from "../config/http";

// Mirrors the seeded categories and campus buildings (backend/scripts/seed.js).
// GET /api/v1/categories does not exist (only the admin endpoint), so fixed lists are used.
const CATEGORY_OPTIONS = [
  "Electronics",
  "Wallets and ID",
  "Keys",
  "Bags",
  "Clothing",
  "Books",
  "Water Bottles",
  "Jewelry",
  "Other",
];
const BUILDING_OPTIONS = [
  "Willis Library",
  "University Union",
  "Discovery Park",
  "Business Leadership Building",
  "Gateway Center",
];
const ZONE_OPTIONS = ["Main Quad", "Discovery Park", "West Campus", "Gateway"];

// Builds the page list with "..." gaps, for example 1 ... 4 5 6 ... 12.
function buildPageItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) items.push("gap");
    items.push(n);
  });
  return items;
}

function Listings() {
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [building, setBuilding] = useState("");
  const [zone, setZone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const storedUser = localStorage.getItem("user");
  const currentUser = storedUser ? JSON.parse(storedUser) : null;
  const token = localStorage.getItem("token");

  const loadListings = async (overrides = {}) => {
    try {
      const filters = {
        search,
        type,
        category,
        brand,
        color,
        building,
        zone,
        startDate,
        endDate,
        ...overrides,
      };
      const requestedPage = filters.page || page;
      const params = new URLSearchParams();

      if (filters.search) params.append("search", filters.search);
      if (filters.type) params.append("type", filters.type);
      if (filters.category) params.append("category", filters.category);
      if (filters.brand) params.append("brand", filters.brand);
      if (filters.color) params.append("color", filters.color);
      if (filters.building) params.append("building", filters.building);
      if (filters.zone) params.append("zone", filters.zone);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      params.append("page", requestedPage);
      params.append("limit", 20);

      const response = await fetch(apiUrl(`/api/v1/listings?${params.toString()}`));
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to load listings.");
        return;
      }

      setListings(data.listings || []);
      setTotalPages(data.totalPages || 1);
      setMessage("");
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = (event) => {
    event.preventDefault();

    if (page !== 1) {
      setPage(1);
    } else {
      loadListings();
    }
  };

  const handleClear = () => {
    const cleared = {
      search: "",
      type: "",
      category: "",
      brand: "",
      color: "",
      building: "",
      zone: "",
      startDate: "",
      endDate: "",
    };

    setSearch("");
    setType("");
    setCategory("");
    setBrand("");
    setColor("");
    setBuilding("");
    setZone("");
    setStartDate("");
    setEndDate("");
    setMessage("");

    if (page !== 1) {
      setPage(1);
    } else {
      loadListings(cleared);
    }
  };

  const handleDelete = async (listingId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this listing?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${listingId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to delete listing.");
        return;
      }

      setMessage("Listing deleted successfully.");
      loadListings();
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  return (
    <div className="listings-layout">
      <aside className="filters" aria-label="Listing filters">
        <h1 className="filters-title">Filters</h1>

        <form onSubmit={handleSearch} className="filter-form">

          <div className="form-field">
            <label htmlFor="search-text">Keyword</label>
            <input
              id="search-text"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search keyword..."
            />
          </div>

          <fieldset className="radio-group">
            <legend>Type</legend>
            <label>
              <input type="radio" name="search-type" value="" checked={type === ""} onChange={() => setType("")} />
              All
            </label>
            <label>
              <input type="radio" name="search-type" value="lost" checked={type === "lost"} onChange={() => setType("lost")} />
              Lost
            </label>
            <label>
              <input type="radio" name="search-type" value="found" checked={type === "found"} onChange={() => setType("found")} />
              Found
            </label>
          </fieldset>

          <div className="form-field">
            <label htmlFor="search-category">Category</label>
            <select
              id="search-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="search-brand">Brand</label>
            <input
              id="search-brand"
              type="text"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="Example: Apple"
            />
          </div>

          <div className="form-field">
            <label htmlFor="search-color">Color</label>
            <input
              id="search-color"
              type="text"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="Example: Black"
            />
          </div>

          <div className="form-field">
            <label htmlFor="search-building">Building</label>
            <select
              id="search-building"
              value={building}
              onChange={(event) => setBuilding(event.target.value)}
            >
              <option value="">All buildings</option>
              {BUILDING_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="search-zone">Zone</label>
            <select
              id="search-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              <option value="">All zones</option>
              {ZONE_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="search-start-date">Date From</label>
            <input
              id="search-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              
            />
          </div>

          <div className="form-field">
            <label htmlFor="search-end-date">Date To</label>
            <input
              id="search-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              
            />
          </div>

          <div className="filter-actions">
            <button type="submit" className="primary">Search</button>
            <button type="button" className="outline" onClick={handleClear}>
              Clear Filters
            </button>
          </div>
        </form>
      </aside>

      <section className="listings-results" aria-label="Listings">
        {message && <p role="alert" className="flash flash-info">{message}</p>}

        {listings.length === 0 && !message && (
          <p className="empty">No active listings found.</p>
        )}

        <div className="listing-grid">
          {listings.map((listing) => {
            const isOwner =
              currentUser && listing.createdBy?._id === currentUser.id;
            const firstImage = listing.images && listing.images[0];

            return (
              <article key={listing._id} className="listing-tile">
                <div className="tile-body">
                  <div className="tile-thumb">
                    {firstImage ? (
                      <img
                        src={`${API_BASE_URL}${firstImage}`}
                        alt={`${listing.title} photo`}
                      />
                    ) : (
                      <span aria-hidden="true">No photo</span>
                    )}
                  </div>
                  <div className="tile-info">
                    <div className="tile-head">
                      <h2>
                        <Link to={`/listings/${listing._id}`}>{listing.title}</Link>
                      </h2>
                      <span
                        className={`type-badge type-${listing.type === "found" ? "found" : "lost"}`}
                      >
                        {String(listing.type || "").toUpperCase()}
                      </span>
                    </div>
                    <p className="tile-meta">
                      {listing.location?.building || "Not specified"}
                    </p>
                    <p className="tile-meta">{formatDate(listing.date)}</p>
                    <p className="tile-meta">
                      {listing.category}
                      {listing.brand ? `, ${listing.brand}` : ""}
                      {listing.color ? `, ${listing.color}` : ""}
                    </p>
                  </div>
                </div>

                <div className="tile-footer">
                  <Link to={`/listings/${listing._id}`}>View Details</Link>
                  {isOwner && (
                    <span className="tile-owner-actions">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => navigate(`/listings/${listing._id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => handleDelete(listing._id)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {totalPages > 1 && (
          <nav className="pagination" aria-label="Pagination">
            <button
              type="button"
              className="page-btn"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>

            {buildPageItems(page, totalPages).map((item, index) =>
              item === "gap" ? (
                <span key={`gap-${index}`} className="page-gap" aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`page-btn${item === page ? " page-btn-active" : ""}`}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              className="page-btn"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}

export default Listings;
