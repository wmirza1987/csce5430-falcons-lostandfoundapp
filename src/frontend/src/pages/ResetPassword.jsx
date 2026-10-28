import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiUrl } from "../config/api";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormMessage("");

    const errors = {};
    if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const response = await fetch(apiUrl(`/api/v1/auth/reset-password/${token}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormMessage(data.message || "Unable to reset password.");
        return;
      }

      navigate("/login", {
        state: { notice: "Password reset successfully. Please log in with your new password." },
      });
    } catch (error) {
      setFormMessage("Unable to connect to the backend.");
    }
  };

  return (
    <div>
      <h1>Reset Password</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="reset-password">New Password</label>
          <br />
          <input
            id="reset-password"
            type="password"
            minLength="8"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
          />
          {fieldErrors.password && (
            <p id="reset-password-error" role="alert" className="field-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="reset-confirm-password">Confirm New Password</label>
          <br />
          <input
            id="reset-confirm-password"
            type="password"
            minLength="8"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={fieldErrors.confirmPassword ? "reset-confirm-password-error" : undefined}
          />
          {fieldErrors.confirmPassword && (
            <p id="reset-confirm-password-error" role="alert" className="field-error">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <br />

        <button type="submit">Reset Password</button>
      </form>

      {formMessage && (
        <p role="alert" className="field-error">
          {formMessage}
        </p>
      )}

      <p>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

export default ResetPassword;
