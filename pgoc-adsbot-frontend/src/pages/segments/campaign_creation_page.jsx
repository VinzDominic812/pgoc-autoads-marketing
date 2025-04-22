import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Tooltip,
  IconButton,
} from "@mui/material";
import axios from "axios";

import WidgetCard from "../components/widget_card";
import DynamicTable from "../components/dynamic_table";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons";
import SpaceBg from "../../assets/campaign_creation_bg.png";
import Papa from "papaparse";
import { getUserData, encryptData, decryptData } from "../../services/user_data.js";

// ICONS
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import InfoIcon from "@mui/icons-material/Info";
import ExportIcon from "@mui/icons-material/FileUpload";
import CloudExportIcon from "@mui/icons-material/BackupRounded";
import RunIcon from "@mui/icons-material/PlayCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/FileDownload";

import { EventSource } from "extended-eventsource";
import Cookies from "js-cookie";
import CampaignCreationTerminal from "../widgets/campaign_creation_widgets/campaign_terminal.jsx";

const REQUIRED_HEADERS = [
  "ad_account_id",
  "access_token",
  "facebook_page_id",
  "sku",
  "material_code",
  "campaign_code",
  "interests_list",
  "daily_budget",
  "video_url",
  "headline",
  "primary_text",
  "image_url",
  "product",
  "start_date",
  "start_time",
  "excluded_ph_region",
];

// Function to get the current timestamp in [YYYY-MM-DD HH-MM-SS] format
const getCurrentTime = () => {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8); // Convert UTC to Manila Time (UTC+8)
  return now.toISOString().replace("T", " ").split(".")[0]; // YYYY-MM-DD HH-MM-SS format
};

const apiUrl = import.meta.env.VITE_API_URL;

