import React, { useState } from "react";
import Logo from "../../../assets/icon.png";
import { useNavigate } from "react-router-dom";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import notify from "../../components/toast";
import Cookies from "js-cookie";
import CryptoJS from "crypto-js";
import CircularProgress from "@mui/material/CircularProgress"; // Import CircularProgress

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET;

export const encryptData = (text) => {
  if (!text) {
    console.warn("encryptData received invalid input:", text);
    return "";
  }
  return CryptoJS.AES.encrypt(text.toString(), SECRET_KEY).toString();
};

const Login = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // Loading state

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      notify("Email is required.", "error");
      return;
    }

    if (!isValidEmail(email)) {
      notify("Please enter a valid email address.", "error");
      return;
    }

    if (!password.trim()) {
      notify("Password is required.", "error");
      return;
    }

    setLoading(true); // Start loading

    const currentDomain = window.location.hostname;
    const currentPort = window.location.port ? `:${window.location.port}` : "";
    const domain = currentDomain + currentPort;
    const requestBody = { email, domain, password };

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "skip_zrok_interstitial": "true" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("Login successful, data received:", data);

        if (!data.access_token || !data.id || !data.user_id || !data.redis_key) {
          console.error("Missing required fields in response data:", data);
          return;
        }

        Cookies.set("xsid", encryptData(data.access_token), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("xsid_g", encryptData(data.id), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("usr", encryptData(data.user_id), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("rsid", encryptData(data.redis_key), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("isxd", encryptData("true"), { expires: 1, secure: true, sameSite: "Strict" });


        notify("Login Successful", "success");
        navigate("/main");
      } else {
        notify(data.message || "Invalid email or password. Please try again.", "error");
      }
    } catch (error) {
      notify("Network error. Please check your connection and try again.", "error");
      console.error("Login error:", error);
    } finally {
      setLoading(false); // Stop loading
    }
  };

  return (
    <div className="user_forms-login" style={{ position: "relative" }}>
      <div className="login-logo" style={{ position: "absolute", top: "-80px", right: "-20px" }}>
        <img src={Logo} alt="Logo" style={{ width: "60px" }} />
      </div>

      <h2 className="forms_title">Login</h2>
      {error && <p className="error-message" style={{ color: "red" }}>{error}</p>}
      
      <form className="forms_form" onSubmit={handleLogin}>
        <fieldset className="forms_fieldset">
          <div className="forms_field">
            <input
              type="email"
              placeholder="Email"
              className="forms_field-input"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="forms_field relative">
            <input
              type={passwordVisible ? "text" : "password"}
              placeholder="Password"
              className="forms_field-input"
              required
              style={{ paddingRight: "40px" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span
              onClick={togglePasswordVisibility}
              style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}
            >
              {passwordVisible ? <VisibilityOff style={{ fontSize: "24px", color: "#888" }} /> : <Visibility style={{ fontSize: "24px", color: "#888" }} />}
            </span>
          </div>
        </fieldset>
        <div className="forms_buttons">
          <button type="button" className="forms_buttons-forgot" onClick={() => navigate("/forgot-password")}>
            Forgot password?
          </button>

          <button type="submit" className="forms_buttons-action" disabled={loading}>
            {loading ? <CircularProgress size={24} style={{ color: "#fff" }} /> : "Log In"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
