import { Link, useNavigate } from "react-router-dom";
import { readStoredUser } from "../config/http";

function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem("token");
  const user = readStoredUser();
  const isModerator = ["moderator", "admin"].includes(user?.role);
  const isAdmin = user?.role === "admin";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="nav-left">
        <Link to="/">Home</Link>
        <Link to="/listings">Listings</Link>
        <Link to="/map">Campus map</Link>

        {token && (
          <>
            <Link to="/listings/new">Create Listing</Link>
            <Link to="/notifications">Notifications</Link>
            <Link to="/messages">Messages</Link>
            {isModerator && <Link to="/moderation">Moderation</Link>}
            {isAdmin && <Link to="/admin">Admin</Link>}
          </>
        )}
      </div>

      <div className="nav-right">
        {!token ? (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        ) : (
          <button onClick={handleLogout}>Logout</button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
