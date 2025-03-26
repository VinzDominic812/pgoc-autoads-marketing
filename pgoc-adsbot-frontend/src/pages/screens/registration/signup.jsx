import React, { useState } from "react";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { CircularProgress } from "@mui/material"; // Import CircularProgress from MUI
import notify from "../../components/toast"; // Import notify from your toast setup
import { useNavigate } from "react-router-dom"; // Import useNavigate

const Signup = ({ setSignupVisible }) => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gender, setGender] = useState("");
  const [code, setCode] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [loading, setLoading] = useState(false); // Track loading state to avoid multiple requests
  const [signupLoading, setSignupLoading] = useState(false);

  const currentDomain = window.location.hostname;
  const currentPort = window.location.port ? `:${window.location.port}` : "";
  const domainWithPort = currentDomain + currentPort;

  const togglePasswordVisibility = () => setPasswordVisible(!passwordVisible);

  const toggleConfirmPasswordVisibility = () =>
    setConfirmPasswordVisible(!confirmPasswordVisible);

  const handleGetCode = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      notify("Email is required.", "error");
      return;
    }

    if (!emailRegex.test(email)) {
      notify("Please enter a valid email address.", "error");
      return;
    }

    const requestBody = { email, domain: domainWithPort };
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(requestBody),
      });
      if (response.ok) {
        notify("Verification Code sent.. please check your email!", "success");
      } else {
        notify("Error sending code. Please try again.", "error");
      }
    } catch (error) {
      notify("Error sending code. Please try again later.", "error");
      console.error("Error sending code:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = async (e) => {
    const newCode = e.target.value;
    setCode(newCode);

    if (newCode.length === 6 && !loading) {
      setLoading(true);
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/auth/verify-email/${newCode}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              skip_zrok_interstitial: "true", // Include the token if needed
            },
          }
        );

        if (response.ok) {
          setIsCodeVerified(true);
          notify("Code verified successfully!", "success");
        } else {
          setIsCodeVerified(false);
          notify("Invalid code! Please try again.", "error");
        }
      } catch (error) {
        setIsCodeVerified(false);
        notify("Error verifying code. Please try again later.", "error");
        console.error("Error verifying code:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const register = async (userData) => {
    try {
      setSignupLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(userData),
      });
      if (response.ok) {
        notify("Registration successful! You can now log in.", "success");
        setTimeout(() => {
          setSignupVisible(false); // 🔥 Switch to Login after success
        }, 1500);
      } else {
        const data = await response.json();
        notify(
          data.message || "Registration failed. Please try again.",
          "error"
        );
      }
    } catch (error) {
      notify("Network error. Please try again later.", "error");
      console.error("Error during registration:", error);
    } finally {
      setSignupLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;

    if (!fullName.trim()) {
      notify("Full name is required.", "error");
      return;
    }

    if (!email.trim()) {
      notify("Email is required.", "error");
      return;
    }

    if (!emailRegex.test(email)) {
      notify("Please enter a valid email address.", "error");
      return;
    }

    if (!password.trim()) {
      notify("Password is required.", "error");
      return;
    }

    if (!passwordRegex.test(password)) {
      notify(
        "Password must be at least 6 characters long and include at least 1 letter and 1 number.",
        "error"
      );
      return;
    }

    if (password !== confirmPassword) {
      notify("Passwords do not match.", "error");
      return;
    }

    if (!gender) {
      notify("Please select your gender.", "error");
      return;
    }

    const userData = {
      username: email.split("@")[0],
      full_name: fullName,
      password,
      email,
      gender,
      domain: domainWithPort,
    };

    register(userData);
  };

  return (
    <div
      className="user_forms-signup"
      style={{ minHeight: "420px", top: "5px" }}
    >
      <h2
        className="forms_title"
        style={{ fontSize: "1.5rem", marginBottom: "12px" }}
      >
        Create Account
      </h2>
      <form className="forms_form" onSubmit={handleSubmit}>
        <fieldset className="forms_fieldset" style={{ padding: "10px" }}>
          <div className="forms_field">
            <input
              type="text"
              placeholder="Full Name"
              className="forms_field-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{ padding: "6px 10px", fontSize: "12px" }}
            />
          </div>

          <div className="forms_field">
            <input
              type="email"
              placeholder="Email"
              className="forms_field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ padding: "6px 10px", fontSize: "12px" }}
            />
          </div>

          <div
            className="forms_field"
            style={{ display: "flex", alignItems: "center" }}
          >
            <input
              type="text"
              placeholder="Code"
              className="forms_field-input"
              value={code}
              onChange={handleCodeChange}
              required
              style={{
                flex: 1,
                marginRight: "10px",
                padding: "6px 10px",
                fontSize: "12px",
              }}
            />
            <button
              type="button"
              className="forms_buttons-action"
              onClick={handleGetCode}
              disabled={loading}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              {loading ? (
                <CircularProgress size={24} style={{ color: "#fff" }} />
              ) : (
                "Get Code"
              )}
            </button>
          </div>

          <div className="forms_field relative">
            <input
              type={passwordVisible ? "text" : "password"}
              placeholder="Password"
              className="forms_field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: "6px 10px",
                fontSize: "12px",
                paddingRight: "40px",
              }}
            />
            <span
              onClick={togglePasswordVisibility}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
              }}
            >
              {passwordVisible ? (
                <VisibilityOff style={{ fontSize: "20px", color: "#888" }} />
              ) : (
                <Visibility style={{ fontSize: "20px", color: "#888" }} />
              )}
            </span>
          </div>

          <div className="forms_field relative">
            <input
              type={confirmPasswordVisible ? "text" : "password"}
              placeholder="Confirm Password"
              className="forms_field-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{
                padding: "6px 10px",
                fontSize: "12px",
                paddingRight: "40px",
              }}
            />
            <span
              onClick={toggleConfirmPasswordVisibility}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
              }}
            >
              {confirmPasswordVisible ? (
                <VisibilityOff style={{ fontSize: "20px", color: "#888" }} />
              ) : (
                <Visibility style={{ fontSize: "20px", color: "#888" }} />
              )}
            </span>
          </div>

          <div className="forms_field">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="forms_field-input"
              required
              style={{ padding: "6px 10px", fontSize: "12px" }}
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </fieldset>
        <div className="forms_buttons" style={{ marginTop: "10px" }}>
          <button
            type="submit"
            className="forms_buttons-action"
            style={{
              backgroundColor: isCodeVerified
                ? "rgba(138, 0, 0, 0.85)"
                : "#ccc",
              cursor: isCodeVerified ? "pointer" : "not-allowed",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "5px",
              fontSize: "14px",
              transition: "background-color 0.3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
            disabled={!isCodeVerified || signupLoading}
          >
            {signupLoading ? (
              <CircularProgress size={18} style={{ color: "#fff" }} />
            ) : (
              "Sign Up"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Signup;
