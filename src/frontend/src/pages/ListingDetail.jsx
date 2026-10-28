import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, apiUrl } from "../config/api";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (error) {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "Not specified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not specified" : date.toLocaleDateString();
}

function formatStatus(value) {
  return String(value || "active")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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
  const [claimExplanation, setClaimExplanation] = useState("");
  const [claimDetailOne, setClaimDetailOne] = useState("");
  const [claimDetailTwo, setClaimDetailTwo] = useState("");
  const [claimNote, setClaimNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isOwner =
    Boolean(listing && currentUser) &&
    listing.createdBy?._id === currentUser.id;
  const canClaim =
    Boolean(token && currentUser && listing) &&
    currentUser.isEmailVerified &&
    !isOwner &&
    listing.type === "found" &&
    listing.status === "active";
  const myClaim = myClaims.find(
    (claim) => (claim.listing?._id || claim.listing) === listing?._id
  );

  const authHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : {};

  const loadMatches = async (listingId) => {
    try {
      const response = await fetch(
        apiUrl(`/api/v1/listings/${listingId}/matches`),
        { headers: authHeaders() }
      );
      const data = await response.json();

      if (response.ok) {
        setMatches(data.matches || []);
      }
    } catch (error) {
      setMessage("Unable to load match suggestions.");
    }
  };

  const loadClaims = async (listingId) => {
    try {
      const response = await fetch(
        apiUrl(`/api/v1/listings/${listingId}/claims`),
        { headers: authHeaders() }
      );
      const data = await response.json();

      if (response.ok) {
        setClaims(data.claims || []);
      }
    } catch (error) {
      setMessage("Unable to load claims.");
    }
  };

  const loadMyClaims = async () => {
    try {
      const response = await fetch(apiUrl("/api/v1/claims/mine"), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (response.ok) {
        setMyClaims(data.claims || []);
      }
    } catch (error) {
      setMessage("Unable to load your claims.");
    }
  };

  const loadListing = async () => {
    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${id}`), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Listing not found.");
        return;
      }

      setListing(data.listing);
      setMessage("");

      const owner =
        currentUser && data.listing.createdBy?._id === currentUser.id;

      if (owner) {
        if (data.listing.status === "active") {
          await loadMatches(data.listing._id);
        } else {
          setMatches([]);
        }

        if (data.listing.type === "found") {
          await loadClaims(data.listing._id);
        }
      } else if (token) {
        await loadMyClaims();
      }
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadListing();
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
      const data = await response.json();

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

  const handleResolve = async () => {
    if (
      !window.confirm(
        "Confirm that the item was handed off and should be marked resolved."
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${id}/resolve`), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to resolve listing.");
        return;
      }

      setMessage("Listing marked resolved.");
      await loadListing();
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (claimId, action) => {
    const prompt =
      action === "approve"
        ? "Approve this claim? Competing pending claims will be closed."
        : "Reject this claim?";

    if (!window.confirm(prompt)) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        apiUrl(`/api/v1/claims/${claimId}/decision`),
        {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ action, decisionNote: claimNote }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to update claim.");
        return;
      }

      setMessage(data.message);
      setClaimNote("");
      await loadListing();
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  const handleClaimSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!claimExplanation.trim()) {
      setMessage("An ownership explanation is required.");
      return;
    }

    if (!claimDetailOne.trim() || !claimDetailTwo.trim()) {
      setMessage("At least two private identifying details are required.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(apiUrl(`/api/v1/listings/${id}/claims`), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          explanation: claimExplanation,
          privateDetails: [claimDetailOne, claimDetailTwo],
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to submit claim.");
        return;
      }

      setMessage(data.message);
      setClaimExplanation("");
      setClaimDetailOne("");
      setClaimDetailTwo("");
      await loadMyClaims();
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  if (!listing) {
    return (
      <div>
        <h1>Listing Details</h1>
        {message ? (
          <p role="alert" className="field-error">{message}</p>
        ) : (
          <p>Loading listing...</p>
        )}
        <Link to="/listings">Back to listings</Link>
      </div>
    );
  }

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

      {message && <p role="alert" className="field-error">{message}</p>}

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
          <strong>Posted by:</strong> {listing.createdBy?.firstName}{" "}
          {listing.createdBy?.lastName}
        </p>

        {isOwner && listing.privateDetails && (
          <div className="private-panel">
            <h3>Private identifying details</h3>
            <p>{listing.privateDetails}</p>
            <p className="hint">Only you can see this information.</p>
          </div>
        )}
      </div>

      {isOwner && (
        <div className="action-row">
          {listing.status === "active" && (
            <>
              <button
                type="button"
                onClick={() => navigate(`/listings/${listing._id}/edit`)}
              >
                Edit
              </button>{" "}
              <button type="button" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            </>
          )}

          {listing.status === "pending_return" && (
            <button type="button" onClick={handleResolve} disabled={busy}>
              Mark Resolved After Handoff
            </button>
          )}
        </div>
      )}

      {isOwner && listing.status === "active" && (
        <section>
          <h2>Potential Matches</h2>
          {matches.length === 0 ? (
            <p>No suggestions at or above the 65-point threshold yet.</p>
          ) : (
            matches.map((match) => {
              const otherListing =
                listing.type === "lost" ? match.foundListing : match.lostListing;

              if (!otherListing) return null;

              return (
                <div className="match-card" key={match._id}>
                  <h3>
                    <Link to={`/listings/${otherListing._id}`}>
                      {otherListing.title}
                    </Link>{" "}
                    <span className="score">{match.score} points</span>
                  </h3>
                  <p>
                    {formatStatus(otherListing.type)} · {otherListing.category} ·{" "}
                    {otherListing.location?.building}
                  </p>
                  <ul>
                    <li>Category: {match.factors?.category?.points || 0} points</li>
                    <li>Date proximity: {match.factors?.date?.points || 0} points</li>
                    <li>
                      Location: {match.factors?.location?.points || 0} points
                      {match.factors?.location?.basis
                        ? ` (${match.factors.location.basis})`
                        : ""}
                    </li>
                    <li>
                      Keywords: {match.factors?.keywords?.points || 0} points
                      {match.factors?.keywords?.shared?.length
                        ? ` (${match.factors.keywords.shared.join(", ")})`
                        : ""}
                    </li>
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}

      {isOwner && listing.type === "found" && (
        <section>
          <h2>Claims and Private Evidence</h2>
          <p className="hint">
            Public listing information is shown above; evidence below is visible
            only to you.
          </p>

          {claims.length === 0 ? (
            <p>No claims yet.</p>
          ) : (
            claims.map((claim) => (
              <div className="claim-card" key={claim._id}>
                <h3>
                  {claim.claimant?.firstName} {claim.claimant?.lastName}{" "}
                  <span className={`status-badge status-${claim.status}`}>
                    {formatStatus(claim.status)}
                  </span>
                </h3>
                <p>
                  <strong>Ownership explanation:</strong> {claim.explanation}
                </p>
                <div className="private-panel">
                  <strong>Private identifying details:</strong>
                  <ul>
                    {(claim.privateDetails || []).map((detail, index) => (
                      <li key={`${claim._id}-${index}`}>{detail}</li>
                    ))}
                  </ul>
                </div>

                {claim.status === "pending" && (
                  <div className="action-row">
                    <label htmlFor={`note-${claim._id}`}>
                      Decision note (optional)
                    </label>
                    <input
                      id={`note-${claim._id}`}
                      type="text"
                      value={claimNote}
                      onChange={(event) => setClaimNote(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleDecision(claim._id, "approve")}
                      disabled={busy}
                    >
                      Approve Claim
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => handleDecision(claim._id, "reject")}
                      disabled={busy}
                    >
                      Reject Claim
                    </button>
                  </div>
                )}

                {claim.decisionNote && (
                  <p>
                    <strong>Decision note:</strong> {claim.decisionNote}
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {!isOwner && token && myClaim && (
        <section>
          <h2>Your Claim</h2>
          <p>
            <strong>Status:</strong>{" "}
            <span className={`status-badge status-${myClaim.status}`}>
              {formatStatus(myClaim.status)}
            </span>
          </p>
          <p>
            <strong>Explanation:</strong> {myClaim.explanation}
          </p>
          <div className="private-panel">
            <strong>Your private details:</strong>
            <ul>
              {(myClaim.privateDetails || []).map((detail, index) => (
                <li key={`${myClaim._id}-${index}`}>{detail}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {canClaim && !myClaim && (
        <section>
          <h2>Submit a Claim</h2>
          <p>
            The owner will see your explanation and private evidence. Other
            users will not.
          </p>
          <form onSubmit={handleClaimSubmit}>
            <div>
              <label htmlFor="claim-explanation">Ownership explanation</label>
              <br />
              <textarea
                id="claim-explanation"
                value={claimExplanation}
                onChange={(event) => setClaimExplanation(event.target.value)}
                required
              />
            </div>

            <br />

            <div>
              <label htmlFor="claim-detail-one">
                Private identifying detail 1
              </label>
              <br />
              <input
                id="claim-detail-one"
                type="text"
                value={claimDetailOne}
                onChange={(event) => setClaimDetailOne(event.target.value)}
                required
              />
            </div>

            <br />

            <div>
              <label htmlFor="claim-detail-two">
                Private identifying detail 2
              </label>
              <br />
              <input
                id="claim-detail-two"
                type="text"
                value={claimDetailTwo}
                onChange={(event) => setClaimDetailTwo(event.target.value)}
                required
              />
            </div>

            <br />

            <button type="submit" disabled={busy}>
              Submit Claim
            </button>
          </form>
        </section>
      )}

      {token && currentUser && !currentUser.isEmailVerified && (
        <p className="hint">
          Verify your email before submitting a claim.
        </p>
      )}
    </div>
  );
}

export default ListingDetail;
