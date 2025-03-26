import React, { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Tooltip,
  IconButton,
  Collapse,
  Box,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/KeyboardArrowRight";
import ExpandLessIcon from "@mui/icons-material/KeyboardArrowDown";
import WidgetCard from "../../components/widget_card";

const OnlyScheduleAccountWidget = ({ schedules, onSelectAccount }) => {
  const adAccounts = schedules?.ad_accounts || [];
  const [selectedAccount, setSelectedAccount] = useState(null);

  const handleSelectAccount = (account) => {
    setSelectedAccount((prev) =>
      prev?.ad_account_id === account.ad_account_id ? null : account
    );
    onSelectAccount(account);
  };

  

  return (
    <WidgetCard width="350px">
      <Typography
        variant="h6"
        sx={{
          marginTop: "10px",
          marginBottom: "10px",
          fontWeight: "bold",
          color: "#333",
          textAlign: "center",
          display: "block",
        }}
      >
        👤 List of Ad Accounts
      </Typography>

      {adAccounts.length === 0 ? (
        <Typography variant="body1" sx={{ textAlign: "center", color: "gray" }}>
          No scheduled ad accounts found.
        </Typography>
      ) : (
        <Box sx={{ marginTop: "10px", maxHeight: "550px", overflowY: "auto" }}>
          {adAccounts.map((account, index) => {
            const isSelected =
              selectedAccount?.ad_account_id === account.ad_account_id;

            return (
              <Card
                key={index}
                elevation={isSelected ? 6 : 2}
                sx={{
                  borderLeft: `5px solid ${isSelected ? "#D32F2F" : "#FF4D4D"}`,
                  backgroundColor: isSelected ? "#FFEBEE" : "#fff",
                  marginBottom: "8px",
                  cursor: "pointer",
                  transition: "0.3s",
                  height: isSelected ? "120px" : "65px",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 2,
                  "&:hover": {
                    backgroundColor: "#FFEBEE",
                  },
                }}
              >
                <CardContent
                  sx={{
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    flexGrow: 1,
                  }}
                  onClick={() => handleSelectAccount(account)}
                >
                  {/* Expand Icon */}
                  <IconButton sx={{ padding: "5px", marginRight: "10px" }}>
                    {isSelected ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>

                  {/* Ad Account Information (Vertically Aligned) */}
                  <Box
                    sx={{
                      flexGrow: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: "bold", color: "#333" }}
                    >
                      Ad Account:
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: "0.75rem" }}>
                      {account.ad_account_id}
                    </Typography>
                  </Box>

                  {/* Access Token with Tooltip */}
                  <Box
                    sx={{
                      flexGrow: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: "bold", color: "#333" }}
                    >
                      Access Token:
                    </Typography>
                    <Tooltip title={account.access_token} arrow>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "gray",
                          fontSize: "12px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "120px",
                        }}
                      >
                        {account.access_token.length > 10
                          ? `${account.access_token.substring(0, 10)}...`
                          : account.access_token}
                      </Typography>
                    </Tooltip>
                  </Box>
                </CardContent>

                {/* Collapsible Details */}
                <Collapse in={isSelected} timeout="auto" unmountOnExit>
                  <CardContent
                    sx={{
                      backgroundColor: "#FFCDD2",
                      padding: "10px",
                      borderRadius: "0 0 8px 8px",
                    }}
                  >
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          Last Status:
                        </Typography>
                        <Typography variant="body2">
                          {account.last_status}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "5px",
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          Last Checked:
                        </Typography>
                        <Typography variant="body2">
                          {account.last_time_checked}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Collapse>
              </Card>
            );
          })}
        </Box>
      )}
    </WidgetCard>
  );
};

export default OnlyScheduleAccountWidget;
