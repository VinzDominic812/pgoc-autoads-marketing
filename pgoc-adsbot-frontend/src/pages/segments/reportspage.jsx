import React, { useState, useEffect, useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import notify from "../components/toast.jsx";
import { TextField, Button, Typography, CircularProgress, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";
import ReportTerminal from "../widgets/reports/reports_terminal.jsx";
import SummaryTable from "../widgets/reports/summary_table.jsx";
import CustomButton from "../components/buttons.jsx";
import CloudExportIcon from "@mui/icons-material/BackupRounded";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  getUserData,
  encryptData,
  decryptData,
} from "../../services/user_data.js";

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
  const [timer, setTimer] = useState(180);
  const [autoFetchInterval, setAutoFetchInterval] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [messages, setMessages] = useState([]);
  const eventSourceRef = useRef(null);
  const [selectedAdAccount, setSelectedAdAccount] = useState("all");
  const [adAccounts, setAdAccounts] = useState([]);
  const [pageLimit, setPageLimit] = useState(25);

  const summaryData = React.useMemo(() => {
    const active = adspentData.filter((row) => row.status === "ACTIVE");

    const calcTotals = (rows) => {
      const totalBudget = rows.reduce((sum, row) => sum + Number(row.daily_budget || 0), 0);
      const budgetRemaining = rows.reduce((sum, row) => sum + Number(row.budget_remaining || 0), 0);
      const spent = totalBudget - budgetRemaining;
      return { totalBudget, budgetRemaining, spent };
    };

    const activeTotals = calcTotals(active);

    return [
      { label: "Total Budget", value: `₱${activeTotals.totalBudget.toFixed(2)}` },
      { label: "Budget Remaining", value: `₱${activeTotals.budgetRemaining.toFixed(2)}` },
      { label: "Spent", value: `₱${activeTotals.spent.toFixed(2)}` },
    ];
  }, [adspentData]);

  // Filtered data based on selected ad account
  const filteredData = React.useMemo(() => {
    if (selectedAdAccount === "all") {
      return adspentData.filter(row => row.status === "ACTIVE");
    }
    return adspentData.filter(row => row.status === "ACTIVE" && row.ad_account_id === selectedAdAccount);
  }, [adspentData, selectedAdAccount]);

  // Fetch data function
  const fetchAdSpendData = useCallback(async () => {
    if (!accessToken || accessToken.length < 100) return;

    try {
      setFetching(true);
      setMessages(prevMessages => [
        ...prevMessages,
        `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] Starting data fetch...`
      ]);

      const { id: user_id } = getUserData();
      console.log("User ID inside fetchAdSpendData:", user_id);
      const response = await fetch(`${apiUrl}/api/v1/adspent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          user_id,
          access_token: accessToken,
          page_limit: pageLimit  // Add the page_limit parameter
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.campaign_spending_data?.accounts) {
          const formattedData = [];
          let newUserName = "";
          const uniqueAccounts = new Set();

          Object.keys(data.campaign_spending_data.accounts).forEach(
            (accountId) => {
              const account = data.campaign_spending_data.accounts[accountId];
              newUserName = data.campaign_spending_data.facebook_name;
              
              // Add this account to the unique accounts set
              uniqueAccounts.add(accountId);
              
              if (account.campaigns && Array.isArray(account.campaigns)) {
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
              } else {
                // If no campaigns are present, still show the account
                formattedData.push({
                  ad_account_id: accountId,
                  ad_account_name: account.name || "Unknown",
                  campaign_name: "No campaigns found",
                  status: "N/A",
                  daily_budget: 0,
                  budget_remaining: 0,
                  spent: 0,
                });
              }
            }
          );

          // Update the list of ad accounts for the filter dropdown
          const accountOptions = Array.from(uniqueAccounts).map(id => {
            const accountName = data.campaign_spending_data.accounts[id].name || "Unknown";
            return { id, name: `${accountName} (${id})` };
          });
          
          setAdAccounts(accountOptions);
          setAdspentData(formattedData);
          setUserName(newUserName);
          
          // Log the number of accounts and campaigns
          setMessages(prevMessages => [
            ...prevMessages,
            `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] Fetched ${accountOptions.length} ad accounts with a total of ${formattedData.length} campaigns.`
          ]);
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
  }, [accessToken, apiUrl, pageLimit]);

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
    }

    // Cleanup if token becomes invalid or is cleared
    return () => {
      if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        setAutoFetchInterval(null);
      }
    };
  }, [accessToken, fetchAdSpendData, autoFetchInterval]);

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

  useEffect(() => {
    const { id: user_id } = getUserData();
    console.log("User ID:", user_id);

    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-adspentreport?keys=${user_id}-key`;

    if (eventSourceRef.current) {
      eventSourceRef.current.close(); // Close any existing connection
    }

    const eventSource = new EventSource(eventSourceUrl);

    eventSource.onmessage = (event) => {
      console.log("SSE Message:", event.data);
      try {
        const parsedData = JSON.parse(event.data); // Parse the JSON data

        // Extract and format the desired message
        if (parsedData.data && parsedData.data.message) {
          const rawMessage = parsedData.data.message.join(" ");

          // Check if the message already contains a timestamp
          const timestampRegex = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;
          const formattedMessage = timestampRegex.test(rawMessage)
            ? rawMessage // Use the message as is if it already has a timestamp
            : `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] ${rawMessage}`;

          setMessages((prevMessages) => [...prevMessages, formattedMessage]);
        }
      } catch (e) {
        console.error("Error parsing SSE data:", e);
        setMessages((prevMessages) => [...prevMessages, event.data]);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [apiUrl]);

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
            
            {/* Page Limit for ad account fetching */}
            <FormControl fullWidth size="small">
              <InputLabel id="page-limit-label">Accounts Per Page</InputLabel>
              <Select
                labelId="page-limit-label"
                value={pageLimit}
                label="Accounts Per Page"
                onChange={(e) => setPageLimit(e.target.value)}
                disabled={fetching}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
              </Select>
            </FormControl>

            {/* Row with Fetch and Export Buttons */}
            <Box sx={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {/* Manual Refresh Button */}
              <CustomButton
                name={fetching ? "Fetching..." : "Refresh Data"}
                onClick={fetchAdSpendData}
                type="primary"
                icon={fetching ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                disabled={!accessToken || accessToken.length < 100 || fetching}
              />
              {/* Custom Stop Fetching Button */}
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
        {/* User Welcome and Ad Account Filter in one row */}
        <Box sx={{ 
          mt: 2, 
          mb: 2, 
          display: "flex", 
          flexDirection: "row",
          justifyContent: "space-between", 
          alignItems: "center",
          position: "relative"  // Add position relative
        }}>
          {/* Welcome message on the left */}
          {userName && (
            <Typography 
              variant="h6" 
              sx={{ 
                flexShrink: 0,
                mr: 2,
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              WELCOME {userName}!
            </Typography>
          )}

          {/* Timer position underneath welcome message */}
          {accessToken && accessToken.length >= 100 && (
            <Typography 
              variant="caption" 
              sx={{ 
                position: "absolute",
                top: "calc(100% - 5px)",
                left: 0,
                color: "text.secondary"
              }}
            >
              Auto-refresh in: {timer} seconds
            </Typography>
          )}

          {/* Ad Account Filter on the right */}
          {adAccounts.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
              <Typography>Filter by Ad Account:</Typography>
              <FormControl sx={{ minWidth: 250 }}>
                <Select
                  value={selectedAdAccount}
                  onChange={(e) => setSelectedAdAccount(e.target.value)}
                  displayEmpty
                  size="small"
                >
                  <MenuItem value="all">All Ad Accounts</MenuItem>
                  {adAccounts.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Box>

        {adspentData.length > 0 ? (
          <WidgetCard 
            title={`Active Campaigns ${selectedAdAccount !== "all" 
              ? `- ${adAccounts.find(a => a.id === selectedAdAccount)?.name || selectedAdAccount}` 
              : '(All Accounts)'}`} 
            height="95.5%"
          >
            <DynamicTable
              headers={headers}
              data={filteredData}
              rowsPerPage={100}
              compact={true}
              nonEditableHeaders={"Actions"}
              page={currentPage}
              onPageChange={(event, newPage) => setCurrentPage(newPage)}
            />
          </WidgetCard>
        ) : (
          <Typography variant="body2" mt={2}>
            {fetching ? "Fetching data..." : "No data available"}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default ReportsPage;