import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl, API_BASE_URL } from "../config/api";

function Listings() {
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [building, setBuilding] = useState("");
  const [zone, setZone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const storedUser = localStorage.getItem("user");
  const currentUser = storedUser ? JSON.parse(storedUser) : null;
  const token = localStorage.getItem("token");

  const loadListings = async () => {
    try {
      const params = new URLSearchParams();

      if (search) params.append("search", search);
      if (type) params.append("type", type);
      if (category) params.append("category", category);
      if (building) params.append("building", building);
      if (zone) params.append("zone", zone);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      params.append("page", page);
      params.append("limit", 20);

      const response = await fetch(apiUrl(`/api/listings?${params.toString()}`));
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
    setSearch("");
    setType("");
    setCategory("");
    setBuilding("");
    setZone("");
    setStartDate("");
    setEndDate("");

    if (page !== 1) {
      setPage(1);
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
      const response = await fetch(apiUrl(`/api/listings/${listingId}`), {
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
    <div>
      <h1>Listings</h1>

      <form onSubmit={handleSearch}>
        <div>
          <label htmlFor="search-text">Search</label>
          <br />
          <input
            id="search-text"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search listings"
          />
        </div>

        <br />

        <div>
          <label htmlFor="search-type">Type</label>
          <br />
          <select
            id="search-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All</option>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </div>

        <br />

        <div>
          <label htmlFor="search-category">Category</label>
          <br />
          <input
            id="search-category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Example: Bags"
          />
        </div>

        <br />

        <div>
          <label htmlFor="search-building">Building</label>
          <br />
          <input
            id="search-building"
            type="text"
            value={building}
            onChange={(event) => setBuilding(event.target.value)}
            placeholder="Example: Willis Library"
          />
        </div>

        <br />

        <div>
          <label htmlFor="search-zone">Zone</label>
          <br />
          <input
            id="search-zone"
            type="text"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="Example: North Campus"
          />
        </div>

        <br />

        <div>
          <label htmlFor="search-start-date">Date From</label>
          <br />
          <input
            id="search-start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <br />

        <div>
          <label htmlFor="search-end-date">Date To</label>
          <br />
          <input
            id="search-end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <br />

        <button type="submit">Search</button>{" "}
        <button type="button" onClick={handleClear}>
          Clear
        </button>
      </form>

      <hr />

      {message && <p role="alert">{message}</p>}

      {listings.length === 0 && !message && (
        <p>No active listings found.</p>
      )}

      {listings.map((listing) => (
        <div key={listing._id} className="listing-card">
          <h2>{listing.title}</h2>

          {listing.images && listing.images.length > 0 && (
            <div className="listing-images">
              {listing.images.map((imagePath) => (
                <img
                  key={imagePath}
                  src={`${API_BASE_URL}${imagePath}`}
                  alt={`${listing.title} photo`}
                  className="listing-thumbnail"
                />
              ))}
            </div>
          )}

          <p>
            <strong>Type:</strong> {listing.type}
          </p>

          <p>
            <strong>Category:</strong> {listing.category}
          </p>

          <p>
            <strong>Description:</strong> {listing.description}
          </p>

          <p>
            <strong>Location:</strong>{" "}
            {listing.location?.building || "Not specified"}
          </p>

          {currentUser &&
            listing.createdBy?._id === currentUser.id && (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/listings/${listing._id}/edit`)
                  }
                >
                  Edit
                </button>

                {" "}

                <button
                  type="button"
                  onClick={() => handleDelete(listing._id)}
                >
                  Delete
                </button>
              </div>
            )}

          <hr />
        </div>
      ))}

      <div className="pagination">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>

        <span>
          {" "}
          Page {page} of {totalPages}{" "}
        </span>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Listings;
