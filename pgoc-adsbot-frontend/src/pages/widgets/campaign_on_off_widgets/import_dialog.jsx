import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DynamicTable from "../../components/dynamic_table";
import CustomButton from "../../components/buttons";
import axios from "axios";

import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";

import { getUserData } from "../../../services/user_data";

const REQUIRED_HEADERS = [
  "ad_account_id",
  "facebook_name",
  "time",
  "cpp_metric",
  "on_off",
  "watch",
];

const apiUrl = import.meta.env.VITE_API_URL;

const ONOFFImportWidget = ({
  open,
  handleClose,
  onImportComplete,
  onRemoveSchedules,
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accessTokenMap, setAccessTokenMap] = useState({});

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

  const validateCSVHeaders = (headers) => {
    return REQUIRED_HEADERS.every((header) => headers.includes(header));
  };

  const parseCSV = (file) => {
    const { id: user_id } = getUserData();

    Papa.parse(file, {
      complete: (result) => {
        if (result.data.length > 1) {
          const headers = result.data[0].map((h) => h.trim());

          if (!validateCSVHeaders(headers)) {
            setErrorMessage(
              "Invalid CSV headers. The file must contain 'ad_account_id', 'facebook_name', 'time', 'cpp_metric', 'watch', and 'on_off'."
            );
            setShowTable(false);
            return;
          }

          const processedData = result.data.slice(1).map((row) => {
            let rowData = headers.reduce((acc, header, index) => {
              acc[header] = row[index] ? row[index].trim() : "";
              return acc;
            }, {});

            if (rowData["time"]) {
              let [hour, minute] = rowData["time"].slice(0, 5).split(":");
              rowData["time"] = `${hour.padStart(2, "0")}:${minute.padStart(
                2,
                "0"
              )}`;
            }

            // Add the actual access token if the Facebook name exists in our mapping
            if (rowData["facebook_name"] && accessTokenMap[rowData["facebook_name"]]) {
              rowData["_actual_access_token"] = accessTokenMap[rowData["facebook_name"]];
            }

            return rowData;
          });

          // Convert processed data to API request format
          const requestData = processedData.map((entry) => ({
            ad_account_id: entry.ad_account_id,
            user_id,
            access_token: entry._actual_access_token || entry.facebook_name,
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

          setTableHeaders(headers);
          setTableData(processedData);
          setShowTable(true);
          setErrorMessage("");
          verifyAdAccounts(requestData, processedData);
        } else {
          setErrorMessage("The CSV file is empty or invalid.");
        }
      },
      header: false,
      skipEmptyLines: true,
    });
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "text/csv") {
      setErrorMessage("Please upload a valid CSV file.");
      return;
    }
    setSelectedFile(file);
    parseCSV(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== "text/csv") {
      setErrorMessage("Please upload a valid CSV file.");
      return;
    }
    setSelectedFile(file);
    parseCSV(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      [
        "ad_account_id",
        "facebook_name",
        "time",
        "campaign_type",
        "cpp_metric",
        "on_off",
        "watch",
      ],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_FACEBOOK_NAME",
        "00:00",
        "REGULAR",
        "0",
        "ON",
        "Campaigns",
      ],
      [
        "ANOTHER_AD_ACCOUNT",
        "ANOTHER_FACEBOOK_NAME",
        "01:00",
        "TEST",
        "0",
        "OFF",
        "AdSets",
      ],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      sampleData.map((row) => row.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Schedule_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = () => {
    const processedDataMap = new Map();
    const { id } = getUserData();
  
    tableData.forEach((row) => {
      // Only process rows with "Verified" status
      if (row.status !== "Verified") {
        return;
      }
  
      const ad_account_id = row["ad_account_id"];
      const facebook_name = row["facebook_name"];
      const actual_token = row["_actual_access_token"];
      const time = row["time"];
      const campaign_type = row["campaign_type"] || "";
      const cpp_metric = row["cpp_metric"] || "";
      const on_off = row["on_off"] || "";
      const watch = row["watch"] || "";
  
      if (!ad_account_id || !facebook_name || !time || !on_off || !watch) {
        return;
      }
  
      const key = `${ad_account_id}_${facebook_name}`;
  
      if (!processedDataMap.has(key)) {
        processedDataMap.set(key, {
          ad_account_id,
          user_id: id,
          access_token: actual_token || facebook_name,
          schedule_data: [],
        });
      }
  
      processedDataMap.get(key).schedule_data.push({
        time,
        campaign_type,
        cpp_metric,
        on_off,
        watch,
      });
    });
  
    const processedData = Array.from(processedDataMap.values());
  
    if (processedData.length === 0) {
      alert("No verified rows to import. Please verify your data first.");
      return;
    }
  
    console.log("Processed Data:", JSON.stringify(processedData));
  
    onImportComplete(processedData);
    handleClose();
  };

  // NEW: Function to receive edited table data
  const handleTableDataChange = (updatedData) => {
    setTableData(updatedData);
  };

  const handleRemoveSchedules = () => {
    const adAccountIds = tableData.map((row) => row["ad_account_id"]);

    if (!adAccountIds.length) {
      alert("No schedules selected to remove.");
      return;
    }

    console.log("Ad Account IDs to Remove:", JSON.stringify(adAccountIds));

    // Call the parent function with selected IDs
    onRemoveSchedules(adAccountIds);

    // Close the dialog
    handleClose();
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
  
    const compareCsvWithJson = (csvData, jsonData, setTableData) => {
      const updatedData = csvData.map((csvRow) => {
        const jsonRow = jsonData.find(
          (json) =>
            json.ad_account_id === csvRow.ad_account_id &&
            json.access_token === (csvRow._actual_access_token || csvRow.facebook_name)
        );
    
        if (!jsonRow) {
          return {
            ...csvRow,
            ad_account_status: "Not Verified",
            access_token_status: "Not Verified",
            status: "Not Verified",
            ad_account_error: "Account not found",
            access_token_error: "Facebook name not found or invalid"
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
    
      setTableData(updatedData);
    };
  
    const verifyAdAccounts = async (campaignsData, originalCsvData) => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/verify/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true",
          },
          body: JSON.stringify(campaignsData),
        });
    
        const result = await response.json();
        console.log("Verification Result:", JSON.stringify(result, null, 2));
    
        if (response.ok && result.verified_accounts) {
          compareCsvWithJson(originalCsvData, result.verified_accounts, setTableData);
          //addAdsetsMessage([`[${getCurrentTime()}] Verification completed for ${result.verified_accounts.length} accounts`]);
        } else {
          const errorMsg = result.message || "No verified accounts returned from API";
          //addAdsetsMessage([`⚠️ ${errorMsg}`]);
        }
      } catch (error) {
        console.error("Error verifying ad accounts:", error);
        //addAdsetsMessage([`❌ Failed to verify ad accounts: ${error.message}`]);
      }
    };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      PaperProps={{ style: { width: 1000, height: 750 } }}
    >
      <DialogTitle className="bg-red-600 text-white text-center font-semibold text-sm p-2">
        Import CSV File
      </DialogTitle>

      <DialogContent
        dividers
        style={{ overflowY: "auto", maxHeight: "calc(750px - 64px - 52px)" }}
      >
        {!showTable ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-400 rounded-lg p-6 text-center cursor-pointer"
            style={{ height: 450 }}
          >
            <CloudUploadIcon
              fontSize="large"
              className="text-gray-600 mt-[120px] mb-2"
            />
            <p className="text-gray-700">
              Drag & drop a CSV file here, or click to select one.
            </p>

            {errorMessage && (
              <p className="text-red-600 font-semibold">{errorMessage}</p>
            )}

            <div className="text-center mb-2">
              <span
                onClick={handleDownloadTemplate}
                className="text-blue-500 underline cursor-pointer"
              >
                Download Template
              </span>
            </div>

            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="fileUpload"
            />
            <label
              htmlFor="fileUpload"
              className="block bg-red-500 text-white px-4 py-2 mt-2 rounded cursor-pointer"
            >
              Choose File
            </label>
          </div>
        ) : (
          <DynamicTable
            headers={tableHeaders}
            data={tableData}
            rowsPerPage={10}
            containerStyles={{ width: "100%", height: "500px" }}
            customRenderers={statusRenderers}
            onDataChange={handleTableDataChange}
            nonEditableHeaders={[
              "ad_account_status",
              "access_token_status",
              "campaign_type",
              "watch",
              "status",
            ]}
          />
        )}
      </DialogContent>

      <DialogActions>
        <CustomButton name="Close" onClick={handleClose} type="secondary" />
        <CustomButton
          name="Remove Schedules"
          onClick={handleRemoveSchedules}
          type="primary"
        />
        <CustomButton
          name="Import New"
          onClick={() => setShowTable(false)}
          type="tertiary"
        />
        <CustomButton
          name="Import Data"
          onClick={handleImportData}
          type="primary"
        />
      </DialogActions>
    </Dialog>
  );
};

export default ONOFFImportWidget;
