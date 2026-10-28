import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiUrl } from "../config/api";

function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await fetch(apiUrl(`/api/v1/auth/verify-email/${token}`));
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.message || "This verification link is invalid or has expired.");
          return;
        }

        setStatus("success");
        setMessage(data.message || "Email verified successfully.");
      } catch (error) {
        setStatus("error");
        setMessage("Unable to connect to the backend.");
      }
    };

    verify();
  }, [token]);

  return (
    <div>
      <h1>Email Verification</h1>

      {status === "verifying" && <p role="status">Verifying your email...</p>}

      {status !== "verifying" && (
        <p role="status" className={status === "error" ? "field-error" : undefined}>
          {message}
        </p>
      )}

      <p>
        <Link to="/login">Go to login</Link>
      </p>
    </div>
  );
}

export default VerifyEmail;
