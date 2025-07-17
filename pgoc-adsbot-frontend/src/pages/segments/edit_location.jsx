import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, TextField, Tooltip } from "@mui/material";
import WidgetCard from "../components/widget_card";
import DynamicTable from "../components/dynamic_table";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons";
import budgetbg from "../../assets/budget-bg.png";
import Papa from "papaparse";
import { getUserData, encryptData, decryptData } from "../../services/user_data.js";
import axios from "axios";

// ICONS
import ExportIcon from "@mui/icons-material/FileUpload";
import CloudExportIcon from "@mui/icons-material/BackupRounded";
import RunIcon from "@mui/icons-material/PlayCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/FileDownload";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";

import { EventSource } from "extended-eventsource";
import Cookies from "js-cookie";
import EditLocationTerminal from "../widgets/edit_location_widgets/edit_location_terminal.jsx";

// Update required headers to use page_name instead of campaign_name
const REQUIRED_HEADERS = [
  "ad_account_id",
  "facebook_name",
  "page_name",
  "item_name",
  "campaign_code",
  "new_regions_cities"
];

// Function to get the current timestamp in [YYYY-MM-DD HH-MM-SS] format
const getCurrentTime = () => {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8); // Convert UTC to Manila Time (UTC+8)
  return now.toISOString().replace("T", " ").split(".")[0]; // [YYYY-MM-DD HH-MM-SS] format
};

const apiUrl = import.meta.env.VITE_API_URL;

// Helper to extract page name from campaign name
const extractPageName = (campaignName) => {
  return campaignName && typeof campaignName === 'string' ? campaignName.split('-')[0] : '';
};

