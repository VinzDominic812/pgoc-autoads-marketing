import { useState, useEffect } from "react";
import notify from "../pages/components/toast";
import Cookies from "js-cookie";
import { encryptData } from "./user_data";

const apiUrl = import.meta.env.VITE_API_URL;

export const fetchUserDataById = async (userId) => {
  if (!userId) {
    notify("User ID is required.", "error");
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/get-user-data?user_id=${userId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "skip_zrok_interstitial" : "true" },
    });

    const data = await response.json();

    if (response.ok) {
      // Store additional user data in localStorage and cookies
      if (data.user_data) {
        // Store username, email, status, etc.
        localStorage.setItem("username", encryptData(data.user_data.username));
        localStorage.setItem("email", encryptData(data.user_data.email));
        localStorage.setItem("status", encryptData(data.user_data.status));
        localStorage.setItem("profile_image", encryptData(data.user_data.profile_image));
        
        // Store user_level and user_role
        localStorage.setItem("user_level", encryptData(data.user_data.user_level));
        localStorage.setItem("user_role", encryptData(data.user_data.user_role));
        
        // Also set in cookies as fallback
        Cookies.set("username", encryptData(data.user_data.username), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("email", encryptData(data.user_data.email), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("status", encryptData(data.user_data.status), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("profile_image", encryptData(data.user_data.profile_image), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("user_level", encryptData(data.user_data.user_level), { expires: 1, secure: true, sameSite: "Strict" });
        Cookies.set("user_role", encryptData(data.user_data.user_role), { expires: 1, secure: true, sameSite: "Strict" });
      }
      
      return data.user_data;
    } else {
      notify(data.message || "User not found.", "error");
      return null;
    }
  } catch (error) {
    notify("Network error. Please try again later.", "error");
    console.error("Error fetching user data:", error);
    return null;
  }
};

export const useUserData = (userId) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const data = await fetchUserDataById(userId);
      setUserData(data);
      setLoading(false);
    };

    fetchData();
  }, [userId]);

  return { userData, loading };
};
