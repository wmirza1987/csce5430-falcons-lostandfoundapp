import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE_URL, apiUrl } from "../config/api";
import { authHeaders, formatDate, formatDateTime, formatStatus, readJson } from "../config/http";

// Evidence photos need the bearer token, so they are fetched and shown through
// an object URL rather than a plain image address.
function EvidenceImage({ claimId, image }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}${image.url}`, { headers: authHeaders() });

        if (!response.ok) {
          throw new Error("failed");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setSrc(objectUrl);
        }
      } catch (error) {
        if (!cancelled) setFailed(true);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [claimId, image.url]);

  if (failed) {
    return <p className="field-error">Evidence photo {image.index + 1} could not be loaded.</p>;
  }

  if (!src) {
    return <p>Loading evidence photo {image.index + 1}...</p>;
  }

  return <img src={src} alt={`Claimant evidence photo ${image.index + 1}`} className="listing-thumbnail" />;
}

// FR-CLM-02 / IF-UI-05: the owner compares the claimant's evidence with the
// private identifying details, side by side, then approves or rejects.
function ClaimReview() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState("approve");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadClaim = async () => {
    try {
      const response = await fetch(apiUrl(`/api/v1/claims/${id}`), { headers: authHeaders() });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Unable to load this claim.");
        return;
      }

      setClaim(data.claim);
      setMessage("");
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwnerView = Boolean(claim?.claimant);
  const canDecide = isOwnerView && ["pending", "rejected"].includes(claim?.status);

  const handleDecision = async (event) => {
    event.preventDefault();

    const confirmText =
      decision === "approve"
        ? "Approve this claim? The listing will be marked resolved, a message thread will open, and other pending claims will be closed."
        : "Reject this claim? The listing stays active for other claimants.";

    if (!window.confirm(confirmText)) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(apiUrl(`/api/v1/claims/${id}/decision`), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision, decisionNote: note }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Unable to save the decision.");
        return;
      }

      setMessage(data.message);
      await loadClaim();
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  if (!claim) {
    return (
      <div>
        <h1>Claim</h1>
        {message ? <p role="alert" className="field-error">{message}</p> : <p>Loading claim...</p>}
      </div>
    );
  }

  const listing = claim.listing;

  return (
    <div>
      <p>
        <Link to={`/listings/${listing.id}`}>Back to listing</Link>
      </p>
      <h1>{isOwnerView ? "Review claim" : "Your claim"}</h1>

      <p>
        <strong>Item:</strong> {listing.title} ·{" "}
        <span className={`status-badge status-${claim.status}`}>{formatStatus(claim.status)}</span>
      </p>
      <p className="hint">Submitted {formatDateTime(claim.createdAt)}</p>

      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}

      {claim.status === "approved" && (
        <p>
          <Link to={`/messages/${claim.id}`}>Open the message thread to arrange the handoff</Link>
        </p>
      )}

      <div className="two-column">
        <section aria-labelledby="evidence-heading" className="listing-card">
          <h2 id="evidence-heading">Claimant evidence</h2>
          {isOwnerView && (
            <p>
              <strong>From:</strong> {claim.claimant.firstName} {claim.claimant.lastName}
            </p>
          )}
          <p className="preview-text">{claim.explanation || "No description available."}</p>
          {claim.evidence?.length > 0 ? (
            claim.evidence.map((image) => <EvidenceImage key={image.index} claimId={claim.id} image={image} />)
          ) : (
            <p className="hint">No evidence photos were attached.</p>
          )}
        </section>

        {isOwnerView && (
          <section aria-labelledby="private-heading" className="private-panel">
            <h2 id="private-heading">Your private identifying details</h2>
            <p>{listing.privateDetails || "No private details were recorded for this item."}</p>
            <p className="hint">Compare these details with the claimant's evidence before deciding.</p>
          </section>
        )}
      </div>

      {canDecide && (
        <form onSubmit={handleDecision} className="stack-form" aria-labelledby="decision-heading">
          <h2 id="decision-heading">Decision</h2>
          <fieldset className="radio-group">
            <legend>Choose an outcome</legend>
            <label>
              <input
                type="radio"
                name="decision"
                value="approve"
                checked={decision === "approve"}
                onChange={() => setDecision("approve")}
              />{" "}
              Approve (opens a message thread)
            </label>
            <label>
              <input
                type="radio"
                name="decision"
                value="reject"
                checked={decision === "reject"}
                onChange={() => setDecision("reject")}
              />{" "}
              Reject (listing stays active)
            </label>
          </fieldset>

          <div className="form-field">
            <label htmlFor="decision-note">Note for the claimant (optional)</label>
            <textarea
              id="decision-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save decision"}
          </button>
        </form>
      )}

      {!isOwnerView && claim.decisionNote && <p className="hint">Note from the owner: {claim.decisionNote}</p>}
      {claim.decidedAt && <p className="hint">Decided {formatDate(claim.decidedAt)}</p>}
    </div>
  );
}

export default ClaimReview;
