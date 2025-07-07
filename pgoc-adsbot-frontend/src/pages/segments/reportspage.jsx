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
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import {
  getUserData,
  encryptData,
  decryptData,
} from "../../services/user_data.js";
import axios from "axios";
import { useAdSpendAutoRefresh } from "../../contexts/AdSpendAutoRefreshContext";

const ReportsPage = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const {
    adspentData,
    fetching,
    selectedFacebookName,
    setSelectedFacebookName,
    selectedAccessToken,
    setSelectedAccessToken,
    fetchAdSpendData,
    stopAutoRefresh,
    autoRefreshEnabled,
    clearAdSpendData,
  } = useAdSpendAutoRefresh();

  // Updated headers to show only essential data
  const headers = [
    "campaign_name",
    "ad_account_name",
    "delivery_status",
    "daily_budget",
    "budget_remaining",
    "spent",
  ];

  const [userName, setUserName] = useState(() => {
    return localStorage.getItem("reportsUserName") || "";
  });

  const [adAccounts, setAdAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const eventSourceRef = useRef(null);
  const [selectedAdAccount, setSelectedAdAccount] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessTokenMap, setAccessTokenMap] = useState({});
  const [facebookNames, setFacebookNames] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [userRelationship, setUserRelationship] = useState(null);
  const [loadingRelationship, setLoadingRelationship] = useState(false);

  // Fetch access tokens when component mounts
  useEffect(() => {
    fetchAccessTokens();
    checkUserRelationship();
  }, []);

  // Function to fetch access tokens from API
  const fetchAccessTokens = async () => {
    try {
      setLoadingTokens(true);
      const { id: userId } = getUserData();
      const response = await axios.get(`${apiUrl}/api/v1/user/${userId}/access-tokens`);
      if (response.data && response.data.data) {
        // Create a mapping of facebook_name -> access_token
        const tokenMap = {};
        const names = [];
        response.data.data.forEach(token => {
          if (token.facebook_name) {
            tokenMap[token.facebook_name] = token.access_token;
            names.push({
              name: token.facebook_name,
              token: token.access_token,
              isExpired: token.is_expire
            });
          }
        });
        setAccessTokenMap(tokenMap);
        setFacebookNames(names);
        // If current selection is no longer valid, clear it
        if (selectedFacebookName && !tokenMap[selectedFacebookName]) {
          setSelectedFacebookName("");
          setSelectedAccessToken("");
        }
      } else {
        setFacebookNames([]);
        setAccessTokenMap({});
        setSelectedFacebookName("");
        setSelectedAccessToken("");
      }
    } catch (error) {
      console.error("Error fetching access tokens:", error);
      notify("Failed to fetch Facebook names. Please check your connection.", "error");
      setFacebookNames([]);
      setAccessTokenMap({});
      setSelectedFacebookName("");
      setSelectedAccessToken("");
    } finally {
      setLoadingTokens(false);
    }
  };

  // Function to check user relationship status
  const checkUserRelationship = async () => {
    try {
      setLoadingRelationship(true);
      const { id: userId } = getUserData();
      const response = await axios.get(`${apiUrl}/api/v1/check-relationship?user_id=${userId}`);
      if (response.data) {
        setUserRelationship(response.data);
      }
    } catch (error) {
      console.error("Error checking user relationship:", error);
      setUserRelationship({ relationship: false });
    } finally {
      setLoadingRelationship(false);
    }
  };

  // Handle Facebook name selection
  const handleFacebookNameChange = (facebookName) => {
    setSelectedFacebookName(facebookName);
    setSelectedAccessToken(accessTokenMap[facebookName] || "");
    setMessages([]);
    setUserName("");
    setAdAccounts([]);
    setCurrentPage(0);
    if (facebookName && accessTokenMap[facebookName]) {
      const { id: user_id } = getUserData();
      fetchAdSpendData(user_id, accessTokenMap[facebookName], facebookName);
    }
  };

  // Enhanced summary data with breakdown by status
  const summaryData = React.useMemo(() => {
    const activeRows = adspentData.filter(row => row.delivery_status === "ACTIVE");
    const inactiveRows = adspentData.filter(row => row.delivery_status === "INACTIVE");
    const notDeliveringRows = adspentData.filter(row => row.delivery_status === "NOT_DELIVERING");
    const totalBudget = adspentData.reduce(
      (sum, row) => sum + Number(row.daily_budget || 0),
      0
    );
    const budgetRemaining = activeRows.reduce(
      (sum, row) => sum + Number(row.budget_remaining || 0),
      0
    );
    const spent = adspentData.reduce(
      (sum, row) => sum + Number(row.spent || 0),
      0
    );
    return [
      { label: "Total Budget", value: `₱${totalBudget.toFixed(2)}` },
      { label: "Budget Remaining (Active)", value: `₱${budgetRemaining.toFixed(2)}` },
      { label: "Spent", value: `₱${spent.toFixed(2)}` },
      { label: "Active Campaigns", value: activeRows.length },
      { label: "Inactive Campaigns", value: inactiveRows.length },
      { label: "Not Delivering", value: notDeliveringRows.length }
    ];
  }, [adspentData]);

  // Enhanced filtering logic to include status filter
  const filteredData = React.useMemo(() => {
    let filtered = adspentData;
    if (selectedAdAccount !== "all") {
      filtered = filtered.filter(row => row.ad_account_id === selectedAdAccount);
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter(row => row.delivery_status === statusFilter);
    }
    return filtered;
  }, [adspentData, selectedAdAccount, statusFilter]);

  useEffect(() => {
    // Update ad accounts list for filter dropdown
    if (adspentData && adspentData.length > 0) {
      const uniqueAccounts = [...new Set(adspentData.map(c => c.ad_account_name))];
      setAdAccounts(uniqueAccounts);
    } else {
      setAdAccounts([]);
    }
  }, [adspentData]);

  useEffect(() => {
    const { id: user_id } = getUserData();
    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-adspentreport?keys=${user_id}-key`;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const eventSource = new EventSource(eventSourceUrl);
    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        if (parsedData.data && parsedData.data.message) {
          const rawMessage = parsedData.data.message.join(" ");
          const timestampRegex = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;
          const formattedMessage = timestampRegex.test(rawMessage)
            ? rawMessage
            : `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] ${rawMessage}`;
          setMessages((prevMessages) => [...prevMessages, formattedMessage]);
          const completionIndicators = [
            "✅ Completed fetching",
            "Completed fetching. Total campaigns",
            "Processing complete",
            "Data fetch completed"
          ];
          const errorIndicators = [
            "❌ Error",
            "Failed to fetch",
            "No ad accounts found",
            "Failed to get user info"
          ];
          if (completionIndicators.some(indicator => rawMessage.includes(indicator))) {
            // No-op: fetching state is managed by context
          } else if (errorIndicators.some(indicator => rawMessage.includes(indicator))) {
            // No-op: fetching state is managed by context
          }
        }
      } catch (e) {
        setMessages((prevMessages) => [...prevMessages, event.data]);
      }
    };
    eventSource.onerror = (error) => {
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
    if (!selectedFacebookName) {
      notify("Please select a Facebook account", "error");
      return;
    }
    const accessToken = accessTokenMap[selectedFacebookName];
    if (accessToken) {
      const { id: user_id } = getUserData();
      fetchAdSpendData(user_id, accessToken, selectedFacebookName);
      setSelectedAccessToken(accessToken);
      setMessages((prev) => prev.length > 0 ? [prev[prev.length - 1]] : []);
    } else {
      notify("Access token not found for selected Facebook account", "error");
    }
  };

  const handleStopFetching = () => {
    stopAutoRefresh();
    setSelectedFacebookName("");
    setSelectedAccessToken("");
    setMessages([]);
    setUserName("");
    setAdAccounts([]);
  };

  const handleClearAllData = () => {
    clearAdSpendData();
    setMessages([]);
    setUserName("");
    setAdAccounts([]);
    notify("All data cleared successfully!", "success");
  };

  const handleSendToSheets = useCallback(async () => {
    const budgetItem = summaryData.find(
      (item) => item.label === "Budget Remaining (Active)"
    );
    if (!budgetItem || !budgetItem.value) {
      return;
    }
    const budgetValue = budgetItem.value.replace(/[^0-9.-]+/g, "");
    if (parseFloat(budgetValue) <= 0) {
        return;
    }
    try {
      await axios.post(
        `${apiUrl}/api/v1/sheets/update-budget`,
        {
          budget_remaining: budgetValue,
        }
      );
      console.log(`Successfully sent budget data to Google Sheets: ${budgetItem.value}`);
    } catch (error) {
      console.error("Error auto-sending data to Google Sheets:", error);
    }
  }, [summaryData, apiUrl]);

  const handleExportData = () => {
    if (adspentData.length === 0) {
      notify("No data to export.", "error");
      return;
    }
    const csvHeaders = [
      "campaign_name",
      "ad_account_name",
      "delivery_status",
      "spent",
      "daily_budget",
      "budget_remaining",
    ];
    const csvRows = [
      csvHeaders.join(","),
      ...adspentData.map(row =>
        csvHeaders.map(header => `"${row[header] !== undefined ? row[header] : ""}"`).join(",")
      ),
      "",
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

  const getCurrentTime = () => {
    const now = new Date();
    return now.toISOString().split('T')[0] + "_" + now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  };

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
            {/* Facebook Name Dropdown */}
            <FormControl sx={{ minWidth: 200 }}>
              <Select
                value={selectedFacebookName}
                onChange={(e) => handleFacebookNameChange(e.target.value)}
                displayEmpty
                disabled={fetching || loadingTokens}
                startAdornment={loadingTokens ? <CircularProgress size={20} /> : null}
                placeholder="Select Facebook"
              >
                <MenuItem value="">
                  <em>Select Facebook</em>
                </MenuItem>
                {facebookNames.map((name) => (
                  <MenuItem key={name.name} value={name.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{name.name}</span>
                      {name.isExpired && (
                        <Typography variant="caption" color="error">
                          ⚠️ Expired
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary">
                {facebookNames.length > 0 
                  ? `Select a Facebook account to fetch campaign data (${facebookNames.length} available)`
                  : loadingRelationship 
                    ? "Checking account status..."
                    : userRelationship?.relationship 
                      ? "No Facebook accounts found. Inform your supervisor."
                      : "No Facebook accounts found. Enter your invite code from your supervisor."
                }
              </Typography>
              {adspentData.length > 0 && (
                <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                  📊 {adspentData.length} campaigns loaded • Ready to export
                </Typography>
              )}
            </FormControl>

            {/* Button Container */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              {/* First Row: Refresh and Stop */}
              <Box sx={{ display: "flex", gap: "15px" }}>
                <CustomButton
                  name={fetching ? "Fetching..." : "Refresh Data"}
                  onClick={handleFetchUser}
                  type="tertiary"
                  icon={
                    fetching ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <RefreshIcon />
                    )
                  }
                  disabled={!selectedFacebookName || fetching}
                />
                <CustomButton
                  name="Stop Fetching"
                  onClick={handleStopFetching}
                  type="primary"
                  icon={null}
                  disabled={!selectedFacebookName || !autoRefreshEnabled}
                />
              </Box>

              {/* Second Row: Refresh Tokens, Export, Clear */}
              <Box sx={{ display: "flex", gap: "15px" }}>
                <CustomButton
                  name={loadingTokens ? "Refreshing..." : "Refresh Tokens"}
                  onClick={fetchAccessTokens}
                  type="secondary"
                  icon={
                    loadingTokens ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <RefreshIcon />
                    )
                  }
                  disabled={loadingTokens}
                />
                <CustomButton
                  name="Export"
                  onClick={handleExportData}
                  type="tertiary"
                  icon={<CloudExportIcon />}
                  disabled={adspentData.length === 0}
                />
                <CustomButton
                  name="Clear Data"
                  onClick={handleClearAllData}
                  type="primary"
                  icon={<DeleteIcon />}
                  disabled={
                    adspentData.length === 0 &&
                    messages.length === 0 &&
                    userName === ""
                  }
                />
              </Box>
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
            {adspentData.length > 0 && (
              <>
                <Typography>Filter by Status:</Typography>
                <FormControl sx={{ minWidth: 200 }}>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    displayEmpty
                    size="small"
                  >
                    <MenuItem value="all">📊 All Statuses</MenuItem>
                    <MenuItem value="ACTIVE">✅ Active Only</MenuItem>
                    <MenuItem value="INACTIVE">⏸️ Inactive</MenuItem>
                    <MenuItem value="NOT_DELIVERING">❌ Not Delivering</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}

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
                      <MenuItem key={account} value={account}>
                        {account}
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
              ? `- ${adAccounts.find(a => a === selectedAdAccount) || selectedAdAccount}` 
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
                "ad_account_name",
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