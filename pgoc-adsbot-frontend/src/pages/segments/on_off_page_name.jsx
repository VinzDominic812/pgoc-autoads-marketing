import React, { useState, useRef, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import WidgetCard from "../components/widget_card.jsx";
import DynamicTable from "../components/dynamic_table.jsx";
import notify from "../components/toast.jsx";
import CustomButton from "../components/buttons.jsx";
import SpaceBg from "../../assets/space-bg.png";
import Papa from "papaparse";
import { getUserData } from "../../services/user_data.js";

// ICONS
import ExportIcon from "@mui/icons-material/FileUpload";
import CloudExportIcon from "@mui/icons-material/BackupRounded";
import RunIcon from "@mui/icons-material/PlayCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/FileDownload";
import PageNameTerminal from "../widgets/on_off_pagename/on_off_pagename_terminal.jsx";
import { EventSource } from "extended-eventsource";
import Cookies from "js-cookie";

const REQUIRED_HEADERS = [
  "ad_account_id",
  "access_token",
  "page_name",
  "on_off",
];

// Function to get the current timestamp in [YYYY-MM-DD HH-MM-SS] format
const getCurrentTime = () => {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8); // Convert UTC to Manila Time (UTC+8)
  return now.toISOString().replace("T", " ").split(".")[0]; // YYYY-MM-DD HH-MM-SS format
};

const apiUrl = import.meta.env.VITE_API_URL;

