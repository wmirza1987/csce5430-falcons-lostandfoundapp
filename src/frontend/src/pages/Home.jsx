import { Link } from "react-router-dom";

function Home() {
  const token = localStorage.getItem("token");

  return (
    <div className="home-page">
      <h1>Campus Lost &amp; Found</h1>

      <p>
        Report lost or found items, search campus listings, and help return
        items to their owners.
      </p>

      <div className="home-actions">
        <Link to="/listings" className="btn primary">Browse Listings</Link>

        {!token && (
          <Link to="/register" className="btn">Create Account</Link>
        )}
        {token && (
          <Link to="/listings/new" className="btn">Report Lost/Found</Link>
        )}
      </div>
    </div>
  );
}

export default Home;