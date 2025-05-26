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
    "campaign_name",
    "delivery_status",
    "daily_budget",
    "budget_remaining",
    "spent",
  ];

  const [adspentData, setAdspentData] = useState([]);
  const [accessToken, setAccessToken] = useState("");
  const [userName, setUserName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [messages, setMessages] = useState([]);
  const eventSourceRef = useRef(null);
  const [selectedAdAccount, setSelectedAdAccount] = useState("all");
  const [adAccounts, setAdAccounts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ACTIVE"); // New state for status filtering

  // Enhanced summary data with breakdown by status
  const summaryData = React.useMemo(() => {
    const activeRows = adspentData.filter(row => row.delivery_status === "ACTIVE");
    const inactiveRows = adspentData.filter(row => row.delivery_status === "INACTIVE");
    const notDeliveringRows = adspentData.filter(row => row.delivery_status === "NOT_DELIVERING");

    const totalBudget = activeRows.reduce(
      (sum, row) => sum + Number(row.daily_budget || 0),
      0
    );
    const budgetRemaining = activeRows.reduce(
      (sum, row) => sum + Number(row.budget_remaining || 0),
      0
    );
    const spent = activeRows.reduce(
      (sum, row) => sum + Number(row.spent || 0),
      0
    );

    return [
      { label: "Total Budget (Active)", value: `₱${totalBudget.toFixed(2)}` },
      { label: "Budget Remaining", value: `₱${budgetRemaining.toFixed(2)}` },
      { label: "Spent", value: `₱${spent.toFixed(2)}` },
      { label: "Active Campaigns", value: activeRows.length },
      { label: "Inactive Campaigns", value: inactiveRows.length },
      { label: "Not Delivering", value: notDeliveringRows.length }
    ];
  }, [adspentData]);

  // Enhanced filtering logic to include status filter
  const filteredData = React.useMemo(() => {
    let filtered = adspentData;
    
    // Filter by ad account
    if (selectedAdAccount !== "all") {
      filtered = filtered.filter(row => row.ad_account_id === selectedAdAccount);
    }
    
    // Filter by delivery status
    if (statusFilter !== "all") {
      filtered = filtered.filter(row => row.delivery_status === statusFilter);
    }
    
    return filtered;
  }, [adspentData, selectedAdAccount, statusFilter]);

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
          access_token: accessToken
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Raw response from API:", data);
        
        if (data && data.campaign_spending_data) {
          console.log("Campaign spending data structure:", data.campaign_spending_data);
          
          // Handle both structured formats for compatibility
          if (data.campaign_spending_data.accounts) {
            // Format from the transformed controller
            processAccountsData(data.campaign_spending_data);
          } else if (Array.isArray(data.campaign_spending_data.campaigns)) {
            // Format directly from worker (fallback)
            processRawCampaignsData(data.campaign_spending_data);
          } else {
            notify("Unknown data format received from server", "error");
            console.error("Unknown data format:", data.campaign_spending_data);
          }
        } else {
          notify("No campaign data received from server", "warning");
        }
      } else {
        try {
          const errorData = await response.json();
          notify(errorData.error || "Failed to fetch campaign data.", "error");
        } catch (e) {
          notify("Failed to fetch campaign data.", "error");
        }
      }
    } catch (error) {
      console.error("Error:", error);
      notify("Network error. Please try again later.", "error");
    } finally {
      setFetching(false);
    }
  }, [accessToken, apiUrl]);

  const processAccountsData = (campaignData) => {
    const formattedData = [];
    let newUserName = campaignData.facebook_name || "";
    const uniqueAccounts = new Set();
    let totalCampaigns = 0;

    Object.keys(campaignData.accounts).forEach((accountId) => {
      const account = campaignData.accounts[accountId];
      uniqueAccounts.add(accountId);

      if (account.campaigns && Array.isArray(account.campaigns)) {
        account.campaigns.forEach((campaign) => {
          const daily_budget = parseFloat(campaign.daily_budget || 0);
          const budget_remaining = parseFloat(campaign.budget_remaining || 0);

          let spent = 0;
          if (campaign.spent !== undefined) {
            spent = parseFloat(campaign.spent);
          } else if (campaign.spend !== undefined) {
            spent = parseFloat(campaign.spend);
          } else {
            spent = parseFloat((daily_budget - budget_remaining).toFixed(2));
          }

          formattedData.push({
            ad_account_id: accountId,
            campaign_id: campaign.id || campaign.campaign_id || "N/A", // Add campaign ID
            campaign_name: campaign.name || "Unnamed Campaign",
            status: campaign.status || "UNKNOWN",
            delivery_status: campaign.delivery_status || "N/A",
            effective_status: campaign.effective_status || "",
            delivery_reasons: campaign.delivery_reasons || [],
            daily_budget: daily_budget,
            budget_remaining: budget_remaining,
            spent: spent,
          });

          totalCampaigns += 1;
        });
      }
    });

    const accountOptions = Array.from(uniqueAccounts).map(id => {
      const accountName = campaignData.accounts[id].name || "Unknown";
      return { id, name: `${accountName} (${id})` };
    });

    setAdAccounts(accountOptions);
    setAdspentData(formattedData);
    setUserName(newUserName);

    setMessages(prevMessages => [
      ...prevMessages,
      `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] Fetched ${accountOptions.length} ad accounts with a total of ${totalCampaigns} campaigns.`
    ]);

    console.log("Formatted data for display:", formattedData);
  };

  // Process raw campaigns data (fallback for direct worker format)
  const processRawCampaignsData = (campaignData) => {
    // This is a fallback in case the controller doesn't transform the data
    const formattedData = [];
    const uniqueAccounts = new Set();
    const accountsMap = {};
    
    // First pass - collect account IDs and build account map
    campaignData.campaigns.forEach(campaign => {
      const accountId = campaign.ad_account_id;
      uniqueAccounts.add(accountId);
      
      if (!accountsMap[accountId]) {
        accountsMap[accountId] = { name: `Account ${accountId}` };
      }
    });
    
    // Second pass - format the campaign data
    campaignData.campaigns.forEach(campaign => {
      const accountId = campaign.ad_account_id;
      const daily_budget = parseFloat(campaign.daily_budget || 0);
      const budget_remaining = parseFloat(campaign.budget_remaining || 0);
      const spent = parseFloat(campaign.spend || 0);
      
      formattedData.push({
        ad_account_id: accountId,
        ad_account_name: accountsMap[accountId].name,
        campaign_id: campaign.id || campaign.campaign_id || "N/A", // Add campaign ID
        campaign_name: campaign.campaign_name,
        status: campaign.status,
        delivery_status: campaign.delivery_status || campaign.status || "N/A",
        effective_status: campaign.effective_status || "",
        delivery_reasons: campaign.delivery_reasons || [],
        daily_budget: daily_budget,
        budget_remaining: budget_remaining,
        spent: spent,
      });
    });
    
    // Update the list of ad accounts for the filter dropdown
    const accountOptions = Array.from(uniqueAccounts).map(id => {
      return { id, name: `${accountsMap[id].name} (${id})` };
    });
    
    setAdAccounts(accountOptions);
    setAdspentData(formattedData);
    setUserName(campaignData.user_name || "");
    
    // Log the number of accounts and campaigns
    setMessages(prevMessages => [
      ...prevMessages,
      `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] Fetched ${accountOptions.length} ad accounts with a total of ${formattedData.length} campaigns.`
    ]);
    
    console.log("Formatted data for display (from raw campaigns):", formattedData);
  };

  useEffect(() => {
    if (accessToken && accessToken.length >= 100 && !fetching) {
      handleFetchUser();
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
      "campaign_id",
      "campaign_name",
      "delivery_status",
      "effective_status",
      "daily_budget",
      "budget_remaining",
      "spent"
    ];

    // Export ALL campaigns, not just filtered
    const csvRows = [
      csvHeaders.join(","),
      ...adspentData.map(row =>
        csvHeaders.map(header => `"${row[header] !== undefined ? row[header] : ""}"`).join(",")
      ),
      "", // Blank row as separator
      "-- Summary (All Campaigns) --",
      ...summaryData.map(item =>
        `"${item.label}","${item.value}"`
      )
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
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

  // Helper function to get status display text with icons
  const getStatusDisplayText = () => {
    const totalDisplayed = filteredData.length;
    const statusText = statusFilter === "all" ? "All Statuses" : 
                     statusFilter === "ACTIVE" ? "Active" :
                     statusFilter === "INACTIVE" ? "Inactive" : "Not Delivering";
    
    const statusIcon = statusFilter === "ACTIVE" ? "✅" :
                      statusFilter === "INACTIVE" ? "⏸️" :
                      statusFilter === "NOT_DELIVERING" ? "❌" : "📊";
    
    return `${statusIcon} ${statusText} (${totalDisplayed})`;
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

        {/* Middle Column - Enhanced Summary Table */}
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
            Campaign Summary
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
        {/* User Welcome and Filters in one row */}
        <Box sx={{ 
          mt: 2, 
          mb: 2, 
          display: "flex", 
          flexDirection: "row",
          justifyContent: "space-between", 
          alignItems: "center",
          position: "relative"
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

          {/* Filters on the right */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {/* Status Filter */}
            <Typography>Filter by Status:</Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                displayEmpty
                size="small"
              >
                <MenuItem value="ACTIVE">✅ Active Only</MenuItem>
                <MenuItem value="all">📊 All Statuses</MenuItem>
                <MenuItem value="INACTIVE">⏸️ Inactive</MenuItem>
                <MenuItem value="NOT_DELIVERING">❌ Not Delivering</MenuItem>
              </Select>
            </FormControl>

            {/* Ad Account Filter */}
            {adAccounts.length > 0 && (
              <>
                <Typography sx={{ ml: 2 }}>Ad Account:</Typography>
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
              </>
            )}
          </Box>
        </Box>

        {adspentData.length > 0 ? (
          <WidgetCard 
            title={`${getStatusDisplayText()} ${selectedAdAccount !== "all" 
              ? `- ${adAccounts.find(a => a.id === selectedAdAccount)?.name || selectedAdAccount}` 
              : '(All Accounts)'}`} 
            height="95.5%"
          >
            <DynamicTable
              headers={headers}
              data={filteredData}
              rowsPerPage={100}
              compact={true}
              nonEditableHeaders={[
                "campaign_name",
                "delivery_status",
                "daily_budget",
                "budget_remaining",
                "spent",
              ]}
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