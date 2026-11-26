import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../config/api";

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const validate = () => {
    const errors = {};

    if (!formData.firstName.trim()) errors.firstName = "First name is required.";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required.";

    if (!formData.email.trim()) {
      errors.email = "UNT email is required.";
    } else if (!/@(my\.)?unt\.edu$/i.test(formData.email.trim())) {
      errors.email = "Please use a valid UNT email address (@unt.edu or @my.unt.edu).";
    }

    if (!formData.password) {
      errors.password = "Password is required.";
    } else if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    if (formData.password && confirmPassword !== formData.password) {
      errors.confirmPassword = "Passwords do not match.";
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormMessage("");

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const response = await fetch(apiUrl("/api/v1/auth/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormMessage(data.message || "Registration failed.");
        return;
      }

      navigate("/login", {
        state: {
          notice: "Account created. Please check your email to verify your account before creating a listing.",
        },
      });
    } catch (error) {
      setFormMessage("Unable to connect to the backend.");
    }
  };

  const fieldProps = (name, label) => ({
    id: `register-${name}`,
    name,
    value: formData[name],
    onChange: handleChange,
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `register-${name}-error` : undefined,
  });

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Create Account</h1>
        <p className="sub">Use your UNT email address to get started.</p>

        <form onSubmit={handleSubmit} noValidate className="plain-form">
          <div className="field-row">
            <div className="form-field">
              <label htmlFor="register-firstName">First Name</label>
              <input type="text" autoComplete="given-name" {...fieldProps("firstName")} />
              {fieldErrors.firstName && (
                <p id="register-firstName-error" role="alert" className="field-error">
                  {fieldErrors.firstName}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="register-lastName">Last Name</label>
              <input type="text" autoComplete="family-name" {...fieldProps("lastName")} />
              {fieldErrors.lastName && (
                <p id="register-lastName-error" role="alert" className="field-error">
                  {fieldErrors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="register-email">UNT Email</label>
            <input type="email" autoComplete="email" {...fieldProps("email")} />
            <span className="hint">Must end in @unt.edu or @my.unt.edu.</span>
            {fieldErrors.email && (
              <p id="register-email-error" role="alert" className="field-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="register-password">Password</label>
            <input type="password" minLength="8" autoComplete="new-password" {...fieldProps("password")} />
            <span className="hint">At least 8 characters.</span>
            {fieldErrors.password && (
              <p id="register-password-error" role="alert" className="field-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="register-confirmPassword">Confirm Password</label>
            <input
              id="register-confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "register-confirmPassword-error" : undefined}
            />
            {fieldErrors.confirmPassword && (
              <p id="register-confirmPassword-error" role="alert" className="field-error">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button type="submit" className="primary block">Create Account</button>
        </form>

        {formMessage && (
          <p role="alert" className="field-error">
            {formMessage}
          </p>
        )}

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
