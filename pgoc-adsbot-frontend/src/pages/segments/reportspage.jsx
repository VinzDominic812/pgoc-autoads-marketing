import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import notify from "../components/toast.jsx";
import { TextField, Button, Typography } from "@mui/material";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";

const ReportsPage = () => {
  const apiUrl = import.meta.env.VITE_API_URL;

  const headers = [
    "ad_account_id",
    "ad_account_name",
    "campaign_name",
    "status",
    "daily_budget",
    "budget_remaining",
    "spent",
  ];

  const [adspentData, setAdspentData] = useState([]);
  const [accessToken, setAccessToken] = useState("");
  const [userName, setUserName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [timer, setTimer] = useState(30);  // Countdown timer for auto-refresh
  const [autoFetchInterval, setAutoFetchInterval] = useState(null);

  const fetchAdSpendData = useCallback(async () => {
    if (!accessToken || accessToken.length < 100) return;

    try {
      setFetching(true);
      const response = await fetch(`${apiUrl}/api/v1/adspent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "skip_zrok_interstitial": "true",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.campaign_spending_data?.accounts) {
          const formattedData = [];

          Object.keys(data.campaign_spending_data.accounts).forEach((accountId) => {
            const account = data.campaign_spending_data.accounts[accountId];

            account.campaigns.forEach((campaign) => {
              const daily_budget = campaign.daily_budget || 0;
              const budget_remaining = campaign.budget_remaining || 0;
              const spent = (daily_budget - budget_remaining).toFixed(2);

              formattedData.push({
                ad_account_id: accountId,
                ad_account_name: account.name || "Unknown",
                campaign_name: campaign.name || "Unnamed Campaign",
                status: campaign.status,
                daily_budget: daily_budget,
                budget_remaining: budget_remaining,
                spent: spent,
              });
            });
          });

          setAdspentData(formattedData);
          setUserName(data.campaign_spending_data.facebook_name);
        }
      } else {
        const errorData = await response.json();
        notify(errorData.error || "Failed to fetch campaign data.", "error");
      }
    } catch (error) {
      console.error("Error:", error);
      notify("Network error. Please try again later.", "error");
    } finally {
      setFetching(false);
    }
  }, [accessToken, apiUrl]);

  const handleFetchUser = () => {
    if (!accessToken) {
      alert("Please enter your access token.");
      return;
    }
    if (accessToken.length < 100) {
      alert("Access token seems invalid.");
      return;
    }
    fetchAdSpendData();
  };

  const handleStopFetching = () => {
    clearInterval(autoFetchInterval);
    setAutoFetchInterval(null);
    setAccessToken(""); // Clear the token so it becomes editable again
  };

  // ⏱️ Auto-refresh every 30 seconds
  useEffect(() => {
    if (!accessToken || accessToken.length < 100) return;

    fetchAdSpendData(); // Initial fetch
    const interval = setInterval(() => {
      fetchAdSpendData();
      setTimer(30); // Reset timer to 30 seconds after each fetch
    }, 30000); // every 30 seconds

    setAutoFetchInterval(interval);

    return () => clearInterval(interval); // Cleanup on unmount or token change
  }, [accessToken, fetchAdSpendData]);

  // Update the countdown timer
  useEffect(() => {
    if (!autoFetchInterval) return;

    const countdown = setInterval(() => {
      setTimer((prevTime) => (prevTime > 0 ? prevTime - 1 : 30)); // Countdown every second
    }, 1000);

    return () => clearInterval(countdown); // Cleanup countdown timer
  }, [autoFetchInterval]);

  return (
    <Box>
      <h2>Ad Spent Report</h2>
      <Box display="flex" gap={2} mb={2}>
        <TextField
          label="Access Token"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          helperText="Enter your Meta Ads Manager Access Token"
          disabled={accessToken && accessToken.length >= 100} // Disable when token is valid
        />
        <Button
          variant="contained"
          onClick={handleFetchUser}
          disabled={accessToken && accessToken.length >= 100} // Disable fetch when token is inserted
        >
          {fetching ? "Fetching..." : "FETCH!"}
        </Button>
        {autoFetchInterval && (
          <Button variant="outlined" onClick={handleStopFetching}>
            Stop Fetching
          </Button>
        )}
      </Box>

      {userName && (
        <Typography variant="h6" mt={2}>
          WELCOME {userName}!!
        </Typography>
      )}

      <Typography variant="body1" mt={2}>
        Auto-refresh in: {timer}s
      </Typography>

      <WidgetCard title="Main Section" height="95.5%">
        <DynamicTable
          headers={headers}
          data={adspentData}
          rowsPerPage={1000}
          compact={true}
          nonEditableHeaders={"Actions"}
        />
      </WidgetCard>
    </Box>
  );
};

export default ReportsPage;
