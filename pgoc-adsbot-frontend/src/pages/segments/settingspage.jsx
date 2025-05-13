import React, { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import {
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Tabs,
  Tab,
  Paper,
} from "@mui/material";
import { getUserData } from "../../services/user_data.js";
import axios from "axios";
import DynamicTable from "../components/dynamic_table";
import WidgetCard from "../components/widget_card.jsx";
import CancelIcon from "@mui/icons-material/Cancel";
import FolderIcon from "@mui/icons-material/Folder";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import PeopleIcon from "@mui/icons-material/People";

const apiUrl = import.meta.env.VITE_API_URL;

// TabPanel component for handling tab content
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
      style={{ padding: '24px 0' }}
    >
      {value === index && children}
    </div>
  );
}

const SettingsPage = () => {
  const userData = getUserData();
  const { id: user_id, user_level, user_role } = userData;
  const [activeTab, setActiveTab] = useState(0);
  
  // Campaign Codes States
  const [campaignCodes, setCampaignCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [openDialog, setOpenDialog] = useState(false); 
  const [selectedCodeId, setSelectedCodeId] = useState(null); 
  
  // Access Token States
  const [accessTokens, setAccessTokens] = useState([]);
  const [newAccessToken, setNewAccessToken] = useState("");
  const [openTokenDialog, setOpenTokenDialog] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState(null);

  // User Relationships States
  const [relationships, setRelationships] = useState([]);
  const [openRelationshipDialog, setOpenRelationshipDialog] = useState(false);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState(null);

  // Check if user is superadmin with user_level 1
  const isSuperAdmin = user_role === "superadmin";
  const isLevel1 = user_level === 1;
  
  // Only superadmins with user_level 1 can view and manage access tokens and relationships
  const canAccessTokenSection = isSuperAdmin && isLevel1;

  useEffect(() => {
    if (user_id) {
      fetchCampaignCodes(user_id);
      
      // Only fetch access tokens and relationships if user is superadmin with user_level 1
      if (canAccessTokenSection) {
        fetchAccessTokens();
        fetchRelationships();
      }
      
      const interval = setInterval(() => {
        // Only refresh data for the active tab to save resources
        if (activeTab === 0) {
          fetchCampaignCodes(user_id);
        } else if (canAccessTokenSection && activeTab === 1) {
          fetchAccessTokens();
        } else if (canAccessTokenSection && activeTab === 2) {
          fetchRelationships();
        }
      }, 10000);
  
      return () => clearInterval(interval);
    }
  }, [user_id, canAccessTokenSection, activeTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    
    // Fetch data when switching to a tab
    if (newValue === 0) {
      fetchCampaignCodes(user_id);
    } else if (canAccessTokenSection && newValue === 1) {
      fetchAccessTokens();
    } else if (canAccessTokenSection && newValue === 2) {
      fetchRelationships();
    }
  };

  const fetchCampaignCodes = async (uid) => {
    try {
      const res = await axios.get(
        `${apiUrl}/api/v1/user/${uid}/campaign-codes`
      );
      setCampaignCodes(res.data.data || []);
    } catch (err) {
      // console.error("Failed to fetch campaign codes:", err);
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
      // console.error("Failed to add campaign code:", err);
    }
  };

  // Function to handle editing of a row (via DynamicTable)
  const handleEditRow = async (updatedRow) => {
    const { id: userId } = getUserData();
    const originalRow = campaignCodes.find((row) => row.id === updatedRow.id);

    if (originalRow && originalRow.campaign_code === updatedRow.campaign_code) {
      // console.log("No changes detected, skipping update for row ID:", updatedRow.id);
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
      // console.log("Campaign code updated:", updatedRow);
      fetchCampaignCodes(userId); // Refresh the table
    } catch (err) {
      // console.error(`Failed to update campaign code for ID ${updatedRow.id}:`, err);
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
      // console.log("Campaign code deleted:", codeId);
      fetchCampaignCodes(userId); // Refresh the campaign codes
    } catch (err) {
      // console.error(`Failed to delete campaign code with ID ${codeId}:`, err);
    }

    // Close the confirmation dialog after deletion
    setOpenDialog(false);
    setSelectedCodeId(null);
  };

  // Handle deletion of access token
  const handleDeleteToken = async (tokenId) => {
    const { id: userId } = getUserData();

    try {
      // Make DELETE request for access token - still need user_id for permission check
      await axios.delete(
        `${apiUrl}/api/v1/user/access-tokens/${tokenId}?user_id=${userId}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      // console.log("Access token deleted:", tokenId);
      fetchAccessTokens(); // Refresh the access tokens list
    } catch (err) {
      // console.error(`Failed to delete access token with ID ${tokenId}:`, err);
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

  // Open dialog handlers for access tokens
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

    if (!newAccessToken) {
      alert("Please provide a valid access token.");
      return;
    }
  
    const payload = {
      user_id: userId,
      access_token: newAccessToken,
    };
  
    try {
      const response = await axios.post(`${apiUrl}/api/v1/user/access-tokens`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.data && response.data.message) {
        // console.log("Success:", response.data.message);
        setNewAccessToken("");
        fetchAccessTokens(); // refresh the list
      }
    } catch (err) {
      // console.error("Failed to add access token:", err);
      const errorMessage = err.response?.data?.error || "Failed to add access token. Please try again.";
      alert(errorMessage);
    }
  };

  // Function to handle editing access token rows
  const handleEditAccessToken = async (updatedRow) => {
    const { id: userId } = getUserData();
    const originalRow = accessTokens.find((row) => row.id === updatedRow.id);

    // Check if actual changes were made
    if (originalRow && 
        originalRow.access_token === updatedRow.access_token &&
        originalRow.facebook_name === updatedRow.facebook_name) {
      // console.log("No changes detected in access token, skipping update for row ID:", updatedRow.id);
      return;
    }

    const payload = {
      user_id: userId, // Still need user_id for permission checks only
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
      // console.log("Access token updated:", updatedRow);
      fetchAccessTokens(); // Refresh the table
    } catch (err) {
      // console.error(`Failed to update access token for ID ${updatedRow.id}:`, err);
    }
  };

  // Fetch all access tokens
  const fetchAccessTokens = async () => {
    try {
      // Get the user_id for authentication/permission checks
      const { id } = getUserData();
      
      const res = await axios.get(`${apiUrl}/api/v1/user/${id}/access-tokens`);
      // console.log("Access tokens API response:", res.data);
      if (res.data && res.data.data) {
        setAccessTokens(res.data.data);
        // console.log("Access tokens after setting state:", res.data.data);
      } else {
        // console.error("Unexpected API response format:", res.data);
        setAccessTokens([]);
      }
    } catch (err) {
      // console.error("Failed to fetch access tokens:", err);
      setAccessTokens([]);
    }
  };

  // Fetch user relationships
  const fetchRelationships = async () => {
    try {
      const userData = getUserData();
      const res = await axios.get(`${apiUrl}/api/v1/user/relationships?superadmin_id=${userData.id}`, {
        headers: {
          "Content-Type": "application/json",
          "skip_zrok_interstitial": "true"
        }
      });
      setRelationships(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch relationships:", err);
    }
  };

  // Handle relationship deletion
  const handleDeleteRelationship = async (relationshipId) => {
    try {
      const userData = getUserData();
      await axios.delete(
        `${apiUrl}/api/v1/user/relationships/${relationshipId}?superadmin_id=${userData.id}`,
        {
          headers: {
            "Content-Type": "application/json",
            "skip_zrok_interstitial": "true"
          },
        }
      );
      fetchRelationships(); // Refresh the relationships list
    } catch (err) {
      console.error(`Failed to delete relationship with ID ${relationshipId}:`, err);
    }

    // Close the confirmation dialog after deletion
    setOpenRelationshipDialog(false);
    setSelectedRelationshipId(null);
  };

  // Open dialog handlers for relationships
  const handleOpenRelationshipDialog = (relationshipId) => {
    setSelectedRelationshipId(relationshipId);
    setOpenRelationshipDialog(true);
  };

  const handleCloseRelationshipDialog = () => {
    setOpenRelationshipDialog(false);
    setSelectedRelationshipId(null);
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

  // Access Token custom renderer
  const accessTokenRenderers = useMemo(
    () => ({
      // Custom renderer for the "Actions" column for deleting tokens
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

  // Relationship custom renderer
  const relationshipRenderers = useMemo(
    () => ({
      // Custom renderer for the "Actions" column
      Actions: (value, row) => (
        <IconButton
          onClick={() => handleOpenRelationshipDialog(row.id)}
          color="error"
        >
          <CancelIcon />
        </IconButton>
      ),
      // Format the created_at date
      created_at: (value) => (
        value ? new Date(value).toLocaleString() : 'N/A'
      ),
    }),
    []
  );

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Settings</Typography>
      
      <Paper elevation={2} sx={{ mb: 4 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            label="Campaign Codes" 
            icon={<FolderIcon />} 
            iconPosition="start" 
          />
          {canAccessTokenSection && (
            <Tab 
              label="Access Tokens" 
              icon={<VpnKeyIcon />} 
              iconPosition="start" 
            />
          )}
          {canAccessTokenSection && (
            <Tab 
              label="User Relationships" 
              icon={<PeopleIcon />} 
              iconPosition="start" 
            />
          )}
        </Tabs>

        {/* Campaign Codes Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ px: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Manage Campaign Codes</Typography>
              <Box display="flex" gap={2}>
                <TextField
                  label="New Campaign Code"
                  value={newCode}
                  onChange={(e) => {
                    setNewCode(e.target.value);
                  }}
                  inputProps={{ maxLength: 10 }}
                  helperText="Up to 10 characters"
                  sx={{ width: '300px' }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleAddCode}
                  sx={{ height: '56px' }}
                >
                  Save
                </Button>
              </Box>
            </Box>
            <DynamicTable
              headers={["campaign_code", "Actions"]}
              data={campaignCodes}
              onDataChange={(updatedData) => {
                setCampaignCodes(updatedData);
                updatedData.forEach((row) => handleEditRow(row));
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={customRenderers}
              nonEditableHeaders={"Actions"}
            />
            {campaignCodes.length === 0 && (
              <Typography 
                variant="body1" 
                sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}
              >
                No campaign codes found. Add a new code using the form above.
              </Typography>
            )}
          </Box>
        </TabPanel>

        {/* Access Tokens Tab */}
        {canAccessTokenSection && (
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ px: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Manage Access Tokens</Typography>
                <Box display="flex" gap={2}>
                  <TextField
                    label="New Access Token"
                    value={newAccessToken}
                    onChange={(e) => setNewAccessToken(e.target.value)}
                    sx={{ width: '300px' }}
                  />
                  <Button 
                    variant="contained" 
                    onClick={handleAddAccessToken}
                    sx={{ height: '56px' }}
                  >
                    Save
                  </Button>
                </Box>
              </Box>
              <DynamicTable
                headers={["facebook_name", "access_token", "is_expire", "expiring_at", "Actions"]}
                data={accessTokens}
                onDataChange={(updatedData) => {
                  setAccessTokens(updatedData);
                  updatedData.forEach((row) => handleEditAccessToken(row));
                }}
                rowsPerPage={8}
                compact={true}
                customRenderers={accessTokenRenderers}
                nonEditableHeaders={"facebook_name,access_token,Actions,is_expire,expiring_at"}
              />
              {accessTokens.length === 0 && (
                <Typography 
                  variant="body1" 
                  sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}
                >
                  No access tokens found. Add a new token using the form above.
                </Typography>
              )}
            </Box>
          </TabPanel>
        )}

        {/* User Relationships Tab */}
        {canAccessTokenSection && (
          <TabPanel value={activeTab} index={2}>
            <Box sx={{ px: 3 }}>
              <Typography variant="h6" mb={2}>User Management</Typography>
              <DynamicTable
                headers={["client_name", "client_email", "client_role", "created_at", "Actions"]}
                data={relationships}
                rowsPerPage={8}
                compact={true}
                customRenderers={relationshipRenderers}
                nonEditableHeaders={"client_name,client_email,client_role,created_at,Actions"}
              />
              {relationships.length === 0 && (
                <Typography 
                  variant="body1" 
                  sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}
                >
                  No user relationships found.
                </Typography>
              )}
            </Box>
          </TabPanel>
        )}
      </Paper>

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

      {/* Delete Confirmation Dialog for Access Tokens */}
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

      {/* Delete Confirmation Dialog for Relationships */}
      <Dialog open={openRelationshipDialog} onClose={handleCloseRelationshipDialog}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <p>Are you sure you want to delete this user relationship?</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRelationshipDialog} color="primary">
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteRelationship(selectedRelationshipId)}
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