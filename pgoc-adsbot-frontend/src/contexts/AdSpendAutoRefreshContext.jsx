import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import notify from "../pages/components/toast.jsx";
import { getUserData } from "../services/user_data.js";

const AdSpendAutoRefreshContext = createContext();

const LOCAL_STORAGE_KEY = "adspend_last_fetch_time";
const DATA_STORAGE_KEY = "adspend_data";
const FACEBOOK_NAME_KEY = "adspend_selected_facebook_name";
const ACCESS_TOKEN_KEY = "adspend_selected_access_token";
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Helper to send budget remaining to Google Sheets
const sendBudgetToSheets = async (campaigns, apiUrl, fetchCompletionTimestamp = null) => {
  if (!Array.isArray(campaigns) || campaigns.length === 0) return;
  // Calculate budget remaining for active campaigns
  const activeRows = campaigns.filter(row => row.delivery_status === "ACTIVE");
  const budgetRemaining = activeRows.reduce(
    (sum, row) => sum + Number(row.budget_remaining || 0),
    0
  );
  if (budgetRemaining <= 0) return;
  try {
    await axios.post(
      `${apiUrl}/api/v1/sheets/update-budget`,
      {
        budget_remaining: Number(budgetRemaining).toFixed(2),
        fetch_completion_timestamp: fetchCompletionTimestamp, // Send the exact fetch completion timestamp
      }
    );
    // Optionally notify or log
    notify(`Sent budget remaining (₱${budgetRemaining.toFixed(2)}) to Google Sheets`, "success");
  } catch (error) {
    // Optionally notify or log
    notify("Error auto-sending data to Google Sheets", "error");
    console.error(error);
  }
};

export const AdSpendAutoRefreshProvider = ({ children, apiUrl }) => {
  const [adspentData, setAdspentData] = useState(() => {
    try {
      const data = localStorage.getItem(DATA_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });
  const [fetching, setFetching] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(() => {
    const t = localStorage.getItem(LOCAL_STORAGE_KEY);
    return t ? parseInt(t, 10) : null;
  });
  const [selectedFacebookName, setSelectedFacebookName] = useState(() => localStorage.getItem(FACEBOOK_NAME_KEY) || "");
  const [selectedAccessToken, setSelectedAccessToken] = useState(() => localStorage.getItem(ACCESS_TOKEN_KEY) || "");
  const timerRef = useRef(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Helper to persist state
  const persistState = (data, fetchTime, fbName, token) => {
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(LOCAL_STORAGE_KEY, fetchTime ? fetchTime.toString() : "");
    if (fbName) localStorage.setItem(FACEBOOK_NAME_KEY, fbName);
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
  };

  // Stop auto-refresh
  const stopAutoRefresh = () => {
    setAutoRefreshEnabled(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Fetch ad spend data
  const fetchAdSpendData = useCallback(async (user_id, access_token, facebookName) => {
    if (!user_id || !access_token) {
      notify("Missing user or access token", "error");
      return;
    }
    
    // Start timer immediately when fetching begins
    const fetchStartTime = Date.now();
    setLastFetchTime(fetchStartTime);
    setFetching(true);
    setAutoRefreshEnabled(true); // Re-enable auto-refresh on manual fetch
    
    try {
      notify("Fetching fresh ad spend data...", "info");
      const response = await axios.post(`${apiUrl}/api/v1/adspent`, {
        user_id,
        access_token,
      });
      if (response.data && response.data.campaign_spending_data?.campaign_spending_data?.campaigns) {
        const campaigns = response.data.campaign_spending_data.campaign_spending_data.campaigns;
        setAdspentData(campaigns);
        
        // Capture the exact time when Facebook API fetch finished
        const fetchCompletionTime = Date.now();
        
        // Persist state with the start time (for timer calculation)
        persistState(campaigns, fetchStartTime, facebookName, access_token);
        
        // Update Google Sheet with budget remaining and the exact fetch completion time
        sendBudgetToSheets(campaigns, apiUrl, fetchCompletionTime);
      } else {
        setAdspentData([]);
        notify("No campaign data found", "error");
      }
    } catch (error) {
      setAdspentData([]);
      notify(error?.response?.data?.error || "Failed to fetch data", "error");
    } finally {
      setFetching(false);
    }
  }, [apiUrl]);

  // Set up the 10-min timer
  useEffect(() => {
    if (!selectedAccessToken || !selectedFacebookName || !autoRefreshEnabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const now = Date.now();
    const msSinceLast = lastFetchTime ? now - lastFetchTime : REFRESH_INTERVAL;
    const msToNext = Math.max(REFRESH_INTERVAL - msSinceLast, 0);
    timerRef.current = setTimeout(() => {
      notify("⏰ 30 minutes passed. Fetching fresh ad spend data...", "info");
      const { id: user_id } = getUserData();
      fetchAdSpendData(user_id, selectedAccessToken, selectedFacebookName);
    }, msToNext);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lastFetchTime, selectedAccessToken, selectedFacebookName, fetchAdSpendData, autoRefreshEnabled]);

  // Clear ad spend data
  const clearAdSpendData = () => {
    setAdspentData([]);
    setLastFetchTime(null);
    setSelectedFacebookName("");
    setSelectedAccessToken("");
    localStorage.removeItem(DATA_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(FACEBOOK_NAME_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  };

  // Expose context values and setters
  return (
    <AdSpendAutoRefreshContext.Provider
      value={{
        adspentData,
        fetching,
        lastFetchTime,
        selectedFacebookName,
        setSelectedFacebookName,
        selectedAccessToken,
        setSelectedAccessToken,
        fetchAdSpendData,
        stopAutoRefresh,
        autoRefreshEnabled,
        clearAdSpendData,
      }}
    >
      {children}
    </AdSpendAutoRefreshContext.Provider>
  );
};

AdSpendAutoRefreshProvider.propTypes = {
  children: PropTypes.node.isRequired,
  apiUrl: PropTypes.string.isRequired,
};

export const useAdSpendAutoRefresh = () => useContext(AdSpendAutoRefreshContext); 