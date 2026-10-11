import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadListing = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/listings");
        const data = await response.json();

        const listing = data.listings?.find((item) => item._id === id);

        if (!listing) {
          setMessage("Listing not found.");
          return;
        }

        setFormData({
          title: listing.title || "",
          category: listing.category || "",
          description: listing.description || "",
          date: listing.date ? listing.date.substring(0, 10) : "",
          building: listing.location?.building || "",
          zone: listing.location?.zone || "",
        });
      } catch (error) {
        setMessage("Unable to load listing.");
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = localStorage.getItem("token");

    const requestBody = {
      title: formData.title,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      location: {
        building: formData.building,
        zone: formData.zone,
      },
    };

    try {
      const response = await fetch(
        `http://localhost:5000/api/listings/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

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

  return (
    <div>
      <h1>Edit Listing</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Title</label>
          <br />
          <input
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Category</label>
          <br />
          <input
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Description</label>
          <br />
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Date</label>
          <br />
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Building</label>
          <br />
          <input
            name="building"
            value={formData.building}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label>Zone</label>
          <br />
          <input
            name="zone"
            value={formData.zone}
            onChange={handleChange}
          />
        </div>

        <br />

        <button type="submit">Save Changes</button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}

export default EditListing;