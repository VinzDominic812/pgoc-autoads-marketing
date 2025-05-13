import React, { useState } from "react";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { Avatar, Box, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, CircularProgress } from "@mui/material";
import Logo from "../../assets/icon.png"; // Your logo path
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import notify from "../components/toast.jsx";
import { getUserData, decryptData } from "../../services/user_data";

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

  const [openInviteInputDialog, setOpenInviteInputDialog] = useState(false);
  const [inputInviteCode, setInputInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [openRelationshipDialog, setOpenRelationshipDialog] = useState(false);
  const [superadminName, setSuperadminName] = useState("");

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
    if (userData?.user_level === 1 && userData?.user_role === "superadmin") {
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
          const unusedCode = data.data.find(code => !code.is_used);
          if (unusedCode) {
            setInviteCode(unusedCode.invite_code);
            setExpiryDate(new Date(unusedCode.expires_at).toLocaleString());
          } else {
            await handleRenewInviteCode();
          }
        } else {
          await handleRenewInviteCode();
        }
      } catch (error) {
        notify('Failed to fetch invite code', 'error');
        //console.error('Error fetching invite code:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // For non-superadmin users, check their relationship status
      try {
        // Get the token using the getUserData function
        const userDataObj = getUserData();
        // console.log('User data object:', userDataObj); // Debug log

        if (!userDataObj || !userDataObj.accessToken) {
          console.error('No user data or access token found');
          notify('Please log in to continue', 'error');
          return;
        }

        // console.log('Checking relationship for user:', userData.id); // Debug log
        const response = await fetch(`${apiUrl}/api/v1/check-relationship?user_id=${userData.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userDataObj.accessToken}`,
            skip_zrok_interstitial: 'true'
          }
        });

        const data = await response.json();
        // console.log('Relationship check response:', data); // Debug log

        if (response.ok) {
          if (data.relationship) {
            // User has a relationship, show the relationship dialog
            setSuperadminName(data.superadmin_name);
            setOpenRelationshipDialog(true);
          } else {
            // No relationship, show invite code input dialog
            setOpenInviteInputDialog(true);
          }
        } else {
          // console.error('Error response:', data); // Debug log
          if (data.msg === 'Not enough segments') {
            notify('Session expired. Please log in again.', 'error');
            // Only redirect if we're sure the token is invalid
            if (response.status === 401) {
              window.location.href = '/';
            }
          } else {
            notify(data.message || 'Error checking relationship', 'error');
            setOpenInviteInputDialog(true);
          }
        }
      } catch (error) {
        // console.error('Error checking relationship:', error);
        notify('Error checking relationship status', 'error');
        setOpenInviteInputDialog(true);
      }
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
      // console.error('Error generating invite code:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInviteInputDialog = () => {
    setOpenInviteInputDialog(true);
  };

  const handleCloseInviteInputDialog = () => {
    setOpenInviteInputDialog(false);
    setInputInviteCode("");
  };

  const handleSubmitInviteCode = async () => {
    if (!inputInviteCode.trim()) {
      notify('Please enter an invite code', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/user/invite-codes/use`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          skip_zrok_interstitial: 'true'
        },
        body: JSON.stringify({
          invite_code: inputInviteCode.trim(),
          user_id: userData.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        notify(data.message || 'Invalid invite code', 'error');
        return;
      }

      notify('Successfully linked with superadmin!', 'success');
      handleCloseInviteInputDialog();
      
      // Update the UI state locally
      if (data.superadmin_name) {
        setSuperadminName(data.superadmin_name);
        setOpenRelationshipDialog(true);
      }
    } catch (error) {
      notify('Error processing invite code', 'error');
      // console.error('Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseRelationshipDialog = () => {
    setOpenRelationshipDialog(false);
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

            {/* Invite Code Button for all users */}
            {open && (
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
                {userData?.user_level === 1 && userData?.user_role === "superadmin" 
                  ? "Invite Code" 
                  : "Enter Invite Code"}
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

      {/* Add Relationship Dialog */}
      <Dialog
        open={openRelationshipDialog}
        onClose={handleCloseRelationshipDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ 
          fontSize: '1.2rem',
          fontWeight: 'bold',
          color: '#1976d2',
          borderBottom: '1px solid #e0e0e0',
          padding: '16px 24px'
        }}>
          Account Management
        </DialogTitle>
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
            <Typography variant="h6" sx={{ 
              fontFamily: 'monospace',
              color: '#1976d2',
              fontWeight: 'bold'
            }}>
              {superadminName || 'Loading...'}
            </Typography>
            <Typography variant="body2" sx={{ 
              color: 'text.secondary',
              textAlign: 'center',
              marginTop: '8px'
            }}>
              You are currently under the management of this superadmin.
              All your activities and campaigns will be monitored and managed by them.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ padding: '16px' }}>
          <Button
            onClick={handleCloseRelationshipDialog}
            variant="contained"
            color="primary"
            fullWidth
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Invite Code Input Dialog */}
      <Dialog
        open={openInviteInputDialog}
        onClose={handleCloseInviteInputDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ 
          fontSize: '1.2rem',
          fontWeight: 'bold',
          color: '#1976d2',
          borderBottom: '1px solid #e0e0e0',
          padding: '16px 24px'
        }}>
          Enter Invite Code
        </DialogTitle>
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
            <TextField
              fullWidth
              label="Invite Code"
              value={inputInviteCode}
              onChange={(e) => setInputInviteCode(e.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="Enter the invite code provided by superadmin"
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#fff',
                  '&.Mui-focused fieldset': {
                    borderColor: '#1976d2',
                  },
                },
              }}
              InputProps={{
                endAdornment: isSubmitting && (
                  <CircularProgress size={20} color="primary" />
                ),
              }}
            />
            <Typography variant="body2" sx={{ 
              color: 'text.secondary',
              textAlign: 'center',
              marginTop: '8px'
            }}>
              Enter the 8-character invite code provided by your superadmin.
              This will link your account to their management.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ padding: '16px' }}>
          <Button
            onClick={handleCloseInviteInputDialog}
            variant="outlined"
            disabled={isSubmitting}
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitInviteCode}
            variant="contained"
            color="primary"
            disabled={isSubmitting || !inputInviteCode.trim()}
            sx={{ flex: 1 }}
          >
            {isSubmitting ? 'Processing...' : 'Submit'}
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