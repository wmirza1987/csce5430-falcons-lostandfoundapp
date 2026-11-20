import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatConfidence, formatDate, readJson } from "../config/http";

const MAX_DESCRIPTION = 1000;
const MAX_PHOTOS = 2;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// FR-CLM-01 / IF-UI-04: claim evidence form for one matched pair. Validation
// messages appear beside the field they describe, and the typed values are kept.
function ClaimForm() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const photoPreviews = useMemo(
    () => photos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [photos]
  );

  useEffect(() => {
    return () => photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [photoPreviews]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(apiUrl(`/api/v1/matches/${matchId}`), { headers: authHeaders() });
        const data = await readJson(response);

        if (!response.ok) {
          setLoadError(data.message || "This match is no longer available for claiming.");
          return;
        }

        if (!data.match.canClaim) {
          setLoadError("This match is no longer available for claiming.");
          return;
        }

        setMatch(data.match);
      } catch (error) {
        setLoadError("Unable to connect to the backend.");
      }
    };

    load();
  }, [matchId]);

  const validate = () => {
    const errors = {};

    if (!description.trim()) {
      errors.description = "Evidence description is required.";
    } else if (description.length > MAX_DESCRIPTION) {
      errors.description = "Evidence description must be 1000 characters or fewer.";
    }

    photos.forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.photos = "Only JPEG, PNG, or WebP images are allowed.";
      } else if (file.size > MAX_PHOTO_BYTES) {
        errors.photos = "Each evidence photo must be no more than 5 MB.";
      }
    });

    if (photos.length > MAX_PHOTOS) {
      errors.photos = "You can attach at most 2 evidence photos.";
    }

    return errors;
  };

  const handlePhotoChange = (event) => {
    const selected = Array.from(event.target.files || []);
    setPhotos(selected.slice(0, MAX_PHOTOS));
    setFieldErrors((current) => ({ ...current, photos: undefined }));

    if (selected.length > MAX_PHOTOS) {
      setFieldErrors((current) => ({
        ...current,
        photos: "You can attach at most 2 evidence photos. The first two were kept.",
      }));
    }
  };

  const handleReview = (event) => {
    event.preventDefault();
    setFormError("");
    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length === 0) {
      setPreviewing(true);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setFormError("");

    const body = new FormData();
    body.append("explanation", description.trim());
    photos.forEach((file) => body.append("evidence", file));

    try {
      const response = await fetch(apiUrl(`/api/v1/matches/${matchId}/claims`), {
        method: "POST",
        headers: authHeaders(),
        body,
      });
      const data = await readJson(response);

      if (!response.ok) {
        const text = data.message || "Unable to submit claim.";
        setPreviewing(false);

        if (/description/i.test(text)) {
          setFieldErrors({ description: text });
        } else if (/photo|image/i.test(text)) {
          setFieldErrors({ photos: text });
        } else {
          setFormError(text);
        }
        return;
      }

      navigate(`/claims/${data.claim.id}`);
    } catch (error) {
      setFormError("Unable to connect to the backend. Your description is still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <h1>Submit a claim</h1>
        <p role="alert" className="field-error">{loadError}</p>
        <p>
          <Link to="/listings">Back to listings</Link>
        </p>
      </div>
    );
  }

  if (!match) {
    return <p>Loading match...</p>;
  }

  const listing = match.foundListing;

  return (
    <div className="claim-form-page">
      <h1>Submit a claim</h1>

      <section aria-labelledby="matched-item-heading" className="listing-card">
        <h2 id="matched-item-heading">Matched found item</h2>
        <p>
          <strong>{listing.title}</strong> · {listing.category} · {listing.location?.building} ·{" "}
          {formatDate(listing.date)}
        </p>
        <p>{listing.description}</p>
        <p className="hint">Confidence {formatConfidence(match.score)} (0 to 1)</p>
      </section>

      {formError && (
        <p role="alert" className="field-error">
          {formError}
        </p>
      )}

      {!previewing && (
        <form onSubmit={handleReview} noValidate className="stack-form">
          <div className="form-field">
            <label htmlFor="claim-description">
              Evidence description <span aria-hidden="true">*</span>
            </label>
            <p id="claim-description-hint" className="hint">
              Describe identifying details only you would know, such as markings or contents. Up to 1000 characters.
            </p>
            <textarea
              id="claim-description"
              name="description"
              rows={6}
              maxLength={MAX_DESCRIPTION}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={`claim-description-hint claim-description-count${fieldErrors.description ? " claim-description-error" : ""}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <p id="claim-description-count" className="hint">
              {description.length} of {MAX_DESCRIPTION} characters
            </p>
            {fieldErrors.description && (
              <p id="claim-description-error" className="field-error">
                {fieldErrors.description}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="claim-photos">Evidence photos (optional, up to 2)</label>
            <p id="claim-photos-hint" className="hint">JPEG, PNG, or WebP, 5 MB or smaller each.</p>
            <input
              id="claim-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              aria-describedby={`claim-photos-hint${fieldErrors.photos ? " claim-photos-error" : ""}`}
              aria-invalid={Boolean(fieldErrors.photos)}
              onChange={handlePhotoChange}
            />
            {fieldErrors.photos && (
              <p id="claim-photos-error" className="field-error">
                {fieldErrors.photos}
              </p>
            )}
          </div>

          <div className="action-row">
            <button type="submit">Review claim</button>
          </div>
        </form>
      )}

      {previewing && (
        <section aria-labelledby="preview-heading" className="listing-card">
          <h2 id="preview-heading">Review before submitting</h2>
          <p>
            <strong>Evidence description</strong>
          </p>
          <p className="preview-text">{description.trim()}</p>

          {photoPreviews.length > 0 && (
            <div className="listing-images">
              {photoPreviews.map((preview) => (
                <img key={preview.url} src={preview.url} alt={`Evidence photo ${preview.file.name}`} className="listing-thumbnail" />
              ))}
            </div>
          )}

          <p className="hint">The owner sees this description and these photos. Nothing is public.</p>

          <div className="action-row">
            <button type="button" onClick={() => setPreviewing(false)} disabled={busy}>
              Edit
            </button>{" "}
            <button type="button" onClick={handleSubmit} disabled={busy}>
              {busy ? "Submitting..." : "Submit claim"}
            </button>
          </div>
        </section>
      )}

    </div>
  );
}

export default ClaimForm;
