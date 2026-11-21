import { Navigate } from "react-router-dom";
import { readStoredUser } from "../config/http";

// Client-side convenience guard. The API independently enforces the same
// roles on every protected endpoint, so this is only about navigation UX.
function RoleRoute({ allow, children }) {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const user = readStoredUser();

  if (!allow.includes(user?.role)) {
    return <Navigate to="/listings" replace />;
  }

  return children;
}

export default RoleRoute;
