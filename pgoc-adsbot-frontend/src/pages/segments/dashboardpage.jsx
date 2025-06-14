import React, { useState } from "react";
import Box from "@mui/material/Box";
import { Typography, Tabs, Tab, Paper, Switch, TextField, Button, CircularProgress } from "@mui/material";
import CampaignIcon from "@mui/icons-material/Campaign";
import ViewListIcon from "@mui/icons-material/ViewList";
import TabIcon from '@mui/icons-material/Tab';
import { getUserData } from "../../services/user_data";
import DynamicTable from "../components/dynamic_table";
import axios from "axios";

const apiUrl = import.meta.env.VITE_API_URL;

// TabPanel component for handling tab content
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
      style={{ padding: '24px 0' }}
    >
      {value === index && children}
    </div>
  );
}

const DashboardPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const userData = getUserData();
  const { id: user_id } = userData;

  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for table data
  const [campaigns, setCampaigns] = useState([]);

  const [adSets, setAdSets] = useState([
    { id: 1, name: 'Ad Set 1', status: true, delivery: 'Active' },
    { id: 2, name: 'Ad Set 2', status: false, delivery: 'Off' },
    { id: 3, name: 'Ad Set 3', status: true, delivery: 'Active' },
  ]);

  const [ads, setAds] = useState([
    { id: 1, name: 'Ad 1', status: false, delivery: 'Off' },
    { id: 2, name: 'Ad 2', status: true, delivery: 'Active' },
    { id: 3, name: 'Ad 3', status: false, delivery: 'Off' },
  ]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${apiUrl}/api/v1/dashboard/fetch`, {
        user_id: user_id || "dummy_user_id",
        access_token: accessToken,
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      if (!response.data || !response.data.dashboard_data || !response.data.dashboard_data.campaigns) {
        throw new Error("Invalid response format from server");
      }

      const fetchedCampaigns = response.data.dashboard_data.campaigns.map(campaign => ({
        id: campaign.campaign_id,
        name: campaign.campaign_name,
        status: campaign.status === 'ACTIVE',
        delivery: campaign.status,
      }));
      setCampaigns(fetchedCampaigns);
    } catch (err) {
      console.error("Failed to fetch ad spend data:", err);
      setError(err.response?.data?.error || err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  // Handler for toggling status
  const handleToggleStatus = (id, currentData, setterFunction) => {
    setterFunction(currentData.map(item => 
      item.id === id ? { ...item, status: !item.status } : item
    ));
  };

  // Custom renderers for the tables
  const customRenderers = {
    "Off / On": (value, row) => (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Switch
          checked={row.status}
          onChange={() => {
            if (activeTab === 0) {
              handleToggleStatus(row.id, campaigns, setCampaigns);
            } else if (activeTab === 1) {
              handleToggleStatus(row.id, adSets, setAdSets);
            } else if (activeTab === 2) {
              handleToggleStatus(row.id, ads, setAds);
            }
          }}
          color="primary"
        />
      </Box>
    ),
    "Campaign": (value, row) => row.name,
    "Ad Set": (value, row) => row.name,
    "Ad": (value, row) => row.name,
    "Delivery": (value, row) => row.delivery,
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>

      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          label="Facebook Access Token"
          variant="outlined"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
        <Button 
          variant="contained" 
          onClick={fetchData} 
          disabled={loading || !accessToken}
          sx={{ height: '56px' }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : "Fetch Data"}
        </Button>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          Error: {error}
        </Typography>
      )}
      
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
            label="Campaigns" 
            icon={<CampaignIcon />} 
            iconPosition="start" 
          />
          <Tab 
            label="Ad Sets" 
            icon={<ViewListIcon />} 
            iconPosition="start" 
          />
          <Tab 
            label="Ads" 
            icon={<TabIcon />} 
            iconPosition="start" 
          />
        </Tabs>

        {/* Campaigns Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ px: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Campaigns Overview</Typography>
            <DynamicTable
              headers={["Off / On", "Campaign", "Delivery"]}
              data={campaigns}
              onDataChange={(updatedData) => {
                setCampaigns(updatedData);
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={customRenderers}
              nonEditableHeaders={"Off / On,Camapaign,Delivery"}
              showCheckbox={true}
            />
          </Box>
        </TabPanel>

        {/* Ad Sets Tab */}
        <TabPanel value={activeTab} index={1}>
          <Box sx={{ px: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Ad Sets Overview</Typography>
            <DynamicTable
              headers={["Off / On", "Ad Set", "Delivery"]}
              data={adSets}
              onDataChange={(updatedData) => {
                setAdSets(updatedData);
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={customRenderers}
              nonEditableHeaders={"Off / On,Delivery"}
              showCheckbox={true}
            />
          </Box>
        </TabPanel>

        {/* Ads Tab */}
        <TabPanel value={activeTab} index={2}>
          <Box sx={{ px: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Ads Overview</Typography>
            <DynamicTable
              headers={["Off / On", "Ad", "Delivery"]}
              data={ads}
              onDataChange={(updatedData) => {
                setAds(updatedData);
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={customRenderers}
              nonEditableHeaders={"Off / On,Delivery"}
              showCheckbox={true}
            />
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default DashboardPage;
