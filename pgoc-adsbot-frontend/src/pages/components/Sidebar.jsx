import React, { useState } from "react";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { Avatar, Box, Chip } from "@mui/material";
import Logo from "../../assets/icon.png"; // Your logo path

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
          padding: "10px",
          justifyContent: open ? "flex-start" : "center",
        }}
      >
        <img
          src={Logo}
          alt="Logo"
          style={{
            width: "30px",
            height: "30px",
            marginRight: open ? "8px" : "0",
          }}
        />
        {open && (
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: "bold",
              whiteSpace: "normal",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
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
          justifyContent: open ? "flex-start" : "center",
          flexDirection: open ? "row" : "column",
        }}
      >
        <Avatar
          variant="square"
          sx={{
            width: 30,
            height: 30,
            backgroundColor: "#f0f0f0",
            marginRight: open ? "6px" : "0",
          }}
          src={profilePicture || undefined}
        >
          {!profilePicture && userName.charAt(0).toUpperCase()}
        </Avatar>

        {open && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              marginLeft: "15px",
              marginTop: "28px",
              gap: "2px",
            }}
          >
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              {userName}
            </Typography>

            <Typography
              sx={{
                fontSize: "11px",
                color: "gray",
                whiteSpace: "nowrap",
              }}
            >
              {userData?.email || "No Email"}
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
                marginTop: "10px",
              }}
            />
          </Box>
        )}
      </Box>

      <Divider />

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

                    // List of cookies to remove
                    const cookiesToRemove = ["xsid", "xsid_g", "usr", "rsid", "isxd"];

                    // Delete cookies
                    cookiesToRemove.forEach((cookie) => {
                      document.cookie = `${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict`;
                    });

                    // Redirect to login page
                    window.location.href = "/";
                    return;
                  }

                  onSelectSegment(item.segment);
                }}
                sx={{
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
                }}
              >
                <ListItemIcon
                  sx={{
                    color: selectedSegment === item.segment ? "red" : "inherit",
                    minWidth: 40,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {open && (
                  <ListItemText
                    primary={item.title}
                    sx={{
                      color:
                        selectedSegment === item.segment ? "red" : "inherit",
                      fontWeight:
                        selectedSegment === item.segment ? "bold" : "normal",
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
