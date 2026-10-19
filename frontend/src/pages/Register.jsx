import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../config/api";

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

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

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormMessage("");

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const response = await fetch(apiUrl("/api/auth/register"), {
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
    <div>
      <h1>Register</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="register-firstName">First Name</label>
          <br />
          <input type="text" {...fieldProps("firstName")} />
          {fieldErrors.firstName && (
            <p id="register-firstName-error" role="alert" className="field-error">
              {fieldErrors.firstName}
            </p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="register-lastName">Last Name</label>
          <br />
          <input type="text" {...fieldProps("lastName")} />
          {fieldErrors.lastName && (
            <p id="register-lastName-error" role="alert" className="field-error">
              {fieldErrors.lastName}
            </p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="register-email">UNT Email</label>
          <br />
          <input type="email" {...fieldProps("email")} />
          {fieldErrors.email && (
            <p id="register-email-error" role="alert" className="field-error">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <br />

        <div>
          <label htmlFor="register-password">Password</label>
          <br />
          <input type="password" minLength="8" {...fieldProps("password")} />
          {fieldErrors.password && (
            <p id="register-password-error" role="alert" className="field-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <br />

        <button type="submit">Register</button>
      </form>

      {formMessage && (
        <p role="alert" className="field-error">
          {formMessage}
        </p>
      )}
    </div>
  );
}

export default Register;