const CampaignCreationPage = () => {
  
  const headers = [
    "ad_account_id",
    "ad_account_status",
    "access_token",
    "access_token_status",
    "facebook_page_id",
    "facebook_page_status",
    "page_name",
    "sku",
    "material_code",
    "campaign_code",
    "interests_list",
    "daily_budget",
    "video_url",
    "headline",
    "primary_text",
    "image_url",
    "product",
    "start_date",
    "start_time",
    "excluded_ph_region",
    "status",
  ];

  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedData, setSelectedData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [isAi, setIsAi] = useState(false);

  const [messages, setMessages] = useState([]);

  const fileInputRef = useRef(null);
  const isRunningRef = useRef(false);
  const eventSourceRef = useRef(null);
  const handleOpenDialog = () => setOpenDialog(true);
  const handleCloseDialog = () => setOpenDialog(false);
  const handleToggle = () => {
    setIsAi((prev) => !prev);
  };

  const getPersistedState = (key, defaultValue) => {
    try {
      const encryptedData = localStorage.getItem(key);
      if (!encryptedData) return defaultValue;
      
      const decryptedData = decryptData(encryptedData);
      
      // Ensure we always return an array
      if (!decryptedData) return defaultValue;
      
      // Handle case where decryptedData is already an array
      if (Array.isArray(decryptedData)) {
        return decryptedData;
      }
      
      // Handle case where decryptedData is a JSON string
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
      // console.error(`Error loading ${key}:`, error);
      return defaultValue;
    }
  };
  
  // Initialize state with array fallback
  const [tableData, setTableData] = useState(() => {
    const data = getPersistedState("campaignCreationTableData", []);
    return Array.isArray(data) ? data : [];
  });
  
  // Save to localStorage with array validation
  useEffect(() => {
    try {
      const dataToStore = Array.isArray(tableData) ? tableData : [];
      const encryptedData = encryptData(dataToStore);
      localStorage.setItem("campaignCreationTableData", encryptedData);
    } catch (error) {
      // console.error("Error saving table data:", error);
    }
  }, [tableData]);

  //stores messages in a localstorage
  useEffect(() => {
    try {
      const encryptedMessages = encryptData(messages);
      localStorage.setItem("adsetsMessages", encryptedMessages);
    } catch (error) {
      console.error("Error saving messages:", error);
      notify("Failed to save messages", "error");
    }
  }, [messages]);

  // Handle selected data change from DynamicTable
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

  //verify user
  useEffect(() => {
    setIsVerified(
      tableData.length > 0 &&
        tableData.every((row) => {
          // console.log("🔍 Row Data:", row);
          const allVerified =
            row["ad_account_status"] === "Verified" &&
            row["access_token_status"] === "Verified" &&
            row["facebook_page_status"] === "Verified";

          // console.log("📌 Status Value:", allVerified ? "OK" : "Error");
          return allVerified; // ✅ Check using TableWidget logic
        })
    );
  }, [tableData]);

  useEffect(() => {
    const { id: user_id } = getUserData();
    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-campaign-creations?keys=${user_id}-key`;

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
          const messageText = data.data.message[0]; // Extract first message
    
          // Always add the message to the message list
          addMessage(data.data.message);
    
          // ✅ Match for "Creating Facebook campaign"
          const campaignCreationMatch = messageText.match(
            /Creating Facebook campaign: (.*?)\./
          );
          if (campaignCreationMatch) {
            const campaignName = campaignCreationMatch[1]; // Extracted campaign name
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `Creating Campaign: ${campaignName}...`,
                    }
                  : entry
              )
            );
          }
    
          // ✅ Match for "Task Created" with campaign name
          const taskCreatedMatch = messageText.match(
            /Task Created: (.*) - Status: (\S+) - Message: (.*)/
          );
          if (taskCreatedMatch) {
            const taskName = taskCreatedMatch[1]; // Extracted task name
            const taskStatus = taskCreatedMatch[2]; // Extracted task status
            const taskMessage = JSON.parse(taskCreatedMatch[3]); // Parsed task message
    
            // Update table with task creation details
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `Task created for ${taskName}: ${taskStatus}`,
                      taskDetails: taskMessage,
                    }
                  : entry
              )
            );
          }
    
          // ✅ Match for "Uploading video for campaign"
          const uploadingVideoMatch = messageText.match(
            /\[(.*?)\] Uploading video for (.*?)\./
          );
          if (uploadingVideoMatch) {
            const timestamp = uploadingVideoMatch[1];
            const campaignName = uploadingVideoMatch[2]; // Extracted campaign name
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `${timestamp} - Uploading video for ${campaignName}...`,
                    }
                  : entry
              )
            );
          }
    
          // ✅ Match for "Uploading image for campaign"
          const uploadingImageMatch = messageText.match(
            /\[(.*?)\] Uploading image for (.*?)\./
          );
          if (uploadingImageMatch) {
            const timestamp = uploadingImageMatch[1];
            const campaignName = uploadingImageMatch[2]; // Extracted campaign name
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `${timestamp} - Uploading image for ${campaignName}...`,
                    }
                  : entry
              )
            );
          }
    
          // ✅ Match for "Ad creative successfully created"
          const adCreativeSuccessMatch = messageText.match(
            /\[(.*?)\] Ad creative successfully created for (.*?)\./
          );
          if (adCreativeSuccessMatch) {
            const timestamp = adCreativeSuccessMatch[1];
            const campaignName = adCreativeSuccessMatch[2]; // Extracted campaign name
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `${timestamp} - Ad creative created for ${campaignName}`,
                    }
                  : entry
              )
            );
          }
    
          // ✅ Handle "Failed to create ad for adset" with error details
          const failedToCreateAdMatch = messageText.match(
            /Failed to create ad for adset (.*?), details: (.*)/
          );
          if (failedToCreateAdMatch) {
            const adsetDetails = failedToCreateAdMatch[1]; // Extracted adset details
            const errorDetails = JSON.parse(failedToCreateAdMatch[2]); // Parsed error details
    
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.key === `${user_id}-key`
                  ? {
                      ...entry,
                      status: `Failed to create ad for ${adsetDetails}: ${errorDetails.error.message}`,
                    }
                  : entry
              )
            );
            addMessage([`[${getCurrentTime()}] ❌ Error creating ad for adset ${adsetDetails}: ${errorDetails.error.message}`]);
          }
    
          // ❌ Handle 401 Unauthorized Error with ON/OFF
          const unauthorizedMatch = messageText.match(
            /Error during campaign fetch for Ad Account (\S+) \((ON|OFF)\): 401 Client Error/
          );
          if (unauthorizedMatch) {
            const adAccountId = unauthorizedMatch[1];
            const onOffStatus = unauthorizedMatch[2];
    
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId &&
                entry.on_off === onOffStatus
                  ? {
                      ...entry,
                      status: `Unauthorized ❌ (${onOffStatus.toUpperCase()})`,
                    }
                  : entry
              )
            );
    
            addMessage([
              `[${getCurrentTime()}] ❌ 401 Unauthorized Error for Ad Account ${adAccountId} (${onOffStatus}). Check access token or permissions.`,
            ]);
          }
    
          // ❌ Handle 403 Forbidden Error
          const forbiddenMatch = messageText.match(
            /https:\/\/graph\.facebook\.com\/v\d+\.\d+\/act_(\d+)\/campaigns/
          );
          if (forbiddenMatch) {
            const adAccountId = forbiddenMatch[1]; // Extracted ad account ID
    
            setTableData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId
                  ? {
                      ...entry,
                      status: `Error ❌ (${entry.on_off.toUpperCase()})`,
                    }
                  : entry
              )
            );
    
            addMessage([
              `[${getCurrentTime()}] ❌ 403 Forbidden for Ad Account ${adAccountId}. Check permissions or tokens.`,
            ]);
          }
        }
      } catch (error) {
        // console.error("Error parsing SSE message:", error);
      }
    };
    
    eventSource.onerror = (error) => {
      // console.error("SSE connection error:", error);
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
      setTableData([]); // Clear state
      
      // Remove from localStorage (encrypted version)
      localStorage.removeItem("campaignCreationTableData");
      
      // Optional: Clean up legacy cookie if it exists
      if (Cookies.get("campaignCreationTableData")) {
        Cookies.remove("campaignCreationTableData");
      }
      
      notify("All data cleared successfully!", "success");
    } catch (error) {
      // console.error("Error clearing data:", error);
      notify("Failed to clear data", "error");
    }
  };

  const handleDownloadRegions = async () => {
    try {
      const response = await fetch(
        "https://pgoccampaign.share.zrok.io/regions",
        {
          method: "GET", // Use GET or specify the appropriate method
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true", // Custom header
          },
        }
      );

      const regionsData = await response.json();

      // Create CSV content with region_name, key, and country
      const csvRows = [
        ["id", "region_name", "key", "country"], // Header
        ...regionsData.map((region) => [
          region.id,
          region.region_name,
          region.region_key,
          region.country_code,
        ]), // Region data
      ];
      const csvContent = csvRows.map((row) => row.join(",")).join("\n");

      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: "text/csv;charset=UTF-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "ph_regions.csv";
      link.click();
    } catch (error) {
      // console.error("Error fetching regions:", error);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      [
        "ad_account_id",
        "access_token",
        "facebook_page_id",
        "sku",
        "material_code",
        "campaign_code",
        "interests_list",
        "daily_budget",
        "video_url",
        "headline",
        "primary_text",
        "image_url",
        "product",
        "start_date",
        "start_time",
        "excluded_ph_region",
      ],
      [
        "'",
        "'",
        "'",
        "'",
        "'",
        "'",
        `"[] / Interest1, Interest2, Interest3 / Interest4, Interest5, Interest6"`,
        "'",
        "'",
        "'",
        "'",
        "'",
        "'",
        "YYYY-MM-DD",
        "HH-MM-SS",
        `"Zamboanga Peninsula,Northern Mindanao,Davao Region,Soccsksargen,Caraga,Autonomous Region in Muslim Mindanao"`,
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

  const handleExportData = () => {
    if (tableData.length === 0) {
      notify("No data to export.", "error");
      return;
    }

    // Define CSV headers
    const csvHeaders = [
      "ad_account_id",
      "access_token",
      "page_name",
      "sku",
      "material_code",
      "interests_list",
      "daily_budget",
      "facebook_page_id",
      "video_url",
      "headline",
      "primary_text",
      "image_url",
      "product",
      "start_date",
      "start_time",
      "excluded_ph_region",
    ];

    // Convert table data to CSV format
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM for proper encoding
      [csvHeaders.join(",")] // Add headers
        .concat(
          tableData.map((row) =>
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

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    const reader = new FileReader();
  
    reader.onload = (e) => {
      const fileContent = e.target?.result;
  
      Papa.parse(fileContent, {
        complete: async (result) => {
          const csvData = result.data;
          console.log(`formattedData:\n${JSON.stringify(csvData, null, 2)}`);
  
          if (csvData.length > 1) {
            const headers = csvData[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
            console.log("🧠 Headers:", headers);
            const formattedData = csvData.slice(1).map((row) =>
              headers.reduce((acc, header, index) => {
                acc[header] = row[index]?.trim() || "";
                return acc;
              }, {})
            );
  
            // Pre-process fields
            formattedData.forEach((item, i) => {
              console.log(`Row ${i}:`, item.campaign_code);
              item["interests_list"] = parseInterestsList(item["interests_list"]);
              item["excluded_ph_region"] = parseExcludedPHRegion(item["excluded_ph_region"]);
              addMessage([
                `[${getCurrentTime()}] 🎯 Row ${i + 1} (${item.sku || "No SKU"}): interests_list = ${JSON.stringify(item.interests_list)}`
              ]);
            });
  
            setTableData(formattedData);

            const campaignCodes = formattedData
              .map((item) => item["campaign_code"])
              .filter((code) => code)

            verifyCampaignCodes(campaignCodes, addMessage);
            verifyAdAccounts(formattedData);
            console.log("🚀 Final Payload Preview:", JSON.stringify(formattedData, null, 2));
          }
        },
        header: false,
        skipEmptyLines: true,
      });
    };
  
    reader.readAsText(file, "UTF-8");
  };  

  const handleRunCampaigns = async () => {
    if (isRunningRef.current) return; // Prevent duplicate execution
    isRunningRef.current = true;
  
    const campaignApiUrl = isAi
      ? `${apiUrl}/api/v1/campaign/create-campaigns-ai`
      : `${apiUrl}/api/v1/campaign/create-campaigns`;
  
    const verifiedCampaigns = tableData.filter(
      (row) => row.status === "Verified"
    );
  
    if (verifiedCampaigns.length === 0) {
      notify("No verified campaigns available to run.", "error");
      isRunningRef.current = false;
      return;
    }
  
    setIsRunning(true);
    addMessage(["Running verified campaigns..."]);
  
    // Check if all campaign_codes are valid
    const campaignCodes = verifiedCampaigns.map((row) => row["campaign_code"]);
    const invalidCampaignCodes = [];
  
    try {
      const response = await fetch(`${apiUrl}/api/v1/verify/campaign-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: 1, // assuming user_id is 1 or get the correct user_id
          campaign_codes: campaignCodes,
        }),
      });
  
      if (!response.ok) {
        addMessage(["❌ Error while validating campaign codes."]);
        isRunningRef.current = false;
        setIsRunning(false);
        return;
      }
  
      const result = await response.json();
      const { missing_codes } = result;
  
      if (missing_codes.length > 0) {
        // Identify which campaigns are invalid
        invalidCampaignCodes.push(...missing_codes);
        addMessage([`❌ The following campaign codes are missing: ${missing_codes.join(", ")}`]);
      }
  
      // Filter out the campaigns that have invalid campaign codes
      const validCampaigns = verifiedCampaigns.filter(
        (row) => !invalidCampaignCodes.includes(row["campaign_code"])
      );
  
      // If no valid campaigns are left, notify the user and exit
      if (validCampaigns.length === 0) {
        addMessage(["❌ No valid campaigns to run. All campaigns had invalid campaign codes."]);
        isRunningRef.current = false;
        setIsRunning(false);
        return;
      }
  
      // Process the valid campaigns
      for await (const [index, row] of validCampaigns.entries()) {
        let parsedInterests = row["interests_list"];
        let parsedExcludedRegions = row["excluded_ph_region"];
  
        if (typeof parsedInterests === "string") {
          try {
            parsedInterests = JSON.parse(parsedInterests);
          } catch (error) {
            console.error(
              "❌ Error parsing interests_list:",
              parsedInterests,
              error
            );
            parsedInterests = [[]]; // Default to an empty array if parsing fails
          }
        }
  
        const { id } = getUserData();
  
        const requestBody = {
          user_id: id,
          campaigns: [
            {
              ad_account_id: row["ad_account_id"],
              access_token: row["access_token"],
              page_name: row["page_name"],
              sku: row["sku"],
              material_code: row["material_code"],
              campaign_code: row["campaign_code"],
              daily_budget: parseInt(row["daily_budget"], 10) || 0,
              facebook_page_id: row["facebook_page_id"],
              video_url: row["video_url"],
              headline: row["headline"],
              primary_text: row["primary_text"],
              image_url: row["image_url"],
              product: row["product"],
              interests_list: parsedInterests,
              exclude_ph_region: parsedExcludedRegions,
              start_date: row["start_date"],
              start_time: row["start_time"],
            },
          ],
        };
  
        try {
          const response = await fetch(campaignApiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              skip_zrok_interstitial: "true",
            },
            body: JSON.stringify(requestBody),
          });
  
          const contentType = response.headers.get("Content-Type");
  
          if (!response.ok) {
            addMessage([`❌ Failed to create campaign for SKU ${row["sku"]} (Status: ${response.status})`]);
            continue;
          }
  
          if (contentType && contentType.includes("application/json")) {
            const responseBody = await response.json();
            addMessage([`✅ Response for SKU ${row["sku"]}: Status ${response.status}`]);
  
            if (responseBody.tasks && responseBody.tasks.length > 0) {
              addMessage([`Task Created: ${responseBody.tasks[0].campaign_name} - Status: ${responseBody.tasks[0].status} - Message: ${JSON.stringify(responseBody.tasks[0])}`]);
            } else {
              addMessage([`⚠️ No task information available for SKU ${row["sku"]}.`]);
            }
          } else {
            const textResponse = await response.text();
            addMessage([`Error: Expected JSON but received for SKU ${row["sku"]}: ${JSON.stringify(textResponse)}`]);
          }
        } catch (error) {
          if (error instanceof Error) {
            addMessage([`❌ Error for SKU ${row["sku"]}: ${error.message}`]);
          } else {
            addMessage([`❌ Unknown error occurred for SKU ${row["sku"]}`]);
          }
        }
      }
  
      setIsRunning(false);
      isRunningRef.current = false;
  
      addMessage(["✅ All valid campaigns have been created successfully!"]);
  
    } catch (error) {
      console.error("Error validating campaign codes:", error);
      addMessage(["❌ Error occurred while validating campaign codes."]);
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };  

  const parseInterestsList = (interestsString) => {
    if (!interestsString || interestsString.trim() === "") return [[]];
  
    console.log("📌 Raw interests_list before processing:", interestsString);
  
    try {
      const groups = interestsString.split("/").map((group) => group.trim());
  
      const parsedArray = groups.map((group) => {
        // Preserve "[]" as empty array to represent Broad
        if (group === "[]" || group === "") return [];
  
        return group
          .split(",")
          .map((interest) => interest.trim())
          .filter(Boolean);
      });
  
      console.log("✅ Final parsed interests_list:", parsedArray);
      return parsedArray.length ? parsedArray : [[]];
    } catch (error) {
      console.error("❌ Error parsing interests_list:", error);
      return [[]]; // fallback
    }
  };

  const parseExcludedPHRegion = (regionString) => {
    if (!regionString || regionString.trim() === "") return [[]];

    // console.log("Raw excluded_ph_region before processing:", regionString);

    try {
      // Split by "/" and handle empty or space-only groups as "[]"
      const groups = regionString.split("/").map((group) => {
        const trimmedGroup = group.trim();
        return trimmedGroup === "" ? "[]" : trimmedGroup;
      });

      // Process each group separately
      const parsedArray = groups.map((group) => {
        // If the group is exactly "[]", return an empty array
        if (group === "[]") return [];

        // Otherwise, split by commas and trim each region
        return group.split(",").map((region) => region.trim());
      });

      // console.log("Formatted excluded_ph_region:", parsedArray);
      return parsedArray;
    } catch (error) {
      // console.error("Error parsing excluded_ph_region:", regionString, error);
    }

    return [[]]; // Default to an empty nested array if parsing fails
  };

  const verifyAdAccounts = async (campaignsData, addMessage) => {
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/verify-ads-account/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true",
          },
          body: JSON.stringify({ user_id: 1, campaigns: campaignsData }),
        }
      );
  
      const result = await response.json();
      console.log(`RESULT: ${JSON.stringify(result,null,2)}`);
  
      if (response.ok && result.verified_accounts) {
        compareCsvWithJson(
          campaignsData,
          result.verified_accounts,
          setTableData
        ); // 🔹 Now updates table data!
  
        // ✅ Enhanced message logging
        if (addMessage) {
          addMessage([
            `[${getCurrentTime()}] Verification completed for ${result.verified_accounts.length} accounts`,
          ]);
        }
      } else {
        const errorMsg =
          result.message || "No verified accounts returned from API.";
        // console.warn("⚠️", errorMsg);
        if (addMessage) {
          addMessage([`⚠️ ${errorMsg}`]);
        }
      }
    } catch (error) {
      // console.error("Error verifying ad accounts:", error);
      if (addMessage) {
        addMessage([`❌ Failed to verify ad accounts: ${error.message}`]);
      }
    }
  };

  const compareCsvWithJson = (csvData, jsonData, setTableData) => {
    const updatedData = csvData.map((csvRow) => {
      const jsonRow = jsonData.find(
        (json) =>
          json.ad_account_id === csvRow.ad_account_id &&
          json.access_token === csvRow.access_token
      );
  
      if (!jsonRow) {
        return {
          ...csvRow,
          ad_account_status: "Not Verified",
          access_token_status: "Not Verified",
          facebook_page_status: "Not Verified",
          status: "Not Verified",
          ad_account_error: "Account not found",
          access_token_error: "Account not found",
          facebook_page_error: "Account not found",
          page_name: ""
        };
      }
  
      return {
        ...csvRow,
        ad_account_status: jsonRow.ad_account_status,
        access_token_status: jsonRow.access_token_status,
        facebook_page_status: jsonRow.facebook_page_status,
        status: jsonRow.ad_account_status === "Verified" && 
               jsonRow.access_token_status === "Verified" &&
               jsonRow.facebook_page_status === "Verified"
               ? "Verified" : "Not Verified",
        ad_account_error: jsonRow.ad_account_error || null,
        access_token_error: jsonRow.access_token_error || null,
        facebook_page_error: jsonRow.facebook_page_error || null,
        page_name: jsonRow.facebook_page_name || ""
      };
    });
  
    setTableData(updatedData);
  };

  // make string visually icons
  const statusRenderers = {
    ad_account_status: (value, row) => (
      <StatusWithIcon status={value} error={row?.ad_account_error} />
    ),
    access_token_status: (value, row) => (
      <StatusWithIcon status={value} error={row?.access_token_error} />
    ),
    facebook_page_status: (value, row) => (
      <StatusWithIcon status={value} error={row?.facebook_page_error} />
    ),
    status: (value, row) => (
      <StatusWithIcon
        status={value}
        error={[row?.ad_account_error, row?.access_token_error, row?.facebook_page_error]
          .filter(Boolean)
          .join("<br />")}
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
        <Tooltip
          title={
            <span dangerouslySetInnerHTML={{ __html: error }} />
          }
          arrow
        >
          <CancelIcon style={{ color: "red" }} />
        </Tooltip>
      ) : (
        <CancelIcon style={{ color: "red" }} />
      );
    }
  
    return <span>{status}</span>;
  };

  const verifyCampaignCodes = async (campaignCodes, addMessage) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/verify/campaign-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: 1, campaign_codes: campaignCodes }), // Pass in the user_id and the campaign_codes
      });
  
      const result = await response.json();
      console.log(`RESULT: ${JSON.stringify(result, null, 2)}`);
  
      if (response.ok) {
        const { existing_codes, missing_codes } = result;
  
        if (existing_codes.length > 0) {
          console.log(`✅ Existing campaign codes: ${existing_codes.join(", ")}`);
        }
  
        if (missing_codes.length > 0) {
          // You could also show the missing codes in the UI if needed
          console.warn(`❌ Missing campaign codes: ${missing_codes.join(", ")}`);
        }
  
        // Handle the result and update the UI or table data
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
            padding: "10px",
            borderRadius: "8px",
          }}
        >
          {/* Title + Info Icon in a flex row */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography
              variant="h5"
              component="div"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              CAMPAIGN CREATIONS PAGE
              <Tooltip title="CSV Instructions 📄">
                <IconButton
                  color="primary"
                  onClick={handleOpenDialog}
                  size="small"
                >
                  <InfoIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} /> {/* Spacer */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px", // Space between rows
              marginBottom: "12px",
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
            {/* First Row - 3 Buttons */}
            <Box sx={{ display: "flex", gap: "15px" }}>
              <CustomButton
                name="Clear All"
                onClick={handleClearAll}
                type="primary"
                icon={<DeleteIcon />}
              />
              <CustomButton
                name="Regions"
                onClick={handleDownloadRegions}
                type="tertiary"
                icon={<DownloadIcon />}
              />
              <CustomButton
                name="Template"
                onClick={handleDownloadTemplate}
                type="tertiary"
                icon={<DownloadIcon />}
              />
            </Box>

            {/* Second Row - 4 Buttons (Including RUN) */}
            <Box sx={{ display: "flex", gap: "15px" }}>
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
                name={`AI: ${isAi ? "ON" : "OFF"}`}
                onClick={handleToggle}
                type="primary"
                icon={<SmartToyRoundedIcon />}
                disabled={true}
              />
              <CustomButton
                name="RUN"
                onClick={handleRunCampaigns}
                type="primary"
                icon={<RunIcon />}
              />
            </Box>
          </Box>
        </Box>
        {/* Second Column */}
        <Box sx={{ width: "50%" }}>
          <CampaignCreationTerminal
            messages={messages}
            setMessages={setMessages}
          />
        </Box>
      </Box>

      {/* Alert Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>📄 Instructions for Using CSV Template</DialogTitle>
        <DialogContent sx={{ maxHeight: 280, overflowY: "auto", px: 2 }}>
          <Typography variant="body2" gutterBottom>
            Follow these steps to ensure a smooth import:
          </Typography>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>
              📥 <strong>Download</strong> the template via "Download Template".
            </li>
            <li>
              🛑 <strong>Start all values</strong> with an apostrophe (
              <code>'</code>) to prevent Excel auto-formatting.
            </li>
            <li>
              💾 <strong>Save as UTF-8 CSV:</strong>
              📊 Excel: <i>File &gt; Save As &gt; CSV UTF-8</i> | 📄 Google
              Sheets: <i>File &gt; Download &gt; CSV</i>.
            </li>
            <li>
              📂 <strong>Import</strong> the filled CSV using "Import CSV"
              before running.
            </li>
            <li>
              🔀{" "}
              <strong>
                Format <code>interests_list</code> &{" "}
                <code>exclude_ph_region</code> properly:
              </strong>
            </li>
            <ul style={{ paddingLeft: 16, margin: 4 }}>
              <li>
                ✅ Use <code>"/"</code> as a delimiter between interest groups.
              </li>
              <li>
                📌 Example:{" "}
                <code>
                  /Interest1, Interest2, Interest3/Interest4, Interest5
                </code>
              </li>
              <li>
                📌 Example:{" "}
                <code>/Davao, Mimaropa, Calabarzon/Ilocos, Davao</code>
              </li>
              <li>
                ❗ If all ad sets share the same excluded regions, omit
                delimiter: <code>Davao, Mimaropa, Calabarzon</code>.
              </li>
              <li>
                ⚠️ If only PH, leave blank or use <code>[]</code>.
              </li>
              <li>
                🆓 Empty Interest List: Use <code>[]</code> or <code>//</code>{" "}
                (space).
              </li>
            </ul>
          </ul>
          <Typography variant="body1" color="textSecondary">
            🔄 Values are auto-split into groups before processing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Got it! 👍
          </Button>
        </DialogActions>
      </Dialog>

      {/* Second Row (Dynamic Table) */}
      <Box sx={{ flex: 1 }}>
        <WidgetCard title="Main Section" height="96%">
          <DynamicTable
            headers={headers}
            data={tableData}
            rowsPerPage={100}
            containerStyles={{
              width: "100%",
              height: "100%",
              marginTop: "8px",
              textAlign: "center",
            }}
            customRenderers={statusRenderers}
            onDataChange={setTableData}
            onSelectedChange={handleSelectedDataChange} // Pass selection handler
            nonEditableHeaders={[
              "ad_account_status",
              "access_token_status",
              "facebook_page_status",
              "page_name",
              "status",
            ]}
          />
        </WidgetCard>
      </Box>
    </Box>
  );
};

export default CampaignCreationPage;
