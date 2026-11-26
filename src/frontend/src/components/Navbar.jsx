import { Link, NavLink, useNavigate } from "react-router-dom";
import { readStoredUser } from "../config/http";

function LogoMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3 4 9v14l12 6 12-6V9L16 3Z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M4 9l12 6 12-6M16 15v14" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      className="bell-icon"
    >
      <path
        d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
      <Link to="/" className="brand">
        <LogoMark />
        <span>Campus Lost &amp; Found</span>
      </Link>

      <div className="nav-links">
        <NavLink to="/listings" end>Browse Listings</NavLink>
        {token && <NavLink to="/listings/new">Report Lost/Found</NavLink>}
        <NavLink to="/map">Campus Map</NavLink>

        {token && (
          <>
            <NavLink to="/messages">Messages</NavLink>
            <NavLink to="/notifications" className="nav-bell">
              <BellIcon />
              <span>Notifications</span>
            </NavLink>
            {isModerator && <NavLink to="/moderation">Moderation</NavLink>}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </>
        )}
      </div>

      <div className="nav-right">
        {!token ? (
          <>
            <NavLink to="/register">Register</NavLink>
            <NavLink to="/login">Sign In</NavLink>
          </>
        ) : (
          <button type="button" onClick={handleLogout}>Logout</button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
