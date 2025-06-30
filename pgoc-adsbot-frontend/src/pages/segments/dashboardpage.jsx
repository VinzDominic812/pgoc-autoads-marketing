import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import { Typography, Tabs, Tab, Paper, Switch, TextField, Button, CircularProgress, MenuItem, Select, FormControl, InputLabel } from "@mui/material";
import CampaignIcon from "@mui/icons-material/Campaign";
import ViewListIcon from "@mui/icons-material/ViewList";
import TabIcon from '@mui/icons-material/Tab';
import RefreshIcon from "@mui/icons-material/Refresh";
import { getUserData } from "../../services/user_data";
import DynamicTable from "../components/dynamic_table";
import axios from "axios";
import notify from "../components/toast.jsx";

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
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [campaigns, setCampaigns] = useState([]);

  const [adSets, setAdSets] = useState([]);

  const [ads, setAds] = useState([]);

  // Add useEffect for automatic fetch
  useEffect(() => {
    if (accessToken && accessToken.length >= 100 && !loading) {
      fetchData();
    }
  }, [accessToken]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const fetchData = async () => {
    if (!accessToken) {
      notify("Please enter an access token", "error");
      return;
    }

    if (accessToken.length < 100) {
      notify("Access token seems invalid", "error");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${apiUrl}/api/v1/dashboard`, {
        user_id: user_id || "dummy_user_id",
        access_token: accessToken,
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      console.log("API Response:", response.data); // Debug log

      if (!response.data || !response.data.dashboard_data || !response.data.dashboard_data.campaigns) {
        console.error("Invalid response structure:", response.data); // Debug log
        throw new Error("Invalid response format from server");
      }

      console.log("Campaigns data:", response.data.dashboard_data.campaigns); // Debug log

      // Log first campaign structure to see what fields are available
      if (response.data.dashboard_data.campaigns.length > 0) {
        console.log("First campaign structure:", response.data.dashboard_data.campaigns[0]);
        console.log("First campaign adsets count:", response.data.dashboard_data.campaigns[0].adsets?.length || 0);
        console.log("First campaign ads count:", response.data.dashboard_data.campaigns[0].ads?.length || 0);
      }

      // Extract unique ad accounts using a Map to prevent duplicates
      const accountMap = new Map();
      response.data.dashboard_data.campaigns.forEach(campaign => {
        if (!accountMap.has(campaign.account_id)) {
          accountMap.set(campaign.account_id, {
            id: campaign.account_id,
            name: campaign.account_name
          });
        }
      });
      const accounts = Array.from(accountMap.values());
      setAdAccounts(accounts);

      // Store all campaigns
      const allCampaigns = response.data.dashboard_data.campaigns.map(campaign => ({
        id: campaign.campaign_id,
        name: campaign.campaign_name,
        status: campaign.status === 'ACTIVE',
        account_id: campaign.account_id
      }));
      setCampaigns(allCampaigns);

      // Extract ad sets from all campaigns
      const allAdSets = [];
      response.data.dashboard_data.campaigns.forEach(campaign => {
        if (campaign.adsets) {
          campaign.adsets.forEach(adset => {
            allAdSets.push({
              id: `${campaign.campaign_id}_${adset.name}`, // Create unique ID
              name: adset.name,
              status: adset.status === 'ACTIVE',
              delivery: adset.status === 'ACTIVE' ? 'Active' : 'Off',
              campaign_id: campaign.campaign_id
            });
          });
        }
      });
      setAdSets(allAdSets);
      console.log("Extracted Ad Sets:", allAdSets); // Debug log

      // Extract ads from all campaigns
      const allAds = [];
      response.data.dashboard_data.campaigns.forEach(campaign => {
        if (campaign.ads) {
          campaign.ads.forEach(ad => {
            allAds.push({
              id: `${campaign.campaign_id}_${ad.name}`, // Create unique ID
              name: ad.name,
              status: ad.status === 'ACTIVE',
              delivery: ad.status === 'ACTIVE' ? 'Active' : 'Off',
              campaign_id: campaign.campaign_id
            });
          });
        }
      });
      setAds(allAds);
      console.log("Extracted Ads:", allAds); // Debug log

      // Set first account as selected by default
      if (accounts.length > 0 && !selectedAccount) {
        setSelectedAccount(accounts[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setError(err.response?.data?.error || err.message || "Failed to fetch data");
      notify("Failed to fetch data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStopFetching = () => {
    setLoading(false);
    setAccessToken(""); // Clear the token so it becomes editable again
  };

  // Filter campaigns based on selected account
  const filteredCampaigns = campaigns.filter(campaign => campaign.account_id === selectedAccount);

  // Filter ad sets based on selected account (through campaigns)
  const filteredAdSets = adSets.filter(adset => {
    const campaign = campaigns.find(c => c.id === adset.campaign_id);
    return campaign && campaign.account_id === selectedAccount;
  });

  // Filter ads based on selected account (through campaigns)
  const filteredAds = ads.filter(ad => {
    const campaign = campaigns.find(c => c.id === ad.campaign_id);
    return campaign && campaign.account_id === selectedAccount;
  });

  // Custom renderers for the tables
  const customRenderers = {
    "Off / On": (value, row) => (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Switch
          checked={row.status}
          onChange={() => handleToggleStatus(row.id, campaigns, setCampaigns)}
          color="primary"
        />
      </Box>
    ),
    "Campaign": (value, row) => row.name,
    "Ad Set": (value, row) => row.name,
    "Ad": (value, row) => row.name,
    "Delivery": (value, row) => row.delivery
  };

  // Handler for toggling status
  const handleToggleStatus = (id, currentData, setterFunction) => {
    setterFunction(currentData.map(item => 
      item.id === id ? { ...item, status: !item.status } : item
    ));
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>

      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          label="Access Token"
          variant="outlined"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: '300px' }}
          size="small"
          disabled={accessToken && accessToken.length >= 100}
          helperText="Enter your Meta Ads Manager Access Token"
        />
        {adAccounts.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Select Ad Account</InputLabel>
            <Select
              value={selectedAccount}
              label="Select Ad Account"
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              {adAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
      {/* Refresh and Stop buttons row */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1, maxWidth: '300px' }}>
        <Button
          variant="contained"
          onClick={fetchData}
          disabled={!accessToken || accessToken.length < 100 || loading}
          sx={{ height: '32px', minWidth: '140px', whiteSpace: 'nowrap' }}
          startIcon={!loading ? <RefreshIcon /> : undefined}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : "Refresh"}
        </Button>
        <Button
          variant="contained"
          onClick={handleStopFetching}
          disabled={!accessToken || loading}
          sx={{ height: '32px', minWidth: '140px', backgroundColor: '#F44336', '&:hover': { backgroundColor: '#D32F2F' }, whiteSpace: 'nowrap' }}
        >
          Stop
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
              headers={["Off / On", "Campaign"]}
              data={filteredCampaigns}
              onDataChange={(updatedData) => {
                setCampaigns(updatedData);
              }}
              rowsPerPage={10}
              compact={true}
              customRenderers={customRenderers}
              nonEditableHeaders={"Off / On,Campaign"}
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
              data={filteredAdSets}
              onDataChange={(updatedData) => {
                setAdSets(updatedData);
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={{
                "Off / On": (value, row) => (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Switch
                      checked={row.status}
                      onChange={() => handleToggleStatus(row.id, adSets, setAdSets)}
                      color="primary"
                    />
                  </Box>
                ),
                "Ad Set": (value, row) => row.name,
                "Delivery": (value, row) => row.delivery
              }}
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
              data={filteredAds}
              onDataChange={(updatedData) => {
                setAds(updatedData);
              }}
              rowsPerPage={8}
              compact={true}
              customRenderers={{
                "Off / On": (value, row) => (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Switch
                      checked={row.status}
                      onChange={() => handleToggleStatus(row.id, ads, setAds)}
                      color="primary"
                    />
                  </Box>
                ),
                "Ad": (value, row) => row.name,
                "Delivery": (value, row) => row.delivery
              }}
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
