import { Link } from "react-router-dom";

function Home() {
  const token = localStorage.getItem("token");

  return (
    <div className="home-page">
      <h1>Lost and Found for Campus</h1>

      <p>
        Report lost or found items, search campus listings, and help return
        items to their owners.
      </p>

      <div className="home-actions">
        <Link to="/listings">
          <button>Browse Listings</button>
        </Link>

        {token && (
          <Link to="/listings/new">
            <button>Create Listing</button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default Home;