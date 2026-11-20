import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../config/api";

function EditListing() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    description: "",
    date: "",
    building: "",
    zone: "",
    privateDetails: "",
  });

  const [images, setImages] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadListing = async () => {
      const token = localStorage.getItem("token");

      try {
        // Fetches the listing directly by id, rather than paging through the
        // public list, so this works regardless of the listing's page or status.
        const response = await fetch(apiUrl(`/api/listings/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        const data = await response.json();

        if (!response.ok) {
          setLoadError(data.message || "Listing not found.");
          return;
        }

        const listing = data.listing;

        setFormData({
          title: listing.title || "",
          category: listing.category || "",
          description: listing.description || "",
          date: listing.date ? listing.date.substring(0, 10) : "",
          building: listing.location?.building || "",
          zone: listing.location?.zone || "",
          privateDetails: listing.privateDetails || "",
        });
      } catch (error) {
        setLoadError("Unable to load listing.");
      }
    };

    loadListing();
  }, [id]);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleImageChange = (event) => {
    setImages(Array.from(event.target.files || []));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = localStorage.getItem("token");

    const body = new FormData();
    body.append("title", formData.title);
    body.append("category", formData.category);
    body.append("description", formData.description);
    body.append("date", formData.date);
    body.append("building", formData.building);
    body.append("zone", formData.zone);
    body.append("privateDetails", formData.privateDetails);
    // Only replaces images if the owner selected new ones; otherwise the
    // existing images are left as they are (see updateListing on the backend).
    images.forEach((file) => body.append("images", file));

    try {
      const response = await fetch(apiUrl(`/api/listings/${id}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to update listing.");
        return;
      }

      setMessage("Listing updated successfully.");

      setTimeout(() => {
        navigate("/listings");
      }, 700);
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  if (loadError) {
    return (
      <div>
        <h1>Edit Listing</h1>
        <p role="alert" className="field-error">{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Edit Listing</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="edit-title">Title</label>
          <br />
          <input
            id="edit-title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-category">Category</label>
          <br />
          <input
            id="edit-category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-description">Description</label>
          <br />
          <textarea
            id="edit-description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-date">Date</label>
          <br />
          <input
            id="edit-date"
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-building">Building</label>
          <br />
          <input
            id="edit-building"
            name="building"
            value={formData.building}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-zone">Zone</label>
          <br />
          <input
            id="edit-zone"
            name="zone"
            value={formData.zone}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="edit-images">Replace Photos (optional)</label>
          <br />
          <input
            id="edit-images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleImageChange}
          />
          <p>Leave empty to keep the current photos. Up to 3 images, JPEG/PNG/WebP, 5 MB each.</p>
        </div>

        <br />

        <div>
          <label htmlFor="edit-privateDetails">Private Identifying Details</label>
          <br />
          <textarea
            id="edit-privateDetails"
            name="privateDetails"
            value={formData.privateDetails}
            onChange={handleChange}
          />
        </div>

        <br />

        <button type="submit">Save Changes</button>
      </form>

      {message && (
        <p role="alert" className="field-error">{message}</p>
      )}
    </div>
  );
}

export default EditListing;
