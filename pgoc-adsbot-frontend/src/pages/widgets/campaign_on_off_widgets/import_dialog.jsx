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

const REQUIRED_HEADERS = [
  "ad_account_id",
  "access_token",
  "time",
  "cpp_metric",
  "on_off",
  "watch",
];

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

  const validateCSVHeaders = (headers) => {
    return REQUIRED_HEADERS.every((header) => headers.includes(header));
  };

  const parseCSV = (file) => {
    Papa.parse(file, {
      complete: (result) => {
        if (result.data.length > 1) {
          const headers = result.data[0].map((h) => h.trim());

          if (!validateCSVHeaders(headers)) {
            setErrorMessage(
              "Invalid CSV headers. The file must contain 'ad_account_id', 'access_token', 'time', 'cpp_metric', 'watch', and 'on_off'."
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

            return rowData;
          });

          setTableHeaders(headers);
          setTableData(processedData);
          setShowTable(true);
          setErrorMessage("");
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
        "access_token",
        "time",
        "campaign_type",
        "cpp_metric",
        "on_off",
        "watch",
      ],
      [
        "SAMPLE_AD_ACCOUNT_ID",
        "SAMPLE_ACCESS_TOKEN",
        "00:00",
        "REGULAR",
        "0",
        "ON",
        "Campaigns",
      ],
      [
        "ANOTHER_AD_ACCOUNT",
        "ANOTHER_ACCESS_TOKEN",
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
      const ad_account_id = row["ad_account_id"];
      const access_token = row["access_token"];
      const time = row["time"];
      const campaign_type = row["campaign_type"] || "";
      const cpp_metric = row["cpp_metric"] || "";
      const on_off = row["on_off"] || "";
      const watch = row["watch"] || "";

      if (!ad_account_id || !access_token || !time || !on_off || !watch) {
        return;
      }

      const key = `${ad_account_id}_${access_token}`;

      if (!processedDataMap.has(key)) {
        processedDataMap.set(key, {
          ad_account_id,
          user_id: id,
          access_token,
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

export default ONOFFImportWidget;
