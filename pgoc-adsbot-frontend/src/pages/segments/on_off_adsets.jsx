import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, TextField } from "@mui/material";
import WidgetCard from "../components/widget_card";
import DynamicTable from "../components/dynamic_table";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons";
import SpaceBg from "../../assets/adset.png";
import Papa from "papaparse";
import { getUserData } from "../../services/user_data.js";

// ICONS
import ExportIcon from "@mui/icons-material/FileUpload";
import CloudExportIcon from "@mui/icons-material/BackupRounded";
import RunIcon from "@mui/icons-material/PlayCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/FileDownload";
import AdsetTerminal from "../widgets/on_off_adsets/on_off_adsets_terminal.jsx";
import { EventSource } from "extended-eventsource";
import Cookies from "js-cookie";

const REQUIRED_HEADERS = [
  "ad_account_id",
  "access_token",
  "campaign_type",
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
    "access_token",
    "campaign_type",
    "what_to_watch",
    "cpp_metric",
    "cpp_date_start",
    "cpp_date_end",
    "on_off",
    "status",
  ];
  // Retrieve persisted state from cookies
  const getPersistedState = (key, defaultValue) => {
    const savedAdsetsData = Cookies.get(key);
    return savedAdsetsData ? JSON.parse(savedAdsetsData) : defaultValue;
  };

  const [tableAdsetsData, setTableAdsetsData] = useState(() =>
    getPersistedState("tableAdsetsData", [])
  );
  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedAdsetsData, setSelectedAdsetsData] = useState([]); // Store selected data
  const [messages, setMessages] = useState([]); // Ensure it's an array
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);

  const [filteredData, setFilteredData] = useState(tableAdsetsData);
  const [searchTerm, setSearchTerm] = useState("");

  // Persist data in cookies whenever state changes
  useEffect(() => {
    Cookies.set("tableAdsetsData", JSON.stringify(tableAdsetsData), {
      expires: 1,
    }); // Expires in 1 day
  }, [tableAdsetsData]);

  useEffect(() => {
    Cookies.set("messages", JSON.stringify(messages), { expires: 1 });
  }, [messages]);

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

  const addAdsetsMessage = (newMessages) => {
    setMessages((prevMessages) => {
      // Ensure prevMessages is always an array (fallback to empty array)
      const messagesArray = Array.isArray(prevMessages) ? prevMessages : [];

      // Use a Map to store unique messages
      const uniqueMessages = new Map(
        [...messagesArray, ...newMessages].map((msg) => [
          JSON.stringify(msg),
          msg,
        ])
      );

      return Array.from(uniqueMessages.values()); // Convert back to array
    });
  };

  // Validate CSV Headers
  const validateCSVHeaders = (fileHeaders) =>
    REQUIRED_HEADERS.every((header) => fileHeaders.includes(header));

  const handleRunAdsets = async () => {
    if (tableAdsetsData.length === 0) {
      addAdsetsMessage([`[${getCurrentTime()}] ❌ No campaigns to process.`]);
      return;
    }

    const { id } = getUserData();
    const batchSize = 1;
    const delayMs = 5000; // 5secs delay

    const requestData = tableAdsetsData.map((entry) => ({
      ad_account_id: entry.ad_account_id,
      user_id: id,
      access_token: entry.access_token,
      schedule_data: [
        {
          campaign_type: entry.campaign_type,
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
          const response = await fetch(`${apiUrl}/api/v1/OnOff/adsets`, {
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

  // Handle CSV File Import
  const handleFileChange = (event) => {
    const file = event.target.files[0];

    if (!file) {
      notify("No file selected.", "error");
      return;
    }

    const { id: user_id } = getUserData(); // Get user ID

    Papa.parse(file, {
      complete: (result) => {
        if (result.data.length < 2) {
          notify("CSV file is empty or invalid.", "error");
          return;
        }

        const fileHeaders = result.data[0].map((h) => h.trim().toLowerCase());

        if (!validateCSVHeaders(fileHeaders)) {
          notify(
            "Invalid CSV headers. Required: ad_account_id, access_token, campaign_type, what_to_watch, cpp_metric, on_off.",
            "error"
          );
          return;
        }

        const processedData = result.data
          .slice(1)
          .filter((row) => row.some((cell) => cell)) // Remove empty rows
          .map((row) =>
            fileHeaders.reduce((acc, header, index) => {
              acc[header] = row[index] ? row[index].trim() : "";
              return acc;
            }, {})
          );

        // Detect and remove duplicate ad_account_id values
        const uniqueData = [];
        const seenAdAccounts = new Set();
        const removedDuplicates = [];

        processedData.forEach((entry) => {
          if (seenAdAccounts.has(entry.ad_account_id)) {
            removedDuplicates.push(entry.ad_account_id);
          } else {
            seenAdAccounts.add(entry.ad_account_id);
            uniqueData.push({ ...entry, status: "Ready" }); // Add default status
          }
        });

        if (removedDuplicates.length > 0) {
          notify(
            `Removed duplicate ad_account_ids: ${removedDuplicates.join(", ")}`,
            "error"
          );
        }

        // Convert unique data to API request format
        const requestData = uniqueData.map((entry) => ({
          ad_account_id: entry.ad_account_id,
          user_id,
          access_token: entry.access_token,
          schedule_data: [
            {
              campaign_type: entry.campaign_type,
              what_to_watch: entry.what_to_watch,
              cpp_metric: entry.cpp_metric,
              cpp_date_start: entry.cpp_date_start,
              cpp_date_end: entry.cpp_date_end,
              on_off: entry.on_off,
            },
          ],
        }));

        console.log(
          "Processed Request Data:",
          JSON.stringify(requestData, null, 2)
        );
        setTableAdsetsData(uniqueData); // Store processed data in the table
        notify("CSV file successfully imported!", "success");
        verifyAdAccounts(requestData, addAdsetsMessage);
      },
      header: false,
      skipEmptyLines: true,
    });

    event.target.value = "";
  };

  const verifyAdAccounts = async (campaignsData) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/verify/adsets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(campaignsData), // 🔹 Send the array directly
      });

      const result = await response.json();
      console.log("Verification Result:", JSON.stringify(result, null, 2));

      if (response.ok && result.verified_accounts) {
        result.verified_accounts.forEach((entry) => {
          // Only display errors
          if (entry.ad_account_error) {
            addAdsetsMessage([
              `${entry.ad_account_id} : ${entry.ad_account_error}`
            ]);
          }
          if (entry.access_token_error) {
            addAdsetsMessage([
              `${entry.ad_account_id}: ${entry.access_token_error}`
            ]);
          }
        });
      } else {
        addAdsetsMessage("⚠️ No verified accounts returned from API.");
      }
    } catch (error) {
      console.error("Error verifying ad accounts:", error);
      addAdsetsMessage("❌ Failed to verify ad accounts. Check your network.");
    }
  };

  // Download CSV Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      [
        "ad_account_id",
        "access_token",
        "campaign_type",
        "what_to_watch",
        "cpp_metric",
        "cpp_date_start",
        "cpp_date_end",
        "on_off",
      ],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_ACCESS_TOKEN",
        "CAMPAIGN_TYPE",
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
      "access_token",
      "campaign_type",
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

  // Handle selected data change from DynamicTable
  const handleSelectedAdsetsDataChange = (selectedRows) => {
    setSelectedAdsetsData(selectedRows);
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
            /\[(.*?)\] Processing (\S+) Completed/
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

            console.log(
              `✅ Success for Ad Account ${adAccountId} at ${timestamp}`
            );
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
              `[${getCurrentTime()}] ❌ 401 Unauthorized Error for Ad Account ${adAccountId} (${onOffStatus}). Check access token or permissions.`,
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
    setTableAdsetsData([]); // Clear state
    Cookies.remove("tableAdsetsData"); // Remove from cookies
    notify("All data cleared successfully!", "success");
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
            ON/OFF ADSETS PAGE
          </Typography>
          <Box sx={{ flex: 1 }} /> {/* Spacer */}
          <Box
            sx={{
              display: "flex",
              gap: "8px",
              marginBottom: "8px",
              marginLeft: "18px",
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
      <Box sx={{ flex: 1 }}>
        <WidgetCard title="Main Section" height="90%">
          {/* Search Bar */}
          <TextField
            label="Search For adAccountId"
            variant="outlined"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            sx={{ marginBottom: "8px", width: "300px" }}
          />

          {/* Dynamic Table with Filtered Data */}
          <DynamicTable
            headers={headers}
            data={filteredData}
            rowsPerPage={1000}
            containerStyles={{
              width: "100%",
              height: "100%",
              marginTop: "8px",
              textAlign: "center",
            }}
            onDataChange={setTableAdsetsData}
            onSelectedChange={handleSelectedAdsetsDataChange}
            nonEditableHeaders={[
              "ad_account_id",
              "access_token",
              "campaign_type",
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
