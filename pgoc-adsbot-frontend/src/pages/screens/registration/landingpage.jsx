import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import CryptoJS from "crypto-js";
import notify from "../../components/toast"; // Import the notify function
import "./landingpage.css";
import Login from "./login";
import Signup from "./signup";

const SECRET_KEY = import.meta.env.VITE_COOKIE_SECRET;

const decryptData = (cipherText) => {
  if (!cipherText) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
};

const LandingPage = () => {
  const [isSignupVisible, setSignupVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isAuthenticated = decryptData(Cookies.get("isxd")) === "true";
    
    if (isAuthenticated) {
      notify("Authenticated redirecting to Main Menu", "info"); // Show notification
      setTimeout(() => {
        navigate("/main"); // Redirect after delay
      }, 3000); // 2-second delay
    }
  }, []);

  const toggleForm = (formType) => {
    setSignupVisible(formType === "signup");
  };

  return (
    <section className="user">
      <div className="user_options-container">
        <div className="user_options-text">
          <div className="user_options-unregistered">
            <h2 className="user_unregistered-title">
              Welcome to PGOC Ads Automation
            </h2>
            <p className="user_unregistered-text">
              Don't have an account? Create one now!
            </p>
            <button
              className="user_unregistered-signup"
              onClick={() => toggleForm("signup")}
            >
              Register
            </button>
          </div>

          <div className="user_options-registered">
            <h2 className="user_registered-title">Already have an account?</h2>
            <p className="user_registered-text">Get started..</p>
            <button
              className="user_registered-login"
              onClick={() => toggleForm("login")}
            >
              Login
            </button>
          </div>
        </div>

        <div
          className={`user_options-forms ${
            isSignupVisible ? "bounceLeft" : "bounceRight"
          }`}
        >
          {isSignupVisible ? (
            <Signup setSignupVisible={setSignupVisible} />
          ) : (
            <Login />
          )}
        </div>
      </div>
    </section>
  );
};

export default LandingPage;