const PageOnOFFPage = () => {
  const headers = [
    "ad_account_id",
    "access_token",
    "page_name",
    "on_off",
    "status",
  ];
  // Retrieve persisted state from cookies
  const getPersistedState = (key, defaultValue) => {
    const savedData = Cookies.get(key);
    return savedData ? JSON.parse(savedData) : defaultValue;
  };

  const [tablePageNameData, setTablePageNameData] = useState(() =>
    getPersistedState("tablePageNameData", [])
  );
  const [selectedRows, setSelectedRows] = useState(new Map());
  const [selectedData, setSelectedData] = useState([]); // Store selected data
  const [messages, setMessages] = useState([]); // Ensure it's an array
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Persist data in cookies whenever state changes
  useEffect(() => {
    Cookies.set("tablePageNameData", JSON.stringify(tablePageNameData), { expires: 1 }); // Expires in 1 day
  }, [tablePageNameData]);

  useEffect(() => {
    Cookies.set("messages", JSON.stringify(messages), { expires: 1 });
  }, [messages]);

  const addMessage = (newMessages) => {
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

  const handleRunCampaigns = async () => {
    if (tablePageNameData.length === 0) {
      addMessage([`[${getCurrentTime()}] ❌ No campaigns to process.`]);
      return;
    }

    const { id: user_id } = getUserData();
    const delayMs = 3000; // 3 seconds delay

    // Convert table data to request format
    const requestData = tablePageNameData.map((entry) => ({
      ad_account_id: entry.ad_account_id,
      user_id,
      access_token: entry.access_token,
      schedule_data: [
        {
          page_name: entry.page_name,
          on_off: entry.on_off,
        },
      ],
    }));

    // Process campaigns sequentially with a delay
    for (const [index, data] of requestData.entries()) {
      const { ad_account_id, schedule_data } = data;
      const on_off = schedule_data[0].on_off; // Extract ON/OFF status

      addMessage([
        `[${getCurrentTime()}] ⏳ Processing Ad Account ${ad_account_id} (${on_off.toUpperCase()})`,
      ]);

      try {
        const response = await fetch(
          `${apiUrl}/api/v1/off-on-pagename/add-pagename`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              skip_zrok_interstitial: "true",
            },
            body: JSON.stringify(data),
          }
        );

        if (!response.ok) {
          throw new Error(`Request failed for row ${index + 1}`);
        }

        // ✅ Update status for the successfully processed campaign
        setTablePageNameData((prevData) =>
          prevData.map((entry) =>
            entry.ad_account_id === ad_account_id && entry.on_off === on_off
              ? {
                  ...entry,
                  status: `Request Sent ✅ (${on_off.toUpperCase()})`,
                }
              : entry
          )
        );

        addMessage([
          `[${getCurrentTime()}] ✅ Ad Account ${ad_account_id} (${on_off.toUpperCase()}) processed successfully`,
        ]);
      } catch (error) {
        addMessage([
          `[${getCurrentTime()}] ❌ Error processing campaign ${
            index + 1
          } for Ad Account ${ad_account_id} (${on_off.toUpperCase()}): ${
            error.message
          }`,
        ]);

        // ❌ Update status for failed campaigns
        setTablePageNameData((prevData) =>
          prevData.map((entry) =>
            entry.ad_account_id === ad_account_id && entry.on_off === on_off
              ? { ...entry, status: `Failed ❌ (${on_off.toUpperCase()})` }
              : entry
          )
        );
      }

      // Delay before the next request
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Add global completion message at the end
    addMessage([`[${getCurrentTime()}] 🚀 All Requests Sent`]);
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
            "Invalid CSV headers. Required: ad_account_id, access_token, page_name, on_off.",
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
  
        // Detect and remove duplicates
        const uniqueData = [];
        const removedDuplicates = [];
        const seenEntries = new Set();
  
        processedData.forEach((entry) => {
          const adAccountId = entry.ad_account_id;
          const pageName = entry.page_name;
          const uniqueKey = `${adAccountId}_${pageName}`; // Track using both fields
  
          // Check if the combination already exists
          if (seenEntries.has(uniqueKey)) {
            removedDuplicates.push(`ad_account_id: ${adAccountId}, page_name: ${pageName}`);
            return;
          }
  
          // Check for page_name with different ad_account_id
          if ([...seenEntries].some((key) => key.endsWith(`_${pageName}`) && !key.startsWith(`${adAccountId}_`))) {
            removedDuplicates.push(`page_name: ${pageName} with different ad_account_id`);
            return;
          }
  
          seenEntries.add(uniqueKey);
          uniqueData.push({ ...entry, status: "Ready" }); // Add default status
        });
  
        if (removedDuplicates.length > 0) {
          notify(
            `Removed conflicting or duplicate data: ${removedDuplicates.join(", ")}`,
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
              page_name: entry.page_name,
              on_off: entry.on_off,
            },
          ],
        }));
  
        console.log("Processed Request Data:", JSON.stringify(requestData, null, 2));
  
        setTablePageNameData(uniqueData); // Store processed data in the table
        notify("CSV file successfully imported!", "success");
      },
      header: false,
      skipEmptyLines: true,
    });
  
    event.target.value = "";
  };

  // Download CSV Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      ["ad_account_id", "access_token", "page_name", "on_off"],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_ACCESS_TOKEN",
        "page_name",
        "ON",
      ],
      [
        "ANOTHER_AD_ACCOUNT",
        "ANOTHER_ACCESS_TOKEN",
        "page_name",
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
    if (tablePageNameData.length === 0) {
      notify("No data to export.", "error");
      return;
    }

    // Define CSV headers
    const csvHeaders = [
      "ad_account_id",
      "access_token",
      "page_name",
      "on_off",
      "status",
    ];

    // Convert table data to CSV format
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM for proper encoding
      [csvHeaders.join(",")] // Add headers
        .concat(
            tablePageNameData.map((row) =>
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
  const handleSelectedDataChange = (selectedRows) => {
    setSelectedData(selectedRows);
  };

  useEffect(() => {
    const { id: user_id } = getUserData();
    const eventSourceUrl = `${apiUrl}/api/v1/messageevents-pagename?keys=${user_id}-key`;

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

          // ✅ Check if it's a "Last Message"
          const lastMessageMatch = messageText.match(/\[(.*?)\] (.*)/);

          if (lastMessageMatch) {
            const timestamp = lastMessageMatch[1]; // e.g., "2025-03-13 11:34:03"
            const messageContent = lastMessageMatch[2]; // e.g., "Campaign updates completed for 1152674286244491 (OFF)"

            setTablePageNameData((prevData) =>
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
            /\[(.*?)\] Fetching Campaign Data for (\S+) \((ON|OFF)\), schedule (.+)/
          );

          if (fetchingMatch) {
            const adAccountId = fetchingMatch[2];
            const onOffStatus = fetchingMatch[3];

            setTablePageNameData((prevData) =>
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
            /\[(.*?)\] Campaign updates completed for (\S+) \((ON|OFF)\)/
          );

          if (successMatch) {
            const adAccountId = successMatch[2];
            const onOffStatus = successMatch[3];

            setTablePageNameData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId &&
                entry.on_off === onOffStatus
                  ? { ...entry, status: `Success ✅` }
                  : entry
              )
            );
          }

          // ❌ Handle 401 Unauthorized error
          const unauthorizedMatch = messageText.match(
            /Error during campaign fetch for Ad Account (\S+) \((ON|OFF)\): 401 Client Error/
          );

          if (unauthorizedMatch) {
            const adAccountId = unauthorizedMatch[1];
            const onOffStatus = unauthorizedMatch[2];

            setTablePageNameData((prevData) =>
              prevData.map((entry) =>
                entry.ad_account_id === adAccountId &&
                entry.on_off === onOffStatus
                  ? { ...entry, status: "Failed ❌" }
                  : entry
              )
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
    setTablePageNameData([]); // Clear state
    Cookies.remove("tablePageNameData"); // Remove from cookies
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
            ON/OFF CAMPAIGNS PAGE
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
              onClick={handleRunCampaigns}
              type="primary"
              icon={<RunIcon />}
            />
          </Box>
        </Box>
        {/* Second Column */}
        <Box sx={{ width: "50%" }}>
          <PageNameTerminal messages={messages} setMessages={setMessages} />
        </Box>
      </Box>

      {/* Second Row (Dynamic Table) */}
      <Box sx={{ flex: 1 }}>
        <WidgetCard title="Main Section" height="100%">
          <DynamicTable
            headers={headers}
            data={tablePageNameData}
            rowsPerPage={8}
            containerStyles={{
              width: "100%",
              height: "100%",
              marginTop: "8px",
              textAlign: "center",
            }}
            onDataChange={setTablePageNameData}
            onSelectedChange={handleSelectedDataChange} // Pass selection handler
            nonEditableHeaders={[
              "ad_account_id",
              "access_token",
              "page_name",
              "status",
            ]}
          />
        </WidgetCard>
      </Box>
    </Box>
  );
};

export default PageOnOFFPage;
