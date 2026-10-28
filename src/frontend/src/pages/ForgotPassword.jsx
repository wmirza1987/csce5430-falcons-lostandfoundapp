import { useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch(apiUrl("/api/v1/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      // Intentionally shown whether or not the account exists (FR AUTH 02).
      setMessage(data.message || "If an account exists for this email, a password reset link has been sent.");
      setSubmitted(true);
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  return (
    <div>
      <h1>Forgot Password</h1>

      {!submitted ? (
        <form onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="forgot-email">Email</label>
            <br />
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <br />

          <button type="submit">Send Reset Link</button>
        </form>
      ) : (
        <p role="status">{message}</p>
      )}

      <p>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

export default ForgotPassword;
