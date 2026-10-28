import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../config/api";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;

function CreateListing() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    type: "lost",
    title: "",
    category: "",
    brand: "",
    color: "",
    description: "",
    date: "",
    building: "",
    zone: "",
    privateDetails: "",
  });

  const [images, setImages] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");
  const [preview, setPreview] = useState(false);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleImageChange = (event) => {
    const files = Array.from(event.target.files || []);
    const errors = {};

    if (files.length > MAX_IMAGES) {
      errors.images = `You can attach at most ${MAX_IMAGES} images.`;
    } else {
      for (const file of files) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          errors.images = "Images must be JPEG, PNG, or WebP.";
          break;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          errors.images = "Each image must be no more than 5 MB.";
          break;
        }
      }
    }

    setFieldErrors((prev) => ({ ...prev, images: errors.images }));
    setImages(files);
  };

  const validate = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = "Title is required.";
    if (!formData.category.trim()) errors.category = "Category is required.";
    if (!formData.description.trim()) errors.description = "Description is required.";
    if (!formData.date) errors.date = "Date is required.";
    if (!formData.building.trim()) errors.building = "Campus building is required.";
    if (formData.type === "found" && images.length === 0) {
      errors.images = "Found item listings require at least one image.";
    }
    return errors;
  };

  const handlePreview = (event) => {
    event.preventDefault();
    setFormMessage("");

    const errors = validate();
    setFieldErrors((prev) => ({ ...prev, ...errors }));

    if (Object.keys(errors).length > 0) return;

    setPreview(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitListing = async () => {
    setFormMessage("");
    const token = localStorage.getItem("token");

    const body = new FormData();
    body.append("type", formData.type);
    body.append("title", formData.title);
    body.append("category", formData.category);
    body.append("brand", formData.brand);
    body.append("color", formData.color);
    body.append("description", formData.description);
    body.append("date", formData.date);
    body.append("building", formData.building);
    body.append("zone", formData.zone);
    body.append("privateDetails", formData.privateDetails);
    images.forEach((file) => body.append("images", file));

    try {
      const response = await fetch(apiUrl("/api/v1/listings"), {
        method: "POST",
        headers: {
          // Content-Type is intentionally omitted: the browser sets the
          // multipart boundary automatically when the body is FormData.
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        setFormMessage(data.message || "Unable to create listing.");
        return;
      }

      setFormMessage("Listing created successfully.");

      setTimeout(() => {
        navigate(`/listings/${data.listing._id}`);
      }, 700);
    } catch (error) {
      setFormMessage("Unable to connect to the backend.");
    }
  };

  if (preview) {
    return (
      <div>
        <h1>Preview Listing</h1>
        <p>
          This is what visitors will see. Private identifying details are not
          shown publicly.
        </p>

        <div className="listing-card">
          <h2>{formData.title}</h2>
          <p>
            <strong>Type:</strong> {formData.type}
          </p>
          <p>
            <strong>Category:</strong> {formData.category}
          </p>
          {formData.brand && (
            <p>
              <strong>Brand:</strong> {formData.brand}
            </p>
          )}
          {formData.color && (
            <p>
              <strong>Color:</strong> {formData.color}
            </p>
          )}
          <p>
            <strong>Description:</strong> {formData.description}
          </p>
          <p>
            <strong>Date:</strong> {formData.date}
          </p>
          <p>
            <strong>Location:</strong> {formData.building}
            {formData.zone ? `, ${formData.zone}` : ""}
          </p>
          <p>
            <strong>Photos:</strong>{" "}
            {images.length > 0
              ? images.map((file) => file.name).join(", ")
              : "None"}
          </p>
          {formData.privateDetails && (
            <p>
              <strong>Private identifying details:</strong> hidden from public
              view
            </p>
          )}
        </div>

        <button type="button" onClick={() => setPreview(false)}>
          Back to edit
        </button>{" "}
        <button type="button" onClick={submitListing}>
          Confirm and Submit
        </button>

        {formMessage && (
          <p role="alert" className="field-error">{formMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Create Listing</h1>

      <form onSubmit={handlePreview} noValidate>
        <div>
          <label htmlFor="create-type">Type</label>
          <br />
          <select id="create-type" name="type" value={formData.type} onChange={handleChange}>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </div>

        <br />

        <div>
          <label htmlFor="create-title">Title</label>
          <br />
          <input
            id="create-title"
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "create-title-error" : undefined}
          />
          {fieldErrors.title && (
            <p id="create-title-error" role="alert" className="field-error">{fieldErrors.title}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-category">Category</label>
          <br />
          <input
            id="create-category"
            type="text"
            name="category"
            value={formData.category}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={fieldErrors.category ? "create-category-error" : undefined}
          />
          {fieldErrors.category && (
            <p id="create-category-error" role="alert" className="field-error">{fieldErrors.category}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-brand">Brand (optional)</label>
          <br />
          <input
            id="create-brand"
            type="text"
            name="brand"
            value={formData.brand}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="create-color">Color (optional)</label>
          <br />
          <input
            id="create-color"
            type="text"
            name="color"
            value={formData.color}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="create-description">Description</label>
          <br />
          <textarea
            id="create-description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? "create-description-error" : undefined}
          />
          {fieldErrors.description && (
            <p id="create-description-error" role="alert" className="field-error">{fieldErrors.description}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-date">Date</label>
          <br />
          <input
            id="create-date"
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.date)}
            aria-describedby={fieldErrors.date ? "create-date-error" : undefined}
          />
          {fieldErrors.date && (
            <p id="create-date-error" role="alert" className="field-error">{fieldErrors.date}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-building">Building</label>
          <br />
          <input
            id="create-building"
            type="text"
            name="building"
            value={formData.building}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.building)}
            aria-describedby={fieldErrors.building ? "create-building-error" : undefined}
          />
          {fieldErrors.building && (
            <p id="create-building-error" role="alert" className="field-error">{fieldErrors.building}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-zone">Zone (optional)</label>
          <br />
          <input
            id="create-zone"
            type="text"
            name="zone"
            value={formData.zone}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="create-images">
            Photos {formData.type === "found" ? "(at least 1 required)" : "(optional)"}
          </label>
          <br />
          <input
            id="create-images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleImageChange}
            aria-invalid={Boolean(fieldErrors.images)}
            aria-describedby={fieldErrors.images ? "create-images-error" : undefined}
          />
          <p>Up to 3 images, JPEG/PNG/WebP, 5 MB each.</p>
          {fieldErrors.images && (
            <p id="create-images-error" role="alert" className="field-error">{fieldErrors.images}</p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="create-privateDetails">
            Private Identifying Details (Found items only, never shown publicly)
          </label>
          <br />
          <textarea
            id="create-privateDetails"
            name="privateDetails"
            value={formData.privateDetails}
            onChange={handleChange}
          />
        </div>

        <br />

        <button type="submit">Preview Listing</button>
      </form>

      {formMessage && (
        <p role="alert" className="field-error">{formMessage}</p>
      )}
    </div>
  );
}

export default CreateListing;
