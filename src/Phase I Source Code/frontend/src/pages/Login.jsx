import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { apiUrl } from "../config/api";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const notice = location.state?.notice;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const errors = {};
    if (!email) errors.email = "Email is required.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.message || "Login failed.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      navigate("/listings");
    } catch (error) {
      setFormError("Unable to connect to the backend.");
    }
  };

  return (
    <div>
      <h1>Login</h1>

      {notice && <p role="status">{notice}</p>}

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="login-email">Email</label>
          <br />
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="login-email-error" role="alert" className="field-error">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="login-password">Password</label>
          <br />
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
          />
          {fieldErrors.password && (
            <p id="login-password-error" role="alert" className="field-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <br />

        <button type="submit">Login</button>
      </form>

      <p>
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>

      {formError && (
        <p role="alert" className="field-error">
          {formError}
        </p>
      )}
    </div>
  );
}

export default Login;
