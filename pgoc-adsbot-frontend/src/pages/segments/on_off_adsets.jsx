import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, TextField, Tooltip } from "@mui/material";
import WidgetCard from "../components/widget_card";
import DynamicTable from "../components/dynamic_table";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons";
import SpaceBg from "../../assets/adset.png";
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

import AdsetTerminal from "../widgets/on_off_adsets/on_off_adsets_terminal.jsx";
import { EventSource } from "extended-eventsource";
import Cookies from "js-cookie";

const REQUIRED_HEADERS = [
  "ad_account_id",
  "facebook_name",
  "campaign_code",
  "what_to_watch",
  "cpp_metric",
  "cpp_date_start",
  "cpp_date_end",
  "on_off",
];

// Function to get the current timestamp in [YYYY-MM-DD HH-MM-SS] format
const getCurrentTime = () => {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8); // Convert UTC to Manila Time (UTC+8)
  return now.toISOString().replace("T", " ").split(".")[0]; // YYYY-MM-DD HH-MM-SS format
};

const apiUrl = import.meta.env.VITE_API_URL;

const OnOffAdsets = () => {
  const headers = [
    "ad_account_id",
    "ad_account_status",
    "facebook_name",
    "access_token_status",
    "campaign_code",
    "what_to_watch",
    "cpp_metric",
    "cpp_date_start",
    "cpp_date_end",
    "on_off",
    "status",
  ];

  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedAdsetsData, setSelectedAdsetsData] = useState([]); // Store selected data
  const [messages, setMessages] = useState([]); // Ensure it's an array
  const [missingCampaignCodes, setMissingCampaignCodes] = useState(false);
  const [verifiedCampaignCodes, setVerifiedCampaignCodes] = useState([]);
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const [accessTokenMap, setAccessTokenMap] = useState({});

  // Retrieve persisted state from cookies
  const getPersistedState = (key, defaultValue) => {
    try{
      const encryptData = localStorage.getItem(key);
      if (!encryptData) return defaultValue;
      const decryptedData = decryptData(encryptData);
      if (!decryptedData) return defaultValue;
      
      if (Array.isArray(decryptedData)) {
        return decryptedData;
      }

      if (typeof decryptedData === 'string') {
        try {
          const parsed = JSON.parse(decryptedData);
          return Array.isArray(parsed) ? parsed : defaultValue;
        } catch {
          return defaultValue;
        }
      }
      return defaultValue;
    } catch (error) {
      //console.error(`Error loading ${key}:`, error);
      return defaultValue;
    }
  };

  const [tableAdsetsData, setTableAdsetsData] = useState(() =>{
    const data = getPersistedState("tableAdsetsData", []);
    return Array.isArray(data) ? data : [];
  });

  const [filteredData, setFilteredData] = useState(tableAdsetsData);
  const [searchTerm, setSearchTerm] = useState("");

  // Persist data in cookies whenever state changes
  useEffect(() => {
    try {
      const dataToStore = Array.isArray(tableAdsetsData) ? tableAdsetsData : [];
      const encryptedData = encryptData(dataToStore);
      localStorage.setItem("tableAdsetsData", encryptedData);
    } catch (error) {
      //console.error("Error Saving table data:", error);
    }
  }, [tableAdsetsData]);

  useEffect(() => {
    try {
      const encryptedMessages = encryptData(messages);
      localStorage.setItem("adsetsMessages", encryptedMessages);
    } catch (error) {
      //console.error("Error saving messages:", error);
      notify("Failed to save messages", "error");
    }
  }, [messages]);

  // Handle selected data change from DynamicTable
  const handleSelectedAdsetsDataChange = (selectedRows) => {
    setSelectedAdsetsData(selectedRows);
  };

  const addAdsetsMessage = (newMessages) => {
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
    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-adsets?keys=${user_id}-key`;

    if (eventSourceRef.current) {
      eventSourceRef.current.close(); // Close any existing SSE connection
    }

    const eventSource = new EventSource(eventSourceUrl, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        skip_zrok_interstitial: "true",
      },
      retry: 1500, // Auto-retry every 1.5s on failure
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.data && data.data.message) {
          const messageText = data.data.message[0]; // ✅ Extract first message

          // ✅ Always add the message to the message list
          addAdsetsMessage(data.data.message);

          // ✅ Check if it's a "Last Message"
          const lastMessageMatch = messageText.match(/\[(.*?)\] (.*)/);

          if (lastMessageMatch) {
            const timestamp = lastMessageMatch[1]; // e.g., "2025-03-13 11:34:03"
            const messageContent = lastMessageMatch[2]; // e.g., "Campaign updates completed for 1152674286244491 (OFF)"

            setTableAdsetsData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      lastMessage: `${timestamp} - ${messageContent}`,
                    }
                  : entry
              )
            );
          }

          // ✅ Handle "Fetching Campaign Data for {ad_account_id} ({operation})"
          const fetchingMatch = messageText.match(
            /\[(.*?)\] Fetching Campaign Data for (\S+) schedule (.*)/
          );

          if (fetchingMatch) {
            const timestamp = fetchingMatch[1];
            const adAccountId = fetchingMatch[2];
            const scheduleData = JSON.parse(
              fetchingMatch[3].replace(/'/g, '"') // Convert single quotes to valid JSON
            );
            const onOffStatus = scheduleData.on_off;

            setTableAdsetsData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId &&
                entry.on_off === onOffStatus
                  ? { ...entry, status: "Fetching ⏳" }
                  : entry
              )
            );
          }

          // ✅ Handle "Campaign updates completed"
          const successMatch = messageText.match(
            /\[(.*?)\] Processing (\S+) Completed/i
          );

          if (successMatch) {
            const timestamp = successMatch[1];
            const adAccountId = successMatch[2];

            setTableAdsetsData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId
                  ? {
                      ...entry,
                      status: `Success ✅ (${entry.on_off.toUpperCase()})`,
                    }
                  : entry
              )
            );

            // console.log(
            //   `✅ Success for Ad Account ${adAccountId} at ${timestamp}`
            // );
          }

          // ❌ Handle 401 Unauthorized Error with ON/OFF
          const unauthorizedMatch = messageText.match(
            /Error during campaign fetch for Ad Account (\S+) \((ON|OFF)\): 401 Client Error/
          );

          if (unauthorizedMatch) {
            const adAccountId = unauthorizedMatch[1];
            const onOffStatus = unauthorizedMatch[2];

            setTableAdsetsData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId &&
                entry.on_off === onOffStatus
                  ? {
                      ...entry,
                      status: `Unauthorized ❌ (${entry.on_off.toUpperCase()})`,
                    }
                  : entry
              )
            );

            addAdsetsMessage([
              `[${getCurrentTime()}] ❌ 401 Unauthorized Error for Ad Account ${adAccountId} (${onOffStatus}). Check facebook name or permissions.`,
            ]);
          }

          // ❌ Handle 403 Forbidden Error
          const forbiddenMatch = messageText.match(
            /https:\/\/graph\.facebook\.com\/v\d+\.\d+\/act_(\d+)\/campaigns/
          );

          if (forbiddenMatch) {
            const adAccountId = forbiddenMatch[1]; // Extracted ad account ID

            setTableAdsetsData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId
                  ? {
                      ...entry,
                      status: `Error ❌ (${entry.on_off.toUpperCase()})`,
                    }
                  : entry
              )
            );

            addAdsetsMessage([
              `[${getCurrentTime()}] ❌ 403 Forbidden for Ad Account ${adAccountId}. Check permissions or tokens.`,
            ]);
          }
        }
      } catch (error) {
        //console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      //console.error("SSE connection error:", error);
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
      setTableAdsetsData([]); 
      localStorage.removeItem("tableAdsetsData");
      if (Cookies.get("tableAdsetsData")) {
        Cookies.remove("tableAdsetsData");
      }
      
      notify("All data cleared successfully!", "success");
    } catch (error){
      //console.error("Error clearing data:", error);
      notify("Failed to clear data", "error");
    }
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      [
        "ad_account_id",
        "facebook_name",
        "campaign_code",
        "what_to_watch",
        "cpp_metric",
        "cpp_date_start",
        "cpp_date_end",
        "on_off",
      ],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "Facebook Name",
        "CAMPAIGN_CODE",
        "ADSETS/CAMPAIGNS",
        "1",
        "YYYY-MM-DD",
        "YYYY-MM-DD",
        "ON",
      ],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      sampleData.map((row) => row.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Campaign_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to export table data to CSV
  const handleExportData = () => {
    if (tableAdsetsData.length === 0) {
      notify("No data to export.", "error");
      return;
    }

    // Define CSV headers
    const csvHeaders = [
      "ad_account_id",
      "facebook_name",
      "campaign_code",
      "what_to_watch",
      "cpp_metric",
      "cpp_date_start",
      "cpp_date_end",
      "on_off",
    ];

    // Convert table data to CSV format
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM for proper encoding
      [csvHeaders.join(",")] // Add headers
        .concat(
          tableAdsetsData.map((row) =>
            csvHeaders.map((header) => `"${row[header] || ""}"`).join(",")
          )
        )
        .join("\n");

    // Create a download link and trigger it
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Exported_Campaigns_${getCurrentTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify("Data exported successfully!", "success");
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
      //console.error("Error fetching access tokens:", error);
    }
  };

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
      addAdsetsMessage([`[${getCurrentTime()}] Available Facebook names: ${availableFacebookNames.join(", ")}`]);
    } else {
      addAdsetsMessage([`[${getCurrentTime()}] Warning: No Facebook names loaded. Make sure to set them up in Settings.`]);
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
            "Invalid CSV headers. Required: ad_account_id, facebook_name, campaign_code, what_to_watch, cpp_metric, on_off.",
            "error"
          );
          return;
        }
  
        const processedData = result.data
          .slice(1)
          .filter((row) => row.some((cell) => cell)) // Remove empty rows
          .map((row, i) => {
            const entry = fileHeaders.reduce((acc, header, index) => {
              acc[header] = row[index] ? row[index].trim() : "";
              return acc;
            }, { status: "Ready" }); // Add default status here
            
            // Debug: Log each row's facebook_name before conversion
            if (entry["facebook_name"]) {
              addAdsetsMessage([
                `[${getCurrentTime()}] Row ${i + 1}: Found facebook_name "${entry["facebook_name"]}"${
                  accessTokenMap[entry["facebook_name"]] ? " (matches a Facebook name)" : ""
                }`
              ]);
            }
            
            // Check if facebook_name exists in our mapping and convert if needed
            if (entry["facebook_name"] && accessTokenMap[entry["facebook_name"]]) {
              const facebookName = entry["facebook_name"];
              const actualToken = accessTokenMap[facebookName];
              
              // Add a message about the conversion
              addAdsetsMessage([
                `[${getCurrentTime()}] 🔑 Row ${i + 1}: Using Facebook name "${facebookName}" (access token will be used for API calls)`,
              ]);
              
              // Store actual token in a separate property for API calls
              // Keep the user-friendly Facebook name as the display value
              entry["_actual_access_token"] = actualToken;
            }
            
            return entry;
          });
  
        // Convert processed data to API request format
        const requestData = processedData.map((entry) => ({
          ad_account_id: entry.ad_account_id,
          user_id,
          // Use the actual access token for API calls if it exists
          access_token: entry._actual_access_token || entry.facebook_name,
          schedule_data: [
            {
              campaign_code: entry.campaign_code,
              what_to_watch: entry.what_to_watch,
              cpp_metric: entry.cpp_metric,
              cpp_date_start: entry.cpp_date_start,
              cpp_date_end: entry.cpp_date_end,
              on_off: entry.on_off,
            },
          ],
        }));
  
        //console.log("Processed Request Data:", JSON.stringify(requestData, null, 2));
        setTableAdsetsData(processedData); // Store all processed data in the table

        const campaignCodes = processedData
              .map((item) => item["campaign_code"])
              .filter((code) => code)

        verifyCampaignCodes(campaignCodes, addAdsetsMessage);

        notify("CSV file successfully imported!", "success");
        verifyAdAccounts(requestData, processedData, addAdsetsMessage);
      },
      header: false,
      skipEmptyLines: true,
    });
  
    event.target.value = "";
  };

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
          .join('\n')} 
      />
    )
  };

  const handleRunAdsets = async () => {
    if (tableAdsetsData.length === 0) {
      addAdsetsMessage([`[${getCurrentTime()}] ❌ No campaigns to process.`]);
      return;
    }
  
    // Ensure there are verified campaign codes
    if (verifiedCampaignCodes.length === 0) {
      addAdsetsMessage([`[${getCurrentTime()}] ❌ No verified campaign codes. Cannot process adsets.`]);
      return;
    }
  
    // Filter the data to include only adsets with verified campaign codes
    const validAdsetsData = tableAdsetsData.filter((entry) =>
      verifiedCampaignCodes.includes(entry.campaign_code)
    );
  
    if (validAdsetsData.length === 0) {
      addAdsetsMessage([`[${getCurrentTime()}] ❌ No valid campaign codes to process.`]);
      return;
    }
  
    const { id } = getUserData();
    const batchSize = 1;
    const delayMs = 5000; // 5secs delay
  
    const requestData = validAdsetsData.map((entry) => ({
      ad_account_id: entry.ad_account_id,
      user_id: id,
      // Use the actual access token for API calls if it exists
      access_token: entry._actual_access_token || entry.facebook_name,
      schedule_data: [
        {
          campaign_code: entry.campaign_code,
          what_to_watch: entry.what_to_watch,
          cpp_metric: entry.cpp_metric,
          cpp_date_start: entry.cpp_date_start,
          cpp_date_end: entry.cpp_date_end,
          on_off: entry.on_off,
        },
      ],
    }));
  
    for (let i = 0; i < requestData.length; i += batchSize) {
      const batch = requestData.slice(i, i + batchSize);
  
      for (const data of batch) {
        const { ad_account_id, schedule_data } = data;
        const on_off = schedule_data[0].on_off;
  
        addAdsetsMessage([
          `[${getCurrentTime()}] ⏳ Processing Ad Account ${ad_account_id} (${on_off.toUpperCase()})`,
        ]);
  
        try {
          const response = await fetch(`${apiUrl}/api/v1/onoff/adsets`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              skip_zrok_interstitial: "true",
            },
            body: JSON.stringify(data),
          });
  
          if (!response.ok) {
            throw new Error(`Request failed for Ad Account ${ad_account_id}`);
          }
  
          setTableAdsetsData((prevData) =>
            prevData.map((entry) =>
              entry.ad_account_id === ad_account_id && entry.on_off === on_off
                ? {
                    ...entry,
                    status: `Request Sent ✅ (${on_off.toUpperCase()})`,
                  }
                : entry
            )
          );
  
          addAdsetsMessage([
            `[${getCurrentTime()}] ✅ Ad Account ${ad_account_id} (${on_off.toUpperCase()}) processed successfully`,
          ]);
        } catch (error) {
          addAdsetsMessage([
            `[${getCurrentTime()}] ❌ Error processing Ad Account ${ad_account_id} (${on_off.toUpperCase()}): ${
              error.message
            }`,
          ]);
  
          setTableAdsetsData((prevData) =>
            prevData.map((entry) =>
              entry.ad_account_id === ad_account_id && entry.on_off === on_off
                ? { ...entry, status: `Failed ❌ (${on_off.toUpperCase()})` }
                : entry
            )
          );
        }
      }
  
      if (i + batchSize < requestData.length) {
        addAdsetsMessage([
          `[${getCurrentTime()}] ⏸ Waiting for 5 seconds before processing the next batch...`,
        ]);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  
    addAdsetsMessage([`[${getCurrentTime()}] 🚀 All Requests Sent`]);
  };  

  useEffect(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();

    const filtered = tableAdsetsData.filter((item) =>
      Object.values(item).some(
        (val) =>
          val !== null &&
          val !== undefined &&
          String(val).toLowerCase().includes(lowerSearchTerm)
      )
    );

    setFilteredData(filtered);
  }, [searchTerm, tableAdsetsData]);

  // Validate CSV Headers
  const validateCSVHeaders = (fileHeaders) =>
    REQUIRED_HEADERS.every((header) => fileHeaders.includes(header));

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

  const compareCsvWithJson = (csvData, jsonData, setTableAdsetsData) => {
    // Log the number of records being compared
    addAdsetsMessage([`[${getCurrentTime()}] Comparing ${csvData.length} CSV rows with ${jsonData.length} API results`]);
    
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
        addAdsetsMessage([
          `[${getCurrentTime()}] ❌ No match found for ad_account_id: ${csvRow.ad_account_id}, check if facebook name is correct`
        ]);
        
        // Try to find if there's at least an ad account match
        const adAccountMatch = jsonData.find(json => json.ad_account_id === csvRow.ad_account_id);
        if (adAccountMatch) {
          addAdsetsMessage([
            `[${getCurrentTime()}] 📌 Found ad_account_id ${csvRow.ad_account_id} but facebook name doesn't match`
          ]);
        }
      }
  
      if (!jsonRow) {
        return {
          ...csvRow,
          ad_account_status: "Not Verified",
          access_token_status: "Not Verified",
          status: "Not Verified",
          ad_account_error: csvRow._actual_access_token ? 
            "Access token converted from Facebook name not recognized" : 
            "Account or facebook name not found",
          access_token_error: csvRow._actual_access_token ? 
            "Converted token may be incorrect or expired" : 
            "Facebook name not recognized"
        };
      }
  
      return {
        ...csvRow,
        ad_account_status: jsonRow.ad_account_status,
        access_token_status: jsonRow.access_token_status,
        status: jsonRow.ad_account_status === "Verified" && 
               jsonRow.access_token_status === "Verified" 
               ? "Verified" : "Not Verified",
        ad_account_error: jsonRow.ad_account_error || null,
        access_token_error: jsonRow.access_token_error || null
      };
    });
  
    setTableAdsetsData(updatedData);
  };

  const verifyAdAccounts = async (campaignsData, originalCsvData, addAdsetsMessage) => {
    try {
      // Make a deep copy of the data - campaignsData should already have the correct tokens
      // since it's generated in handleFileChange with the correct access tokens
      
      const response = await fetch(`${apiUrl}/api/v1/verify/adsets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(campaignsData),
      });
  
      const result = await response.json();
      //console.log("Verification Result:", JSON.stringify(result, null, 2));
  
      if (response.ok && result.verified_accounts) {
        compareCsvWithJson(originalCsvData, result.verified_accounts, setTableAdsetsData);
        addAdsetsMessage([`[${getCurrentTime()}] Verification completed for ${result.verified_accounts.length} accounts`]);
      } else {
        const errorMsg = result.message || "No verified accounts returned from API";
        addAdsetsMessage([`⚠️ ${errorMsg}`]);
      }
    } catch (error) {
      //console.error("Error verifying ad accounts:", error);
      addAdsetsMessage([`❌ Failed to verify ad accounts: ${error.message}`]);
    }
  };

  const verifyCampaignCodes = async (campaignCodes, addMessage) => {
    try {
      const { id: user_id } = getUserData();
      const response = await fetch(`${apiUrl}/api/v1/verify/campaign-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id, campaign_codes: campaignCodes }),
      });
  
      const result = await response.json();
      console.log(`RESULT: ${JSON.stringify(result, null, 2)}`);
  
      if (response.ok) {
        const { existing_codes, missing_codes } = result;
  
        if (existing_codes.length > 0) {
          console.log(`✅ Existing campaign codes: ${existing_codes.join(", ")}`);
          setVerifiedCampaignCodes(existing_codes); // Store valid campaign codes
        }
  
        if (missing_codes.length > 0) {
          console.warn(`❌ Missing campaign codes: ${missing_codes.join(", ")}`);
        }
  
        if (addMessage) {
          addMessage([
            `[${getCurrentTime()}] Verified campaign codes: ${existing_codes.length} found, ${missing_codes.length} missing.`,
          ]);
        }
      } else {
        const errorMsg = result.message || "An error occurred while verifying campaign codes.";
        console.warn("⚠️", errorMsg);
        if (addMessage) {
          addMessage([`⚠️ ${errorMsg}`]);
        }
      }
    } catch (error) {
      console.error("Error verifying campaign codes:", error);
      if (addMessage) {
        addMessage([`❌ Failed to verify campaign codes: ${error.message}`]);
      }
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
            backgroundImage: `url(${SpaceBg})`,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <Typography variant="h5" gutterBottom>
            ON/OFF ADS PAGE
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
              onClick={handleRunAdsets}
              type="primary"
              icon={<RunIcon />}
            />
          </Box>
        </Box>
        {/* Second Column */}
        <Box sx={{ width: "50%" }}>
          <AdsetTerminal messages={messages} setMessages={setMessages} />
        </Box>
      </Box>

      {/* Second Row (Dynamic Table) */}
      <Box sx={{ flex: 1, paddingTop: "10px"}}>
        <WidgetCard title="Main Section" height="100%">
          {/* Search Bar */}
          <TextField
            label="Search For adAccountId"
            variant="outlined"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            sx={{
              marginBottom: "8px",
              width: "300px",
              marginRight: "16px", // <== add this
            }}
          />

          {/* Dynamic Table with Filtered Data */}
          <DynamicTable
            headers={headers}
            data={filteredData}
            rowsPerPage={1000}
            containerStyles={{
              width: "10%",
              height: "50%",
              marginTop: "8px",
              textAlign: "center",
            }}
            customRenderers={statusRenderers}
            onDataChange={setTableAdsetsData}
            onSelectedChange={handleSelectedAdsetsDataChange}
            nonEditableHeaders={[
              "ad_account_status",
              "access_token_status",
              "campaign_code",
              "what_to_watch",
              "status",
            ]}
          />
        </WidgetCard>
      </Box>
    </Box>
  );
};

export default OnOffAdsets;
