import React, { useState } from "react";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { Avatar, Box, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import Logo from "../../assets/icon.png"; // Your logo path
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import notify from "../components/toast.jsx";

const apiUrl = import.meta.env.VITE_API_URL;

const Sidebar = ({
  open: propOpen,
  setOpen: propSetOpen,
  navigation,
  onSelectSegment,
  userData,
  selectedSegment,
}) => {
  const [localOpen, setLocalOpen] = useState(false);

  // Use controlled or local state
  const isControlled = typeof propSetOpen === "function";
  const open = isControlled ? propOpen : localOpen;
  const setOpen = isControlled ? propSetOpen : setLocalOpen;

  const [hoverTimeout, setHoverTimeout] = useState(null);

  const userName = userData?.username || "Guest";
  const profilePicture = userData?.profile_image
    ? `data:image/jpeg;base64,${userData.profile_image}`
    : null;

  const [openInviteDialog, setOpenInviteDialog] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setOpen(true);
    }, 300);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setOpen(false);
  };

  const handleOpenInviteDialog = async () => {
    setOpenInviteDialog(true);
    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/user/${userData.id}/invite-codes`, {
        headers: {
          'Content-Type': 'application/json',
          skip_zrok_interstitial: 'true'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invite code');
      }

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        // Get the most recent unused code
        const unusedCode = data.data.find(code => !code.is_used);
        if (unusedCode) {
          setInviteCode(unusedCode.invite_code);
          setExpiryDate(new Date(unusedCode.expires_at).toLocaleString());
        } else {
          // If no unused code exists, generate a new one
          await handleRenewInviteCode();
        }
      } else {
        // If no codes exist, generate a new one
        await handleRenewInviteCode();
      }
    } catch (error) {
      notify('Failed to fetch invite code', 'error');
      console.error('Error fetching invite code:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseInviteDialog = () => {
    setOpenInviteDialog(false);
  };

  const handleCopyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      notify('Invite code copied to clipboard!', 'success');
      handleCloseInviteDialog();
    }
  };

  const handleRenewInviteCode = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/user/invite-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          skip_zrok_interstitial: 'true'
        },
        body: JSON.stringify({
          superadmin_id: userData.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate new invite code');
      }

      const data = await response.json();
      if (data.data && data.data.invite_code) {
        setInviteCode(data.data.invite_code);
        setExpiryDate(new Date(data.data.expires_at).toLocaleString());
        notify('New invite code generated successfully!', 'success');
      }
    } catch (error) {
      notify('Failed to generate new invite code', 'error');
      console.error('Error generating invite code:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? 250 : 60,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: open ? 250 : 60,
          transition: "width 0.3s",
          overflowX: "hidden",
          padding: "10px 0",
        },
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Logo and Company Name */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          flexDirection: open ? "row" : "column",
          height: "40px",
          width: open ? "250px" : "60px", // Set a fixed width
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <img
          src={Logo}
          alt="Logo"
          style={{
            width: "30px",
            height: "30px",
            marginRight: open ? "8px" : "0",
            transition: "margin-right 0.3s ease", // Smooth transition for margin change
          }}
        />
        {open && (
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Philippian Group of Companies
          </Typography>
        )}
      </Box>

      {/* Avatar, Username, Email, and Status */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          marginTop: "-8px",
          padding: "6px 10px",
          justifyContent: "flex-start",
          width: open ? "250px" : "60px", // Set a fixed width
          flexDirection: open ? "row" : "column",
        }}
      >
        <Avatar
          variant="square"
          sx={{
            width: 40,
            height: 40,
            backgroundColor: "#f0f0f0",
            transition: "none",
          }}
          src={profilePicture || undefined}
        >
          {!profilePicture && userName.charAt(0).toUpperCase()}
        </Avatar>

        {open && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column", // Now we are stacking name and email
              justifyContent: "center",
              marginLeft: 1.5,
            }}
          >
            {/* Name and Status inline */}
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Typography
                sx={{
                  fontSize: "13px",
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                }}
              >
                {userName}
              </Typography>

              <Chip
                label={
                  userData?.status?.toLowerCase() === "active"
                    ? "Active"
                    : "Inactive"
                }
                size="small"
                sx={{
                  backgroundColor:
                    userData?.status?.toLowerCase() === "active"
                      ? "#4CAF50"
                      : "#D32F2F",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: "bold",
                  height: "18px",
                }}
              />
            </Box>

            {/* Email below name */}
            <Typography
              sx={{
                fontSize: "11px",
                color: "gray",
                whiteSpace: "nowrap",
              }}
            >
              {userData?.email || "No Email"}
            </Typography>

            {/* Superadmin Button */}
            {open && userData?.user_level === 1 && userData?.user_role === "superadmin" && (
              <Typography
                sx={{
                  fontSize: "11px",
                  color: "#1976d2",
                  cursor: "pointer",
                  marginTop: "4px",
                  "&:hover": {
                    textDecoration: "underline",
                  },
                }}
                onClick={handleOpenInviteDialog}
              >
                Invite Code
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <Divider />

      {/* Invite Code Dialog */}
      <Dialog
        open={openInviteDialog}
        onClose={handleCloseInviteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Invite Code</DialogTitle>
        <DialogContent>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            marginTop: '10px',
            gap: '8px'
          }}>
            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
              {isLoading ? 'Loading...' : inviteCode || 'No invite code available'}
            </Typography>
            {!isLoading && inviteCode && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Expires: {expiryDate}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ padding: '16px' }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={handleRenewInviteCode}
            variant="outlined"
            color="primary"
            disabled={isLoading}
          >
            Renew
          </Button>
          <Button
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyInviteCode}
            variant="contained"
            color="primary"
            disabled={isLoading || !inviteCode}
          >
            Copy & Exit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Navigation List */}
      <List>
        {navigation.map((item, index) =>
          item.kind === "header" && open ? (
            <Typography key={index} sx={{ margin: "12px", fontWeight: "bold" }}>
              {item.title}
            </Typography>
          ) : (
            item.segment && (
              <ListItem
                button
                key={item.segment}
                onClick={() => {
                  if (item.segment === "logout") {
                    // Clear localStorage
                    localStorage.removeItem("selectedSegment");
                    localStorage.removeItem("authToken");
                    
                    // Also clear the additional user data from localStorage
                    localStorage.removeItem("username");
                    localStorage.removeItem("email");
                    localStorage.removeItem("status");
                    localStorage.removeItem("profile_image");
                    localStorage.removeItem("user_level");
                    localStorage.removeItem("user_role");

                    // List of cookies to remove
                    const cookiesToRemove = [
                      "xsid",
                      "xsid_g",
                      "usr",
                      "rsid",
                      "isxd",
                      "username",
                      "email",
                      "status",
                      "profile_image",
                      "user_level",
                      "user_role"
                    ];

                    // Delete cookies
                    cookiesToRemove.forEach((cookie) => {
                      document.cookie = `${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict`;
                    });

                    // Redirect to login page
                    window.location.href = "/";
                    return;
                    // Handle logout
                  } else {
                    onSelectSegment(item.segment);
                  }
                }}
                sx={{
                  width: open ? 250 : 60, // Adjust based on whether the sidebar is open
                  height: "48px", // Fixed height to prevent vertical stretching
                  backgroundColor:
                    selectedSegment === item.segment
                      ? "rgb(219, 218, 218)"
                      : "transparent",
                  color: selectedSegment === item.segment ? "red" : "inherit",
                  fontWeight:
                    selectedSegment === item.segment ? "bold" : "normal",
                  borderLeft:
                    selectedSegment === item.segment ? "5px solid red" : "none",
                  transition: "all 0.3s",
                  "&:hover": {
                    backgroundColor: "rgb(235, 235, 235)",
                    color: "black",
                  },
                  display: "flex",
                  alignItems: "center", // Align items to the start to prevent stretching
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40, // Fixed width for the icon
                    color: selectedSegment === item.segment ? "red" : "inherit",
                  }}
                >
                  {item.icon}
                </ListItemIcon>

                {/* Ensure ListItemText is aligned and does not stretch */}
                {open && (
                  <ListItemText
                    primary={item.title}
                    sx={{
                      color:
                        selectedSegment === item.segment ? "red" : "inherit",
                      fontWeight:
                        selectedSegment === item.segment ? "bold" : "normal",
                      whiteSpace: "nowrap", // Prevent text from wrapping
                    }}
                  />
                )}
              </ListItem>
            )
          )
        )}
      </List>
      <Divider />
    </Drawer>
  );
};

export default Sidebar;