const EditLocationPage = () => {

  // Update table headers to use page_name as the main identifier
  const headers = [
    "ad_account_id",
    "ad_account_status",
    "facebook_name",
    "access_token_status",
    "page_name",
    "item_name",
    "campaign_code",
    "new_regions_cities",
    "status"
  ];

  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedData, setSelectedData] = useState([]); // Store selected data
  const [messages, setMessages] = useState([]); // Ensure it's an array
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const [accessTokenMap, setAccessTokenMap] = useState({});

  // Retrieve persisted state from cookies
  const getPersistedState = (key, defaultValue) => {
    try {
      const encryptData = localStorage.getItem(key);
      if (!encryptData) return defaultValue;
      const decryptedData = decryptData(encryptData);
      if (!decryptedData) return defaultValue;

      if (Array.isArray(decryptedData)) {
        return decryptedData;
      }

      if (typeof decryptedData === "string") {
        try {
          const parsed = JSON.parse(decryptedData);
          return Array.isArray(parsed) ? parsed : defaultValue;
        } catch {
          return defaultValue;
        }
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error loading ${key}:`, error);
      return defaultValue;
    }
  };

  const [tableEditLocationData, setTableEditLocationData] = useState(() => {
    const data = getPersistedState("tableEditLocationData", []);
    return Array.isArray(data) ? data : [];
  });

  useEffect(() => {
    try {
      const dataToStore = Array.isArray(tableEditLocationData)
        ? tableEditLocationData
        : [];
      const encryptedData = encryptData(dataToStore);
      localStorage.setItem("tableEditLocationData", encryptedData);
    } catch (error) {
      console.error("Error Saving table data:", error);
    }
  }, [tableEditLocationData]);

  useEffect(() => {
    try {
      const encryptedMessages = encryptData(messages);
      localStorage.setItem("pagenameMessages", encryptedMessages);
    } catch (error) {
      console.error("Error saving messages:", error);
      notify("Failed to save messages", "error");
    }
  }, [messages]);

  const handleSelectedDataChange = (selectedRows) => {
    setSelectedData(selectedRows);
  };

  const addMessage = (newMessages) => {
    setMessages((prevMessages) => {
      const messagesArray = Array.isArray(prevMessages) ? prevMessages : [];

      // Ensure newMessages is a single string, not split into characters
      const newMessageText = Array.isArray(newMessages)
        ? newMessages.join(" ")
        : newMessages;

      // Avoid duplicates while maintaining the order
      const uniqueMessages = new Set([...messagesArray, newMessageText]);

      return Array.from(uniqueMessages);
    });
  };

  useEffect(() => {
    const { id: user_id } = getUserData();
    // Adjusted EventSource URL for location updates
    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-editlocation?keys=${user_id}-key`;

    if (eventSourceRef.current) {
        eventSourceRef.current.close();
    }

    const eventSource = new EventSource(eventSourceUrl, {
        headers: {
            "ngrok-skip-browser-warning": "true",
            skip_zrok_interstitial: "true",
        },
        retry: 1500,
    });

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data && data.data && data.data.message) {
                const messageText = data.data.message[0];
                addMessage(data.data.message);

                // Match processing message
                const processingMatch = messageText.match(/Processing location update for page: '(.+)'/);
                if (processingMatch) {
                    const pageName = processingMatch[1];
                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) =>
                            entry.page_name === pageName
                                ? { ...entry, status: "Processing ⏳" }
                                : entry
                        )
                    );
                }

                // Match found ad sets message
                const foundAdSetsMatch = messageText.match(/Found (\d+) ad sets to update\./);
                if (foundAdSetsMatch) {
                    // Optionally update status to indicate ad sets found
                }

                // Match success update for ad set
                const successAdSetMatch = messageText.match(/Successfully updated ad set (\d+)/);
                if (successAdSetMatch) {
                    // Optionally update status for ad set
                }

                // Match failed update for ad set
                const failedAdSetMatch = messageText.match(/Failed to update ad set (\d+)/);
                if (failedAdSetMatch) {
                    // Optionally update status for ad set
                }

                // Match final report
                const finalReportMatch = messageText.match(/Finished\. Successfully updated (\d+) ad sets\. Failed to update (\d+)\./);
                if (finalReportMatch) {
                    // Find the last processed page_name from previous messages
                    const lastPageNameMatch = messages.slice().reverse().find(m => m.includes("Processing location update for page:"));
                    let pageName = null;
                    if (lastPageNameMatch) {
                        const match = lastPageNameMatch.match(/Processing location update for page: '(.+)'/);
                        if (match) pageName = match[1];
                    }
                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) =>
                            entry.page_name === pageName
                                ? { ...entry, status: `Success ✅ (${finalReportMatch[1]} updated, ${finalReportMatch[2]} failed)` }
                                : entry
                        )
                    );
                }

                // Match error message
                const errorMatch = messageText.match(/❌ (.+)/);
                if (errorMatch) {
                    // Try to extract page name from the message
                    const pageNameMatch = messageText.match(/for page name '(.+)'/);
                    const pageName = pageNameMatch ? pageNameMatch[1] : null;
                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) =>
                            pageName && entry.page_name === pageName
                                ? { ...entry, status: `Failed ❌ (${errorMatch[1]})` }
                                : entry
                        )
                    );
                }

                // Match STRICT MODE error message for no exact match found
                const strictErrorMatch = messageText.match(
                    /❌ STRICT MODE: No exact match found under ad account (.*?) for page_name: '(.*?)', item_name: '(.*?)', campaign_code: '(.*?)'/
                );

                if (strictErrorMatch) {
                    const adAccountId = strictErrorMatch[1];
                    const pageName = strictErrorMatch[2];
                    const itemName = strictErrorMatch[3];
                    const campaignCode = strictErrorMatch[4];

                    console.log(`❌ STRICT MODE Error: No exact match for ${pageName}-${itemName}-${campaignCode} in ${adAccountId}`);

                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) => {
                            if (entry.ad_account_id === adAccountId && 
                                entry.page_name === pageName && 
                                entry.item_name === itemName && 
                                entry.campaign_code === campaignCode) {
                                return { ...entry, status: `No Exact Match ❌` };
                            }
                            return entry;
                        })
                    );
                }

                // Match detailed mismatch error from logs
                const mismatchErrorMatch = messageText.match(
                    /STRICT MODE: No exact match\. Closest match '(.*?)' has mismatches: (.*)/
                );

                if (mismatchErrorMatch) {
                    const closestMatch = mismatchErrorMatch[1];
                    const mismatches = mismatchErrorMatch[2];
                    
                    console.log(`❌ STRICT MODE Mismatch: Closest match '${closestMatch}' has issues: ${mismatches}`);
                    
                    // Extract specific mismatch details
                    const pageMismatch = mismatches.match(/page_name: expected '(.*?)', found '(.*?)'/);
                    const itemMismatch = mismatches.match(/item_name: expected '(.*?)', found '(.*?)'/);
                    const codeMismatch = mismatches.match(/campaign_code: expected '(.*?)', found '(.*?)'/);
                    
                    let errorDetails = [];
                    if (pageMismatch) errorDetails.push(`Page: ${pageMismatch[1]} ≠ ${pageMismatch[2]}`);
                    if (itemMismatch) errorDetails.push(`Item: ${itemMismatch[1]} ≠ ${itemMismatch[2]}`);
                    if (codeMismatch) errorDetails.push(`Code: ${codeMismatch[1]} ≠ ${codeMismatch[2]}`);
                    
                    const errorSummary = errorDetails.join(', ');
                    
                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) => {
                            // Try to match based on the expected values from the error
                            const expectedPage = pageMismatch ? pageMismatch[1] : entry.page_name;
                            const expectedItem = itemMismatch ? itemMismatch[1] : entry.item_name;
                            const expectedCode = codeMismatch ? codeMismatch[1] : entry.campaign_code;
                            
                            if (entry.page_name === expectedPage && 
                                entry.item_name === expectedItem && 
                                entry.campaign_code === expectedCode) {
                                return { ...entry, status: `Mismatch: ${errorSummary} ❌` };
                            }
                            return entry;
                        })
                    );
                }

                // Match general STRICT MODE error message
                const generalStrictErrorMatch = messageText.match(
                    /❌ STRICT MODE: (.*)/
                );

                if (generalStrictErrorMatch) {
                    const errorMsg = generalStrictErrorMatch[1];
                    console.log(`❌ STRICT MODE Error: ${errorMsg}`);
                    
                    // Try to match this error to a specific row based on the error message content
                    setTableEditLocationData((prevData) =>
                        prevData.map((entry) => {
                            // Check if this error message contains information that matches this entry
                            if (errorMsg.includes(entry.page_name) && 
                                errorMsg.includes(entry.item_name) && 
                                errorMsg.includes(entry.campaign_code)) {
                                return { ...entry, status: `Strict Match Failed ❌` };
                            }
                            return entry;
                        })
                    );
                }
            }
        } catch (error) {
            console.error("Error parsing SSE message:", error);
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
  }, []);

  const handleClearAll = () => {
    try {
      setTableEditLocationData([]);
      localStorage.removeItem("tableEditLocationData");
      if (Cookies.get("tableEditLocationData")) {
        Cookies.remove("tableEditLocationData");
      }

      notify("All data cleared successfully!", "success");
    } catch (error) {
      console.error("Error clearing data:", error);
      notify("Failed to clear data", "error");
    }
  };

  // Fetch access tokens when component mounts
  useEffect(() => {
    fetchAccessTokens();
  }, []);

  // Function to fetch access tokens from API
  const fetchAccessTokens = async () => {
    try {
      const { id: userId } = getUserData();
      const response = await axios.get(`${apiUrl}/api/v1/user/${userId}/access-tokens`);
      
      if (response.data && response.data.data) {
        // Create a mapping of facebook_name -> access_token
        const tokenMap = {};
        response.data.data.forEach(token => {
          if (token.facebook_name) {
            tokenMap[token.facebook_name] = token.access_token;
          }
        });
        setAccessTokenMap(tokenMap);
      }
    } catch (error) {
      console.error("Error fetching access tokens:", error);
    }
  };

  // Update template download to use page_name
  const handleDownloadTemplate = () => {
    const sampleData = [
      ["facebook_name", "page_name", "item_name", "ad_account_id", "new_regions_cities", "campaign_code"],
      ["Facebook Name", "PageName1", "ITEM_1", "SAMPLE_AD_ACCOUNT_ID", "test", "CAMPAIGN_CODE_1"],
      ["Another Facebook Name", "PageName2", "ITEM_2", "ANOTHER_AD_ACCOUNT", "test", "CAMPAIGN_CODE_2"],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      sampleData.map((row) => row.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Campaign_Location_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportData = () => {
    if (tableEditLocationData.length === 0) {
      notify("No data to export.", "error");
      return;
    }

    // Define CSV headers
    const csvHeaders = [
      "ad_account_id",
      "facebook_name",
      "page_name",
      "item_name",
      "campaign_code",
      "new_regions_cities",
      "status",
    ];

    // Convert table data to CSV format
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM for proper encoding
      [csvHeaders.join(",")] // Add headers
        .concat(
          tableEditLocationData.map((row) =>
            csvHeaders.map((header) => `"${row[header] || ""}"`).join(",")
          )
        )
        .join("\n");

    // Create a download link and trigger it
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Exported_Campaign_Locations_${getCurrentTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify("Data exported successfully!", "success");
  };

  // Update CSV import logic to use page_name
  const handleFileChange = (event) => {
    const file = event.target.files[0];
  
    if (!file) {
      notify("No file selected.", "error");
      return;
    }
  
    const { id: user_id } = getUserData(); // Get user ID
    
    // Add debug message about available Facebook names
    const availableFacebookNames = Object.keys(accessTokenMap);
    if (availableFacebookNames.length > 0) {
      addMessage([`[${getCurrentTime()}] Available Facebook names: ${availableFacebookNames.join(", ")}`]);
    } else {
      addMessage([`[${getCurrentTime()}] Warning: No Facebook names loaded. Make sure to set them up in Settings.`]);
    }
  
    Papa.parse(file, {
      complete: (result) => {
        if (result.data.length < 2) {
          notify("CSV file is empty or invalid.", "error");
          return;
        }
  
        const fileHeaders = result.data[0].map((h) => h.trim().toLowerCase());
  
        if (!validateCSVHeaders(fileHeaders)) {
          notify(
            "Invalid CSV headers. Required: ad_account_id, facebook_name, page_name, new_regions_cities.",
            "error"
          );
          return;
        }
  
        // Process raw data into objects
        const rawData = result.data
          .slice(1)
          .filter((row) => row.some((cell) => cell)) // Remove empty rows
          .map((row, i) => {
            const entry = fileHeaders.reduce((acc, header, index) => {
              acc[header] = row[index] ? row[index].trim() : "";
              return acc;
            }, {});
            
            // Debug: Log each row's facebook_name before conversion
            if (entry["facebook_name"]) {
              addMessage([
                `[${getCurrentTime()}] Row ${i + 1}: Found facebook_name "${entry["facebook_name"]}"${
                  accessTokenMap[entry["facebook_name"]] ? " (matches a Facebook name)" : ""
                }`
              ]);
            }
            
            // Check if facebook_name is a Facebook name and convert if needed
            if (entry["facebook_name"] && accessTokenMap[entry["facebook_name"]]) {
              const facebookName = entry["facebook_name"];
              const actualToken = accessTokenMap[facebookName];
              
              // Add a message about the conversion
              addMessage([
                `[${getCurrentTime()}] 🔑 Row ${i + 1}: Using Facebook name "${facebookName}" (access token will be used for API calls)`,
              ]);
              
              // Store actual token in a separate property for API calls
              // Keep the user-friendly Facebook name as the display value
              entry["_actual_access_token"] = actualToken;
            }
            
            return entry;
          });
  
        const finalData = rawData.map(entry => ({
          ad_account_id: entry.ad_account_id,
          facebook_name: entry.facebook_name,
          _actual_access_token: entry._actual_access_token, // Include actual token
          page_name: entry.page_name || "",
          item_name: entry.item_name || "",
          campaign_code: entry.campaign_code || "",
          new_regions_cities: entry.new_regions_cities || "",
          status: "Ready"
        }));
  
        // Update table with the processed data
        setTableEditLocationData(finalData);
        
        if (finalData.length > 0) {
          console.log(
              "Processed Request Data for verification:",
              JSON.stringify(finalData.map(d => ({
                ad_account_id: d.ad_account_id,
                user_id,
                access_token: d._actual_access_token || d.facebook_name,
              })), null, 2)
            );
          notify("CSV file successfully processed!", "success");
          // Only verify ad accounts, not campaigns specifically at this stage
          verifyAdAccounts(finalData, addMessage);
        } else {
          notify("No valid data to process", "warning");
        }
      },
      header: false,
      skipEmptyLines: true,
    });
  
    event.target.value = "";
  };

  // Update handleRunCampaigns to use page_name for backend call
  const handleRunCampaigns = async () => {
    if (tableEditLocationData.length === 0) {
      addMessage([`[${getCurrentTime()}] ❌ No campaigns to process.`]);
      return;
    }

    const { id: user_id } = getUserData();

    // Iterate through each row in the table to send individual requests
    for (let i = 0; i < tableEditLocationData.length; i++) {
      const row = tableEditLocationData[i];
      const { ad_account_id, page_name, new_regions_cities } = row;
      const access_token = row._actual_access_token || row.facebook_name; // Use the resolved token

      // Basic validation for new_regions_cities
      if (!new_regions_cities || typeof new_regions_cities !== "string" || new_regions_cities.trim() === "") {
        setTableEditLocationData(prevData =>
          prevData.map((item, index) =>
            index === i
              ? {
                  ...item,
                  status: `Error ❌ (Invalid Regions and City)`,
                }
              : item
          )
        );
        addMessage([
          `[${getCurrentTime()}] ❌ Error for page "${page_name}" in ad account: ${ad_account_id}: Invalid new_regions_cities "${new_regions_cities}". Please provide at least one region or city.`,
        ]);
        continue; // Skip to the next row
      }

      const requestData = {
        ad_account_id,
        user_id,
        access_token,
        page_name: page_name, // Send page_name as campaign_name for backend compatibility
        new_regions_city: new_regions_cities.split(',').map(s => s.trim()), // Send as array
        item_name: row.item_name || "",
        campaign_code: row.campaign_code || "",
      };

      try {
        addMessage([
          `[${getCurrentTime()}] ⏳ Attempting to update locations for page "${page_name}" to ${new_regions_cities} in ad account: ${ad_account_id}`,
        ]);
  
        const response = await fetch(`${apiUrl}/api/v1/campaign/editlocation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true",
          },
          body: JSON.stringify(requestData),
        });
  
        if (!response.ok) {
          const errorResponse = await response.json();
          throw new Error(errorResponse.message || `Request failed with status ${response.status}`);
        }
  
        const responseData = await response.json();
        
        setTableEditLocationData(prevData =>
          prevData.map((item, index) =>
            index === i
              ? {
                  ...item,
                  status: `Success ✅ (Locations Updated)`,
                }
              : item
          )
        );

        // Only print the backend's response message (if present)
        if (responseData.message) {
          addMessage([responseData.message]);
        } else {
          addMessage([`[${getCurrentTime()}] ✅ Locations updated for page "${page_name}" in ad account: ${ad_account_id}.`]);
        }
  
        // Optional delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
  
      } catch (error) {
        setTableEditLocationData(prevData =>
          prevData.map((item, index) =>
            index === i
              ? {
                  ...item,
                  status: `Error ❌ (${error.message})`,
                }
              : item
          )
        );
  
        addMessage([
          `[${getCurrentTime()}] ❌ Error for page "${page_name}" in ad account: ${ad_account_id}: ${error.message}`,
        ]);
      }
    }
    addMessage([`[${getCurrentTime()}] All Locations update operations completed.`]);
  };

  // Update validateCSVHeaders to use page_name
  const validateCSVHeaders = (fileHeaders) =>
    REQUIRED_HEADERS.every((header) => fileHeaders.includes(header));

  const statusRenderers = {
    ad_account_status: (value, row) => (
      <StatusWithIcon status={value} error={row?.ad_account_error} />
    ),
    access_token_status: (value, row) => (
      <StatusWithIcon status={value} error={row?.access_token_error} />
    ),
    status: (value, row) => (
      <StatusWithIcon
        status={value}
        error={[row?.ad_account_error, row?.access_token_error]
          .filter(Boolean)
          .join("\n")}
      />
    ),
  };

  const StatusWithIcon = ({ status, error }) => {
    if (!status) return null;

    if (status === "Verified") {
      return <CheckIcon style={{ color: "green" }} />;
    }

    if (status === "Not Verified") {
      return error ? (
        <Tooltip title={error}>
          <CancelIcon style={{ color: "red" }} />
        </Tooltip>
      ) : (
        <CancelIcon style={{ color: "red" }} />
      );
    }

    return <span>{status}</span>;
  };

  const compareCsvWithJson = (csvData, jsonData, setTableEditLocationData) => {
    // Log the number of records being compared
    addMessage([`[${getCurrentTime()}] Comparing ${csvData.length} CSV rows with ${jsonData.length} API verification results`]);
    
    const updatedData = csvData.map((csvRow) => {
      // Find the matching row from API results by using the actual token if available
      const csvAccessToken = csvRow._actual_access_token || csvRow.facebook_name;
      
      const jsonRow = jsonData.find(
        (json) => {
          return json.ad_account_id === csvRow.ad_account_id &&
                 json.access_token === csvAccessToken;
        }
      );
      
      // Log details about each comparison to help debug
      if (!jsonRow) {
        addMessage([
          `[${getCurrentTime()}] ❌ No verification match found for ad_account_id: ${csvRow.ad_account_id}`
        ]);
      }

      if (!jsonRow) {
        return {
          ...csvRow,
          ad_account_status: "Not Verified",
          access_token_status: "Not Verified",
          status: "Not Verified",
          ad_account_error: csvRow._actual_access_token ? 
            "Access token converted from Facebook name not recognized or invalid for this account" : 
            "Account or facebook name not found for verification",
          access_token_error: csvRow._actual_access_token ? 
            "Converted token may be incorrect or expired" : 
            "Facebook name not recognized"
        };
      }

      return {
        ...csvRow,
        ad_account_status: jsonRow.ad_account_status,
        access_token_status: jsonRow.access_token_status,
        status:
          jsonRow.ad_account_status === "Verified" &&
          jsonRow.access_token_status === "Verified"
            ? "Verified"
            : "Not Verified",
        ad_account_error: jsonRow.ad_account_error || null,
        access_token_error: jsonRow.access_token_error || null,
      };
    });

    setTableEditLocationData(updatedData);
  };

  const verifyAdAccounts = async (
    originalCsvData, // This now contains ad_account_id, facebook_name, _actual_access_token, campaign_name, new_regions_cities
    addMessage
  ) => {
    try {
      const { id: user_id } = getUserData();
      // Prepare data for ad account verification. Only send ad_account_id, user_id, and access_token.
      // Filter out unique ad accounts to avoid redundant verification calls
      const uniqueAdAccountsForVerification = Array.from(
        new Map(originalCsvData.map(item => [item.ad_account_id, {
          ad_account_id: item.ad_account_id,
          user_id,
          access_token: item._actual_access_token || item.facebook_name,
        }])).values()
      );
      
      addMessage([`[${getCurrentTime()}] Initiating verification for ${uniqueAdAccountsForVerification.length} unique ad accounts...`]);

      const response = await fetch(`${apiUrl}/api/v1/verify-ads-account/verify/adaccount`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(uniqueAdAccountsForVerification),
      });

      const result = await response.json();
      console.log("Verification Result:", JSON.stringify(result, null, 2));

      if (response.ok && result.verified_accounts) {
        // Compare the original CSV data with the verification results
        compareCsvWithJson(
          originalCsvData,
          result.verified_accounts,
          setTableEditLocationData
        );
        addMessage([
          `[${getCurrentTime()}] Verification completed for ${
            result.verified_accounts.length
          } accounts.`,
        ]);
      } else {
        const errorMsg =
          result.message || "No verified accounts returned from API for verification.";
        addMessage([`⚠️ ${errorMsg}`]);
        // If verification fails or returns no data, mark all original entries as "Not Verified"
        setTableEditLocationData(prevData => prevData.map(entry => ({
          ...entry,
          ad_account_status: "Not Verified",
          access_token_status: "Not Verified",
          status: "Not Verified",
          ad_account_error: "Verification failed or no data returned",
          access_token_error: "Verification failed or no data returned",
        })));
      }
    } catch (error) {
      console.error("Error verifying ad accounts:", error);
      addMessage([`❌ Failed to verify ad accounts: ${error.message}`]);
      // Mark all entries as failed in case of a network or unhandled error
      setTableEditLocationData(prevData => prevData.map(entry => ({
        ...entry,
        ad_account_status: "Not Verified",
        access_token_status: "Not Verified",
        status: "Not Verified",
        ad_account_error: `Verification error: ${error.message}`,
        access_token_error: `Verification error: ${error.message}`,
      })));
    }
  };

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* First Row */}
      <Box sx={{ display: "flex", height: "285px" }}>
        {/* First Column */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            backgroundImage: `url(${budgetbg})`,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <Typography variant="h5" gutterBottom>
            EDIT LOCATIONS
          </Typography>
          <Box sx={{ flex: 1 }} /> {/* Spacer */}
          <Box
            sx={{
              display: "flex",
              gap: "8px",
              marginBottom: "8px",
              justifyContent: "center",
            }}
          >
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <CustomButton
              name="Clear All"
              onClick={handleClearAll}
              type="primary"
              icon={<DeleteIcon />}
            />
            <CustomButton
              name="Template"
              onClick={handleDownloadTemplate}
              type="tertiary"
              icon={<DownloadIcon />}
            />
            <CustomButton
              name="Export"
              onClick={handleExportData}
              type="tertiary"
              icon={<CloudExportIcon />}
            />
            <CustomButton
              name="Import CSV"
              onClick={() => fileInputRef.current.click()}
              type="tertiary"
              icon={<ExportIcon />}
            />
            <CustomButton
              name="RUN"
              onClick={handleRunCampaigns}
              type="primary"
              icon={<RunIcon />}
            />
          </Box>
        </Box>
        {/* Second Column */}
        <Box sx={{ width: "50%" }}>
          <EditLocationTerminal messages={messages} setMessages={setMessages} />
        </Box>
      </Box>

      {/* Second Row (Dynamic Table) */}
      <Box sx={{ flex: 1 }}>
        <WidgetCard title="Main Section" height="96%">
          <DynamicTable
            headers={headers}
            data={tableEditLocationData}
            rowsPerPage={8}
            containerStyles={{
              width: "100%",
              height: "100%",
              marginTop: "8px",
              textAlign: "center",
            }}
            customRenderers={statusRenderers}
            onDataChange={setTableEditLocationData}
            onSelectedChange={handleSelectedDataChange} // Pass selection handler
            nonEditableHeaders={[
              "ad_account_status",
              "access_token_status",
              "status",
            ]}
          />
        </WidgetCard>
      </Box>
    </Box>
  );

}

export default EditLocationPage