import { useState } from "react";
import { useNavigate } from "react-router-dom";

function CreateListing() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    type: "lost",
    title: "",
    category: "",
    description: "",
    date: "",
    building: "",
    zone: "",
    image1: "",
    image2: "",
    image3: "",
    privateDetails: "",
  });

  const [message, setMessage] = useState("");

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = localStorage.getItem("token");

    const images = [
      formData.image1,
      formData.image2,
      formData.image3,
    ].filter((image) => image.trim() !== "");

    const requestBody = {
      type: formData.type,
      title: formData.title,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      location: {
        building: formData.building,
        zone: formData.zone,
      },
      images,
      privateDetails: formData.privateDetails,
    };

    try {
      const response = await fetch(
        "http://localhost:5000/api/listings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || data.message || "Unable to create listing.");
        return;
      }

      setMessage("Listing created successfully.");

      setTimeout(() => {
        navigate("/listings");
      }, 1000);
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  return (
    <div>
      <h1>Create Listing</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Type</label>
          <br />
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
          >
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </div>

        <br />

        <div>
          <label>Title</label>
          <br />
          <input
            type="text"
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
            type="text"
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
            type="text"
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
            type="text"
            name="zone"
            value={formData.zone}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>Image URL 1</label>
          <br />
          <input
            type="text"
            name="image1"
            value={formData.image1}
            onChange={handleChange}
            required={formData.type === "found"}
          />
          {formData.type === "found" && (
            <p>Found-item listings require at least one image.</p>
          )}
        </div>

        <br />

        <div>
          <label>Image URL 2</label>
          <br />
          <input
            type="text"
            name="image2"
            value={formData.image2}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>Image URL 3</label>
          <br />
          <input
            type="text"
            name="image3"
            value={formData.image3}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label>Private Details</label>
          <br />
          <textarea
            name="privateDetails"
            value={formData.privateDetails}
            onChange={handleChange}
          />
        </div>

        <br />

        <button type="submit">Create Listing</button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}

export default CreateListing;