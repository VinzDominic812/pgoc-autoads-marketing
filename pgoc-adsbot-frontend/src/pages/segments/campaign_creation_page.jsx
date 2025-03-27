import React, { useState, useRef, useEffect, useMemo } from "react";
import {Box, 
        Button, 
        Dialog, 
        DialogActions, 
        DialogContent, 
        DialogTitle, 
        Typography, 
        Tooltip,
        IconButton,
       } from "@mui/material";

import WidgetCard from "../components/widget_card";
import DynamicTable from "../components/dynamic_table";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons";
import SpaceBg from "../../assets/campaign_creation_bg.png";
import Papa from "papaparse";
import { getUserData } from "../../services/user_data.js";

// ICONS
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
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
  "page_name",
  "facebook_page_id",
  "sku",
  "material_code",
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

  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedData, setSelectedData] = useState([]); // Store selected data
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState([]); // Ensure it's an array
  const [isVerified, setIsVerified] = useState(false);
  const fileInputRef = useRef(null);
  const isRunningRef = useRef(false);
  const eventSourceRef = useRef(null);
  const [openDialog, setOpenDialog] =useState(false);
  const handleOpenDialog = () => setOpenDialog(true);
  const handleCloseDialog = () => setOpenDialog(false);
  const [errorMessages, setErrorMessages] = useState([]);

  const [isAi, setIsAi] = useState(false);

  const handleToggle = () => {
    setIsAi((prev) => !prev);
  };

  const headers = [
    "ad_account_id",
    "ad_account_status",
    "access_token",
    "access_token_status",
    "page_name",
    "facebook_page_id",
    "facebook_page_status",
    "sku",
    "material_code",
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

  // Retrieve persisted state from cookies
  const getPersistedState = (key, defaultValue) => {
    const savedData = Cookies.get(key);
    return savedData ? JSON.parse(savedData) : defaultValue;
  };

  const [tableData, setTableData] = useState(() =>
    getPersistedState("campaignCreationTableData", [])
  );

  const handleSelectedDataChange = (selectedRows) => {
    setSelectedData(selectedRows);
  };

  useEffect(() => {
    if (!tableData || tableData.length === 0) return;

    const allVerified = tableData.every(
      (row) =>
        row["ad_account_status"] === "Verified" &&
        row["access_token_status"] === "Verified" &&
        row["facebook_page_status"] === "Verified"
    );

    // ✅ Only update state if value changes
    setIsVerified((prev) => {
      if (prev !== allVerified) {
        console.log("📌 Updating isVerified:", allVerified ? "OK" : "Error");
        return allVerified;
      }
      return prev;
    });
  }, [tableData]);

  // Persist data in cookies whenever state changes
    useEffect(() => {
      Cookies.set("campaignCreationTableData", JSON.stringify(tableData), { expires: 1 }); // Expires in 1 day
    }, [tableData]);
  
    useEffect(() => {
      Cookies.set("campainCreationmessages", JSON.stringify(messages), { expires: 1 });
    }, [messages]);

  //verify user
  useEffect(() => {
    setIsVerified(
      tableData.length > 0 &&
        tableData.every((row) => {
          console.log("🔍 Row Data:", row);
          const allVerified =
            row["ad_account_status"] === "Verified" &&
            row["access_token_status"] === "Verified" &&
            row["facebook_page_status"] === "Verified";

          console.log("📌 Status Value:", allVerified ? "OK" : "Error");
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
          const messageText = data.data.message[0]; // ✅ Extract first message

          // ✅ Always add the message to the message list
          addMessage(data.data.message);
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

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const fileContent = e.target?.result;

      Papa.parse(fileContent, {
        complete: (result) => {
          console.log("Parsed CSV Data:", result.data);
          const csvData = result.data;

          if (csvData.length > 1) {
            const headers = csvData[0].map((header) => header.trim()); // Trim headers

            const formattedData = csvData.slice(1).map((row) =>
              headers.reduce((acc, header, index) => {
                acc[header] = row[index]?.trim() || ""; // Trim values & handle empty cells
                return acc;
              }, {})
            );

            // Debugging: Check interests_list field before parsing
            formattedData.forEach((item) => {
              console.log(
                "Raw interests_list from CSV:",
                item["interests_list"]
              );
              console.log(
                "Raw excluded_ph_region from CSV:",
                item["excluded_ph_region"]
              );
              item["interests_list"] = parseInterestsList(
                item["interests_list"]
              );
              item["excluded_ph_region"] = parseExcludedPHRegion(
                item["excluded_ph_region"]
              );
            });

            setTableData(formattedData);
            console.log(`formatteddata: ${JSON.stringify(formattedData)}`);
            verifyAdAccounts(formattedData);
          }
        },
        header: false,
        skipEmptyLines: true,
      });
    };

    reader.readAsText(file, "UTF-8");
  };

  const compareCsvWithJson = (csvData, jsonData, setTableData) => {
    console.log("Comparing CSV data with JSON response...");
  
    const updatedData = csvData.map((csvRow) => {
      const jsonRow = jsonData.find(
        (json) =>
          json.ad_account_id === csvRow.ad_account_id &&
          json.access_token === csvRow.access_token &&
          json.facebook_page_id === csvRow.facebook_page_id
      );
  
      if (!jsonRow) {
        addMessage(`❌ No matching account for Ad Account ID: ${csvRow.ad_account_id}`);
        return {
          ...csvRow,
          ad_account_status: "No matching account",
          access_token_status: "No matching token",
          facebook_page_status: "No matching page",
          status: "Error",
        };
      }
  
      // Check for errors and add messages
      if (jsonRow.ad_account_status !== "Verified") {
        addMessage(`⚠️ Ad Account Error for ${csvRow.ad_account_id}: ${jsonRow.ad_account_error || "Unknown Error"}`);
      }
      if (jsonRow.access_token_status !== "Verified") {
        addMessage(`⚠️ Access Token Error for ${csvRow.ad_account_id}: ${jsonRow.access_token_error || "Unknown Error"}`);
      }
      if (jsonRow.facebook_page_status !== "Verified") {
        addMessage(`⚠️ Facebook Page Error for ${csvRow.facebook_page_id}: ${jsonRow.facebook_page_error || "Unknown Error"}`);
      }
  
      const allVerified =
        jsonRow.ad_account_status === "Verified" &&
        jsonRow.access_token_status === "Verified" &&
        jsonRow.facebook_page_status === "Verified";
  
      return {
        ...csvRow,
        ad_account_status: jsonRow.ad_account_status,
        access_token_status: jsonRow.access_token_status,
        facebook_page_status: jsonRow.facebook_page_status,
        status: allVerified ? "Verified" : "Error",
      };
    });
  
    setTableData(updatedData);
  };  

  const verifyAdAccounts = async (campaignsData) => {
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
      console.log(`RESULT: ${JSON.stringify(result)}`);

      if (response.ok && result.verified_accounts) {
        compareCsvWithJson(
          campaignsData,
          result.verified_accounts,
          setTableData
        ); // 🔹 Now updates table data!
      } else {
        console.warn("⚠️ No verified accounts returned from API.");
      }
    } catch (error) {
      console.error("Error verifying ad accounts:", error);
    }
  };

  const parseInterestsList = (interestsString) => {
    if (!interestsString || interestsString.trim() === "") return [[]];

    console.log("📌 Raw interests_list before processing:", interestsString);

    try {
      // Split by " / " to separate different groups
      const groups = interestsString
        .split(" / ")
        .map((group) => group.trim())
        .filter((group) => group.length > 0 && group !== "[]");

      // Convert each group into an array of interests
      const parsedArray = groups.map((group) =>
        group
          .split(",")
          .map((interest) => interest.trim())
          .filter(Boolean)
      );

      console.log("✅ Formatted interests_list:", parsedArray);
      return parsedArray.length ? parsedArray : [[]]; // Ensure it's always a nested array
    } catch (error) {
      console.error("❌ Error parsing interests_list:", interestsString, error);
      return [[]]; // Default to empty nested array on failure
    }
  };

  // New function to parse the excluded_ph_region
  const parseExcludedPHRegion = (regionString) => {
    if (!regionString || regionString.trim() === "") return [[]];

    console.log("Raw excluded_ph_region before processing:", regionString);

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

      console.log("Formatted excluded_ph_region:", parsedArray);
      return parsedArray;
    } catch (error) {
      console.error("Error parsing excluded_ph_region:", regionString, error);
    }

    return [[]]; // Default to an empty nested array if parsing fails
  };

  // Function to fetch regions and download them as CSV
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
      console.error("Error fetching regions:", error);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      [
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
      ],
      [
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

  const handleRunCampaigns = async () => {

    if (isRunningRef.current) return; // Prevent duplicate execution
    isRunningRef.current = true;

    const campaignApiUrl = isAi
        ? `${apiUrl}/api/v1/campaign/create-campaigns-ai`
        : `${apiUrl}/api/v1/campaign/create-campaigns`;

        const verifiedCampaigns = tableData.filter(row => row.status === "Verified");

        if (verifiedCampaigns.length === 0) {
          notify("No verified campaigns available to run.", "error");
          isRunningRef.current = false;
          return;
        }
      
        setIsRunning(true);
        addMessage(["Running verified campaigns..."]);
      
        console.log("✅ Verified Campaigns:", JSON.stringify(verifiedCampaigns, null, 2));
      
        for await (const [index, row] of verifiedCampaigns.entries()) {
          console.log(`🔄 Processing verified row ${index + 1}/${verifiedCampaigns.length}:`, row);
      
          let parsedInterests = row["interests_list"];
          let parsedExcludedRegions = row["excluded_ph_region"];
      
          if (typeof parsedInterests === "string") {
            try {
              parsedInterests = JSON.parse(parsedInterests);
            } catch (error) {
              console.error("❌ Error parsing interests_list:", parsedInterests, error);
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
      
          console.log(`Campaign Data : ${JSON.stringify(requestBody)}`);
      
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
              console.log(`❌ Response Body: ${JSON.stringify(response)}`);
              continue;
            }
      
            if (contentType && contentType.includes("application/json")) {
              const responseBody = await response.json();
              addMessage([`✅ Response for SKU ${row["sku"]}: Status ${response.status}`]);
      
              if (responseBody.tasks && responseBody.tasks.length > 0) {
                console.log("📌 Response Body:", responseBody);
                addMessage([
                  `Task Created: ${responseBody.tasks[0].campaign_name} - Status: ${
                    responseBody.tasks[0].status
                  } - Message: ${JSON.stringify(responseBody.tasks[0])}`,
                ]);
              } else {
                addMessage([`⚠️ No task information available for SKU ${row["sku"]}.`]);
              }
            } else {
              const textResponse = await response.text();
              addMessage([
                `Error: Expected JSON but received for SKU ${row["sku"]}: ${JSON.stringify(textResponse)}`,
              ]);
            }
          } catch (error) {
            if (error instanceof Error) {
              addMessage([`❌ Error for SKU ${row["sku"]}: ${error.message}`]);
            } else {
              addMessage([`❌ Unknown error occurred for SKU ${row["sku"]}`]);
            }
          }
      
          console.log(`✅ FINISHED Processing row ${index + 1}`);
        }
      
        setIsRunning(false);
        isRunningRef.current = false;
      
        addMessage([
          "✅ All verified campaigns have been created successfully!",
        ]);
      };

  const handleClearAll = () => {
    setTableData([]); // Clear state
    Cookies.remove("tableData"); // Remove from cookies
    notify("All data cleared successfully!", "success");
  };

  //Icons for Verified
  const customRenderers = useMemo(
    () => ({
      ad_account_status: (status) =>
        status === "Verified" ? (
          <Tooltip title="Ad Account Verified">
            <CheckIcon style={{ color: "green" }} />
          </Tooltip>
        ) : (
          <Tooltip title={`Ad Account Error: ${status}`}>
            <CancelIcon style={{ color: "red" }} />
          </Tooltip>
        ),
      access_token_status: (status) =>
        status === "Verified" ? (
          <Tooltip title="Access Token Verified">
            <CheckIcon style={{ color: "green" }} />
          </Tooltip>
        ) : (
          <Tooltip title={`Access Token Error: ${status}`}>
            <CancelIcon style={{ color: "red" }} />
          </Tooltip>
        ),
      facebook_page_status: (status) =>
        status === "Verified" ? (
          <Tooltip title="Facebook Page Verified">
            <CheckIcon style={{ color: "green" }} />
          </Tooltip>
        ) : (
          <Tooltip title={`Facebook Page Error: ${status}`}>
            <CancelIcon style={{ color: "red" }} />
          </Tooltip>
        ),
      status: (status) =>
        status === "Verified" ? (
          <Tooltip title="All Verified">
            <CheckIcon style={{ color: "green" }} />
          </Tooltip>
        ) : (
          <Tooltip title="Some Errors Detected">
            <CancelIcon style={{ color: "red" }} />
          </Tooltip>
        ),
    }),
    [tableData]
  );

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
              variant="h6"
              component="div"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              CAMPAIGN CREATIONS
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
                disabled = {true}
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
                ✅ Use <code>/</code> as a delimiter between interest groups.
              </li>
              <li>
                📌 Example:{" "}
                <code>
                  [] / Interest1, Interest2, Interest3 / Interest4, Interest5
                </code>
              </li>
              <li>
                📌 Example:{" "}
                <code>[] / Davao, Mimaropa, Calabarzon / Ilocos, Davao</code>
              </li>
              <li>
                ❗ If all ad sets share the same excluded regions, omit
                delimiter: <code>Davao, Mimaropa, Calabarzon</code>.
              </li>
              <li>
                ⚠️ If only PH, leave blank or use <code>[]</code>.
              </li>
              <li>
                🆓 Empty Interest List: Use <code>[]</code> or <code>/ /</code>{" "}
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
        <WidgetCard title="Main Section" height="100%" width={"100%"}>
          <DynamicTable
            headers={headers}
            data={tableData}
            rowsPerPage={5}
            containerStyles={{
              width: "100%",
              height: "100%",
              marginTop: "8px",
              textAlign: "center",
            }}
            customRenderers={customRenderers}
            onDataChange={setTableData}
            onSelectedChange={handleSelectedDataChange} // Pass selection handler
            nonEditableHeaders={[
              "ad_account_status",
              "access_token_status",
              "facebook_page_status",
              "status",
            ]}
          />
        </WidgetCard>
      </Box>
    </Box>
  );
};

export default CampaignCreationPage;
