import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import notify from "../../components/toast";
import Logo from "../../../assets/icon.png";
import { CircularProgress } from "@mui/material";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const ResetPassword = () => {
  const { token } = useParams(); // Get token from URL
  const [isTokenValid, setIsTokenValid] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // State to toggle password visibility
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const apiUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/auth/reset-password/${token}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "skip_zrok_interstitial" : "true"
          },
        });

        if (response.status === 200) {
          setIsTokenValid(true);
        } else {
          setError("Invalid or expired token. Redirecting to login...");
          setIsTokenValid(false);
          setTimeout(() => {
            navigate("/");
          }, 5000);
        }
      } catch {
        setError("Error verifying token. Redirecting to login...");
        setIsTokenValid(false);
        setTimeout(() => {
          navigate("/");
        }, 5000);
      }
    };

    verifyToken();
  }, [token, navigate, apiUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword) {
      notify("Password is required.", "error");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/new-password/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "skip_zrok_interstitial" : "true",
        },
        body: JSON.stringify({ new_password: newPassword }),
      });

      if (response.status === 200) {
        notify(
          "Password reset successfully. Redirecting to login...",
          "success"
        );
        setTimeout(() => {
          navigate("/");
        }, 3000);
      } else {
        setError("Error resetting password. Please try again later.");
      }
    } catch {
      setError("Error resetting password. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (isTokenValid === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
        <div className="bg-white shadow-lg rounded-lg p-6 w-full max-w-md text-center">
          <CircularProgress />
          <p className="mt-4 text-gray-700">Validating token...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
      <div className="bg-white shadow-lg rounded-lg p-6 w-full max-w-md relative">
        <div className="text-center mb-4">
          <img src={Logo} alt="Logo" className="mx-auto w-20 h-20" />
          <h1 className="text-2xl font-bold text-[#990404] mt-4">
            Reset Password
          </h1>
          {isTokenValid === false && (
            <p className="text-red-500 mt-2">{error}</p>
          )}
        </div>
        {isTokenValid && (
          <form onSubmit={handleSubmit}>
            <div className="mb-4 w-full relative">
              <input
                type={showPassword ? "text" : "password"} // Toggle input type
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
              <span
                onClick={() => setShowPassword(!showPassword)} // Toggle password visibility
                className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-600 hover:text-gray-800"
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </span>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#990404] text-white py-2 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-400"
            >
              {loading ? (
                <CircularProgress size={24} className="text-white" />
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}
        <div className="text-center mt-4">
          <p>
            <a href="/" className="text-blue-600 hover:underline">
              Go back to login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
