import React, { useState } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DynamicTable from "../../components/dynamic_table";
import CustomButton from "../../components/buttons";
import { getUserData } from "../../../services/user_data";

const REQUIRED_HEADERS = ["ad_account_id", "access_token"];

const CampaignNameImportWidget = ({
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

  const validateCSVHeaders = (headers) => {
    // Required fixed headers
    const REQUIRED_HEADERS = [
      "ad_account_id",
      "access_token",
      "time",
      "campaign_name",
      "on_off",
    ];

    // Check if all required headers are present
    return REQUIRED_HEADERS.every((header) => headers.includes(header));
  };

  const parseCSV = (file) => {
    Papa.parse(file, {
      complete: (result) => {
        if (result.data.length > 0) {
          const headers = result.data[0].map((h) => h.trim());

          if (!validateCSVHeaders(headers)) {
            setErrorMessage(
              "Invalid CSV headers. The file must contain 'ad_account_id', 'access_token', 'time', 'campaign_name', and 'on_off'."
            );
            setShowTable(false);
            return;
          }

          // Process CSV Data
          const processedData = result.data.slice(1).map((row) => {
            let rowData = headers.reduce((acc, header, index) => {
              acc[header] = row[index] ? row[index].trim() : "";
              return acc;
            }, {});

            // Ensure time is always in HH:MM format with leading zero
            if (rowData["time"]) {
              let [hour, minute] = rowData["time"].slice(0, 5).split(":");
              rowData["time"] = `${hour.padStart(2, "0")}:${minute.padStart(
                2,
                "0"
              )}`;
            }

            return rowData;
          });

          setTableHeaders(headers);
          setTableData(processedData);
          setShowTable(true);
          setErrorMessage("");
        }
      },
      header: false,
      skipEmptyLines: true,
    });
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "text/csv") {
      setSelectedFile(file);
      parseCSV(file);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === "text/csv") {
      setSelectedFile(file);
      parseCSV(file);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };
  const handleDownloadTemplate = () => {
    const sampleData = [
      ["ad_account_id", "access_token", "time", "campaign_name", "on_off"],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_ACCESS_TOKEN",
        "00:00",
        "Campaign A / Campaign B",
        "ON",
      ],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_ACCESS_TOKEN",
        "01:00",
        "Campaign C / Campaign D",
        "OFF",
      ],
      [
        "ANOTHER_AD_ACCOUNT",
        "ANOTHER_ACCESS_TOKEN",
        "02:30",
        "Campaign X / Campaign Y",
        "ON",
      ],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      sampleData.map((row) => row.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Campaign_Schedule_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = () => {
    const processedDataMap = new Map();
    const { id } = getUserData();

    tableData.forEach((row) => {
      const ad_account_id = row["ad_account_id"];
      const access_token = row["access_token"];
      let time = row["time"] ? row["time"].slice(0, 5) : ""; // Ensure HH:MM format

      if (time) {
        const [hour, minute] = time.split(":");
        time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`; // Ensure leading zeros
      }

      const campaign_name_raw = row["campaign_name"] || "";
      const on_off = row["on_off"] || "";

      const key = `${ad_account_id}_${access_token}`;

      // Ensure campaign_name is always an array
      const campaign_name = campaign_name_raw
        .split("/")
        .map((name) => name.trim())
        .filter((name) => name); // Remove empty strings

      if (!processedDataMap.has(key)) {
        processedDataMap.set(key, {
          ad_account_id,
          user_id: id,
          access_token,
          schedule_data: [],
        });
      }

      if (time && campaign_name.length > 0 && on_off) {
        processedDataMap
          .get(key)
          .schedule_data.push({ time, campaign_name, on_off });
      }
    });

    const processedData = Array.from(processedDataMap.values());

    console.log("Processed Data:", JSON.stringify(processedData));

    // Pass data to parent component
    onImportComplete(processedData);

    // Close the dialog
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
            onDataChange={handleTableDataChange}
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

export default CampaignNameImportWidget;
