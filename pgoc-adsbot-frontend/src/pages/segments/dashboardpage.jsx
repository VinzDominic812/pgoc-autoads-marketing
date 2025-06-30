import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  const [selectedAccount, setSelectedAccount] = useState("");
  
  // New state for access token dropdown
  const [accessTokenMap, setAccessTokenMap] = useState({});
  const [facebookNames, setFacebookNames] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [selectedFacebookName, setSelectedFacebookName] = useState("");

  // Store raw campaign data from API
  const [rawCampaignData, setRawCampaignData] = useState([]);
  
  // Track selected campaigns for filtering
  const [selectedCampaigns, setSelectedCampaigns] = useState(new Set());

  // Memoized data processing
  const processedData = useMemo(() => {
    if (!rawCampaignData.length) {
      return {
        adAccounts: [],
        campaigns: [],
        adSets: [],
        ads: []
      };
    }

    console.log("Processing data..."); // Debug log

    // Extract unique ad accounts using a Map to prevent duplicates
    const accountMap = new Map();
    const allCampaigns = [];
    const allAdSets = [];
    const allAds = [];

    rawCampaignData.forEach(campaign => {
      // Process ad accounts
      if (!accountMap.has(campaign.account_id)) {
        accountMap.set(campaign.account_id, {
          id: campaign.account_id,
          name: campaign.account_name
        });
      }

      // Process campaigns
      allCampaigns.push({
        id: campaign.campaign_id,
        name: campaign.campaign_name,
        status: campaign.status === 'ACTIVE',
        account_id: campaign.account_id,
        campaign_id: campaign.campaign_id // Ensure we have campaign_id for filtering
      });

      // Process ad sets
      if (campaign.adsets) {
        campaign.adsets.forEach((adset, index) => {
          allAdSets.push({
            id: `${campaign.campaign_id}_${index}`, // Use index instead of name for uniqueness
            name: adset.name,
            status: adset.status === 'ACTIVE',
            delivery: adset.status === 'ACTIVE' ? 'Active' : 'Off',
            campaign_id: campaign.campaign_id,
            account_id: campaign.account_id // Store account_id for faster filtering
          });
        });
      }

      // Process ads
      if (campaign.ads) {
        campaign.ads.forEach((ad, index) => {
          allAds.push({
            id: `${campaign.campaign_id}_ad_${index}`, // Use index for uniqueness
            name: ad.name,
            status: ad.status === 'ACTIVE',
            delivery: ad.status === 'ACTIVE' ? 'Active' : 'Off',
            campaign_id: campaign.campaign_id,
            account_id: campaign.account_id // Store account_id for faster filtering
          });
        });
      }
    });

    return {
      adAccounts: Array.from(accountMap.values()),
      campaigns: allCampaigns,
      adSets: allAdSets,
      ads: allAds
    };
  }, [rawCampaignData]);

  // Handle Facebook name selection
  const handleFacebookNameChange = (facebookName) => {
    setSelectedFacebookName(facebookName);
    const newAccessToken = accessTokenMap[facebookName] || "";
    setAccessToken(newAccessToken);

    // Clear previous data
    setRawCampaignData([]);
    setSelectedAccount("");
    setSelectedCampaigns(new Set());
    setError(null);
  };

  // Function to fetch access tokens from API
  const fetchAccessTokens = async () => {
    try {
      setLoadingTokens(true);
      const { id: userId } = getUserData();
      const response = await axios.get(`${apiUrl}/api/v1/user/${userId}/access-tokens`);
      
      if (response.data && response.data.data) {
        const tokenMap = {};
        const names = [];
        
        response.data.data.forEach(token => {
          if (token.facebook_name) {
            tokenMap[token.facebook_name] = token.access_token;
            names.push({
              name: token.facebook_name,
              isExpired: token.is_expire
            });
          }
        });
        
        setAccessTokenMap(tokenMap);
        setFacebookNames(names);
        
      } else {
        setFacebookNames([]);
        setAccessTokenMap({});
      }
    } catch (error) {
      console.error("Error fetching access tokens:", error);
      notify("Failed to fetch Facebook names. Please check your connection.", "error");
      setFacebookNames([]);
      setAccessTokenMap({});
    } finally {
      setLoadingTokens(false);
    }
  };

  // Memoized filtered data based on selected account and selected campaigns
  const filteredData = useMemo(() => {
    let campaigns = processedData.campaigns;
    let adSets = processedData.adSets;
    let ads = processedData.ads;

    // Filter by selected account first
    if (selectedAccount) {
      campaigns = campaigns.filter(campaign => campaign.account_id === selectedAccount);
      adSets = adSets.filter(adset => adset.account_id === selectedAccount);
      ads = ads.filter(ad => ad.account_id === selectedAccount);
    }

    // Filter ad sets and ads based on selected campaigns
    if (selectedCampaigns.size > 0) {
      adSets = adSets.filter(adset => selectedCampaigns.has(adset.campaign_id));
      ads = ads.filter(ad => selectedCampaigns.has(ad.campaign_id));
    }

    return {
      campaigns,
      adSets,
      ads
    };
  }, [processedData, selectedAccount, selectedCampaigns]);

  // Auto-fetch when a facebook account is selected
  useEffect(() => {
    if (accessToken) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Fetch access tokens when component mounts
  useEffect(() => {
    fetchAccessTokens();
  }, []);

  // Set default selected account when accounts are loaded
  useEffect(() => {
    if (processedData.adAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(processedData.adAccounts[0].id);
    }
  }, [processedData.adAccounts, selectedAccount]);

  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);

  const fetchData = useCallback(async () => {
    if (!accessToken) {
      notify("Please select a Facebook account to refresh.", "error");
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

      console.log("API Response:", response.data);

      if (!response.data || !response.data.dashboard_data || !response.data.dashboard_data.campaigns) {
        console.error("Invalid response structure:", response.data);
        throw new Error("Invalid response format from server");
      }

      // Store raw data - processing will be handled by useMemo
      setRawCampaignData(response.data.dashboard_data.campaigns);

    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setError(err.response?.data?.error || err.message || "Failed to fetch data");
      notify("Failed to fetch data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, user_id]);

  const handleStopFetching = useCallback(() => {
    setLoading(false);
    setAccessToken("");
    setSelectedFacebookName("");
  }, []);

  // Memoized toggle handlers
  const handleToggleCampaignStatus = useCallback((id) => {
    setRawCampaignData(prevData => 
      prevData.map(campaign => 
        campaign.campaign_id === id 
          ? { ...campaign, status: campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }
          : campaign
      )
    );
  }, []);

  // Handle campaign selection changes
  const handleCampaignSelectionChange = useCallback((selectedRowIds) => {
    // selectedRowIds contains the IDs of selected campaigns
    const selectedCampaignIds = new Set(selectedRowIds);
    setSelectedCampaigns(selectedCampaignIds);
    
    // Show notification about filtering
    if (selectedCampaignIds.size > 0) {
      notify(`Filtering ad sets and ads for ${selectedCampaignIds.size} selected campaign(s)`, "info");
    } else {
      notify("Showing all ad sets and ads", "info");
    }
  }, []);

  // Custom renderers for the tables - memoized to prevent re-creation
  const customRenderers = useMemo(() => ({
    "Off / On": (value, row) => (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Switch
          checked={row.status}
          onChange={() => handleToggleCampaignStatus(row.id)}
          color="primary"
        />
      </Box>
    ),
    "Campaign": (value, row) => row.name,
    "Ad Set": (value, row) => row.name,
    "Ad": (value, row) => row.name,
    "Delivery": (value, row) => row.delivery
  }), [handleToggleCampaignStatus]);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>

      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <FormControl size="small" sx={{ flexGrow: 1, maxWidth: '300px' }}>
            <InputLabel>Select Facebook Account</InputLabel>
            <Select
              value={selectedFacebookName}
              onChange={(e) => handleFacebookNameChange(e.target.value)}
              disabled={loadingTokens || loading}
              label="Select Facebook Account"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {facebookNames.map((fbAccount) => (
                <MenuItem key={fbAccount.name} value={fbAccount.name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{fbAccount.name}</span>
                    {fbAccount.isExpired && (
                      <Typography variant="caption" color="error">
                        ⚠️ Expired
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
        </FormControl>

        {processedData.adAccounts.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Select Ad Account</InputLabel>
            <Select
              value={selectedAccount}
              label="Select Ad Account"
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              {processedData.adAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1, maxWidth: '300px' }}>
        <Button
          variant="contained"
          onClick={fetchData}
          disabled={!accessToken || loading}
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

      {/* Campaign Selection Info */}
      {selectedCampaigns.size > 0 && (
        <Box sx={{ mb: 2, p: 2, backgroundColor: '#e3f2fd', borderRadius: 1 }}>
          <Typography variant="body2" color="primary">
            📊 Filtering data for {selectedCampaigns.size} selected campaign(s)
          </Typography>
        </Box>
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
            <Typography variant="h6" sx={{ mb: 2 }}>
              Campaigns Overview ({filteredData.campaigns.length})
            </Typography>
            <DynamicTable
              headers={["Off / On", "Campaign"]}
              data={filteredData.campaigns}
              onDataChange={() => {}} // Remove if not needed
              onSelectionChange={handleCampaignSelectionChange}
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
            <Typography variant="h6" sx={{ mb: 2 }}>
              Ad Sets Overview ({filteredData.adSets.length})
              {selectedCampaigns.size > 0 && (
                <Typography component="span" variant="body2" color="textSecondary" sx={{ ml: 1 }}>
                  (Filtered by selected campaigns)
                </Typography>
              )}
            </Typography>
            <DynamicTable
              headers={["Off / On", "Ad Set", "Delivery"]}
              data={filteredData.adSets}
              onDataChange={() => {}} // Remove if not needed
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
            <Typography variant="h6" sx={{ mb: 2 }}>
              Ads Overview ({filteredData.ads.length})
              {selectedCampaigns.size > 0 && (
                <Typography component="span" variant="body2" color="textSecondary" sx={{ ml: 1 }}>
                  (Filtered by selected campaigns)
                </Typography>
              )}
            </Typography>
            <DynamicTable
              headers={["Off / On", "Ad", "Delivery"]}
              data={filteredData.ads}
              onDataChange={() => {}} // Remove if not needed
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