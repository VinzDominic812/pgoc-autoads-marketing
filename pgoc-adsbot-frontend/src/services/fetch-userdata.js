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
    // Get the current token
    const currentToken = localStorage.getItem("xsid") || Cookies.get("xsid");
    // console.log("Current token before fetch:", currentToken); // Debug log

    const response = await fetch(`${apiUrl}/api/v1/auth/get-user-data?user_id=${userId}`, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": currentToken ? `Bearer ${currentToken}` : "",
        "skip_zrok_interstitial": "true" 
      },
    });

    const data = await response.json();
    //console.log("User data response:", data); // Debug log

    if (response.ok) {
      // Store additional user data in localStorage and cookies
      if (data.user_data) {
        // Store username, email, status, etc.
        const encryptedData = {
          username: encryptData(data.user_data.username),
          email: encryptData(data.user_data.email),
          status: encryptData(data.user_data.status),
          profile_image: encryptData(data.user_data.profile_image),
          user_level: encryptData(data.user_data.user_level),
          user_role: encryptData(data.user_data.user_role)
        };

        // Store in localStorage
        Object.entries(encryptedData).forEach(([key, value]) => {
          if (value) {
            localStorage.setItem(key, value);
            Cookies.set(key, value, { expires: 1, secure: true, sameSite: "Strict" });
          }
        });
      }
      
      return data.user_data;
    } else {
      notify(data.message || "User not found.", "error");
      return null;
    }
  } catch (error) {
    notify("Network error. Please try again later.", "error");
    // console.error("Error fetching user data:", error);
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
