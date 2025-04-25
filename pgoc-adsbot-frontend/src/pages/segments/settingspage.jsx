import React, { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { getUserData } from "../../services/user_data.js";
import axios from "axios";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";
import CancelIcon from "@mui/icons-material/Cancel";

const apiUrl = import.meta.env.VITE_API_URL;

const SettingsPage = () => {
  const { id: user_id } = getUserData();
  const [campaignCodes, setCampaignCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [openDialog, setOpenDialog] = useState(false); // State for Dialog visibility
  const [selectedCodeId, setSelectedCodeId] = useState(null); // Selected code ID to delete

  useEffect(() => {
    if (user_id) {
      fetchCampaignCodes(user_id); // initial load

      const interval = setInterval(() => {
        fetchCampaignCodes(user_id); // refresh every 10s
      }, 10000);

      return () => clearInterval(interval); // clean up when component unmounts
    }
  }, [user_id]);

  const fetchCampaignCodes = async (uid) => {
    try {
      const res = await axios.get(
        `${apiUrl}/api/v1/user/${uid}/campaign-codes`
      );
      setCampaignCodes(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch campaign codes:", err);
    }
  };

  const handleAddCode = async () => {
    const { id } = getUserData();

    if (!id || !newCode) {
      alert("Please provide both user ID and campaign code.");
      return;
    }

    const jsonBody = {
      user_id: id,
      campaign_code: newCode,
    };

    try {
      await axios.post(
        `${apiUrl}/api/v1/user/campaign-codes`,
        jsonBody,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      setNewCode("");
      fetchCampaignCodes(id); // Refresh the campaign codes
    } catch (err) {
      console.error("Failed to add campaign code:", err);
    }
  };

  // Function to handle editing of a row (via DynamicTable)
  const handleEditRow = async (updatedRow) => {
    const { id: userId } = getUserData();
    const originalRow = campaignCodes.find((row) => row.id === updatedRow.id);

    if (originalRow && originalRow.campaign_code === updatedRow.campaign_code) {
      console.log("No changes detected, skipping update for row ID:", updatedRow.id);
      return;
    }

    const payload = {
      user_id: userId,
      campaign_code: updatedRow.campaign_code,
    };

    try {
      await axios.put(
        `${apiUrl}/api/v1/user/campaign-codes/${updatedRow.id}`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      console.log("Campaign code updated:", updatedRow);
      fetchCampaignCodes(userId); // Refresh the table
    } catch (err) {
      console.error(`Failed to update campaign code for ID ${updatedRow.id}:`, err);
    }
  };

  // Handle the delete of a campaign code
  const handleDeleteCode = async (codeId) => {
    const { id: userId } = getUserData();

    try {
      // Make DELETE request
      await axios.delete(
        `${apiUrl}/api/v1/user/campaign-codes/${codeId}?user_id=${userId}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Campaign code deleted:", codeId);
      fetchCampaignCodes(userId); // Refresh the campaign codes
    } catch (err) {
      console.error(`Failed to delete campaign code with ID ${codeId}:`, err);
    }

    // Close the confirmation dialog after deletion
    setOpenDialog(false);
    setSelectedCodeId(null);
  };

  const handleOpenDialog = (codeId) => {
    setSelectedCodeId(codeId); // Store the code ID to delete
    setOpenDialog(true); // Open the dialog
  };

  const handleCloseDialog = () => {
    setOpenDialog(false); // Close the dialog
    setSelectedCodeId(null); // Reset the selected code ID
  };

  const customRenderers = useMemo(
    () => ({
      // Custom renderer for the "Actions" column
      Actions: (value, row) => (
        <IconButton
          onClick={() => handleOpenDialog(row.id)} // Open dialog when delete icon is clicked
          color="error"
        >
          <CancelIcon />
        </IconButton>
      ),
    }),
    []
  );

  return (
    <Box>
      <h2>Campaign Codes</h2>
      <Box display="flex" gap={2} mb={2}>
        <TextField
          label="New Campaign Code"
          value={newCode}
          onChange={(e) => {
            setNewCode(e.target.value);
          }}
          inputProps={{ maxLength: 5 }} // Limit to 5 characters only
          helperText="Up to 5 characters"
        />
        <Button variant="contained" onClick={handleAddCode}>
          Save
        </Button>
      </Box>
      <WidgetCard title="Main Section" height="95.5%">
        <DynamicTable
          headers={["campaign_code", "Actions"]} // Adding a column for actions (delete)
          data={campaignCodes}
          onDataChange={(updatedData) => {
            // Update the local state (UI)
            setCampaignCodes(updatedData);

            // Send the updated data to the backend
            updatedData.forEach((row) => handleEditRow(row));
          }}
          rowsPerPage={8}
          compact={true}
          customRenderers={customRenderers}
          nonEditableHeaders={"Actions"}
        />
      </WidgetCard>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <p>Are you sure you want to delete this campaign code?</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteCode(selectedCodeId)}
            color="secondary"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPage;
