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
  Divider,
  Typography,
} from "@mui/material";
import { getUserData } from "../../services/user_data.js";
import axios from "axios";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";
import CancelIcon from "@mui/icons-material/Cancel";

const apiUrl = import.meta.env.VITE_API_URL;

const SettingsPage = () => {
  const userData = getUserData();
  const { id: user_id, user_level, user_role } = userData;
  const [campaignCodes, setCampaignCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [openDialog, setOpenDialog] = useState(false); 
  const [selectedCodeId, setSelectedCodeId] = useState(null); 
  
  // Access Token States
  const [accessTokens, setAccessTokens] = useState([]);
  const [newAccessToken, setNewAccessToken] = useState("");
  
  // New state for access token deletion dialog
  const [openTokenDialog, setOpenTokenDialog] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState(null);

  // Check if user is superadmin
  const isSuperAdmin = user_role === "superadmin";
  
  // Determine if access token management should be visible (must be superadmin regardless of level)
  const showAccessTokenManagement = isSuperAdmin && user_level !== 3;

  useEffect(() => {
    if (user_id) {
      fetchCampaignCodes(user_id);
      // Only fetch access tokens if the user has permission to see them
      if (showAccessTokenManagement) {
        fetchAccessTokens(user_id);
      }
      const interval = setInterval(() => {
        fetchCampaignCodes(user_id);
        // Only fetch access tokens if the user has permission to see them
        if (showAccessTokenManagement) {
          fetchAccessTokens(user_id);
        }
      }, 10000);
  
      return () => clearInterval(interval);
    }
  }, [user_id, showAccessTokenManagement]);

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

  // NEW: Handle deletion of access token
  const handleDeleteToken = async (tokenId) => {
    const { id: userId } = getUserData();

    try {
      // Make DELETE request for access token
      await axios.delete(
        `${apiUrl}/api/v1/user/access-tokens/${tokenId}?user_id=${userId}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Access token deleted:", tokenId);
      fetchAccessTokens(userId); // Refresh the access tokens list
    } catch (err) {
      console.error(`Failed to delete access token with ID ${tokenId}:`, err);
    }

    // Close the confirmation dialog after deletion
    setOpenTokenDialog(false);
    setSelectedTokenId(null);
  };

  // Open dialog handlers for campaign codes
  const handleOpenDialog = (codeId) => {
    setSelectedCodeId(codeId);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedCodeId(null);
  };

  // NEW: Open dialog handlers for access tokens
  const handleOpenTokenDialog = (tokenId) => {
    setSelectedTokenId(tokenId);
    setOpenTokenDialog(true);
  };

  const handleCloseTokenDialog = () => {
    setOpenTokenDialog(false);
    setSelectedTokenId(null);
  };

  const handleAddAccessToken = async () => {
    const { id: userId } = getUserData();
  
    if (!userId || !newAccessToken) {
      alert("Please provide a valid access token.");
      return;
    }
  
    const payload = {
      user_id: userId,
      access_token: newAccessToken,
      // Optionally: facebook_name: 'Example Name'  // Add this if your UI allows input
    };
  
    try {
      await axios.post(`${apiUrl}/api/v1/user/access-tokens`, payload, {
        headers: { "Content-Type": "application/json" },
      });
  
      setNewAccessToken("");
      fetchAccessTokens(userId); // refresh the list
    } catch (err) {
      console.error("Failed to add access token:", err);
    }
  };

  // NEW: Function to handle editing access token rows
  const handleEditAccessToken = async (updatedRow) => {
    const { id: userId } = getUserData();
    const originalRow = accessTokens.find((row) => row.id === updatedRow.id);

    // Check if actual changes were made
    if (originalRow && 
        originalRow.access_token === updatedRow.access_token &&
        originalRow.facebook_name === updatedRow.facebook_name) {
      console.log("No changes detected in access token, skipping update for row ID:", updatedRow.id);
      return;
    }

    const payload = {
      user_id: userId,
      access_token: updatedRow.access_token,
      facebook_name: updatedRow.facebook_name || ""
    };

    try {
      await axios.put(
        `${apiUrl}/api/v1/user/access-tokens/${updatedRow.id}`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      console.log("Access token updated:", updatedRow);
      fetchAccessTokens(userId); // Refresh the table
    } catch (err) {
      console.error(`Failed to update access token for ID ${updatedRow.id}:`, err);
    }
  };

  const fetchAccessTokens = async (uid) => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/user/${uid}/access-tokens`);
      console.log("Access tokens API response:", res.data);
      if (res.data && res.data.data) {
        setAccessTokens(res.data.data);
        console.log("Access tokens after setting state:", res.data.data);
      } else {
        console.error("Unexpected API response format:", res.data);
        setAccessTokens([]);
      }
    } catch (err) {
      console.error("Failed to fetch access tokens:", err);
      setAccessTokens([]);
    }
  };

  const customRenderers = useMemo(
    () => ({
      // Custom renderer for the "Actions" column
      Actions: (value, row) => (
        <IconButton
          onClick={() => handleOpenDialog(row.id)}
          color="error"
        >
          <CancelIcon />
        </IconButton>
      ),
    }),
    []
  );

  // Access Token custom renderer - UPDATED to use handleOpenTokenDialog
  const accessTokenRenderers = useMemo(
    () => ({
      // Custom renderer for the "Actions" column - Now connects to the delete function
      Actions: (value, row) => (
        <IconButton
          onClick={() => handleOpenTokenDialog(row.id)}
          color="error"
        >
          <CancelIcon />
        </IconButton>
      ),
      // Format the expiring_at date
      expiring_at: (value) => (
        value ? new Date(value).toLocaleString() : 'N/A'
      ),
      // Show yes/no for is_expire
      is_expire: (value) => (
        value ? 'Yes' : 'No'
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
          inputProps={{ maxLength: 10 }} // Limit to 10 characters
          helperText="Up to 10 characters"
        />
        <Button variant="contained" onClick={handleAddCode}>
          Save
        </Button>
      </Box>
      <WidgetCard title="Campaign Codes" height="auto" mb={4}>
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

      {/* Access Tokens Section - Only visible to superadmins with proper level */}
      {showAccessTokenManagement && (
        <>
          <Divider sx={{ my: 4 }} />
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">Access Tokens</Typography>
            <Box display="flex" gap={2}>
              <TextField
                label="New Access Token"
                value={newAccessToken}
                onChange={(e) => setNewAccessToken(e.target.value)}
                sx={{ width: '300px' }}
              />
              <Button variant="contained" onClick={handleAddAccessToken}>
                Save
              </Button>
            </Box>
          </Box>
          <WidgetCard title="Access Token Management" height="auto">
            <DynamicTable
              headers={["access_token", "facebook_name", "is_expire", "expiring_at", "Actions"]}
              data={accessTokens}
              onDataChange={(updatedData) => {
                // Update the local state (UI)
                setAccessTokens(updatedData);
                
                // Send updated data to backend
                updatedData.forEach((row) => handleEditAccessToken(row));
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={accessTokenRenderers}
              nonEditableHeaders={"access_token,facebook_name,Actions,is_expire,expiring_at"}
            />
            {accessTokens.length === 0 && (
              <Typography 
                variant="body1" 
                sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}
              >
                No access tokens found. Add a new token using the form above.
              </Typography>
            )}
          </WidgetCard>
        </>
      )}

      {/* Delete Confirmation Dialog for Campaign Codes */}
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

      {/* NEW: Delete Confirmation Dialog for Access Tokens */}
      <Dialog open={openTokenDialog} onClose={handleCloseTokenDialog}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <p>Are you sure you want to delete this access token?</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTokenDialog} color="primary">
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteToken(selectedTokenId)}
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