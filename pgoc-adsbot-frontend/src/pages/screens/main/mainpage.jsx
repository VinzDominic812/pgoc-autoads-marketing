import React, { useState, useEffect } from "react";
import { createTheme, ThemeProvider, styled } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Sidebar from "../../components/Sidebar";
import Toolbar from "@mui/material/Toolbar";

// Icons
import CampaignIcon from "@mui/icons-material/CreateNewFolderRounded";
import CampaignscheduleIcon from "@mui/icons-material/CampaignRounded";
import DashboardIcon from "@mui/icons-material/DashboardCustomizeRounded";
import BarChartIcon from "@mui/icons-material/BarChart";
import ScheduledIcon from "@mui/icons-material/AlarmSharp";
import PowerIcon from "@mui/icons-material/PowerSettingsNewSharp";
import LogoutIcon from "@mui/icons-material/LogoutRounded";
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';

// Pages
import DashboardPage from "../../segments/dashboardpage";
import ReportsPage from "../../segments/reportspage";
import SettingsPage from "../../segments/settingspage";
import CampaignONOFFPage from "../../segments/campaign_on_off_page";
import CampaignNameOnlyPage from "../../segments/only_campaign_name";
import CampaignCreationPage from "../../segments/campaign_creation_page";
import AdsetsONOFFpage from "../../segments/on_off_adsets"
import PageNameONOFFpage from "../../segments/on_off_page_name"
import EditBudgetPage from "../../segments/edit_budget"

// Auth & Data Fetching
import { getUserData } from "../../../services/user_data"; // Adjust path if needed
import { useUserData } from "../../../services/fetch-userdata";
import CreateOnOFFPage from "../../segments/on_off_campaign_name";

const NAVIGATION = [
  { 
    segment: "home", 
    title: "Dashboard", 
    icon: <DashboardIcon /> 
  },
  {
    segment: "campaign-creation",
    title: "Campaign Creation",
    icon: <CampaignIcon />,
  },
  { 
    segment: "adsets-off", 
    title: "ON/OFF Ads", 
    icon: <GridViewRoundedIcon /> 
  },
  // { segment: "campaign-off", 
  //   title: "ON/OFF Campaigns", 
  //   icon: <PowerIcon /> 
  // },
  { segment: "pagename-off", 
    title: "ON/OFF By Page", 
    icon: <FlagRoundedIcon /> 
  },
  // {
  //   segment: "scheduled-campaign-name",
  //   title: "Schedule ON/OFF Campaigns ",
  //   icon: <CampaignscheduleIcon />,
  // },
  { 
    segment: "budget", 
    title: "Budget", 
    icon: <CurrencyExchangeIcon /> 
  },
  {
    segment: "scheduled-on-and-off",
    title: "ON/OFF By Sched",
    icon: <ScheduledIcon />,
  },
  { 
    segment: "reports", 
    title: "Reports", 
    icon: <BarChartIcon /> 
  },
  { 
    segment: "settings", 
    title: "Settings", 
    icon: <SettingsOutlinedIcon /> 
  },
  { 
    segment: "logout", 
    title: "Logout", 
    icon: <LogoutIcon /> 
  },
];

const demoTheme = createTheme({
  palette: {
    mode: "light",
  },
});

const Skeleton = styled("div")(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  borderRadius: theme.shape.borderRadius,
  height: "100px", // Default height
}));

const Dashboard = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Load the last selected segment from localStorage, default to "home"
  const [selectedSegment, setSelectedSegment] = useState(
    localStorage.getItem("selectedSegment") || "home"
  );

  const [hoverTimeout, setHoverTimeout] = useState(null);

  // Get user data
  const { id } = getUserData(); // Decrypt user ID
  const { userData, loading } = useUserData(id ?? ""); // Ensure id is valid before using

  useEffect(() => {
    if (selectedSegment) {
      localStorage.setItem("selectedSegment", selectedSegment);
    }
  }, [selectedSegment]);

  const handleSegmentSelect = (segment) => {
    if (segment === "logout") {
      // Clear localStorage
      localStorage.removeItem("selectedSegment");
      localStorage.removeItem("authToken"); // Remove any stored token

      // Clear cookies (assuming cookies are used for authentication)
      document.cookie =
        "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      // Redirect to login page
      navigate("/");
      return;
    }
    setSelectedSegment(segment);
  };

  const handleMouseEnter = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    setHoverTimeout(
      setTimeout(() => {
        setSidebarOpen(true);
      }, 300)
    );
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setSidebarOpen(false);
  };

  const getContent = () => {
    switch (selectedSegment) {
      case "home":
        return <DashboardPage />;
      case "campaign-creation":
        return <CampaignCreationPage />;
      case "adsets-off":
        return <AdsetsONOFFpage />;
      case "campaign-off":
        return <CreateOnOFFPage userData={userData} />;
      case "pagename-off":
        return <PageNameONOFFpage userData={userData}/>;
      case "scheduled-campaign-name":
        return <CampaignNameOnlyPage userData={userData} />;
      case "budget":
        return <EditBudgetPage userData={userData}/>;
      case "scheduled-on-and-off":
        return <CampaignONOFFPage userData={userData} />;
      case "reports":
        return <ReportsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <ThemeProvider theme={demoTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          background: "linear-gradient(to bottom right, #fff5f5, #f8d7da)",
        }}
      >
        {/* Sidebar */}
        <Box onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <Sidebar
            open={isSidebarOpen}
            navigation={NAVIGATION}
            onSelectSegment={handleSegmentSelect}
            userData={userData}
            selectedSegment={selectedSegment} // Pass the selected segment
          />
        </Box>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            bgcolor: "transparent",
            transition: "margin-left 0.3s",
            p: 3,
            mt: 0,
          }}
        >
          {getContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default Dashboard;
