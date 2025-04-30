import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import notify from "../components/toast.jsx";
import { TextField, Button, Typography } from "@mui/material";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";
import ReportTerminal from "../widgets/reports/reports_terminal.jsx";
import SummaryTable from "../widgets/reports/summary_table.jsx";
import CustomButton from "../components/buttons.jsx"; // Import your CustomButton
import CloudExportIcon from "@mui/icons-material/BackupRounded";

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
  const [timer, setTimer] = useState(180); // Countdown timer for auto-refresh (180 seconds = 3 minutes)
  const [autoFetchInterval, setAutoFetchInterval] = useState(null);
  const [currentPage, setCurrentPage] = useState(0); // Track the current page of the table
  const [messages, setMessages] = useState([]);

  const summaryData = React.useMemo(() => {
    const active = adspentData.filter((row) => row.status === "ACTIVE");
  
    const calcTotals = (rows) => {
      const totalBudget = rows.reduce((sum, row) => sum + Number(row.daily_budget || 0), 0);
      const budgetRemaining = rows.reduce((sum, row) => sum + Number(row.budget_remaining || 0), 0);
      const spent = totalBudget - budgetRemaining;
      return { totalBudget, budgetRemaining, spent };
    };
  
    const activeTotals = calcTotals(active);
    const overallTotals = calcTotals(adspentData);
  
    return [
      { label: "Active - Total Budget", value: `₱${activeTotals.totalBudget.toFixed(2)}` },
      { label: "Active - Budget Remaining", value: `₱${activeTotals.budgetRemaining.toFixed(2)}` },
      { label: "Active - Spent", value: `₱${activeTotals.spent.toFixed(2)}` },
      { label: "Overall - Total Budget", value: `₱${overallTotals.totalBudget.toFixed(2)}` },
      { label: "Overall - Budget Remaining", value: `₱${overallTotals.budgetRemaining.toFixed(2)}` },
      { label: "Overall - Spent", value: `₱${overallTotals.spent.toFixed(2)}` },
    ];
  }, [adspentData]);

  // Fetch data function
  const fetchAdSpendData = useCallback(async () => {
    if (!accessToken || accessToken.length < 100) return;

    try {
      setFetching(true);
      const response = await fetch(`${apiUrl}/api/v1/adspent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.campaign_spending_data?.accounts) {
          const formattedData = [];
          let newUserName = "";

          Object.keys(data.campaign_spending_data.accounts).forEach(
            (accountId) => {
              const account = data.campaign_spending_data.accounts[accountId];
              newUserName = data.campaign_spending_data.facebook_name;

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
            }
          );

          setAdspentData(formattedData);
          setUserName(newUserName);
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

  useEffect(() => {
    if (accessToken && accessToken.length >= 100 && !fetching) {
      handleFetchUser();
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && accessToken.length >= 100 && !autoFetchInterval) {
      const interval = setInterval(() => {
        fetchAdSpendData();
      }, 180000); // 3 minutes in milliseconds
  
      setAutoFetchInterval(interval);
      return () => clearInterval(interval); // Cleanup on unmount
    }
  
    // Cleanup if token becomes invalid or is cleared
    return () => {
      if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        setAutoFetchInterval(null);
      }
    };
  }, [accessToken, fetchAdSpendData]);

  useEffect(() => {
    if (accessToken && accessToken.length >= 100) {
      // Reset the timer to 180 on token set
      setTimer(180);
  
      const countdownInterval = setInterval(() => {
        setTimer((prevTimer) => {
          if (prevTimer <= 1) return 180; // Reset after reaching 0
          return prevTimer - 1;
        });
      }, 1000);
  
      return () => clearInterval(countdownInterval);
    }
  }, [accessToken]);

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
    setFetching(false);
    setAccessToken(""); // Clear the token so it becomes editable again
  };

  const handleExportData = () => {
    if (adspentData.length === 0) {
      notify("No data to export.", "error");
      return;
    }
  
    const csvHeaders = [
      "ad_account_id",
      "ad_account_name",
      "campaign_name",
      "status",
      "daily_budget",
      "budget_remaining",
      "spent",
    ];
  
    // Convert table data to CSV rows
    const csvRows = [
      csvHeaders.join(","),
      ...adspentData.map(row =>
        csvHeaders.map(header => `"${row[header] || ""}"`).join(",")
      ),
      "", // Blank row as a separator
      "-- Summary --",
      ...summaryData.map(item =>
        `"${item.label}","${item.value}"`
      ),
    ];
  
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
  
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Exported_Campaigns_${getCurrentTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  
    notify("Data exported successfully!", "success");
  };

  // Helper function for current timestamp
  const getCurrentTime = () => {
    const now = new Date();
    return now.toISOString().split('T')[0] + "_" + now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  };

  // JSX Rendering
  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* First Row */}
      <Box sx={{ display: "flex", height: "285px" }}>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", borderRadius: "8px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography variant="h5" component="div" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              REPORT PAGE
            </Typography>
          </Box>
  
          <Box sx={{ flex: 1 }} />
  
          <Box sx={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {/* Access Token Text Field */}
            <TextField
              label="Access Token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              helperText="Enter your Meta Ads Manager Access Token"
              disabled={accessToken && accessToken.length >= 100}
            />
  
            {/* Row with Fetch and Export Buttons */}
            <Box sx={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {/* Custom Fetch or Stop Fetching Button */}
              <CustomButton
                name="Stop Fetching"
                onClick={handleStopFetching}
                type="tertiary"
                icon={null}
                disabled={!accessToken || accessToken.length < 100}

              />
              {/* Custom Export Button */}
              <CustomButton
                name="Export"
                onClick={handleExportData}
                type="tertiary"
                icon={<CloudExportIcon />}
                sx={{ flex: 1 }} // Ensure it takes up available space if needed
              />
            </Box>
            <Typography variant="caption" sx={{ mt: 1 }}>
              Auto-refresh in: {timer} seconds
            </Typography>
          </Box>
        </Box>
  
        {/* Middle Column - Summary Table */}
        <Box
          sx={{
            width: "30%",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            border: "1px solid #ddd",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
            mr: 2, // Add right margin
          }}
        >
          <Typography variant="h6" mb={2} textAlign="center">
            Active Campaign Summary
          </Typography>
          <SummaryTable data={summaryData} />
        </Box>
  
        {/* Terminal */}
        <Box sx={{ width: "50%" }}>
          <ReportTerminal messages={messages} setMessages={setMessages} />
        </Box>
      </Box>
  
      {/* Second Row (Dynamic Table) */}
      <Box sx={{ flex: 1 }}>
        {userName && (
          <Typography variant="h6" mt={2}>
            WELCOME {userName}!!
          </Typography>
        )}
  
        {adspentData.length > 0 ? (
          <WidgetCard title="Main Section" height="95.5%">
            <DynamicTable
              headers={headers}
              data={adspentData}
              rowsPerPage={100}
              compact={true}
              nonEditableHeaders={"Actions"}
              page={currentPage}
              onPageChange={(event, newPage) => setCurrentPage(newPage)} // Update current page
            />
          </WidgetCard>
        ) : (
          <Typography variant="body2" mt={2}>
            No data available
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default ReportsPage;