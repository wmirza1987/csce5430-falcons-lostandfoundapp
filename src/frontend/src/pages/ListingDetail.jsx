import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, apiUrl } from "../config/api";
import {
  authHeaders,
  formatConfidence,
  formatDate,
  formatStatus,
  formatDateTime,
  readJson,
  readStoredUser,
} from "../config/http";

function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const currentUser = readStoredUser();

  const [listing, setListing] = useState(null);
  const [matches, setMatches] = useState([]);
  const [claims, setClaims] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const isOwner = Boolean(listing && currentUser && listing.createdBy?._id === currentUser.id);

  const loadAll = async () => {
    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${id}`), { headers: authHeaders() });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Listing not found.");
        return;
      }

      setListing(data.listing);
      setMessage("");

      const owner = Boolean(currentUser && data.listing.createdBy?._id === currentUser.id);

      if (owner) {
        const [matchResponse, claimResponse] = await Promise.all([
          fetch(apiUrl(`/api/v1/listings/${id}/matches`), { headers: authHeaders() }),
          data.listing.type === "found"
            ? fetch(apiUrl(`/api/v1/listings/${id}/claims`), { headers: authHeaders() })
            : Promise.resolve(null),
        ]);

        if (matchResponse.ok) {
          setMatches((await readJson(matchResponse)).matches || []);
        }

        if (claimResponse && claimResponse.ok) {
          setClaims((await readJson(claimResponse)).claims || []);
        }
      } else if (token) {
        const mineResponse = await fetch(apiUrl("/api/v1/claims/mine"), { headers: authHeaders() });

        if (mineResponse.ok) {
          setMyClaims((await readJson(mineResponse)).claims || []);
        }
      }
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this listing?")) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${id}`), {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Unable to delete listing.");
        return;
      }

      navigate("/listings");
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  if (!listing) {
    return (
      <div>
        <p>
          <Link to="/listings">Back to listings</Link>
        </p>
        {message ? <p role="alert" className="field-error">{message}</p> : <p>Loading listing...</p>}
      </div>
    );
  }

  const myClaim = myClaims.find((claim) => claim.listing?.id === listing._id);

  return (
    <div>
      <p>
        <Link to="/listings">Back to listings</Link>
      </p>

      <h1>{listing.title}</h1>
      <p>
        <span className={`status-badge status-${listing.status}`}>
          {formatStatus(listing.status)}
        </span>
      </p>

      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}

      <div className="listing-card">
        {listing.images?.length > 0 && (
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
          <strong>Type:</strong> {formatStatus(listing.type)}
        </p>
        <p>
          <strong>Category:</strong> {listing.category}
        </p>
        {listing.brand && (
          <p>
            <strong>Brand:</strong> {listing.brand}
          </p>
        )}
        {listing.color && (
          <p>
            <strong>Color:</strong> {listing.color}
          </p>
        )}
        <p>
          <strong>Description:</strong> {listing.description}
        </p>
        <p>
          <strong>Date:</strong> {formatDate(listing.date)}
        </p>
        <p>
          <strong>Location:</strong> {listing.location?.building || "Not specified"}
          {listing.location?.zone ? `, ${listing.location.zone}` : ""}
        </p>
        <p>
          <strong>Posted by:</strong> {listing.createdBy?.firstName} {listing.createdBy?.lastName}
        </p>

        {isOwner && listing.privateDetails && (
          <div className="private-panel">
            <h2>Private identifying details</h2>
            <p>{listing.privateDetails}</p>
            <p className="hint">Only you can see this. It is shown to you during claim review.</p>
          </div>
        )}
      </div>

      {isOwner && listing.status === "active" && (
        <div className="action-row">
          <button type="button" onClick={() => navigate(`/listings/${listing._id}/edit`)}>
            Edit
          </button>{" "}
          <button type="button" onClick={handleDelete} disabled={busy}>
            Delete
          </button>
        </div>
      )}

      {!isOwner && myClaim && (
        <section aria-labelledby="my-claim-heading">
          <h2 id="my-claim-heading">Your claim</h2>
          <p>
            Status: <span className={`status-badge status-${myClaim.status}`}>{formatStatus(myClaim.status)}</span>
          </p>
          <p>
            <Link to={`/claims/${myClaim.id}`}>View claim</Link>
            {myClaim.status === "approved" && (
              <>
                {" · "}
                <Link to={`/messages/${myClaim.id}`}>Open message thread</Link>
              </>
            )}
          </p>
        </section>
      )}

      {isOwner && (
        <section aria-labelledby="matches-heading">
          <h2 id="matches-heading">Possible matches</h2>
          {matches.length === 0 ? (
            <p>No possible matches yet. Matching runs automatically when listings are posted or edited.</p>
          ) : (
            matches.map((match) => {
              const other = match.yourRole === "lost" ? match.foundListing : match.lostListing;

              return (
                <div className="match-card" key={match.id}>
                  <h3>{other.title}</h3>
                  <p>
                    Confidence {formatConfidence(match.score)} (0 to 1) · {formatStatus(other.type)} ·{" "}
                    {other.location?.building}
                  </p>
                  {match.canClaim && (
                    <Link to={`/matches/${match.id}/claim`}>Submit a claim for this match</Link>
                  )}
                  {match.yourRole === "found" && (
                    <p className="hint">The other person may submit a claim. You will review it here.</p>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}

      {isOwner && listing.type === "found" && (
        <section aria-labelledby="claims-heading">
          <h2 id="claims-heading">Claims on this item</h2>
          {claims.length === 0 ? (
            <p>No claims yet.</p>
          ) : (
            <ul className="plain-list">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link to={`/claims/${claim.id}`}>
                    Claim from {claim.claimant?.firstName} {claim.claimant?.lastName}
                  </Link>{" "}
                  <span className={`status-badge status-${claim.status}`}>{formatStatus(claim.status)}</span>{" "}
                  <span className="hint">{formatDateTime(claim.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default ListingDetail;
