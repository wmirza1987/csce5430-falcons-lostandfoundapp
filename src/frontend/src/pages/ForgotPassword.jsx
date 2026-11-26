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
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Forgot Password</h1>
        <p className="sub">Enter your email and we will send you a reset link.</p>

        {!submitted ? (
          <form onSubmit={handleSubmit} noValidate className="plain-form">
            <div className="form-field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <button type="submit" className="primary block">Send Reset Link</button>
          </form>
        ) : (
          <p role="status" className="flash flash-success">{message}</p>
        )}

        <p className="auth-alt">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
