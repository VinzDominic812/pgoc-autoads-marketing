import { useState, useEffect } from "react";
import notify from "../pages/components/toast";

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
